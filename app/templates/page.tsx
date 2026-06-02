"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";


const CATEGORIES = [
  "Makanan & Minuman",
  "Transportasi & Perjalanan",
  "Perlengkapan Kantor",
  "Utilitas & Tagihan",
  "Layanan Profesional",
  "Aset & Peralatan",
  "Pemasaran & Iklan",
  "Lainnya",
  "Uncategorized"
];

const DOCUMENT_TYPES: Record<string, string> = {
  receipt: "Resi/Struk",
  invoice: "Invoice",
  nota: "Nota",
  kwitansi: "Kwitansi",
  faktur_pajak: "Faktur Pajak",
  other: "Lainnya"
};

type TemplateRow = {
  id: string;
  template_name: string;
  document_type: string;
  vendor_pattern: string;
  default_category: string;
  usage_count: number;
  updated_at: string;
};

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/templates");
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Gagal mengambil data template");
      }
      const data = await res.json() as any;
      setTemplates(data.templates || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCategory = async (id: string, newCategory: string) => {
    try {
      setUpdating(true);
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_category: newCategory })
      });
      if (!res.ok) throw new Error("Gagal menyimpan kategori");
      
      setTemplates(templates.map(t => t.id === id ? { ...t, default_category: newCategory } : t));
      setEditingId(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus template "${name}"?`)) return;
    try {
      setUpdating(true);
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal menghapus template");
      
      setTemplates(templates.filter(t => t.id !== id));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const m = dateString.match(/(\\d{4}-\\d{2}-\\d{2})/);
    return m ? m[0] : dateString;
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Manajemen Template</h1>
              <p className="mt-1 text-sm text-gray-500">
                Template otomatis dibuat oleh AI. Atur kategori default agar klasifikasi lebih akurat.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center rounded-lg bg-gray-100 px-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200"
              >
                ← Kembali ke Dashboard
              </Link>
              <LogoutButton />
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <p className="text-gray-500 text-sm">Memuat data...</p>
            ) : error ? (
              <div className="text-red-500 text-sm font-semibold p-4 bg-red-50 rounded-lg">{error}</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <p>Belum ada template yang tersimpan.</p>
                <p className="text-sm mt-2">Upload dan verifikasi dokumen pertama Anda agar AI mulai membuat template.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-xs font-semibold text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3">Vendor / Nama</th>
                      <th className="px-6 py-3">Jenis Dokumen</th>
                      <th className="px-6 py-3 w-64">Kategori Default</th>
                      <th className="px-6 py-3 text-center">Dipakai (x)</th>
                      <th className="px-6 py-3">Update Terakhir</th>
                      <th className="px-6 py-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {templates.map(t => (
                      <tr key={t.id} className="bg-white hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900">{t.vendor_pattern}</p>
                          <p className="text-xs text-gray-400 mt-1">{t.template_name}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                            {DOCUMENT_TYPES[t.document_type] || t.document_type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {editingId === t.id ? (
                            <select
                              defaultValue={t.default_category || "Uncategorized"}
                              onChange={(e) => handleUpdateCategory(t.id, e.target.value)}
                              onBlur={() => setEditingId(null)}
                              disabled={updating}
                              autoFocus
                              className="w-full border border-blue-400 rounded-md p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            >
                              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                          ) : (
                            <div 
                              className="cursor-pointer inline-flex items-center gap-2 group" 
                              onClick={() => setEditingId(t.id)}
                              title="Klik untuk mengubah"
                            >
                              <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-transparent group-hover:border-gray-300">
                                {t.default_category || "Uncategorized"}
                              </span>
                              <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-gray-900">{t.usage_count}</td>
                        <td className="px-6 py-4 text-gray-500">{formatDate(t.updated_at)}</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleDelete(t.id, t.vendor_pattern)}
                            disabled={updating}
                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-md transition-colors"
                            title="Hapus template ini"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
