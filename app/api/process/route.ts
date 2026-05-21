export const runtime = "edge";

import { extractDocumentData } from "@/lib/ai";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { getEnv } from "@/lib/env";
import { validateMagicBytes, checkRateLimit, RATE_LIMITS, safeLogError } from "@/lib/security";
import { recordAudit, getClientIP } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const { fileKey, customFields } = await req.json() as any;

    if (!fileKey) {
      return NextResponse.json({ error: "Missing fileKey" }, { status: 400 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting: max 10 proses AI per menit per user
    const { env } = getRequestContext();
    const db = env.DB;
    if (db) {
      const rateCheck = await checkRateLimit(
        db, user.userId, "process",
        RATE_LIMITS.process.maxRequests, RATE_LIMITS.process.windowSeconds
      );
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: "Terlalu banyak permintaan. Silakan tunggu sebentar." },
          { status: 429, headers: { "Retry-After": String(rateCheck.resetAt - Math.floor(Date.now() / 1000)) } }
        );
      }
    }

    const CF_ACCOUNT_ID = getEnv("CF_ACCOUNT_ID");
    const R2_ACCESS_KEY_ID = getEnv("R2_ACCESS_KEY_ID");
    const R2_SECRET_ACCESS_KEY = getEnv("R2_SECRET_ACCESS_KEY");
    const R2_BUCKET_NAME = getEnv("R2_BUCKET_NAME");

    if (!CF_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      return NextResponse.json({ error: "Konfigurasi server salah." }, { status: 500 });
    }

    // 1. Ambil gambar dari R2
    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    const getObjectResult = await S3.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileKey,
      })
    );

    if (!getObjectResult.Body) {
      return NextResponse.json({ error: "File tidak ditemukan di R2" }, { status: 404 });
    }

    // Convert file Stream/Blob to Base64
    const byteArray = await getObjectResult.Body.transformToByteArray();

    // KEAMANAN: Validasi magic bytes — verifikasi tipe file dari header, bukan MIME type client
    const fileValidation = validateMagicBytes(byteArray);
    if (!fileValidation.valid) {
      return NextResponse.json(
        { error: "File tidak valid. Tipe file tidak dikenali atau tidak didukung." },
        { status: 400 }
      );
    }

    // KEAMANAN: Validasi ukuran file setelah diambil dari R2 (server-side enforcement)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (byteArray.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File terlalu besar. Maksimal 5MB." },
        { status: 400 }
      );
    }

    // Convert Uint8Array to Base64
    const base64Image = Buffer.from(byteArray).toString("base64");

    // Gunakan MIME type dari magic bytes (bukan dari ekstensi file)
    const mimeType = fileValidation.mimeType;

    // 2. Kirim ke Qwen2.5 VL via OpenRouter
    const extractedJson = await extractDocumentData(base64Image, mimeType, customFields);

    // Hitung rata-rata confidence score untuk field utama
    let avgConfidence = 0;
    let fieldCount = 0;
    
    if (extractedJson.vendor?.confidence) { avgConfidence += extractedJson.vendor.confidence; fieldCount++; }
    if (extractedJson.date?.confidence) { avgConfidence += extractedJson.date.confidence; fieldCount++; }
    if (extractedJson.total_amount?.confidence) { avgConfidence += extractedJson.total_amount.confidence; fieldCount++; }
    
    const finalConfidence = fieldCount > 0 ? avgConfidence / fieldCount : 0;

    // Ambil document_type, payment_method, dan category yang diklasifikasikan AI
    const documentType = extractedJson.document_type?.value || "other";
    const paymentMethod = extractedJson.payment_method?.value || "other";
    let category = extractedJson.category?.value || "Uncategorized";
    const referenceNumber = extractedJson.reference_number?.value || "";

    // 3. Simpan hasil ke D1 Database
    // env dan db sudah diambil di atas untuk rate limiting
    if (db) {
      const docId = uuidv4();
      const userId = user.userId;
      const rawJsonString = JSON.stringify(extractedJson);
      const lineItemsString = extractedJson.line_items ? JSON.stringify(extractedJson.line_items) : null;
      const vendorName = extractedJson.vendor?.value || "";

      const dateStr = extractedJson.date?.value || "";
      const totalAmt = extractedJson.total_amount?.value || 0;
      let isDuplicate = 0;

      // Cek apakah sudah ada template untuk vendor yang sama
      let defaultCategory = category;
      if (vendorName) {
        const existingTemplate = await db.prepare(`
          SELECT id, usage_count, default_category FROM document_templates 
          WHERE user_id = ? AND LOWER(vendor_pattern) = LOWER(?) AND document_type = ?
        `).bind(userId, vendorName, documentType).first<{id: string, usage_count: number, default_category: string}>();
        
        if (existingTemplate && existingTemplate.default_category) {
            // Jika ada template dan punya default_category, kita utamakan default_category dari template 
            // agar konsisten.
            category = existingTemplate.default_category;
        }

      // DETEKSI DUPLIKAT
      if (vendorName && dateStr && totalAmt > 0) {
        const queryParams = [userId, vendorName, dateStr, totalAmt];
        let queryStr = `
          SELECT id FROM documents
          WHERE user_id = ? 
            AND LOWER(vendor) = LOWER(?)
            AND date = ?
            AND total_amount = ?
        `;
        if (referenceNumber) {
          queryStr += ` AND LOWER(reference_number) = LOWER(?)`;
          queryParams.push(referenceNumber);
        }
        queryStr += ` LIMIT 1`;

        const dupCheck = await db.prepare(queryStr).bind(...queryParams).first();
        if (dupCheck) {
          isDuplicate = 1;
        }
      }

      // Simpan dokumen dengan document_type, payment_method, category, reference_number, is_duplicate
      await db.prepare(`
        INSERT INTO documents (id, user_id, file_key, status, document_type, vendor, date, subtotal, tax_amount, total_amount, currency, payment_method, category, reference_number, is_duplicate, line_items, ai_confidence_score, raw_ai_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        docId,
        userId,
        fileKey,
        'PENDING',
        documentType,
        vendorName,
        dateStr,
        extractedJson.subtotal?.value || null,
        extractedJson.tax_amount?.value || null,
        totalAmt,
        extractedJson.currency?.value || "",
        paymentMethod,
        category,
        referenceNumber,
        isDuplicate,
        lineItemsString,
        finalConfidence,
        rawJsonString
      ).run();

      // 4. Auto-create atau update Template berdasarkan vendor + document_type
      // Satu vendor bisa punya beberapa template jika document_type berbeda
      // Contoh: "Tokopedia receipt" dan "Tokopedia invoice" = 2 template terpisah
        if (existingTemplate) {
          // Template untuk vendor + document_type ini sudah ada, tambahkan usage_count
          await db.prepare(`
            UPDATE document_templates 
            SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(existingTemplate.id).run();
        } else {
          // Buat template baru untuk kombinasi vendor + document_type ini
          const templateId = uuidv4();
          // Kumpulkan nama-nama field yang berhasil diekstrak AI (untuk disimpan sebagai schema)
          const extractedFieldNames = Object.keys(extractedJson).filter(
            k => k !== "line_items" && k !== "status"
          );
          const fieldSchemaString = JSON.stringify(extractedFieldNames);
          const templateName = `${vendorName} ${documentType}`.trim();

          await db.prepare(`
            INSERT INTO document_templates (id, user_id, template_name, document_type, vendor_pattern, default_category, field_schema)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            templateId,
            userId,
            templateName,
            documentType,
            vendorName,
            defaultCategory,
            fieldSchemaString
          ).run();
        }
      } else {
         // Fallback simpan dokumen jika tidak ada vendorName
         await db.prepare(`
            INSERT INTO documents (id, user_id, file_key, status, document_type, vendor, date, subtotal, tax_amount, total_amount, currency, payment_method, category, reference_number, is_duplicate, line_items, ai_confidence_score, raw_ai_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            docId,
            userId,
            fileKey,
            'PENDING',
            documentType,
            vendorName,
            dateStr,
            extractedJson.subtotal?.value || null,
            extractedJson.tax_amount?.value || null,
            totalAmt,
            extractedJson.currency?.value || "",
            paymentMethod,
            category,
            referenceNumber,
            isDuplicate,
            lineItemsString,
            finalConfidence,
            rawJsonString
          ).run();
      }

      // Audit log: rekam proses dokumen berhasil
      const clientIP = getClientIP(req);
      recordAudit(db, {
        userId,
        action: "process",
        targetType: "document",
        targetId: docId,
        details: `type=${documentType}, vendor=${vendorName}, confidence=${finalConfidence.toFixed(2)}`,
        ipAddress: clientIP,
      });

      return NextResponse.json({ 
        message: "Dokumen berhasil diproses", 
        documentId: docId, 
        documentType,
        paymentMethod,
        category,
        data: extractedJson 
      });
    }

    return NextResponse.json({ 
      message: "Data diekstrak, namun gagal menyimpan ke database (DB binding hilang)", 
      data: extractedJson 
    });

  } catch (error: unknown) {
    safeLogError("ProcessRoute", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal saat pemrosesan." }, { status: 500 });
  }
}
