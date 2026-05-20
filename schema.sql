CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_key TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    document_type TEXT DEFAULT 'other', -- 'receipt', 'invoice', 'nota', 'kwitansi', 'faktur_pajak', 'other'
    vendor TEXT,
    date TEXT,
    subtotal REAL,
    tax_amount REAL,
    total_amount REAL,
    currency TEXT,
    payment_method TEXT, -- 'cash', 'debit', 'credit_card', 'transfer', 'ewallet', 'qris', 'other'
    line_items TEXT, -- Menyimpan JSON array dari detail item
    ai_confidence_score REAL,
    raw_ai_json TEXT,
    final_json TEXT,
    category TEXT DEFAULT 'Uncategorized',
    reference_number TEXT,
    is_duplicate INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Tabel Template: Menyimpan pola vendor yang pernah dikenali AI,
-- sehingga dokumen dari vendor yang sama bisa diproses lebih konsisten
CREATE TABLE IF NOT EXISTS document_templates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    template_name TEXT NOT NULL, -- Nama yang ditampilkan, misal: "Tokopedia Receipt"
    document_type TEXT NOT NULL, -- 'receipt', 'invoice', dll.
    vendor_pattern TEXT, -- Nama vendor yang cocok (case-insensitive match)
    field_schema TEXT NOT NULL, -- JSON array of field names yang harus diekstrak
    default_category TEXT, -- Kategori default yang akan di-assign ke dokumen vendor ini
    usage_count INTEGER DEFAULT 1, -- Berapa kali template ini dipakai
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(user_id, vendor_pattern, document_type) -- Satu vendor bisa punya template berbeda per jenis dokumen
);
