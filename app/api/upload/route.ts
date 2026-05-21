export const runtime = "edge";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { checkRateLimit, RATE_LIMITS, safeLogError } from "@/lib/security";
import { recordAudit, getClientIP } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const { fileType, fileSize } = await req.json() as any;

    // 1. Keamanan: Cek tipe file (hanya izinkan image dan pdf)
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(fileType)) {
      return NextResponse.json({ error: "Tipe file tidak diizinkan." }, { status: 400 });
    }

    // 2. Keamanan: Batasi ukuran file (misal max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      return NextResponse.json({ error: "Ukuran file terlalu besar. Maksimal 5MB." }, { status: 400 });
    }

    // 3. Keamanan: Autentikasi
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.userId;

    // 4. Keamanan: Rate limiting — max 20 upload per menit per user
    const { env } = getRequestContext();
    const db = env.DB;
    if (db) {
      const rateCheck = await checkRateLimit(
        db, userId, "upload",
        RATE_LIMITS.upload.maxRequests, RATE_LIMITS.upload.windowSeconds
      );
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: "Terlalu banyak upload. Silakan tunggu sebentar." },
          { status: 429, headers: { "Retry-After": String(rateCheck.resetAt - Math.floor(Date.now() / 1000)) } }
        );
      }
    }

    // 3. Keamanan: Randomisasi nama file (mencegah overwrite/path traversal)
    const fileId = uuidv4();
    let ext = "bin";
    if (fileType === "image/jpeg") ext = "jpg";
    if (fileType === "image/png") ext = "png";
    if (fileType === "application/pdf") ext = "pdf";
    
    const fileKey = `uploads/${userId}/${fileId}.${ext}`;

    // Pastikan environment variables tersedia
    const CF_ACCOUNT_ID = getEnv("CF_ACCOUNT_ID");
    const R2_ACCESS_KEY_ID = getEnv("R2_ACCESS_KEY_ID");
    const R2_SECRET_ACCESS_KEY = getEnv("R2_SECRET_ACCESS_KEY");
    const R2_BUCKET_NAME = getEnv("R2_BUCKET_NAME");

    if (!CF_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      console.error("Missing R2 environment variables");
      return NextResponse.json({ error: "Konfigurasi server salah." }, { status: 500 });
    }

    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType,
      ContentLength: fileSize, // Gunakan ukuran asli file agar signature S3 cocok
    });

    // Generate Presigned URL berlaku untuk 5 menit (300 detik)
    const uploadUrl = await getSignedUrl(S3, command, { expiresIn: 300 });

    // Audit log: rekam permintaan upload
    if (db) {
      const clientIP = getClientIP(req);
      recordAudit(db, {
        userId,
        action: "upload",
        targetType: "document",
        targetId: fileId,
        details: `fileType=${fileType}, fileSize=${fileSize}`,
        ipAddress: clientIP,
      });
    }

    return NextResponse.json({ uploadUrl, fileKey, fileId });
  } catch (error) {
    safeLogError("UploadRoute", error);
    // 5. Keamanan: Sembunyikan error detail dari response
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
