import { getCloudflareContext } from "@opennextjs/cloudflare";
import Link from "next/link";
import ExportModal from "./ExportModal";
import LogoutButton from "@/components/LogoutButton";
import { getAuthUserFromHeaders } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SortSelect, { type DashboardSortKey } from "./SortSelect";


// Dummy data fallback if DB fails
const dummyDocuments = [
  { id: "1", vendor: "Starbucks (Fallback)", date: "2023-10-01", total_amount: 55000, status: "PENDING", document_type: "receipt", payment_method: "cash", created_at: "2023-10-01 10:00:00" },
  { id: "2", vendor: "Gramedia (Fallback)", date: "2023-10-05", total_amount: 120000, status: "VERIFIED", document_type: "invoice", payment_method: "transfer", created_at: "2023-10-05 12:30:00" },
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

type DocumentRow = {
  id: string;
  document_type?: string | null;
  vendor?: string | null;
  date?: string | null;
  total_amount?: number | null;
  status?: string | null;
  payment_method?: string | null;
  category?: string | null;
  reference_number?: string | null;
  is_duplicate?: number | null;
  created_at?: string | null;
  final_json?: string | null;
  raw_ai_json?: string | null;
};

function coerceSortKey(input: unknown): DashboardSortKey {
  const v = typeof input === "string" ? input : "";
  switch (v) {
    case "created_asc":
    case "total_desc":
    case "total_asc":
    case "vendor_asc":
    case "vendor_desc":
    case "created_desc":
      return v;
    default:
      return "created_desc";
  }
}

function getOrderBy(sort: DashboardSortKey): string {
  switch (sort) {
    case "created_asc":
      return "created_at ASC";
    case "total_desc":
      return "COALESCE(total_amount, 0) DESC, created_at DESC";
    case "total_asc":
      return "COALESCE(total_amount, 0) ASC, created_at DESC";
    case "vendor_asc":
      return "(vendor IS NULL) ASC, vendor COLLATE NOCASE ASC, created_at DESC";
    case "vendor_desc":
      return "(vendor IS NULL) ASC, vendor COLLATE NOCASE DESC, created_at DESC";
    case "created_desc":
    default:
      return "created_at DESC";
  }
}

function formatCreatedAt(value: unknown): string {
  if (!value) return "-";
  const raw = String(value);
  // Prefer YYYY-MM-DD if present
  const m = raw.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : raw;
}

function getTypeBadgeClass(type: string | null | undefined): string {
  switch (type) {
    case "receipt":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "invoice":
      return "bg-purple-50 text-purple-700 ring-purple-200";
    case "nota":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "kwitansi":
      return "bg-teal-50 text-teal-700 ring-teal-200";
    case "faktur_pajak":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-gray-50 text-gray-700 ring-gray-200";
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const reqHeaders = await headers();
  const user = await getAuthUserFromHeaders(reqHeaders);

  if (!user) {
    redirect("/login");
  }

  let documents: DocumentRow[] = [];
  let documentTypes: string[] = [];
  let vendorList: string[] = [];
  const resolvedSearchParams = (await searchParams) || {};
  const sort = coerceSortKey(resolvedSearchParams.sort);

  try {
    const { env } = getCloudflareContext();
    const db = env.DB;
    if (db) {
      const orderBy = getOrderBy(sort);
      const { results } = await db
        .prepare(`SELECT * FROM documents WHERE user_id = ? ORDER BY ${orderBy}`)
        .bind(user.userId)
        .all();
      documents = (results || []) as unknown as DocumentRow[];

      // Ambil daftar unik document_type yang ada di database untuk filter export (hanya milik user ini)
      const typeResults = await db
        .prepare("SELECT DISTINCT document_type FROM documents WHERE document_type IS NOT NULL AND user_id = ?")
        .bind(user.userId)
        .all();
      documentTypes = ((typeResults.results || []) as unknown as Array<{ document_type?: string | null }>)
        .map((r) => r.document_type)
        .filter((t): t is string => Boolean(t));

      // Ambil daftar unik vendor untuk dropdown filter export
      const vendorResults = await db
        .prepare("SELECT DISTINCT vendor FROM documents WHERE vendor IS NOT NULL AND vendor != '' AND user_id = ? ORDER BY vendor COLLATE NOCASE ASC")
        .bind(user.userId)
        .all();
      vendorList = ((vendorResults.results || []) as unknown as Array<{ vendor?: string | null }>)
        .map((r) => r.vendor)
        .filter((v): v is string => Boolean(v));
    } else {
      documents = dummyDocuments as unknown as DocumentRow[];
      documentTypes = ["receipt", "invoice"];
      vendorList = ["Starbucks (Fallback)", "Gramedia (Fallback)"];
    }
  } catch (error) {
    console.error("Gagal mengambil data dari D1 Database:", error);
    documents = dummyDocuments as unknown as DocumentRow[];
    documentTypes = ["receipt", "invoice"];
  }

  // Hitung Summary Analytics
  let totalExpense = 0;
  let verifiedCount = 0;
  const vendorCounts: Record<string, number> = {};

  for (const doc of documents) {
    const amount = doc.total_amount || 0;
    totalExpense += amount;
    
    if (doc.status === "VERIFIED") {
      verifiedCount++;
    }

    if (doc.vendor) {
      vendorCounts[doc.vendor] = (vendorCounts[doc.vendor] || 0) + 1;
    }
  }

  const averageExpense = documents.length > 0 ? totalExpense / documents.length : 0;
  
  let topVendor = "-";
  let maxCount = 0;
  for (const [vendor, count] of Object.entries(vendorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topVendor = vendor;
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Halo, {user.name}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {documents.length} dokumen ditemukan • Sort: <span className="font-medium text-gray-700">{sort}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                + Upload Baru
              </Link>
              <Link
                href="/templates"
                className="inline-flex h-9 items-center rounded-lg bg-gray-100 px-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200 border border-gray-200"
              >
                Kelola Template
              </Link>
              <ExportModal documentTypes={documentTypes} vendorList={vendorList} />
              <LogoutButton />
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 border-b border-gray-100 p-6 md:grid-cols-4">
            <div className="rounded-xl border border-gray-100 bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-600">Total Pengeluaran</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">Rp {totalExpense.toLocaleString("id-ID")}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-600">Rata-rata Transaksi</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">Rp {Math.round(averageExpense).toLocaleString("id-ID")}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-purple-50 p-4">
              <p className="text-sm font-medium text-purple-600">Total Dokumen</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{documents.length}</p>
              <p className="mt-1 text-xs text-gray-500">{verifiedCount} Terverifikasi</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-orange-50 p-4">
              <p className="text-sm font-medium text-orange-600">Top Vendor</p>
              <p className="mt-2 text-lg font-bold text-gray-900 line-clamp-1">{topVendor}</p>
              <p className="mt-1 text-xs text-gray-500">{maxCount} Transaksi</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
            <SortSelect value={sort} />

            {documents.length === 0 ? (
              <div className="text-sm text-gray-500">Belum ada dokumen. Mulai dengan upload dokumen pertama Anda.</div>
            ) : (
              <div className="text-xs text-gray-500">Klik “Review” untuk verifikasi / koreksi data.</div>
            )}
          </div>

          <div className="overflow-x-auto border-t border-gray-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
                <tr className="border-b border-gray-200">
                  <th className="px-6 py-3">Jenis</th>
                  <th className="px-6 py-3">Vendor</th>
                  <th className="px-6 py-3">Kategori</th>
                  <th className="px-6 py-3">No. Referensi</th>
                  <th className="px-6 py-3">Tanggal</th>
                  <th className="px-6 py-3">Dibuat</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3">Pembayaran</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(documents as DocumentRow[]).map((doc) => {
                  const typeKey = doc.document_type ?? "other";
                  const paymentKey = doc.payment_method ?? "other";
                  const typeInfo = DOCUMENT_TYPE_LABELS[typeKey] || DOCUMENT_TYPE_LABELS.other;
                  const paymentLabel = PAYMENT_LABELS[paymentKey] || "-";
                  const createdAt = formatCreatedAt(doc.created_at);
                  const typeBadgeClass = getTypeBadgeClass(doc.document_type);

                  let isSuspicious = false;
                  try {
                    const finalData = JSON.parse(doc.final_json || doc.raw_ai_json || "{}");
                    if (finalData?.fraud_analysis?.is_suspicious || finalData?.fraud_analysis?.value?.is_suspicious) {
                      isSuspicious = true;
                    }
                  } catch (e) {}

                  const statusClass =
                    doc.status === "VERIFIED"
                      ? "bg-green-50 text-green-700 ring-green-200"
                      : "bg-yellow-50 text-yellow-800 ring-yellow-200";

                  return (
                    <tr key={doc.id} className="bg-white">
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${typeBadgeClass}`}
                        >
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{doc.vendor || "-"}</td>
                      <td className="px-6 py-4 text-gray-600">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                          {doc.category || "Uncategorized"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-mono text-xs">{doc.reference_number || "-"}</td>
                      <td className="px-6 py-4 text-gray-600">{doc.date || "-"}</td>
                      <td className="px-6 py-4 text-gray-600">{createdAt}</td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900">
                        Rp {(doc.total_amount || 0).toLocaleString("id-ID")}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{paymentLabel}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass}`}>
                            {doc.status}
                          </span>
                          {doc.is_duplicate === 1 && (
                            <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700 ring-1 ring-inset ring-red-200" title="Kemungkinan Duplikat">
                              ⚠️ DUPLIKAT
                            </span>
                          )}
                          {isSuspicious && (
                            <span className="inline-flex items-center rounded-md bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-800 ring-1 ring-inset ring-orange-300" title="Terdeteksi Anomali / Fraud">
                              ⚠️ ANOMALI
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/review/${doc.id}`}
                          className="inline-flex h-8 items-center rounded-md bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
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
      </div>
    </main>
  );
}
