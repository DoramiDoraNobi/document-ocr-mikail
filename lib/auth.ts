/**
 * Auth Library — Secure Edge-compatible authentication
 * Menggunakan Web Crypto API (PBKDF2) untuk hashing password
 * dan library `jose` untuk JWT signing/verification.
 * 
 * KEAMANAN:
 * - Password di-hash dengan PBKDF2-SHA256 + 100.000 iterasi + random salt
 * - JWT disimpan di httpOnly cookie (tidak bisa diakses JavaScript)
 * - Setiap JWT berisi user_id yang digunakan untuk Row-Level Security
 */

import { SignJWT, jwtVerify } from "jose";

import { getEnv } from "./env";

// JWT Secret key — di production harus dari environment variable
function getJwtSecret(): Uint8Array {
  const secret = getEnv("JWT_SECRET") || "smart-doc-reader-default-secret-change-in-prod-2026";
  return new TextEncoder().encode(secret);
}

const JWT_EXPIRY = "7d"; // Token berlaku 7 hari
const COOKIE_NAME = "auth_token";

// ========================================
// PASSWORD HASHING (Web Crypto API — Edge Compatible)
// ========================================

/**
 * Generate random salt (16 bytes)
 */
function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash password menggunakan PBKDF2-SHA256 dengan 100.000 iterasi
 */
async function hashWithPBKDF2(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const saltBytes = new Uint8Array(salt.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash password dan kembalikan format "salt:hash"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const hash = await hashWithPBKDF2(password, salt);
  return `${salt}:${hash}`;
}

/**
 * Verifikasi password terhadap hash yang tersimpan
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const computedHash = await hashWithPBKDF2(password, salt);
  return computedHash === hash;
}

// ========================================
// JWT TOKEN MANAGEMENT
// ========================================

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
}

/**
 * Buat JWT token baru
 */
export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

/**
 * Verifikasi dan decode JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

// ========================================
// COOKIE HELPERS
// ========================================

/**
 * Buat Set-Cookie header untuk auth token (httpOnly, secure, SameSite=Lax)
 */
export function createAuthCookie(token: string): string {
  const maxAge = 7 * 24 * 60 * 60; // 7 hari dalam detik
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/**
 * Buat Set-Cookie header untuk menghapus auth token (logout)
 */
export function createLogoutCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Ekstrak token dari cookie header
 */
export function getTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map(c => c.trim());
  const authCookie = cookies.find(c => c.startsWith(`${COOKIE_NAME}=`));
  if (!authCookie) return null;
  return authCookie.split("=")[1] || null;
}

// ========================================
// REQUEST AUTH HELPER
// ========================================

/**
 * Ambil user yang sedang login dari request (cookie)
 * Digunakan di semua API route dan Server Components
 */
export async function getAuthUser(req: Request): Promise<JWTPayload | null> {
  const cookieHeader = req.headers.get("cookie");
  const token = getTokenFromCookies(cookieHeader);
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Helper untuk Server Components — ambil token dari headers
 */
export async function getAuthUserFromHeaders(headers: Headers): Promise<JWTPayload | null> {
  const cookieHeader = headers.get("cookie");
  const token = getTokenFromCookies(cookieHeader);
  if (!token) return null;
  return verifyToken(token);
}
