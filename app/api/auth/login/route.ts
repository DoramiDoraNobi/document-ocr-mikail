
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { verifyPassword, createToken, createAuthCookie } from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS, safeLogError, sanitizeInput } from "@/lib/security";
import { recordAudit, getClientIP } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json() as any;

    // Validasi input
    if (!email || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi." }, { status: 400 });
    }

    const { env } = getRequestContext();
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "Database tidak tersedia." }, { status: 500 });
    }

    // Rate limiting: max 5 login attempt per 5 menit per IP
    const clientIP = getClientIP(req);
    const rateCheck = await checkRateLimit(
      db, clientIP, "login",
      RATE_LIMITS.login.maxRequests, RATE_LIMITS.login.windowSeconds
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan login. Silakan tunggu 5 menit." },
        { status: 429, headers: { "Retry-After": String(rateCheck.resetAt - Math.floor(Date.now() / 1000)) } }
      );
    }

    const cleanEmail = sanitizeInput(email, 255);

    // Cari user berdasarkan email
    const user = await db
      .prepare("SELECT id, name, email, password_hash FROM users WHERE LOWER(email) = LOWER(?)")
      .bind(cleanEmail)
      .first<{ id: string; name: string; email: string; password_hash: string }>();

    if (!user || !user.password_hash) {
      // Sengaja generik untuk mencegah user enumeration
      // Audit log: login gagal
      recordAudit(db, {
        userId: "unknown",
        action: "login_failed",
        targetType: "user",
        targetId: cleanEmail.toLowerCase(),
        details: "user not found",
        ipAddress: clientIP,
      });
      return NextResponse.json({ error: "Email atau password salah." }, { status: 401 });
    }

    // Verifikasi password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      // Audit log: login gagal (wrong password)
      recordAudit(db, {
        userId: user.id,
        action: "login_failed",
        targetType: "user",
        targetId: user.id,
        details: "wrong password",
        ipAddress: clientIP,
      });
      return NextResponse.json({ error: "Email atau password salah." }, { status: 401 });
    }

    // Buat JWT token
    const token = await createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    const cookie = createAuthCookie(token);

    // Audit log: login berhasil
    recordAudit(db, {
      userId: user.id,
      action: "login",
      targetType: "user",
      targetId: user.id,
      ipAddress: clientIP,
    });

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
  } catch (error: unknown) {
    safeLogError("LoginRoute", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat login." }, { status: 500 });
  }
}
