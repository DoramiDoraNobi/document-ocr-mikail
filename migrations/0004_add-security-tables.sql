-- Migration: Tambah tabel rate_limits dan audit_logs untuk keamanan

-- Tabel rate_limits: Menyimpan catatan request per user/IP untuk rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,          -- Identifier (user_id atau IP address)
    action TEXT NOT NULL,       -- Nama endpoint (upload, process, login, export)
    created_at INTEGER NOT NULL -- Unix timestamp (seconds)
);

-- Index untuk query cepat berdasarkan key + action + waktu
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
    ON rate_limits (key, action, created_at);

-- Tabel audit_logs: Merekam aksi penting untuk audit trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,       -- 'upload', 'process', 'edit', 'verify', 'delete', 'export', 'login', 'register', 'login_failed'
    target_type TEXT NOT NULL,  -- 'document', 'user', 'export'
    target_id TEXT NOT NULL,    -- ID objek yang dioperasikan
    details TEXT,               -- Info tambahan (max 500 char)
    ip_address TEXT,            -- IP address user
    created_at INTEGER NOT NULL -- Unix timestamp (seconds)
);

-- Index untuk query audit log per user dan per waktu
CREATE INDEX IF NOT EXISTS idx_audit_logs_user
    ON audit_logs (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON audit_logs (action, created_at);
