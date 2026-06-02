const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Ambil dokumen terbaru
  console.log("Mengambil dokumen terbaru dari database...");
  const resultStr = execSync('npx wrangler d1 execute document-reader-db --local --command="SELECT id, raw_ai_json FROM documents ORDER BY created_at DESC LIMIT 1" --json').toString();
  const res = JSON.parse(resultStr);
  
  if (!res[0] || !res[0].results || res[0].results.length === 0) {
    console.error("Tidak ada dokumen yang ditemukan di database. Silakan upload dokumen terlebih dahulu.");
    process.exit(1);
  }

  const latestDoc = res[0].results[0];
  const docId = latestDoc.id;
  const raw_json_str = latestDoc.raw_ai_json;
  const raw_json = JSON.parse(raw_json_str || "{}");
  
  // Inject fraud_analysis
  raw_json.fraud_analysis = {
    value: {
      is_suspicious: true,
      anomaly_score: 9,
      reason: "Harga Pulpen Titanium terlalu mahal (Rp 600.000) dan tanggal tidak valid (32 Mei)."
    },
    confidence: 0.95
  };
  
  const new_raw_json_str = JSON.stringify(raw_json).replace(/'/g, "''"); // escape single quotes for SQL
  
  console.log(`Menginjeksi data fraud ke dokumen dengan ID: ${docId}`);
  
  // Buat sql file sementara untuk menghindari error escaping command line Windows
  const sqlContent = `UPDATE documents SET raw_ai_json = '${new_raw_json_str}', final_json = '${new_raw_json_str}' WHERE id='${docId}';`;
  const sqlPath = path.join(__dirname, 'temp_update.sql');
  fs.writeFileSync(sqlPath, sqlContent);
  
  const updateCmd = `npx wrangler d1 execute document-reader-db --local --file="${sqlPath}"`;
  execSync(updateCmd);
  
  // Hapus file sql sementara
  fs.unlinkSync(sqlPath);
  
  console.log("\n=======================================================");
  console.log("✅ Berhasil update database dengan data simulasi fraud!");
  console.log(`Silakan buka di browser Anda:`);
  console.log(`👉 http://localhost:8787/review/${docId}`);
  console.log("=======================================================");
} catch (e) {
  console.error("Error:", e.stdout ? e.stdout.toString() : e.message);
}
