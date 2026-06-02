
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { safeLogError, sanitizeInput } from "@/lib/security";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const { env } = getCloudflareContext();
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "Koneksi database tidak tersedia." }, { status: 500 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as any;
    const defaultCategory = sanitizeInput(body.default_category || "Uncategorized", 100);

    await db.prepare(`
      UPDATE document_templates
      SET default_category = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      defaultCategory,
      id,
      user.userId
    ).run();

    return NextResponse.json({ success: true, message: "Kategori default berhasil diperbarui" });

  } catch (error) {
    safeLogError("PUT /api/templates/[id]", error);
    return NextResponse.json({ error: "Gagal memperbarui data template." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const { env } = getCloudflareContext();
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "Koneksi database tidak tersedia." }, { status: 500 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db.prepare("DELETE FROM document_templates WHERE id = ? AND user_id = ?").bind(id, user.userId).run();

    return NextResponse.json({ success: true, message: "Template berhasil dihapus" });

  } catch (error) {
    safeLogError("DELETE /api/templates/[id]", error);
    return NextResponse.json({ error: "Gagal menghapus template." }, { status: 500 });
  }
}
