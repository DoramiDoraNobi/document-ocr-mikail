"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

const DOCUMENT_TYPE_OPTIONS = [
  { value: "", label: "Semua Jenis" },
  { value: "receipt", label: "Resi / Struk" },
  { value: "invoice", label: "Invoice / Faktur" },
  { value: "nota", label: "Nota" },
  { value: "kwitansi", label: "Kwitansi" },
  { value: "faktur_pajak", label: "Faktur Pajak" },
  { value: "other", label: "Lainnya" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "PENDING", label: "Perlu Review" },
  { value: "VERIFIED", label: "Terverifikasi" },
];

const PAYMENT_OPTIONS = [
  { value: "", label: "Semua Pembayaran" },
  { value: "cash", label: "Tunai" },
  { value: "debit", label: "Debit" },
  { value: "credit_card", label: "Kartu Kredit" },
  { value: "transfer", label: "Transfer Bank" },
  { value: "ewallet", label: "E-Wallet" },
  { value: "qris", label: "QRIS" },
];

export default function ExportModal({ documentTypes }: { documentTypes: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [filters, setFilters] = useState({
    type: "",
    status: "",
    vendor: "",
    from: "",
    to: "",
    payment: "",
    items: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filters.type) params.set("type", filters.type);
    if (filters.status) params.set("status", filters.status);
    if (filters.vendor) params.set("vendor", filters.vendor);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.payment) params.set("payment", filters.payment);
    if (filters.items) params.set("items", "1");

    const url = `/api/export?${params.toString()}`;
    window.location.href = url;
    setIsOpen(false);
  };

  const modalContent = isOpen ? (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "24px",
          width: "100%",
          maxWidth: "512px",
          maxHeight: "90vh",
          overflowY: "auto",
          margin: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1f2937" }}>Export Data Dokumen</h2>
          <button
            onClick={() => setIsOpen(false)}
            style={{ color: "#9ca3af", fontSize: "24px", lineHeight: 1, background: "none", border: "none", cursor: "pointer", padding: "4px" }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "20px" }}>
          Pilih filter di bawah untuk menentukan dokumen mana yang ingin di-export. Kosongkan semua filter untuk export seluruh data.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Jenis Dokumen */}
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Jenis Dokumen</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "8px", padding: "10px", fontSize: "13px", color: "#374151", outline: "none" }}
            >
              {DOCUMENT_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {documentTypes.length > 0 && (
              <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                Jenis tersedia: {documentTypes.map(t => {
                  const found = DOCUMENT_TYPE_OPTIONS.find(o => o.value === t);
                  return found ? found.label : t;
                }).join(", ")}
              </p>
            )}
          </div>

          {/* Status */}
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "8px", padding: "10px", fontSize: "13px", color: "#374151", outline: "none" }}
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Metode Pembayaran */}
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Metode Pembayaran</label>
            <select
              value={filters.payment}
              onChange={(e) => setFilters({ ...filters, payment: e.target.value })}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "8px", padding: "10px", fontSize: "13px", color: "#374151", outline: "none" }}
            >
              {PAYMENT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Vendor */}
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Vendor / Merchant</label>
            <input
              type="text"
              placeholder="Contoh: Tokopedia, Starbucks..."
              value={filters.vendor}
              onChange={(e) => setFilters({ ...filters, vendor: e.target.value })}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "8px", padding: "10px", fontSize: "13px", color: "#374151", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Rentang Tanggal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Dari Tanggal</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "8px", padding: "10px", fontSize: "13px", color: "#374151", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Sampai Tanggal</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "8px", padding: "10px", fontSize: "13px", color: "#374151", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>

          {/* Detail line items */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", backgroundColor: "#f9fafb", padding: "12px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <input
              type="checkbox"
              id="includeItems"
              checked={filters.items}
              onChange={(e) => setFilters({ ...filters, items: e.target.checked })}
              style={{ width: "16px", height: "16px", marginTop: "2px", accentColor: "#16a34a" }}
            />
            <label htmlFor="includeItems" style={{ cursor: "pointer", fontSize: "13px", color: "#374151" }}>
              <span style={{ fontWeight: 600 }}>Sertakan rincian item per baris</span>
              <br />
              <span style={{ fontSize: "11px", color: "#6b7280" }}>Setiap item di dalam dokumen akan menjadi baris terpisah di CSV (format Dext-style)</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button
            onClick={handleExport}
            style={{ flex: 1, backgroundColor: "#16a34a", color: "#fff", fontWeight: 700, padding: "12px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "14px" }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#15803d")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#16a34a")}
          >
            Download CSV
          </button>
          <button
            onClick={() => setIsOpen(false)}
            style={{ padding: "12px 24px", backgroundColor: "#f3f4f6", color: "#374151", fontWeight: 600, borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "14px" }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e5e7eb")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        style={{
          backgroundColor: "#16a34a",
          color: "#fff",
          padding: "8px 16px",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          whiteSpace: "nowrap",
        }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#15803d")}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#16a34a")}
      >
        <svg style={{ width: "16px", height: "16px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export CSV
      </button>

      {mounted && modalContent && createPortal(modalContent, document.body)}
    </>
  );
}
