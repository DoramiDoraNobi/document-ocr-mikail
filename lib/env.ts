import { getCloudflareContext } from "@opennextjs/cloudflare";

function isPlaceholder(val: any): boolean {
  if (typeof val !== "string") return false;
  return val.startsWith("your_") && val.endsWith("_here");
}

export function getEnv(key: string): string | undefined {
  // 1. Coba ambil dari Cloudflare Pages / Workers environment (getCloudflareContext)
  try {
    const { env } = getCloudflareContext();
    const val = env && (env as Record<string, any>)[key];
    if (val && !isPlaceholder(val)) {
      return val;
    }
  } catch (e) {
    // Abaikan error jika dipanggil di luar konteks request (misal saat build)
  }

  // 2. Fallback ke process.env secara explisit agar Next.js bisa menggantinya saat build
  // Dilarang menggunakan process.env[key] secara dinamis karena akan memanggil polyfill Node.js
  if (typeof process !== "undefined" && process.env) {
    let val: string | undefined = undefined;
    if (key === "JWT_SECRET") val = process.env.JWT_SECRET;
    if (key === "OPENROUTER_API_KEY") val = process.env.OPENROUTER_API_KEY;
    if (key === "CF_ACCOUNT_ID") val = process.env.CF_ACCOUNT_ID;
    if (key === "R2_ACCESS_KEY_ID") val = process.env.R2_ACCESS_KEY_ID;
    if (key === "R2_SECRET_ACCESS_KEY") val = process.env.R2_SECRET_ACCESS_KEY;
    if (key === "R2_BUCKET_NAME") val = process.env.R2_BUCKET_NAME;

    if (val && !isPlaceholder(val)) {
      return val;
    }
  }

  return undefined;
}
