-- Migration: Tambahkan UNIQUE constraint pada (user_id, vendor_pattern, document_type)
-- Tujuan: Satu vendor bisa punya template berbeda per jenis dokumen
-- Contoh: "Tokopedia receipt" dan "Tokopedia invoice" = 2 template terpisah

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_vendor_doctype
ON document_templates (user_id, vendor_pattern, document_type);
