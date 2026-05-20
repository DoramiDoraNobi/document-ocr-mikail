"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [customFields, setCustomFields] = useState("");
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      alert("Pilih file terlebih dahulu");
      return;
    }

    try {
      setLoading(true);
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatus(`[${i + 1}/${files.length}] Meminta akses untuk: ${file.name}...`);
        
        // 1. Dapatkan Presigned URL
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileType: file.type, fileSize: file.size }),
        });
        
        if (!res.ok) {
          throw new Error("Gagal mendapatkan URL upload");
        }

        const { uploadUrl, fileKey } = await res.json();

        setStatus(`[${i + 1}/${files.length}] Mengunggah dokumen...`);
        
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

        setStatus(`[${i + 1}/${files.length}] Memproses dengan AI... (Bisa memakan waktu)`);
        
        // 3. Proses menggunakan AI
        const processRes = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey, customFields: customFields.trim() }),
        });

        if (!processRes.ok) {
          throw new Error("Gagal memproses dokumen dengan AI");
        }
      }
      
      setStatus("Selesai memproses semua dokumen! Mengalihkan ke Dashboard...");
      
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);

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
            <span className="text-gray-400 text-xs mt-2">Format: JPG, PNG, WEBP, PDF (Max 5MB per file)</span>
            <input type="file" multiple style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileChange} />
          </label>
          
          {files.length > 0 && (
            <div className="mt-4 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
              <ul className="divide-y divide-gray-100">
                {files.map((f, idx) => (
                  <li key={idx} className="p-3 flex justify-between items-center text-sm text-gray-700">
                    <span className="truncate pr-4">{f.name}</span>
                    <button 
                      onClick={() => removeFile(idx)}
                      className="text-red-500 hover:text-red-700 font-medium text-xs flex-shrink-0"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            </div>
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
          disabled={files.length === 0 || loading}
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
