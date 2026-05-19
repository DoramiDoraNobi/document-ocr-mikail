"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal mendaftar. Silakan coba lagi.");
      }

      // Berhasil register, redirect ke dashboard
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb", padding: "24px" }}>
      <div style={{ backgroundColor: "#fff", padding: "40px", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", width: "100%", maxWidth: "400px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#1f2937", textAlign: "center", marginBottom: "8px" }}>Buat Akun</h1>
        <p style={{ fontSize: "14px", color: "#6b7280", textAlign: "center", marginBottom: "32px" }}>Mulai otomasi pemrosesan dokumen Anda sekarang.</p>
        
        {error && (
          <div style={{ backgroundColor: "#fef2f2", color: "#b91c1c", padding: "12px", borderRadius: "8px", fontSize: "14px", marginBottom: "20px", border: "1px solid #fca5a5" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Nama Lengkap</label>
            <input 
              type="text" 
              name="name" 
              required 
              placeholder="John Doe"
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", outline: "none", boxSizing: "border-box" }} 
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Email</label>
            <input 
              type="email" 
              name="email" 
              required 
              placeholder="nama@email.com"
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", outline: "none", boxSizing: "border-box" }} 
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Password</label>
            <input 
              type="password" 
              name="password" 
              required 
              placeholder="Minimal 8 karakter"
              minLength={8}
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", outline: "none", boxSizing: "border-box" }} 
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            style={{ width: "100%", padding: "14px", backgroundColor: "#2563eb", color: "#fff", fontWeight: 600, border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, marginTop: "8px", fontSize: "15px" }}
          >
            {loading ? "Memproses..." : "Daftar"}
          </button>
        </form>

        <p style={{ marginTop: "24px", textAlign: "center", fontSize: "14px", color: "#6b7280" }}>
          Sudah punya akun? <Link href="/login" style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>Masuk di sini</Link>
        </p>
      </div>
    </main>
  );
}
