# Smart Document Reader

Smart Document Reader adalah aplikasi web untuk membaca dokumen keuangan seperti resi, struk, invoice, nota, dan kwitansi, lalu mengubahnya menjadi data terstruktur yang bisa ditinjau ulang, disimpan, dan diekspor.

Fokus utama aplikasi ini adalah workflow yang rapi dan aman:

**upload dokumen → ekstraksi otomatis → review manual → penyimpanan → export data**

Karena OCR dan AI tidak selalu akurat, hasil ekstraksi tidak langsung dianggap final. Pengguna tetap diberi kesempatan untuk memeriksa dan mengoreksi data sebelum disimpan.

> Status saat ini: MVP fungsional.  
> Alur inti sudah berjalan end-to-end di Cloudflare edge environment, dengan beberapa area yang masih bisa ditingkatkan.

---

## Stack & Pendekatan OCR/AI

### Stack yang digunakan
- **Frontend / Backend**: Next.js 16 (App Router) + TypeScript
- **Runtime**: Cloudflare Pages
- **Database**: Cloudflare D1
- **File Storage**: Cloudflare R2
- **AI Engine**: Qwen 2.5 VL via OpenRouter
- **Fallback Model**: Gemini 2.5 Flash
- **Styling**: Tailwind CSS v4
- **Authentication**: JWT + Web Crypto API

### Pendekatan OCR/AI
Aplikasi ini memakai pendekatan **Vision LLM**, yaitu dokumen dibaca langsung dari gambar atau PDF lalu diubah menjadi JSON terstruktur.

Alur sederhananya:

```text
image/pdf → Vision LLM → structured JSON → manual review → save/export
```

Pendekatan ini dipilih karena:
- Layout resi dan invoice sering tidak konsisten.
- Struk thermal printer cukup sulit ditangani OCR tradisional.
- Pipeline menjadi lebih sederhana karena tidak perlu `OCR → cleanup → parsing terpisah`.
- Hasil ekstraksi lebih mudah diarahkan ke format data yang siap direview.

### Kenapa tidak memakai OCR tradisional saja?

OCR tradisional masih berguna, tetapi untuk dokumen keuangan nyata hasilnya sering tidak stabil, terutama pada:
- Font kecil
- Foto buram
- Dokumen miring
- Layout yang berubah-ubah
- Campuran bahasa Indonesia dan Inggris

Karena itu, Vision LLM lebih cocok dijadikan inti ekstraksi untuk MVP, lalu hasil akhirnya tetap diverifikasi manusia.

---

## Asumsi yang Diambil

Beberapa asumsi yang dipakai saat membangun MVP ini:
- Internet tersedia, karena proses AI dijalankan lewat API eksternal.
- Fokus utama adalah dokumen keuangan umum, seperti struk, invoice, nota, dan kwitansi.
- Confidence score dari AI hanya menjadi penanda awal, bukan ukuran akurasi yang mutlak.
- Human-in-the-loop adalah bagian inti sistem, karena hasil OCR/AI tidak dianggap benar sepenuhnya.
- Ukuran file dibatasi, agar upload dan pemrosesan tetap stabil.
- MVP ini ditujukan untuk penggunaan kecil hingga menengah, bukan skala enterprise besar.
- Multi-page PDF belum menjadi fokus utama, sehingga dukungan paling kuat masih untuk dokumen satu halaman atau PDF sederhana.

---

## AI Workflow Log



| Komponen            | Tool / Agent                       | Dipakai Untuk                                                    |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| Ekstraksi dokumen   | Qwen 2.5 VL via OpenRouter         | Membaca gambar/PDF dan mengubahnya menjadi JSON terstruktur      |
| Fallback extraction | Gemini 2.5 Flash                   | Dipakai ketika model utama gagal, timeout, atau rate-limited     |
| Prompt engineering  | AI agent di IDE / coding assistant | Menyusun prompt ekstraksi, format JSON, dan aturan confidence    |
| Debugging aplikasi  | AI agent di IDE / coding assistant | Membantu mencari bug, mempercepat iterasi, dan merapikan logic   |
| Validasi hasil      | Logic aplikasi                     | Menandai field yang meragukan atau kosong agar bisa dicek manual |

---

## Prompt Paling Menentukan

Prompt di bawah ini adalah prompt yang paling berpengaruh dalam pembuatan aplikasi, karena menjadi dasar cara AI membaca dokumen dan mengubahnya ke struktur data.

<details>
<summary><b>Lihat Prompt Lengkap</b></summary>

```text
Kamu adalah gabungan Product Manager, Solution Architect, dan Security Engineer senior.

Aku ingin membangun aplikasi web bernama “Smart Document Reader”.
Jangan langsung menulis kode aplikasi.
Langkah pertama WAJIB membuat PRD yang rapi, detail, dan realistis.
Setelah PRD selesai, berhenti dan tunggu persetujuan sebelum lanjut ke desain teknis atau implementasi.

Konteks produk:
Aplikasi ini membaca dokumen keuangan seperti resi, struk, dan invoice melalui OCR + AI, lalu mengubahnya menjadi data terstruktur yang bisa diperiksa dan diekspor.
Ambil inspirasi konsep dari dext.com, tetapi jangan meniru fiturnya secara penuh. Fokus pada inti proses: upload → ekstraksi → review → simpan → filter → export.

Kebutuhan minimum:
1. Upload dokumen
   - User dapat mengunggah gambar atau PDF.
   - Format minimal: JPG, PNG, PDF.
   - Boleh multi-upload.
2. Ekstraksi otomatis
   - Sistem mengekstrak minimal:
     - nama vendor/merchant
     - tanggal
     - total
     - mata uang
     - daftar item jika ada
3. Review & koreksi
   - Hasil ekstraksi harus tampil dalam form yang bisa diedit manual sebelum disimpan.
   - Tegaskan bahwa OCR tidak pernah 100% akurat.
4. Tingkat keyakinan / validasi
   - Tandai field yang AI tidak yakin atau gagal dibaca.
   - Buat bentuk validasi yang jelas agar user tahu bagian mana yang perlu dicek.
5. Daftar & penyimpanan
   - Semua dokumen yang diproses tersimpan.
   - Bisa dibuka lagi.
   - Bisa difilter minimal berdasarkan tanggal atau vendor.
6. Export
   - Minimal export ke CSV.
   - Kalau masuk akal, tambahkan opsi export lain sebagai bonus.

Fokus keamanan yang wajib dipikirkan:
- Semua validasi file dilakukan di server, bukan hanya di frontend.
- Batasi tipe file yang diterima dan periksa MIME type asli.
- Batasi ukuran file upload.
- Sanitasi nama file dan semua input user.
- Hindari XSS pada data hasil OCR yang kemungkinan mengandung teks berbahaya.
- Gunakan autentikasi yang aman.
- Terapkan otorisasi agar user hanya melihat dokumennya sendiri.
- Simpan file dengan aman, idealnya di storage terpisah dari aplikasi.
- Gunakan signed URL atau mekanisme akses terbatas untuk file.
- Pertimbangkan enkripsi data sensitif saat disimpan.
- Jangan menyimpan secret/API key di frontend.
- Gunakan environment variables untuk semua credential.
- Tambahkan rate limiting untuk endpoint upload dan ekstraksi.
- Tambahkan CSRF protection bila memakai session-based auth.
- Logging harus aman, tidak menulis data sensitif secara berlebihan.
- Tambahkan audit log untuk aksi penting seperti upload, edit, delete, export.
- Pertimbangkan antivirus / file scanning / content sniffing jika relevan.
- Buat batasan akses dan retensi data.
- Jelaskan risiko keamanan dan mitigasinya di PRD.

Tugasmu sekarang:
1. Buat PRD lengkap dalam bahasa Indonesia yang jelas dan terstruktur.
2. PRD harus mencakup:
   - ringkasan produk
   - problem statement
   - target user
   - tujuan produk
   - scope MVP
   - out of scope
   - user journey
   - functional requirements
   - non-functional requirements
   - security requirements
   - data model tingkat tinggi
   - workflow OCR + AI + review
   - validasi confidence / uncertain fields
   - penyimpanan dokumen
   - filter dan search
   - export CSV
   - edge cases
   - risiko dan mitigasi
   - acceptance criteria
   - milestone / fase pengerjaan
3. Setelah PRD, buat daftar pertanyaan terbuka yang masih perlu diputuskan.
4. Jangan menulis kode aplikasi dulu.
5. Jangan masuk ke implementasi teknis detail dulu kecuali hanya untuk menjelaskan kebutuhan arsitektur tingkat tinggi.
6. Hentikan output setelah PRD selesai dan tanyakan apakah aku ingin lanjut ke desain teknis.

Gaya penulisan:
- Rapi, profesional, dan mudah dipakai sebagai dokumen kerja.
- Jangan terlalu abstrak.
- Buat realistis untuk versi MVP.
- Utamakan keamanan, privasi, dan kemudahan review manual.
- Anggap OCR bisa salah, jadi human-in-the-loop adalah bagian inti dari alur.

Format output yang diinginkan:
- Gunakan heading yang jelas.
- Gunakan poin-poin seperlunya.
- Jangan campur dengan kode.
- Buat seperti dokumen PRD yang siap dipakai tim produk dan engineering.
```
</details>

---

## Apa yang Akan Diperbaiki Bila Waktu 2x Lipat

Kalau waktu pengerjaan dua kali lebih panjang, prioritas perbaikannya adalah:

- **Benchmark akurasi yang lebih serius**  
  Menyiapkan dokumen uji berlabel untuk mengukur hasil ekstraksi per field secara lebih objektif.
- **Image preprocessing**  
  Menambahkan rotate, deskew, denoise, dan peningkatan kontras sebelum dokumen masuk ke AI.
- **Rate limiting dan anti-bot protection**  
  Melindungi endpoint upload dan proses ekstraksi dari abuse.