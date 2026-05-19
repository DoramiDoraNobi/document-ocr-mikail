export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { hashPassword, createToken, createAuthCookie } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    // Validasi input
    if (!name || !email || !password) {
      return NextResponse.json({ error: "Nama, email, dan password wajib diisi." }, { status: 400 });
    }

    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Nama harus minimal 2 karakter." }, { status: 400 });
    }

    if (typeof email !== "string" || !email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password harus minimal 8 karakter." }, { status: 400 });
    }

    const { env } = getRequestContext();
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "Database tidak tersedia." }, { status: 500 });
    }

    // Cek apakah email sudah terdaftar
    const existingUser = await db
      .prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?)")
      .bind(email.trim())
      .first();

    if (existingUser) {
      return NextResponse.json({ error: "Email sudah terdaftar. Silakan login." }, { status: 409 });
    }

    // Hash password
    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Insert user baru
    await db
      .prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
      .bind(userId, cleanName, cleanEmail, passwordHash)
      .run();

    // Buat JWT token
    const token = await createToken({ userId, email: cleanEmail, name: cleanName });
    const cookie = createAuthCookie(token);

    return NextResponse.json(
      { success: true, user: { id: userId, name: cleanName, email: cleanEmail } },
      { headers: { "Set-Cookie": cookie } }
    );
  } catch (error: any) {
    console.error("Register Error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat mendaftar." }, { status: 500 });
  }
}
