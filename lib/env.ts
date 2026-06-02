import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getEnv(key: string): string | undefined {
  // 1. Coba ambil dari Cloudflare Pages / Workers environment (getCloudflareContext)
  try {
    const { env } = getCloudflareContext();
    if (env && (env as Record<string, any>)[key]) {
      return (env as Record<string, any>)[key];
    }
  } catch (e) {
    // Abaikan error jika dipanggil di luar konteks request (misal saat build)
  }

  // 2. Fallback ke process.env secara explisit agar Next.js bisa menggantinya saat build
  // Dilarang menggunakan process.env[key] secara dinamis karena akan memanggil polyfill Node.js
  if (typeof process !== "undefined" && process.env) {
    if (key === "JWT_SECRET") return process.env.JWT_SECRET;
    if (key === "OPENROUTER_API_KEY") return process.env.OPENROUTER_API_KEY;
    if (key === "CF_ACCOUNT_ID") return process.env.CF_ACCOUNT_ID;
    if (key === "R2_ACCESS_KEY_ID") return process.env.R2_ACCESS_KEY_ID;
    if (key === "R2_SECRET_ACCESS_KEY") return process.env.R2_SECRET_ACCESS_KEY;
    if (key === "R2_BUCKET_NAME") return process.env.R2_BUCKET_NAME;
  }

  return undefined;
}
