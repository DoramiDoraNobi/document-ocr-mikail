"use client";

export const runtime = "edge";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

// Komponen Badge Peringatan Keamanan / Confidence
const ConfidenceBadge = ({ score }: { score: number }) => {
  if (score >= 0.8) return <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Yakin ({(score * 100).toFixed(0)}%)</span>;
  if (score >= 0.5) return <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Cek Ulang ({(score * 100).toFixed(0)}%)</span>;
  return <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded font-bold">Ragu ({(score * 100).toFixed(0)}%)</span>;
};

const initialData = {
  document_type: { value: "other", confidence: 1.0 },
  category: { value: "Uncategorized", confidence: 1.0 },
  reference_number: { value: "", confidence: 1.0 },
  vendor: { value: "", confidence: 1.0 },
  date: { value: "", confidence: 1.0 },
  subtotal: { value: 0, confidence: 1.0 },
  tax_amount: { value: 0, confidence: 1.0 },
  total_amount: { value: 0, confidence: 1.0 },
  currency: { value: "IDR", confidence: 1.0 },
  payment_method: { value: "other", confidence: 1.0 },
  line_items: [] as any[]
};

type FormData = Record<string, any>;

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();

  const [originalDocument, setOriginalDocument] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>(initialData);
  const [isDuplicate, setIsDuplicate] = useState(0);
  const [viewUrl, setViewUrl] = useState<string>("");
  const [fileKey, setFileKey] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  
  // On-the-fly Extraction State
  const [newFieldName, setNewFieldName] = useState("");
  const [extractingField, setExtractingField] = useState(false);
  const [extractError, setExtractError] = useState("");

  useEffect(() => {
    async function fetchDocument() {
      try {
        setLoading(true);
        const res = await fetch(`/api/documents/${id}`);
        if (!res.ok) {
          throw new Error("Gagal mengambil data dokumen");
        }
        const data = await res.json() as any;
        const doc = data.document;

        if (doc) {
          setOriginalDocument(doc);
          setIsDuplicate(doc.is_duplicate || 0);

          const raw = doc.raw_ai_json || {};
          const finalData = doc.final_json || raw;
          
          setFormData(finalData);
          setViewUrl(doc.viewUrl || "");
          setFileKey(doc.file_key || "");
        }
      } catch (err: any) {
        setError(err.message || "Gagal memuat dokumen.");
      } finally {
        setLoading(false);
      }
    }

    fetchDocument();
  }, [id]);

  const handleLineItemChange = (idx: number, field: string, value: any) => {
    const items = [...(formData.line_items || formData.items || [])];
    items[idx] = { ...items[idx], [field]: value };
    setFormData({ ...formData, line_items: items });
  };

  const addLineItem = () => {
    const items = [...(formData.line_items || formData.items || [])];
    items.push({ description: "", quantity: 1, unit_price: 0, total_price: 0 });
    setFormData({ ...formData, line_items: items });
  };

  const removeLineItem = (idx: number) => {
    const items = [...(formData.line_items || formData.items || [])];
    items.splice(idx, 1);
    setFormData({ ...formData, line_items: items });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch(`/api/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          status: "VERIFIED"
        }),
      });

      if (!res.ok) {
        throw new Error("Gagal menyimpan koreksi data");
      }

      alert("Berhasil disimpan!");
      router.push("/dashboard");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExtractField = async () => {
    if (!newFieldName.trim()) return;
    try {
      setExtractingField(true);
      setExtractError("");
      const res = await fetch(`/api/documents/${id}/extract-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldName: newFieldName.trim() }),
      });
      const data = await res.json() as any;
      
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengekstrak field baru");
      }
      
      if (data.result) {
        setFormData(prev => ({
          ...prev,
          [newFieldName.trim()]: data.result
        }));
        setNewFieldName("");
      }
    } catch (err: any) {
      setExtractError(err.message);
    } finally {
      setExtractingField(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Apakah Anda yakin ingin menghapus dokumen ini secara permanen?")) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Gagal menghapus dokumen");
      }

      alert("Dokumen berhasil dihapus!");
      router.push("/dashboard");
    } catch (err: any) {
      alert(err.message || "Gagal menghapus.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <p className="text-lg font-semibold text-gray-600">Memuat data dokumen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-6 rounded-xl shadow max-w-md text-center">
          <p className="text-red-600 font-bold mb-4">Error: {error}</p>
          <button onClick={() => router.push("/dashboard")} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isPdf = fileKey.toLowerCase().endsWith(".pdf");

  return (
    <main className="min-h-screen p-8 bg-gray-50 flex gap-8">
      {/* Kiri: Viewer Gambar Dokumen */}
      <div className="flex-1 bg-gray-200 rounded-xl shadow-inner flex items-center justify-center p-4 min-h-[500px] overflow-hidden">
        {viewUrl ? (
          isPdf ? (
            <iframe src={viewUrl} className="w-full h-full min-h-[600px] rounded-lg border-0" />
          ) : (
            <div className="relative inline-block max-w-full max-h-full">
              <img src={viewUrl} alt="Dokumen Asli" className="max-w-full max-h-[85vh] w-auto h-auto rounded-lg shadow-md block" />
              <svg 
                className="absolute top-0 left-0 w-full h-full pointer-events-none rounded-lg z-10" 
                viewBox="0 0 1000 1000" 
                preserveAspectRatio="none"
              >
                {Object.keys(formData).map(key => {
                  if (key === "line_items" || key === "items" || key === "status") return null;
                  const field = formData[key] as any;
                  if (field && typeof field === "object" && field.box && typeof field.box === "object") {
                    const { x, y, w, h } = field.box;
                    if (x === undefined || y === undefined || w === undefined || h === undefined) return null;
                    
                    const confidence = field.confidence || 0;
                    
                    let strokeColor = "rgba(220, 38, 38, 0.9)"; // Red
                    let fillColor = "rgba(220, 38, 38, 0.2)";
                    if (confidence >= 0.8) {
                      strokeColor = "rgba(22, 163, 74, 0.9)"; // Green
                      fillColor = "rgba(22, 163, 74, 0.2)";
                    } else if (confidence >= 0.5) {
                      strokeColor = "rgba(202, 138, 4, 0.9)"; // Yellow
                      fillColor = "rgba(202, 138, 4, 0.2)";
                    }

                    return (
                      <g key={key}>
                        <rect 
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          stroke={strokeColor}
                          strokeWidth="4"
                          fill={fillColor}
                          rx="4"
                        />
                        <text 
                          x={x} 
                          y={Math.max(20, y - 10)} 
                          fill={strokeColor} 
                          fontSize="24" 
                          fontWeight="bold"
                          style={{ textShadow: "1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white" }}
                        >
                          {key}
                        </text>
                      </g>
                    );
                  }
                  return null;
                })}
              </svg>
            </div>
          )
        ) : (
          <div className="text-gray-500 text-center">
            <p className="text-lg">Berkas asli tidak dapat dimuat</p>
          </div>
        )}
      </div>

      {/* Kanan: Form Koreksi */}
      <div className="w-[500px] shrink-0 bg-white p-6 rounded-xl shadow-lg flex flex-col h-fit">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Koreksi Data Dokumen</h2>
          <button onClick={() => router.push("/dashboard")} className="text-xs text-gray-500 hover:text-gray-700">
            Batal
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-6 break-all">ID: {id}</p>
        
        {/* Banner Deteksi Fraud / Anomali */}
        {(formData.fraud_analysis?.is_suspicious || formData.fraud_analysis?.value?.is_suspicious) && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-r-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 text-red-800 font-bold mb-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Potensi Anomali Terdeteksi</span>
              {(formData.fraud_analysis.anomaly_score || formData.fraud_analysis.value?.anomaly_score) > 0 && (
                <span className="text-xs bg-red-200 text-red-900 px-2 py-0.5 rounded-full ml-auto">
                  Skor: {formData.fraud_analysis.anomaly_score || formData.fraud_analysis.value?.anomaly_score}/10
                </span>
              )}
            </div>
            <p className="text-sm text-red-700 ml-7">
              {formData.fraud_analysis.reason || formData.fraud_analysis.value?.reason || "AI mendeteksi adanya kejanggalan pada dokumen ini. Mohon periksa kembali."}
            </p>
          </div>
        )}

        {/* Loop Dynamic Fields */}
        {Object.keys(formData).map((key) => {
          if (key === "line_items" || key === "items" || key === "status" || key === "fraud_analysis") return null;
          
          const field = formData[key];
          // Pastikan field adalah object yang memiliki value (sesuai format AI)
          if (!field || typeof field !== "object" || !("value" in field)) return null;

          // Mempercantik nama label, e.g. "total_amount" menjadi "Total Amount"
          const labelName = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
          const isNumber = typeof field.value === "number" || key === "total_amount";

          return (
            <div className="mb-4" key={key}>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-semibold text-gray-700">{labelName}</label>
                <ConfidenceBadge score={field.confidence ?? 1.0} />
              </div>
              <div className="relative">
                {key === "total_amount" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rp</span>}
                <input 
                  type={isNumber ? "number" : "text"} 
                  value={field.value}
                  onChange={(e) => setFormData({
                    ...formData, 
                    [key]: { 
                      ...field, 
                      value: isNumber ? parseFloat(e.target.value) || 0 : e.target.value 
                    }
                  })}
                  className={`border p-2 rounded w-full text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${key === "total_amount" ? 'pl-9 ' : ''} ${field.confidence < 0.7 ? 'border-yellow-500 bg-yellow-50' : 'border-gray-300'}`}
                />
              </div>
              {field.confidence < 0.7 && (
                <p className="text-xs text-yellow-600 mt-1">⚠️ AI kurang yakin dengan isian ini, mohon periksa manual.</p>
              )}
            </div>
          );
        })}

        {/* Daftar Item Rinci (Line Items) */}
        <div className="mb-6 border-t pt-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-semibold text-gray-700">
              Daftar Item Rinci ({((formData as any).line_items || (formData as any).items || []).length} item)
            </label>
            <button
              onClick={addLineItem}
              className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded font-semibold border border-blue-200"
            >
              + Tambah Item
            </button>
          </div>
          <div className="bg-gray-50 rounded border max-h-[300px] overflow-y-auto overflow-x-auto relative">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-gray-100 border-b sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-2">Deskripsi</th>
                  <th className="p-2 w-16 text-center">Qty</th>
                  <th className="p-2 text-right">Harga Satuan</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 w-10 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {((formData as any).line_items || (formData as any).items || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500 italic">
                      Tidak ada item
                    </td>
                  </tr>
                ) : (
                  ((formData as any).line_items || (formData as any).items || []).map((item: any, idx: number) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-gray-100 transition-colors">
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.description || item.name || ""}
                          onChange={(e) => handleLineItemChange(idx, "description", e.target.value)}
                          placeholder="Nama item"
                          className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[120px]"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          value={item.quantity || item.qty || 1}
                          onChange={(e) => handleLineItemChange(idx, "quantity", parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[50px]"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          value={item.unit_price || item.price || 0}
                          onChange={(e) => handleLineItemChange(idx, "unit_price", parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[80px]"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          value={item.total_price || item.subtotal || 0}
                          onChange={(e) => handleLineItemChange(idx, "total_price", parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-right font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[80px]"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => removeLineItem(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Hapus baris"
                        >
                          <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ekstraksi Field Kustom On-the-fly */}
        <div className="mb-8 border-t pt-4 bg-purple-50/50 p-4 rounded-lg border border-purple-100">
          <h3 className="text-sm font-semibold text-purple-900 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Ekstrak Field Tambahan dengan AI
          </h3>
          <p className="text-xs text-purple-700 mb-3">
            Ada data yang belum terekstrak? Ketik nama field (contoh: "Plat Nomor" atau "Nama Kasir") lalu ekstrak otomatis dari gambar tanpa perlu memproses ulang.
          </p>
          <div className="flex gap-2">
            <input 
              type="text"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              placeholder="Masukkan nama field..."
              className="flex-1 border border-purple-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              onKeyDown={(e) => e.key === 'Enter' && !extractingField && handleExtractField()}
            />
            <button
              onClick={handleExtractField}
              disabled={extractingField || !newFieldName.trim()}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-semibold px-4 py-2 rounded text-sm transition-colors flex items-center gap-2"
            >
              {extractingField ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Mengekstrak...
                </>
              ) : "✨ Ekstrak Otomatis"}
            </button>
          </div>
          {extractError && <p className="text-xs text-red-500 mt-2 font-semibold">{extractError}</p>}
        </div>

        <div className="flex flex-col gap-2 mt-auto">
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold px-4 py-3 rounded transition"
          >
            {saving ? "Menyimpan..." : "Konfirmasi & Verifikasi"}
          </button>

          <button
            onClick={() => {
              window.location.href = `/api/export?id=${id}`;
            }}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold px-4 py-2 rounded transition border border-emerald-200 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV Dokumen Ini
          </button>
          
          <button 
            onClick={handleDelete} 
            disabled={saving}
            className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-4 py-2 rounded transition border border-red-200"
          >
            Hapus Dokumen Ini
          </button>
        </div>
      </div>
    </main>
  );
}
