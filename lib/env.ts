import { getRequestContext } from "@cloudflare/next-on-pages";

export function getEnv(key: string): string | undefined {
  // 1. Coba ambil dari Cloudflare Pages / Workers environment (getRequestContext)
  try {
    const { env } = getRequestContext();
    if (env && (env as Record<string, any>)[key]) {
      return (env as Record<string, any>)[key];
    }
  } catch (e) {
    // Abaikan error jika dipanggil di luar konteks request (misal saat build)
  }

  // 2. Fallback ke process.env untuk development lokal (Node.js standar)
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }

  return undefined;
}
