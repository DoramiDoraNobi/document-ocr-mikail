export const runtime = "edge";

import { extractDocumentData } from "@/lib/ai";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { fileKey, customFields } = await req.json();

    if (!fileKey) {
      return NextResponse.json({ error: "Missing fileKey" }, { status: 400 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
    const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
    const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
    const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

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
    // Convert Uint8Array to Base64
    const base64Image = Buffer.from(byteArray).toString("base64");

    // Deteksi MimeType sederhana dari ekstensi fileKey
    let mimeType = "image/jpeg";
    if (fileKey.toLowerCase().endsWith(".png")) mimeType = "image/png";
    if (fileKey.toLowerCase().endsWith(".webp")) mimeType = "image/webp";
    if (fileKey.toLowerCase().endsWith(".pdf")) mimeType = "application/pdf";

    // 2. Kirim ke Qwen2.5 VL via OpenRouter
    const extractedJson = await extractDocumentData(base64Image, mimeType, customFields);

    // Hitung rata-rata confidence score untuk field utama
    let avgConfidence = 0;
    let fieldCount = 0;
    
    if (extractedJson.vendor?.confidence) { avgConfidence += extractedJson.vendor.confidence; fieldCount++; }
    if (extractedJson.date?.confidence) { avgConfidence += extractedJson.date.confidence; fieldCount++; }
    if (extractedJson.total_amount?.confidence) { avgConfidence += extractedJson.total_amount.confidence; fieldCount++; }
    
    const finalConfidence = fieldCount > 0 ? avgConfidence / fieldCount : 0;

    // Ambil document_type dan payment_method yang diklasifikasikan AI
    const documentType = extractedJson.document_type?.value || "other";
    const paymentMethod = extractedJson.payment_method?.value || "other";

    // 3. Simpan hasil ke D1 Database
    const db = process.env.DB;
    if (db) {
      const docId = uuidv4();
      const userId = user.userId;
      const rawJsonString = JSON.stringify(extractedJson);
      const lineItemsString = extractedJson.line_items ? JSON.stringify(extractedJson.line_items) : null;
      const vendorName = extractedJson.vendor?.value || "";

      // Simpan dokumen dengan document_type dan payment_method
      await db.prepare(`
        INSERT INTO documents (id, user_id, file_key, status, document_type, vendor, date, subtotal, tax_amount, total_amount, currency, payment_method, line_items, ai_confidence_score, raw_ai_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        docId,
        userId,
        fileKey,
        'PENDING',
        documentType,
        vendorName,
        extractedJson.date?.value || "",
        extractedJson.subtotal?.value || null,
        extractedJson.tax_amount?.value || null,
        extractedJson.total_amount?.value || 0,
        extractedJson.currency?.value || "",
        paymentMethod,
        lineItemsString,
        finalConfidence,
        rawJsonString
      ).run();

      // 4. Auto-create atau update Template berdasarkan vendor
      // Cek apakah sudah ada template untuk vendor yang sama
      if (vendorName) {
        const existingTemplate = await db.prepare(`
          SELECT id, usage_count FROM document_templates 
          WHERE user_id = ? AND LOWER(vendor_pattern) = LOWER(?)
        `).bind(userId, vendorName).first();

        if (existingTemplate) {
          // Template sudah ada, tambahkan usage_count
          await db.prepare(`
            UPDATE document_templates 
            SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(existingTemplate.id).run();
        } else {
          // Buat template baru otomatis
          const templateId = uuidv4();
          // Kumpulkan nama-nama field yang berhasil diekstrak AI (untuk disimpan sebagai schema)
          const extractedFieldNames = Object.keys(extractedJson).filter(
            k => k !== "line_items" && k !== "status"
          );
          const fieldSchemaString = JSON.stringify(extractedFieldNames);
          const templateName = `${vendorName} ${documentType}`.trim();

          await db.prepare(`
            INSERT INTO document_templates (id, user_id, template_name, document_type, vendor_pattern, field_schema)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            templateId,
            userId,
            templateName,
            documentType,
            vendorName,
            fieldSchemaString
          ).run();
        }
      }

      return NextResponse.json({ 
        message: "Dokumen berhasil diproses", 
        documentId: docId, 
        documentType,
        paymentMethod,
        data: extractedJson 
      });
    }

    return NextResponse.json({ 
      message: "Data diekstrak, namun gagal menyimpan ke database (DB binding hilang)", 
      data: extractedJson 
    });

  } catch (error: any) {
    console.error("Proses Ekstraksi Error:", error);
    return NextResponse.json({ error: error.message || "Terjadi kesalahan internal saat pemrosesan." }, { status: 500 });
  }
}
