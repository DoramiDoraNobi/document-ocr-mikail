-- Tambahkan kolom category pada tabel documents
ALTER TABLE documents ADD COLUMN category TEXT DEFAULT 'Uncategorized';

-- Tambahkan kolom default_category pada tabel document_templates
ALTER TABLE document_templates ADD COLUMN default_category TEXT;
