export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { getAuthUser } from "@/lib/auth";

// Helper: Escape field untuk CSV yang benar
// - Jika mengandung koma, kutip ganda, atau newline → bungkus dengan kutip ganda
// - Kutip ganda di dalam value di-double-kan
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper: Format angka untuk CSV (tanpa simbol, hanya angka)
function csvNumber(value: unknown): string {
  if (value === null || value === undefined) return "0";
  const num = Number(value);
  if (isNaN(num)) return "0";
  return num.toString();
}

// Helper: Format tanggal ke format Indonesia yang rapi
function formatDate(value: unknown): string {
  if (!value) return "";
  const str = String(value);
  // Coba parse sebagai date
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`; // DD/MM/YYYY
  return str;
}

// Label mapping
const DOC_TYPE_LABELS: Record<string, string> = {
  receipt: "Resi/Struk",
  invoice: "Invoice",
  nota: "Nota",
  kwitansi: "Kwitansi",
  faktur_pajak: "Faktur Pajak",
  other: "Lainnya",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Tunai",
  debit: "Debit",
  credit_card: "Kartu Kredit",
  transfer: "Transfer Bank",
  ewallet: "E-Wallet",
  qris: "QRIS",
  other: "-",
};

export async function GET(req: Request) {
  try {
    const { env } = getRequestContext();
    const db = env.DB;

    if (!db) {
      return new Response("Koneksi database tidak tersedia.", { status: 500 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse query params
    const url = new URL(req.url);
    const singleId = url.searchParams.get("id"); // Export 1 dokumen saja
    const documentType = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const vendor = url.searchParams.get("vendor");
    const dateFrom = url.searchParams.get("from");
    const dateTo = url.searchParams.get("to");
    const paymentMethod = url.searchParams.get("payment");
    const includeLineItems = url.searchParams.get("items") === "1";

    let documents: any[] = [];

    if (singleId) {
      // === MODE: Export satu dokumen berdasarkan ID ===
      const doc = await db.prepare(
        "SELECT * FROM documents WHERE id = ? AND user_id = ?"
      ).bind(singleId, user.userId).first();

      if (!doc) {
        return new Response("Dokumen tidak ditemukan.", { status: 404 });
      }
      documents = [doc];
    } else {
      // === MODE: Export berdasarkan filter ===
      let query = "SELECT * FROM documents WHERE user_id = ?";
      const bindings: any[] = [user.userId];

      if (documentType) {
        query += " AND document_type = ?";
        bindings.push(documentType);
      }

      if (status) {
        query += " AND status = ?";
        bindings.push(status);
      }

      if (vendor) {
        query += " AND LOWER(vendor) LIKE LOWER(?)";
        bindings.push(`%${vendor}%`);
      }

      if (dateFrom) {
        query += " AND date >= ?";
        bindings.push(dateFrom);
      }

      if (dateTo) {
        query += " AND date <= ?";
        bindings.push(dateTo);
      }

      if (paymentMethod) {
        query += " AND payment_method = ?";
        bindings.push(paymentMethod);
      }

      query += " ORDER BY created_at DESC";

      let stmt = db.prepare(query);
      if (bindings.length > 0) {
        stmt = stmt.bind(...bindings);
      }
      const { results } = await stmt.all();
      documents = results || [];
    }

    if (documents.length === 0) {
      return new Response("Tidak ada data yang cocok dengan filter untuk di-export.", { status: 404 });
    }

    // Build CSV
    const rows: string[] = [];

    if (includeLineItems) {
      // === FORMAT DETAIL: Satu baris per LINE ITEM ===
      const headers = [
        "No",
        "Jenis Dokumen",
        "Vendor",
        "Tanggal Dokumen",
        "Nama Item",
        "Qty",
        "Harga Satuan",
        "Total Harga Item",
        "Subtotal Dokumen",
        "Pajak",
        "Total Dokumen",
        "Mata Uang",
        "Metode Pembayaran",
        "Status",
        "Confidence AI (%)",
        "Tanggal Diproses",
        "ID Dokumen",
      ];
      rows.push(headers.map(csvEscape).join(","));

      let rowNum = 0;
      for (const doc of documents) {
        const docTypeName = DOC_TYPE_LABELS[doc.document_type || "other"] || doc.document_type || "Lainnya";
        const paymentName = PAYMENT_LABELS[doc.payment_method || "other"] || doc.payment_method || "-";
        const confidencePercent = doc.ai_confidence_score ? Math.round(doc.ai_confidence_score * 100) : 0;

        // Parse line_items
        let lineItems: any[] = [];
        try {
          if (doc.line_items) {
            lineItems = JSON.parse(doc.line_items as string);
          }
        } catch { /* ignore */ }

        if (lineItems.length > 0) {
          for (const item of lineItems) {
            rowNum++;
            rows.push([
              csvNumber(rowNum),
              csvEscape(docTypeName),
              csvEscape(doc.vendor || ""),
              csvEscape(formatDate(doc.date)),
              csvEscape(item.description || item.name || ""),
              csvNumber(item.quantity || item.qty || 1),
              csvNumber(item.unit_price || item.price || 0),
              csvNumber(item.total_price || item.subtotal || 0),
              csvNumber(doc.subtotal || 0),
              csvNumber(doc.tax_amount || 0),
              csvNumber(doc.total_amount || 0),
              csvEscape(doc.currency || "IDR"),
              csvEscape(paymentName),
              csvEscape(doc.status === "VERIFIED" ? "Terverifikasi" : "Perlu Review"),
              csvNumber(confidencePercent),
              csvEscape(formatDate(doc.created_at)),
              csvEscape(doc.id),
            ].join(","));
          }
        } else {
          rowNum++;
          rows.push([
            csvNumber(rowNum),
            csvEscape(docTypeName),
            csvEscape(doc.vendor || ""),
            csvEscape(formatDate(doc.date)),
            csvEscape("(Tidak ada rincian item)"),
            csvNumber(1),
            csvNumber(doc.total_amount || 0),
            csvNumber(doc.total_amount || 0),
            csvNumber(doc.subtotal || 0),
            csvNumber(doc.tax_amount || 0),
            csvNumber(doc.total_amount || 0),
            csvEscape(doc.currency || "IDR"),
            csvEscape(paymentName),
            csvEscape(doc.status === "VERIFIED" ? "Terverifikasi" : "Perlu Review"),
            csvNumber(confidencePercent),
            csvEscape(formatDate(doc.created_at)),
            csvEscape(doc.id),
          ].join(","));
        }
      }
    } else {
      // === FORMAT RINGKASAN: Satu baris per dokumen ===
      const headers = [
        "No",
        "Jenis Dokumen",
        "Vendor",
        "Tanggal Dokumen",
        "Subtotal",
        "Pajak",
        "Total",
        "Mata Uang",
        "Metode Pembayaran",
        "Jumlah Item",
        "Status",
        "Confidence AI (%)",
        "Tanggal Diproses",
        "ID Dokumen",
      ];
      rows.push(headers.map(csvEscape).join(","));

      let rowNum = 0;
      for (const doc of documents) {
        rowNum++;
        const docTypeName = DOC_TYPE_LABELS[doc.document_type || "other"] || doc.document_type || "Lainnya";
        const paymentName = PAYMENT_LABELS[doc.payment_method || "other"] || doc.payment_method || "-";
        const confidencePercent = doc.ai_confidence_score ? Math.round(doc.ai_confidence_score * 100) : 0;

        let itemCount = 0;
        try {
          if (doc.line_items) {
            itemCount = JSON.parse(doc.line_items as string).length;
          }
        } catch { /* ignore */ }

        rows.push([
          csvNumber(rowNum),
          csvEscape(docTypeName),
          csvEscape(doc.vendor || ""),
          csvEscape(formatDate(doc.date)),
          csvNumber(doc.subtotal || 0),
          csvNumber(doc.tax_amount || 0),
          csvNumber(doc.total_amount || 0),
          csvEscape(doc.currency || "IDR"),
          csvEscape(paymentName),
          csvNumber(itemCount),
          csvEscape(doc.status === "VERIFIED" ? "Terverifikasi" : "Perlu Review"),
          csvNumber(confidencePercent),
          csvEscape(formatDate(doc.created_at)),
          csvEscape(doc.id),
        ].join(","));
      }
    }

    const csvContent = rows.join("\r\n");

    // Tambahkan BOM UTF-8 agar Excel membaca encoding dengan benar
    const BOM = "\uFEFF";

    // Tentukan nama file
    let filename: string;
    if (singleId) {
      const vendorSlug = (documents[0]?.vendor || "dokumen").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      filename = `export_${vendorSlug}_${formatDate(documents[0]?.date) || new Date().toISOString().split("T")[0]}.csv`;
    } else if (vendor) {
      const vendorSlug = vendor.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      filename = `export_${vendorSlug}_${new Date().toISOString().split("T")[0]}.csv`;
    } else {
      filename = `export_dokumen_${new Date().toISOString().split("T")[0]}.csv`;
    }

    return new Response(BOM + csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error("Export Error:", error);
    return new Response("Terjadi kesalahan saat melakukan export CSV.", { status: 500 });
  }
}
