
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { safeLogError, sanitizeInput } from "@/lib/security";
import { recordAudit, getClientIP } from "@/lib/audit";

// GET: Ambil detail dokumen tunggal beserta URL Rute Lokal
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
    const doc = await db.prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?").bind(id, user.userId).first<any>();

    if (!doc) {
      return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    }

    // Gunakan rute lokal untuk melihat file R2
    const viewUrl = `/api/documents/${id}/file`;

    // Audit log: rekam aksi view
    recordAudit(db, {
      userId: user.userId,
      action: "view",
      targetType: "document",
      targetId: id,
      ipAddress: getClientIP(req),
    });

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
    safeLogError("GET /api/documents/[id]", error);
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

    const body = await req.json() as any;
    const status = body.status || "PENDING";
    
    // Fallback ekstraksi field default agar Dashboard tetap berjalan
    const vendor = sanitizeInput(body.vendor?.value || body["Nama Vendor"]?.value || "", 255);
    const date = sanitizeInput(body.date?.value || body.tanggal?.value || "", 50);
    const total_amount = parseFloat(body.total_amount?.value || 0);
    const currency = sanitizeInput(body.currency?.value || "", 10);
    const category = sanitizeInput(body.category?.value || "Uncategorized", 100);
    const reference_number = sanitizeInput(body.reference_number?.value || "", 100);
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

    // Audit log: rekam aksi edit/verify
    const auditAction = status === "VERIFIED" ? "verify" as const : "edit" as const;
    recordAudit(db, {
      userId: user.userId,
      action: auditAction,
      targetType: "document",
      targetId: id,
      details: `status=${status}, vendor=${vendor}`,
      ipAddress: getClientIP(req),
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    safeLogError("PUT /api/documents/[id]", error);
    return NextResponse.json({ error: "Gagal memperbarui data dokumen." }, { status: 500 });
  }
}

// DELETE: Hapus dokumen dari database dan R2
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

    // Ambil file_key sebelum menghapus, agar bisa hapus file dari R2
    const doc = await db.prepare("SELECT file_key FROM documents WHERE id = ? AND user_id = ?").bind(id, user.userId).first<{ file_key: string }>();

    if (!doc) {
      return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    }

    // Hapus dari database
    await db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").bind(id, user.userId).run();

    // Hapus file dari R2 (cleanup, agar tidak ada file orphan)
    const bucket = env.BUCKET;
    if (bucket) {
      try {
        await bucket.delete(doc.file_key);
      } catch (r2Error) {
        // R2 delete gagal — log tapi jangan gagalkan operasi (file orphan lebih baik daripada error)
        safeLogError("R2DeleteFile", r2Error);
      }
    }

    // Audit log: rekam aksi hapus
    recordAudit(db, {
      userId: user.userId,
      action: "delete",
      targetType: "document",
      targetId: id,
      details: `file_key=${doc.file_key}`,
      ipAddress: getClientIP(req),
    });

    return NextResponse.json({ success: true, message: "Dokumen dihapus" });

  } catch (error) {
    safeLogError("DELETE /api/documents/[id]", error);
    return NextResponse.json({ error: "Gagal menghapus dokumen." }, { status: 500 });
  }
}
