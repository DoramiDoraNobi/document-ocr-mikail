import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

export const runtime = "edge";

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
      return new Response("Koneksi database tidak tersedia.", { status: 500 });
    }
    
    const user = await getAuthUser(req);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    const doc = await db.prepare("SELECT file_key FROM documents WHERE id = ? AND user_id = ?").bind(id, user.userId).first<{ file_key: string }>();
    if (!doc) {
      return new Response("Dokumen tidak ditemukan.", { status: 404 });
    }
    
    const object = await env.BUCKET.get(doc.file_key);
    if (!object) {
      return new Response("File tidak ditemukan di R2.", { status: 404 });
    }
    
    // Set content type and return body
    const headers = new Headers();
    headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
    headers.set("Cache-Control", "public, max-age=3600");
    
    return new Response(object.body, { headers });
  } catch (error) {
    console.error("Error fetching file:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
