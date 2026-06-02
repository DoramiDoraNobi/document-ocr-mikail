/**
 * Security Utilities
 * - Magic bytes file validation (verifikasi tipe file dari header, bukan MIME type client)
 * - Rate limiting in-app menggunakan D1
 */

// ========================================
// MAGIC BYTES VALIDATION
// ========================================

interface FileTypeResult {
  valid: boolean;
  detectedType: string;
  mimeType: string;
}

/**
 * Verifikasi tipe file berdasarkan magic bytes (file header).
 * Ini lebih aman daripada mengandalkan MIME type dari client,
 * karena client bisa mengirim MIME type palsu.
 *
 * Mendukung: JPEG, PNG, PDF, WebP
 */
export function validateMagicBytes(bytes: Uint8Array): FileTypeResult {
  if (bytes.length < 4) {
    return { valid: false, detectedType: "unknown", mimeType: "unknown" };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return { valid: true, detectedType: "jpeg", mimeType: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4E && bytes[3] === 0x47
  ) {
    return { valid: true, detectedType: "png", mimeType: "image/png" };
  }

  // PDF: 25 50 44 46 (%PDF)
  if (
    bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46
  ) {
    return { valid: true, detectedType: "pdf", mimeType: "application/pdf" };
  }

  // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF....WEBP)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 &&
    bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 &&
    bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { valid: true, detectedType: "webp", mimeType: "image/webp" };
  }

  return { valid: false, detectedType: "unknown", mimeType: "unknown" };
}

// ========================================
// RATE LIMITING (menggunakan D1)
// ========================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp (seconds)
}

/**
 * Rate limiter sederhana menggunakan D1.
 * Menghitung jumlah request per key (misal: userId atau IP) dalam window waktu tertentu.
 *
 * @param db - D1 Database instance
 * @param key - Identifier unik (userId, IP address, dsb.)
 * @param action - Nama aksi yang di-limit (misal: "upload", "process", "login")
 * @param maxRequests - Jumlah request maksimal dalam window
 * @param windowSeconds - Durasi window dalam detik
 */
export async function checkRateLimit(
  db: D1Database,
  key: string,
  action: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;

  // Hitung request dalam window
  const countResult = await db
    .prepare(
      "SELECT COUNT(*) as cnt FROM rate_limits WHERE key = ? AND action = ? AND created_at > ?"
    )
    .bind(key, action, windowStart)
    .first<{ cnt: number }>();

  const currentCount = countResult?.cnt || 0;

  if (currentCount >= maxRequests) {
    // Cari kapan request pertama dalam window expire
    const oldestResult = await db
      .prepare(
        "SELECT MIN(created_at) as oldest FROM rate_limits WHERE key = ? AND action = ? AND created_at > ?"
      )
      .bind(key, action, windowStart)
      .first<{ oldest: number }>();

    const resetAt = (oldestResult?.oldest || now) + windowSeconds;
    return { allowed: false, remaining: 0, resetAt };
  }

  // Catat request baru
  await db
    .prepare("INSERT INTO rate_limits (key, action, created_at) VALUES (?, ?, ?)")
    .bind(key, action, now)
    .run();

  // Bersihkan record lama (di luar window) — housekeeping supaya tabel tidak membengkak
  // Hanya jalankan cleanup sekali-sekali (probabilistik, ~10% chance per request)
  if (Math.random() < 0.1) {
    await db
      .prepare("DELETE FROM rate_limits WHERE created_at < ?")
      .bind(windowStart - windowSeconds) // Hapus yang sudah 2x window lalu
      .run();
  }

  return {
    allowed: true,
    remaining: maxRequests - currentCount - 1,
    resetAt: now + windowSeconds,
  };
}

// Konfigurasi rate limit per endpoint
export const RATE_LIMITS = {
  upload: { maxRequests: 20, windowSeconds: 60 },      // 20 upload per menit
  process: { maxRequests: 10, windowSeconds: 60 },     // 10 proses AI per menit
  login: { maxRequests: 5, windowSeconds: 300 },       // 5 login attempt per 5 menit
  export: { maxRequests: 10, windowSeconds: 60 },      // 10 export per menit
} as const;

// ========================================
// SAFE LOGGING
// ========================================

/**
 * Log error tanpa membocorkan data sensitif.
 * Hanya log message dan nama error, bukan seluruh stack/response body.
 */
export function safeLogError(context: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`[${context}] ${error.name}: ${error.message}`);
  } else if (typeof error === "string") {
    console.error(`[${context}] Error: ${error}`);
  } else {
    console.error(`[${context}] Non-Error thrown (${typeof error}):`, error);
  }
}

// ========================================
// INPUT SANITIZATION
// ========================================

/**
 * Sanitasi string input — trim, hapus null bytes, batasi panjang.
 */
export function sanitizeInput(value: unknown, maxLength: number = 500): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/\0/g, "")       // Hapus null bytes
    .slice(0, maxLength);      // Batasi panjang
}
