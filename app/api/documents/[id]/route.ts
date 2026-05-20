export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

// GET: Ambil detail dokumen tunggal beserta URL R2 Presigned
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const { env } = getRequestContext();
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "Koneksi database tidak tersedia." }, { status: 500 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ambil dokumen dari D1
    const doc = await db.prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?").bind(id, user.userId).first();

    if (!doc) {
      return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    }

    // Gunakan rute lokal untuk melihat file R2
    const viewUrl = `/api/documents/${id}/file`;

    return NextResponse.json({
      document: {
        id: doc.id,
        user_id: doc.user_id,
        file_key: doc.file_key,
        status: doc.status,
        document_type: doc.document_type,
        vendor: doc.vendor,
        date: doc.date,
        subtotal: doc.subtotal,
        tax_amount: doc.tax_amount,
        total_amount: doc.total_amount,
        currency: doc.currency,
        payment_method: doc.payment_method,
        category: doc.category,
        reference_number: doc.reference_number,
        is_duplicate: doc.is_duplicate,
        line_items: doc.line_items ? JSON.parse(doc.line_items as string) : [],
        ai_confidence_score: doc.ai_confidence_score,
        raw_ai_json: doc.raw_ai_json ? JSON.parse(doc.raw_ai_json as string) : null,
        final_json: doc.final_json ? JSON.parse(doc.final_json as string) : null,
        created_at: doc.created_at,
        viewUrl,
      }
    });

  } catch (error) {
    console.error("Error GET /api/documents/[id]:", error);
    return NextResponse.json({ error: "Gagal mengambil data dokumen." }, { status: 500 });
  }
}

// PUT: Perbarui data dokumen (Verifikasi/Koreksi Manual)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const { env } = getRequestContext();
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "Koneksi database tidak tersedia." }, { status: 500 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const status = body.status || "PENDING";
    
    // Fallback ekstraksi field default agar Dashboard tetap berjalan
    const vendor = body.vendor?.value || body["Nama Vendor"]?.value || "";
    const date = body.date?.value || body.tanggal?.value || "";
    const total_amount = parseFloat(body.total_amount?.value || 0);
    const currency = body.currency?.value || "";
    const category = body.category?.value || "Uncategorized";
    const reference_number = body.reference_number?.value || "";
    const is_duplicate = 0; // Bersihkan flag duplikat saat diverifikasi manual

    // Simpan seluruh state dynamic form ke final_json
    const finalJsonString = JSON.stringify(body);

    await db.prepare(`
      UPDATE documents
      SET vendor = ?, date = ?, total_amount = ?, currency = ?, status = ?, category = ?, reference_number = ?, is_duplicate = ?, final_json = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      vendor,
      date,
      total_amount,
      currency,
      status,
      category,
      reference_number,
      is_duplicate,
      finalJsonString,
      id,
      user.userId
    ).run();

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error PUT /api/documents/[id]:", error);
    return NextResponse.json({ error: "Gagal memperbarui data dokumen." }, { status: 500 });
  }
}

// DELETE: Hapus dokumen dari database
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const { env } = getRequestContext();
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "Koneksi database tidak tersedia." }, { status: 500 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Hanya hapus dari database untuk sekarang (idealnya hapus dari R2 juga)
    await db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").bind(id, user.userId).run();

    return NextResponse.json({ success: true, message: "Dokumen dihapus" });

  } catch (error) {
    console.error("Error DELETE /api/documents/[id]:", error);
    return NextResponse.json({ error: "Gagal menghapus dokumen." }, { status: 500 });
  }
}
