import { getRequestContext } from "@cloudflare/next-on-pages";
import Link from "next/link";
import ExportModal from "./ExportModal";
import LogoutButton from "@/components/LogoutButton";
import { getAuthUserFromHeaders } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const runtime = "edge";

// Dummy data fallback if DB fails
const dummyDocuments = [
  { id: "1", vendor: "Starbucks (Fallback)", date: "2023-10-01", total_amount: 55000, status: "PENDING", document_type: "receipt", payment_method: "cash" },
  { id: "2", vendor: "Gramedia (Fallback)", date: "2023-10-05", total_amount: 120000, status: "VERIFIED", document_type: "invoice", payment_method: "transfer" },
];

const DOCUMENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  receipt: { label: "Resi/Struk", color: "bg-blue-100 text-blue-800" },
  invoice: { label: "Invoice", color: "bg-purple-100 text-purple-800" },
  nota: { label: "Nota", color: "bg-orange-100 text-orange-800" },
  kwitansi: { label: "Kwitansi", color: "bg-teal-100 text-teal-800" },
  faktur_pajak: { label: "Faktur Pajak", color: "bg-red-100 text-red-800" },
  other: { label: "Lainnya", color: "bg-gray-100 text-gray-700" },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Tunai",
  debit: "Debit",
  credit_card: "Kartu Kredit",
  transfer: "Transfer",
  ewallet: "E-Wallet",
  qris: "QRIS",
  other: "-",
};

export default async function DashboardPage() {
  const reqHeaders = await headers();
  const user = await getAuthUserFromHeaders(reqHeaders);

  if (!user) {
    redirect("/login");
  }

  let documents: any[] = [];
  let documentTypes: string[] = [];

  try {
    const { env } = getRequestContext();
    const db = env.DB;
    if (db) {
      const { results } = await db.prepare("SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC").bind(user.userId).all();
      documents = results || [];

      // Ambil daftar unik document_type yang ada di database untuk filter export (hanya milik user ini)
      const typeResults = await db.prepare("SELECT DISTINCT document_type FROM documents WHERE document_type IS NOT NULL AND user_id = ?").bind(user.userId).all();
      documentTypes = (typeResults.results || []).map((r: any) => r.document_type).filter(Boolean);
    } else {
      documents = dummyDocuments;
      documentTypes = ["receipt", "invoice"];
    }
  } catch (error) {
    console.error("Gagal mengambil data dari D1 Database:", error);
    documents = dummyDocuments;
    documentTypes = ["receipt", "invoice"];
  }

  return (
    <main style={{ minHeight: "100vh", padding: "32px", backgroundColor: "#f9fafb" }}>
      <div style={{ maxWidth: "1152px", margin: "0 auto", backgroundColor: "#fff", padding: "32px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#1f2937" }}>Halo, {user.name}</h1>
            <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>{documents.length} dokumen Anda ditemukan</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Link
              href="/"
              style={{
                backgroundColor: "#2563eb",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
                display: "inline-block",
              }}
            >
              + Upload Baru
            </Link>
            <ExportModal documentTypes={documentTypes} />
            <LogoutButton />
          </div>
        </div>

        {/* Tabel Data */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "12px", color: "#4b5563", fontWeight: 600, fontSize: "13px" }}>Jenis</th>
                <th style={{ padding: "12px", color: "#4b5563", fontWeight: 600, fontSize: "13px" }}>Vendor</th>
                <th style={{ padding: "12px", color: "#4b5563", fontWeight: 600, fontSize: "13px" }}>Tanggal</th>
                <th style={{ padding: "12px", color: "#4b5563", fontWeight: 600, fontSize: "13px", textAlign: "right" }}>Total</th>
                <th style={{ padding: "12px", color: "#4b5563", fontWeight: 600, fontSize: "13px" }}>Pembayaran</th>
                <th style={{ padding: "12px", color: "#4b5563", fontWeight: 600, fontSize: "13px" }}>Status</th>
                <th style={{ padding: "12px", color: "#4b5563", fontWeight: 600, fontSize: "13px" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc: any) => {
                const typeInfo = DOCUMENT_TYPE_LABELS[doc.document_type] || DOCUMENT_TYPE_LABELS.other;
                const paymentLabel = PAYMENT_LABELS[doc.payment_method] || "-";

                // Map type colors to inline styles
                const typeColorMap: Record<string, { bg: string; text: string }> = {
                  receipt: { bg: "#dbeafe", text: "#1e40af" },
                  invoice: { bg: "#ede9fe", text: "#6d28d9" },
                  nota: { bg: "#ffedd5", text: "#c2410c" },
                  kwitansi: { bg: "#ccfbf1", text: "#0f766e" },
                  faktur_pajak: { bg: "#fee2e2", text: "#b91c1c" },
                  other: { bg: "#f3f4f6", text: "#374151" },
                };
                const typeStyle = typeColorMap[doc.document_type] || typeColorMap.other;

                return (
                  <tr key={doc.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "12px" }}>
                      <span style={{
                        backgroundColor: typeStyle.bg,
                        color: typeStyle.text,
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontWeight: 500, color: "#1f2937", fontSize: "14px" }}>{doc.vendor || "-"}</td>
                    <td style={{ padding: "12px", color: "#4b5563", fontSize: "13px" }}>{doc.date || "-"}</td>
                    <td style={{ padding: "12px", textAlign: "right", fontWeight: 600, color: "#1f2937", fontSize: "14px" }}>
                      Rp {(doc.total_amount || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: "12px", fontSize: "13px", color: "#4b5563" }}>{paymentLabel}</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{
                        backgroundColor: doc.status === "VERIFIED" ? "#dcfce7" : "#fef9c3",
                        color: doc.status === "VERIFIED" ? "#166534" : "#854d0e",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}>
                        {doc.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <Link href={`/review/${doc.id}`} style={{ color: "#2563eb", textDecoration: "none", fontSize: "13px" }}>
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
