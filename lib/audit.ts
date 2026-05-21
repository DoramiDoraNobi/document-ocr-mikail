/**
 * Audit Log Library
 * Merekam aksi penting (upload, edit, delete, export, login) ke tabel audit_logs.
 *
 * Prinsip:
 * - Non-blocking: kegagalan audit log TIDAK boleh menggagalkan operasi utama
 * - Tidak menyimpan data sensitif (password, API key, file content)
 * - Menyimpan: siapa, kapan, apa yang dilakukan, terhadap objek apa
 */

export type AuditAction =
  | "upload"
  | "process"
  | "view"
  | "edit"
  | "verify"
  | "delete"
  | "export"
  | "login"
  | "register"
  | "login_failed";

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  targetType: string;          // "document", "user", "export"
  targetId: string;            // ID objek yang dioperasikan
  details?: string;            // Info tambahan (misal: "status changed to VERIFIED")
  ipAddress?: string;          // IP address user
}

/**
 * Rekam satu entri audit log ke D1.
 * Sengaja fire-and-forget — kegagalan di-swallow agar operasi utama tetap berjalan.
 */
export async function recordAudit(db: D1Database, entry: AuditEntry): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Batasi panjang details agar tidak menyimpan data berlebihan
    const safeDetails = entry.details
      ? entry.details.slice(0, 500)
      : null;

    await db
      .prepare(
        `INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        entry.userId,
        entry.action,
        entry.targetType,
        entry.targetId,
        safeDetails,
        entry.ipAddress || null,
        now
      )
      .run();
  } catch {
    // Audit log gagal — jangan gagalkan operasi utama
    // Di production, bisa kirim ke external error tracker
    console.error("[AuditLog] Failed to record audit entry");
  }
}

/**
 * Ambil IP address dari request headers.
 * Di Cloudflare, IP tersedia di header CF-Connecting-IP.
 */
export function getClientIP(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
