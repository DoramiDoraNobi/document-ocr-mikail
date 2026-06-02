
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { safeLogError } from "@/lib/security";

export async function GET(req: Request) {
  try {
    const { env } = getRequestContext();
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "Koneksi database tidak tersedia." }, { status: 500 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { results } = await db.prepare(`
      SELECT * FROM document_templates 
      WHERE user_id = ? 
      ORDER BY updated_at DESC, usage_count DESC
    `).bind(user.userId).all();

    return NextResponse.json({ templates: results });

  } catch (error) {
    safeLogError("GET /api/templates", error);
    return NextResponse.json({ error: "Gagal mengambil data template." }, { status: 500 });
  }
}
