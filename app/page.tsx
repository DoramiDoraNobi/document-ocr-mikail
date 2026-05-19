"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [customFields, setCustomFields] = useState("");
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Pilih file terlebih dahulu");
      return;
    }

    try {
      setLoading(true);
      setStatus("1/3: Meminta akses upload ke penyimpanan aman...");
      
      // 1. Dapatkan Presigned URL
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileType: file.type, fileSize: file.size }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Gagal mendapatkan URL upload");
      }

      const { uploadUrl, fileKey } = await res.json();

      setStatus("2/3: Mengunggah dokumen...");
      
      // 2. Upload file langsung ke R2
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Gagal mengunggah file ke Cloudflare R2");
      }

      setStatus("3/3: Memproses dokumen dengan AI...");
      
      // 3. Proses menggunakan OpenRouter (Qwen2.5 VL)
      const processRes = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey, customFields: customFields.trim() }),
      });

      if (!processRes.ok) {
        throw new Error("Gagal memproses dokumen dengan AI");
      }

      const processData = await processRes.json();
      
      setStatus("Mengalihkan ke halaman Koreksi...");
      
      // Redirect ke halaman review secara otomatis
      if (processData.documentId) {
        router.push(`/review/${processData.documentId}`);
      } else {
        router.push("/dashboard");
      }
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Terjadi kesalahan.");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50 flex flex-col items-center justify-center">
      <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Smart Document Reader</h1>
          <a href="/dashboard" className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition whitespace-nowrap ml-2">
            Dashboard ➔
          </a>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Upload resi/invoice Anda. Dokumen Anda akan diproses secara aman.
        </p>

        <div className="mb-6">
          <label className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors text-center">
            <svg style={{ width: '48px', height: '48px' }} className="text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="text-gray-600 font-medium text-sm md:text-base">Klik untuk memilih atau seret gambar ke sini</span>
            <span className="text-gray-400 text-xs mt-2">Format: JPG, PNG, WEBP, PDF (Max 5MB)</span>
            <input type="file" style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileChange} />
          </label>
          {file && (
            <p className="mt-2 text-xs text-gray-600 text-center truncate">{file.name}</p>
          )}
        </div>

        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Kustomisasi Field Ekstraksi (Opsional)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Bila dikosongkan, AI akan mengekstrak: Vendor, Tanggal, Total, dan Daftar Item. 
            Anda bisa memasukkan field khusus, misalnya: <span className="italic font-mono">Nama Pasien, Nama Dokter, Obat</span>
          </p>
          <input 
            type="text" 
            placeholder="Contoh: Nama Supir, Plat Nomor, Berat Barang"
            value={customFields}
            onChange={(e) => setCustomFields(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded transition"
        >
          {loading ? "Memproses..." : "Upload & Ekstrak"}
        </button>

        {status && (
          <p className="mt-4 text-sm text-center text-blue-600 font-medium">
            {status}
          </p>
        )}
        
        <div className="mt-8 border-t pt-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Security Notice</h2>
          <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
            <li>Koneksi terenkripsi (TLS)</li>
            <li>File langsung diunggah ke *Secure Bucket* (R2)</li>
            <li>Menggunakan Vision LLM pasif (Anti-Injection)</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
