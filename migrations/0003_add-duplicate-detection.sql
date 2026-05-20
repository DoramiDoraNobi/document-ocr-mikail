-- Tambahkan kolom penanda duplikat dan nomor referensi
ALTER TABLE documents ADD COLUMN is_duplicate INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN reference_number TEXT;
