"use client";

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
  vendor: { value: "", confidence: 1.0 },
  date: { value: "", confidence: 1.0 },
  subtotal: { value: 0, confidence: 1.0 },
  tax_amount: { value: 0, confidence: 1.0 },
  total_amount: { value: 0, confidence: 1.0 },
  currency: { value: "IDR", confidence: 1.0 },
  payment_method: { value: "other", confidence: 1.0 },
  line_items: [] as any[]
};

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();

  const [formData, setFormData] = useState(initialData);
  const [viewUrl, setViewUrl] = useState<string>("");
  const [fileKey, setFileKey] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function fetchDocument() {
      try {
        setLoading(true);
        const res = await fetch(`/api/documents/${id}`);
        if (!res.ok) {
          throw new Error("Gagal mengambil data dokumen");
        }
        const data = await res.json();
        const doc = data.document;

        if (doc) {
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

      alert("Data berhasil diverifikasi dan disimpan!");
      router.push("/dashboard");
    } catch (err: any) {
      alert(err.message || "Gagal menyimpan.");
    } finally {
      setSaving(false);
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
        
        {/* Loop Dynamic Fields */}
        {Object.keys(formData).map((key) => {
          if (key === "line_items" || key === "items" || key === "status") return null;
          
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
        {((formData as any).line_items?.length > 0 || (formData as any).items?.length > 0) && (
          <div className="mb-6 border-t pt-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Daftar Item Rinci (Mendeteksi {((formData as any).line_items || (formData as any).items || []).length} item)
            </label>
            <div className="bg-gray-50 rounded border max-h-[250px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-gray-100 border-b sticky top-0">
                  <tr>
                    <th className="p-2">Deskripsi</th>
                    <th className="p-2 w-12 text-center">Qty</th>
                    <th className="p-2 text-right">Harga Satuan</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {((formData as any).line_items || (formData as any).items || []).map((item: any, idx: number) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="p-2 truncate max-w-[150px]" title={item.description || item.name}>
                        {item.description || item.name || "-"}
                      </td>
                      <td className="p-2 text-center">{item.quantity || item.qty || 1}</td>
                      <td className="p-2 text-right">Rp {(item.unit_price || item.price || 0).toLocaleString()}</td>
                      <td className="p-2 text-right font-semibold">Rp {(item.total_price || item.subtotal || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-auto">
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold px-4 py-3 rounded transition"
          >
            {saving ? "Menyimpan..." : "Konfirmasi & Verifikasi"}
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
