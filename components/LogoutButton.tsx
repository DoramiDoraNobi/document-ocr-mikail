"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Gagal logout", error);
    }
  };

  return (
    <button
      onClick={handleLogout}
      style={{
        backgroundColor: "#fef2f2",
        color: "#dc2626",
        padding: "8px 16px",
        borderRadius: "6px",
        fontSize: "13px",
        fontWeight: 600,
        border: "1px solid #fecaca",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      Logout
    </button>
  );
}
