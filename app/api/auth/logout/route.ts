export const runtime = "edge";

import { NextResponse } from "next/server";
import { createLogoutCookie } from "@/lib/auth";

export async function POST() {
  const cookie = createLogoutCookie();
  return NextResponse.json(
    { success: true, message: "Berhasil logout." },
    { headers: { "Set-Cookie": cookie } }
  );
}
