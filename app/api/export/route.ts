export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { env } = getRequestContext();
    const db = env.DB;

    if (!db) {
      return new Response("Koneksi database tidak tersedia.", { status: 500 });
    }

    // Parse query params untuk selective export
    const url = new URL(req.url);
    const documentType = url.searchParams.get("type"); // 'receipt', 'invoice', dll.
    const status = url.searchParams.get("status"); // 'PENDING', 'VERIFIED'
    const vendor = url.searchParams.get("vendor");
    const dateFrom = url.searchParams.get("from"); // 'YYYY-MM-DD'
    const dateTo = url.searchParams.get("to"); // 'YYYY-MM-DD'
    const paymentMethod = url.searchParams.get("payment");
    const includeLineItems = url.searchParams.get("items") === "1"; // Sertakan detail item per baris

    const user = await getAuthUser(req);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Build query secara dinamis berdasarkan filter
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

    // Execute query dengan dynamic bindings
    let stmt = db.prepare(query);
    if (bindings.length > 0) {
      stmt = stmt.bind(...bindings);
    }
    const { results } = await stmt.all();
    const documents = results || [];

    if (documents.length === 0) {
      return new Response("Tidak ada data yang cocok dengan filter untuk di-export.", { status: 404 });
    }

    // Build CSV rows
    if (includeLineItems) {
      // Format: Satu baris per LINE ITEM (seperti Dext export detail)
      const headers = [
        "ID Dokumen",
        "Jenis Dokumen",
        "Vendor / Merchant",
        "Tanggal",
        "Deskripsi Item",
        "Kuantitas",
        "Harga Satuan",
        "Total Harga Item",
        "Subtotal Dokumen",
        "Pajak",
        "Total Nominal",
        "Mata Uang",
        "Metode Pembayaran",
        "Status",
        "Skor Confidence AI",
        "Tanggal Diproses"
      ];

      const csvRows = [headers.join(",")];

      for (const doc of documents) {
        const safeVendor = `"${(doc.vendor || "").toString().replace(/"/g, '""')}"`;
        const safeId = `"${doc.id}"`;
        const docType = `"${doc.document_type || "other"}"`;
        const date = `"${doc.date || ""}"`;
        const subtotal = doc.subtotal || 0;
        const taxAmount = doc.tax_amount || 0;
        const totalAmount = doc.total_amount || 0;
        const currency = `"${doc.currency || ""}"`;
        const payment = `"${doc.payment_method || ""}"`;
        const docStatus = `"${doc.status || ""}"`;
        const confidence = doc.ai_confidence_score || "";
        const createdAt = `"${doc.created_at || ""}"`;

        // Parse line_items
        let lineItems: any[] = [];
        try {
          if (doc.line_items) {
            lineItems = JSON.parse(doc.line_items as string);
          }
        } catch { /* ignore parse errors */ }

        if (lineItems.length > 0) {
          // Satu baris per item
          for (const item of lineItems) {
            const desc = `"${(item.description || item.name || "").toString().replace(/"/g, '""')}"`;
            const qty = item.quantity || item.qty || 1;
            const unitPrice = item.unit_price || item.price || 0;
            const totalPrice = item.total_price || item.subtotal || 0;

            csvRows.push(`${safeId},${docType},${safeVendor},${date},${desc},${qty},${unitPrice},${totalPrice},${subtotal},${taxAmount},${totalAmount},${currency},${payment},${docStatus},${confidence},${createdAt}`);
          }
        } else {
          // Tidak ada line items, tetap tampilkan summary row
          csvRows.push(`${safeId},${docType},${safeVendor},${date},"(Tidak ada item)",1,${totalAmount},${totalAmount},${subtotal},${taxAmount},${totalAmount},${currency},${payment},${docStatus},${confidence},${createdAt}`);
        }
      }

      const csvContent = csvRows.join("\n");
      return new Response(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="export_detail_items_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    } else {
      // Format ringkasan: Satu baris per dokumen
      const headers = [
        "ID Dokumen",
        "Jenis Dokumen",
        "Vendor / Merchant",
        "Tanggal",
        "Subtotal",
        "Pajak",
        "Total Nominal",
        "Mata Uang",
        "Metode Pembayaran",
        "Jumlah Item",
        "Status",
        "Skor Confidence AI",
        "Tanggal Diproses"
      ];

      const csvRows = [headers.join(",")];

      for (const doc of documents) {
        const safeVendor = `"${(doc.vendor || "").toString().replace(/"/g, '""')}"`;
        const safeId = `"${doc.id}"`;
        const docType = `"${doc.document_type || "other"}"`;
        const date = `"${doc.date || ""}"`;
        const subtotal = doc.subtotal || 0;
        const taxAmount = doc.tax_amount || 0;
        const totalAmount = doc.total_amount || 0;
        const currency = `"${doc.currency || ""}"`;
        const payment = `"${doc.payment_method || ""}"`;
        const docStatus = `"${doc.status || ""}"`;
        const confidence = doc.ai_confidence_score || "";
        const createdAt = `"${doc.created_at || ""}"`;

        // Hitung jumlah item
        let itemCount = 0;
        try {
          if (doc.line_items) {
            itemCount = JSON.parse(doc.line_items as string).length;
          }
        } catch { /* ignore */ }

        csvRows.push(`${safeId},${docType},${safeVendor},${date},${subtotal},${taxAmount},${totalAmount},${currency},${payment},${itemCount},${docStatus},${confidence},${createdAt}`);
      }

      const csvContent = csvRows.join("\n");
      return new Response(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="export_dokumen_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

  } catch (error) {
    console.error("Export Error:", error);
    return new Response("Terjadi kesalahan saat melakukan export CSV.", { status: 500 });
  }
}
