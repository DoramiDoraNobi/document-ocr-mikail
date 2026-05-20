export const runtime = "edge";

import { extractDocumentData } from "@/lib/ai";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestContext } from "@cloudflare/next-on-pages";

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

    const { env } = getRequestContext();
    const bucket = env.BUCKET;

    if (!bucket) {
      return NextResponse.json({ error: "Konfigurasi server salah (Bucket tidak ditemukan)." }, { status: 500 });
    }

    // 1. Ambil gambar dari R2
    const object = await bucket.get(fileKey);

    if (!object) {
      return NextResponse.json({ error: "File tidak ditemukan di R2" }, { status: 404 });
    }

    // Convert file Stream/Blob to Base64
    const arrayBuffer = await object.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
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

    // Ambil document_type, payment_method, dan category yang diklasifikasikan AI
    const documentType = extractedJson.document_type?.value || "other";
    const paymentMethod = extractedJson.payment_method?.value || "other";
    let category = extractedJson.category?.value || "Uncategorized";
    const referenceNumber = extractedJson.reference_number?.value || "";

    // 3. Simpan hasil ke D1 Database
    const db = env.DB;
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
    console.error("Proses Ekstraksi Error:", error);
    const message = error instanceof Error ? error.message : "Terjadi kesalahan internal saat pemrosesan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
