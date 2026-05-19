import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  const { pathname } = req.nextUrl;

  // Daftar rute yang memerlukan login
  const protectedRoutes = ["/dashboard", "/review"];
  
  const isProtected = protectedRoutes.some(route => pathname.startsWith(route)) || pathname === "/";

  // Daftar rute auth (tidak boleh diakses jika sudah login)
  const authRoutes = ["/login", "/register"];
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));

  // Jika belum login, redirect ke login
  if (!token && isProtected) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Jika sudah login, redirect dari auth routes ke dashboard
  if (token && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
