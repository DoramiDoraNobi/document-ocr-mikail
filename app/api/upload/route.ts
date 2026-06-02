
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { checkRateLimit, RATE_LIMITS, safeLogError } from "@/lib/security";
import { recordAudit, getClientIP } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    // 1. Ambil formData
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan dalam request." }, { status: 400 });
    }

    const fileType = file.type;
    const fileSize = file.size;

    // 2. Keamanan: Cek tipe file (hanya izinkan image dan pdf)
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(fileType)) {
      return NextResponse.json({ error: "Tipe file tidak diizinkan." }, { status: 400 });
    }

    // 3. Keamanan: Batasi ukuran file (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      return NextResponse.json({ error: "Ukuran file terlalu besar. Maksimal 5MB." }, { status: 400 });
    }

    // 4. Keamanan: Autentikasi
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.userId;

    // 5. Keamanan: Rate limiting — max 20 upload per menit per user
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

    // 6. Keamanan: Randomisasi nama file (mencegah overwrite/path traversal)
    const fileId = uuidv4();
    let ext = "bin";
    if (fileType === "image/jpeg") ext = "jpg";
    if (fileType === "image/png") ext = "png";
    if (fileType === "image/webp") ext = "webp";
    if (fileType === "application/pdf") ext = "pdf";
    
    const fileKey = `uploads/${userId}/${fileId}.${ext}`;

    const bucket = env.BUCKET;
    if (!bucket) {
      console.error("Missing R2 bucket binding");
      return NextResponse.json({ error: "Konfigurasi server salah." }, { status: 500 });
    }

    // Upload file langsung ke R2
    await bucket.put(fileKey, file, {
      httpMetadata: { contentType: fileType },
    });

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

    return NextResponse.json({ fileKey, fileId });
  } catch (error) {
    safeLogError("UploadRoute", error);
    // Keamanan: Sembunyikan error detail dari response
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
