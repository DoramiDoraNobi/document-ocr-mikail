
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { extractSingleField } from "@/lib/ai";
import { validateMagicBytes } from "@/lib/security";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fieldName } = await req.json() as { fieldName: string };
    if (!fieldName || fieldName.trim() === "") {
      return NextResponse.json({ error: "fieldName is required" }, { status: 400 });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const bucket = env.BUCKET;

    if (!db || !bucket) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const resolvedParams = await params;

    // Ambil dokumen dari database untuk mendapatkan file_key
    const docQuery = await db.prepare("SELECT file_key FROM documents WHERE id = ? AND user_id = ?").bind(resolvedParams.id, user.userId).first();
    
    if (!docQuery || !docQuery.file_key) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const fileKey = docQuery.file_key as string;

    // Ambil file dari R2
    const object = await bucket.get(fileKey);
    if (!object) {
      return NextResponse.json({ error: "Image not found in storage" }, { status: 404 });
    }

    const arrayBuffer = await object.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
    const fileValidation = validateMagicBytes(byteArray);
    
    if (!fileValidation.valid) {
      return NextResponse.json({ error: "Invalid image file" }, { status: 400 });
    }

    const base64Image = Buffer.from(byteArray).toString("base64");

    // Panggil AI
    const extractedData = await extractSingleField(base64Image, fileValidation.mimeType, fieldName);

    // AI akan mengembalikan { "fieldName": { "value": "...", "confidence": 0.9 } }
    const fieldResult = extractedData[fieldName];

    if (!fieldResult) {
      return NextResponse.json({ error: "Failed to extract field" }, { status: 500 });
    }

    return NextResponse.json({ result: fieldResult });
  } catch (error: any) {
    console.error("Error extracting field:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
