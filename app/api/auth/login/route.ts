export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { verifyPassword, createToken, createAuthCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // Validasi input
    if (!email || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi." }, { status: 400 });
    }

    const { env } = getRequestContext();
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "Database tidak tersedia." }, { status: 500 });
    }

    // Cari user berdasarkan email
    const user = await db
      .prepare("SELECT id, name, email, password_hash FROM users WHERE LOWER(email) = LOWER(?)")
      .bind(email.trim())
      .first();

    if (!user || !user.password_hash) {
      // Sengaja generik untuk mencegah user enumeration
      return NextResponse.json({ error: "Email atau password salah." }, { status: 401 });
    }

    // Verifikasi password
    const isValid = await verifyPassword(password, user.password_hash as string);
    if (!isValid) {
      return NextResponse.json({ error: "Email atau password salah." }, { status: 401 });
    }

    // Buat JWT token
    const token = await createToken({
      userId: user.id as string,
      email: user.email as string,
      name: user.name as string,
    });
    const cookie = createAuthCookie(token);

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { headers: { "Set-Cookie": cookie } }
    );
  } catch (error: any) {
    console.error("Login Error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat login." }, { status: 500 });
  }
}
