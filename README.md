# Dekan Cup FST 2026 — Live Score

Aplikasi live score, jadwal pertandingan, dan profil HIMA untuk **Dekan Cup Fakultas Sains dan Teknologi 2026**.

Tema visual: vintage/scrapbook pos surat — kertas krem, marun tua, hijau tua, tipografi serif berornamen, terinspirasi dari desain "Badan Pengurus Inti" yang Anda kirimkan.

## Struktur

```
dekancup-app/
├── backend/     Express + Socket.io + penyimpanan file JSON (REST API, auth, real-time)
└── frontend/    HTML + CSS + JS (vanilla, tanpa build step, tema vintage)
```

Backend juga otomatis menyajikan folder `frontend/` (mode all-in-one) — jadi Anda **hanya perlu menjalankan backend** untuk mencoba semuanya.

## Cara Menjalankan

```bash
cd backend
npm install
cp .env.example .env      # sesuaikan JWT_SECRET, email/password admin jika perlu
npm start
```

Buka **http://localhost:4000** di browser.

Database file JSON (`backend/data/dekancup.json`) dibuat otomatis saat pertama kali dijalankan, lengkap dengan:
- 8 HIMA: HIMAKI, HIMBIO, HIMAFI, HIMASTA, HIMATIKA, HMTB, HMTL, HIMSI
- BEM & Kabinet BEM (sebagai penyelenggara, bukan tim bertanding)
- Akun admin default
- 4 contoh pertandingan (1 live, 2 belum mulai, 1 selesai) agar tampilan tidak kosong

### Login Admin (demo)
```
Email    : admin@dekancup.fst.ac.id
Password : DekanCup2026!
```
⚠️ **Ganti password ini** sebelum dipakai untuk acara sungguhan — edit `ADMIN_EMAIL` / `ADMIN_PASSWORD` di `.env`, lalu hapus `backend/data/dekancup.db` agar di-seed ulang.

## Mengganti Logo

Semua logo saat ini adalah **placeholder SVG monogram** (lingkaran + inisial) dengan warna sesuai tema. Ganti dengan logo asli:

| Logo | Lokasi file |
|---|---|
| 8 logo HIMA | `frontend/assets/logos/{kode}.svg` (mis. `himaki.svg`) — bisa diganti `.png`/`.jpg`, lalu update `logo_url` lewat API `PATCH /api/himas/:id` |
| Logo BEM | `frontend/assets/logos/bem.svg` |
| Logo Kabinet BEM | `frontend/assets/logos/kabinet.svg` |
| **Logo Dekan Cup** (utama, di navbar) | `frontend/assets/dekancup-logo.svg` — ganti dengan logo resmi Dekan Cup FST 2026 saat sudah tersedia |

Jika ingin memakai file gambar (PNG/JPG) alih-alih SVG, cukup taruh file di folder yang sama dan ubah nama file yang direferensikan di `index.html` / data `logo_url` di database.

## Fitur yang Sudah Berfungsi

1. **Jadwal Pertandingan** — filter berdasarkan HIMA, tanggal, status; kartu bergaya "kartu pos" dengan lencana status (Belum Mulai / Live berdenyut / Selesai).
2. **Profil HIMA** — logo, deskripsi, kontak, daftar atlet (opsional).
3. **Live Score real-time** — admin klik +1/-1 atau tombol kejadian (gol, kartu, pergantian pemain) → semua pengguna yang membuka pertandingan yang sama langsung melihat perubahan lewat Socket.io, tanpa refresh.
4. **Autentikasi admin** — JWT, proteksi seluruh endpoint tulis (`POST`/`PATCH`).
5. **Klasemen sementara** — otomatis terhitung saat pertandingan diselesaikan (menang=3, seri=1, kalah=0).
6. **Riwayat pertandingan** — daftar pertandingan berstatus selesai.
7. **Toast notifikasi** — muncul saat skor/kejadian berubah secara real-time.
8. **PWA-ready** — ada `manifest.json`, bisa "Add to Home Screen".
9. **Registrasi Peserta** — formulir publik per cabor/lomba (`#/daftar`) untuk Futsal, Basket, Voli, Badminton, E-Sport Mobile Legends, Fotografi, Catur, Band Competition, dan Tari; data masuk ke Panel Admin (bisa difilter, dihapus, diunduh sebagai `.xlsx`), dan opsional otomatis tersalin ke Google Sheets (termasuk link file formulir PDF yang diunggah). Detail lengkap di bagian "Registrasi Peserta" di bawah.

## Registrasi Peserta

Formulir pendaftaran ada di **`#/daftar`**, satu halaman per cabor/lomba (`#/daftar/futsal`, `#/daftar/basket`, `#/daftar/voli`, `#/daftar/badminton`, `#/daftar/esport`, `#/daftar/fotografi`, `#/daftar/catur`, `#/daftar/band`, `#/daftar/tari`). Setiap formulir berisi: HIMA/kontingen, kategori, nama tim, penanggung jawab, daftar peserta (nama+NIM), catatan, **upload file formulir PDF** (dengan link template di atasnya), dan **persetujuan Surat Pernyataan Force Majeure** (dengan link suratnya) — semua wajib diisi sebelum kirim. Field & jumlah peserta per cabor diatur di satu tempat:
- Backend: `backend/src/routes/registrations.js` → objek `SPORT_CONFIG`
- Frontend: `frontend/js/app.js` → objek `SPORT_CONFIG` (dekat konstanta `SPORT_SLUGS`)

⚠️ **Catatan penting**: struktur pertanyaan formulir ini (kategori, jumlah peserta per tim, dst) adalah **asumsi standar** turnamen antar-HIMA — saya tidak berhasil membuka link Google Form contoh yang diberikan (server Google menolak akses otomatis). Silakan bandingkan dengan form aslinya dan sesuaikan `SPORT_CONFIG` di kedua file di atas kalau ada field yang beda (nama field, kategori, jumlah peserta minimum/maksimum, dsb). Yang masih **perlu dipastikan/diganti manual**:
- Kategori & jumlah peserta untuk **Fotografi, Catur, Band Competition, Tari** masih asumsi (Fotografi & Catur individu 1 peserta kategori "Umum"; Band Competition 3–10 orang; Tari 3–15 orang) — sesuaikan kalau beda dari ketentuan panitia.
- Field tambahan sudah ada untuk: Tari (Nama Grup Tari), Band Competition (Nama Band), Fotografi (cabang lomba lain yang diikuti).

**Status Inti/Cadangan** — untuk Futsal, Basket, Voli, dan E-Sport (Mobile Legends & FIFA), N peserta pertama yang diisi di formulir otomatis berstatus **Inti**, sisanya (sampai batas maksimum) otomatis **Cadangan**. Urutan murni dari urutan pengisian form, bukan pilihan manual. Angka N saat ini: Futsal 5, Basket 5, Voli 6, Mobile Legends 5, FIFA 2 (`minPlayers`/`categoryPlayers.min` di `SPORT_CONFIG`, sama di backend & frontend). Batas maksimum FIFA saya naikkan dari 2 → 4 supaya ada ruang untuk cadangan (kalau tidak dinaikkan, tidak akan pernah ada slot cadangan sama sekali) — sesuaikan lagi kalau panitia mau angka lain. Cabor lain (Badminton, Fotografi, Catur, Band Competition, Tari) tidak punya status Inti/Cadangan karena tidak diminta.

**Kode Kategori** — tiap kategori punya kode singkat (mis. Putra→`PA`, Putri→`PI`) yang muncul di kolom "Kode Kategori" pada export `.xlsx` & sheet Google Sheets, supaya kategori dalam satu sheet cabor (mis. sheet "Voli" berisi Putra & Putri sekaligus) gampang dibedakan tanpa buka tiap baris. Daftar kodenya ada di `CATEGORY_CODES` (`backend/src/routes/registrations.js`) — kategori yang belum terdaftar di situ otomatis tampil apa adanya.
- `templateUrl` & `forceMajeureUrl` saat ini memakai link yang sama untuk semua cabor — kalau tiap cabor ternyata perlu link template/surat yang berbeda-beda, timpa nilainya per-cabor di `SPORT_CONFIG`.

Data yang masuk selalu tersimpan aman di `backend/data/dekancup.json` (koleksi `registrations`) — bisa dilihat & dihapus di Panel Admin, dan diunduh kapan saja sebagai file `.xlsx` (satu sheet per cabor) lewat tombol "⬇ Unduh Excel". Ini cara paling gampang memindahkan data ke Google Sheets: unduh `.xlsx`-nya, lalu di Google Sheets pilih **File → Import → Upload**.

### Opsional: sinkron otomatis ke Google Sheets tiap ada pendaftaran baru

Kalau ingin data langsung nongol di spreadsheet tanpa perlu unduh manual, pakai **Google Apps Script** (gratis, tidak perlu API key/service account):

1. Buka Google Sheets tujuan → **Extensions → Apps Script**.
2. Hapus isi editor, ganti dengan kode berikut, lalu **Save**:

   ```javascript
   function doPost(e) {
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const data = JSON.parse(e.postData.contents);

     // Satu sheet/tab terpisah per cabor (Futsal, Basket, Voli, dst),
     // dibuat otomatis kalau belum ada. Nama tab disamakan dengan nama
     // cabor, karakter yang tidak diizinkan Google Sheets ([ ] : \ ? / *)
     // dibuang & dipotong maks 100 karakter.
     const sheetName = String(data.sport_type || 'Lainnya')
       .replace(/[\[\]:\\?/*]/g, '')
       .slice(0, 100);
     const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

     const EXPECTED_HEADERS = [
       'HIMA', 'Kategori', 'Kode Kategori', 'Nama Peserta', 'NIM', 'Status',
       'Penanggung Jawab', 'No. WhatsApp', 'Email', 'Jumlah Peserta',
       'Riwayat Penyakit/Alergi', 'Catatan', 'Info Tambahan',
       'Setuju Force Majeure', 'File Formulir',
     ];
     if (sheet.getLastRow() === 0) {
       sheet.appendRow(EXPECTED_HEADERS);
     } else {
       // Perbaiki otomatis kalau header di baris 1 ternyata sudah tidak cocok
       // lagi dengan susunan kolom saat ini (mis. karena skrip ini pernah
       // di-update sebelumnya tapi header di sheet lama belum ikut berubah —
       // supaya data baru tidak pernah lagi kelihatan "salah kolom").
       const currentHeaders = sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).getValues()[0];
       const headersMatch = EXPECTED_HEADERS.every((h, i) => currentHeaders[i] === h);
       if (!headersMatch) {
         sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS]);
       }
     }

     // Field tambahan khusus cabor (Nama Grup Tari, Nama Band, cabang lain
     // Fotografi, dst) digabung jadi satu kolom "key: value; key: value".
     const extraFieldsText = Object.entries(data.extra_fields || {})
       .filter(([, v]) => v)
       .map(([k, v]) => `${k}: ${v}`)
       .join('; ');

     // "status" ('Inti'/'Cadangan') hanya ada untuk cabor yang punya susunan
     // regu inti (Futsal, Basket, Voli, E-Sport) — cabor lain kolom Status-nya
     // dikosongkan saja karena tidak relevan (mis. Badminton, Fotografi, dst).
     const players = (data.players && data.players.length)
       ? data.players
       : [{ name: '-', nim: '-', status: '' }];
     const startRow = sheet.getLastRow() + 1;

     // Satu baris per peserta, kolom yang sama untuk 1 tim (HIMA, Kategori,
     // PJ, WA, dst) ditulis di tiap baris dulu, nanti digabung (merge) di bawah.
     // Kolom "Kode Kategori" membedakan kategori dalam 1 sheet cabor yang sama
     // — mis. sheet "Voli" berisi pendaftar Putra (kode PA) & Putri (kode PI)
     // sekaligus, jadi gampang di-filter/sort tanpa perlu buka tiap baris.
     players.forEach((p) => {
       sheet.appendRow([
         data.hima_code || data.hima_id, data.category || '', data.category_code || data.category || '',
         p.name, p.nim, p.status || '',
         data.contact_name, data.contact_whatsapp, data.contact_email,
         players.length, data.health_notes || '', data.notes || '', extraFieldsText,
         data.force_majeure_agreement ? 'Ya' : 'Tidak',
         data.formulir_file_url || '',
       ]);
     });

     const numRows = players.length;
     if (numRows > 1) {
       // Kolom yang nilainya sama untuk satu tim digabung jadi 1 sel besar:
       // HIMA(1), Kategori(2), Kode Kategori(3), Penanggung Jawab(7),
       // No. WhatsApp(8), Email(9), Jumlah Peserta(10),
       // Riwayat Penyakit/Alergi(11), Catatan(12), Info Tambahan(13),
       // Setuju Force Majeure(14), File Formulir(15).
       // Nama(4)/NIM(5)/Status(6) TIDAK digabung karena beda tiap peserta.
       [1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15].forEach((col) => {
         sheet.getRange(startRow, col, numRows, 1).merge().setVerticalAlignment('middle');
       });
     }

     // Baris kosong pemisah antar tim, biar gampang dibaca sekilas.
     sheet.insertRowAfter(startRow + numRows - 1);

     return ContentService.createTextOutput(JSON.stringify({ ok: true }))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```

3. Klik **Deploy → New deployment** → pilih tipe **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Klik **Deploy**, lalu **copy URL Web App**-nya (bentuknya `https://script.google.com/macros/s/…/exec`).
5. Tempel URL itu ke `SHEETS_WEBHOOK_URL` di file `.env` backend, lalu restart server (`npm start`).

**Catatan soal header yang "geser"**: skrip di atas sekarang otomatis memperbaiki baris header (baris 1) tiap kali ada submit baru, kalau ternyata sudah tidak cocok dengan susunan kolom saat ini (mis. karena skrip ini pernah diedit sebelumnya). Tapi perbaikan itu baru jalan **saat ada submit baru masuk ke tab itu** — jadi kalau ada tab yang sudah lama tidak menerima pendaftaran baru (headernya kadung salah dari sebelumnya), perbaikannya tidak otomatis langsung terjadi. Untuk tab yang sudah kadung salah, perbaiki manual sekali saja: ganti isi baris 1 (A1:O1) dengan urutan header ini —

```
HIMA	Kategori	Kode Kategori	Nama Peserta	NIM	Status	Penanggung Jawab	No. WhatsApp	Email	Jumlah Peserta	Riwayat Penyakit/Alergi	Catatan	Info Tambahan	Setuju Force Majeure	File Formulir
```

Kalau habis diedit skripnya, ingat **redeploy versi baru**-nya juga (Deploy → Manage deployments → ikon pensil → Version: New version → Deploy), bukan cuma Save — kalau tidak, URL Web App yang sedang dipakai masih menjalankan kode versi lama.

Setelah itu, setiap ada yang submit formulir registrasi, backend otomatis mengirim datanya ke spreadsheet itu. Kalau `SHEETS_WEBHOOK_URL` dikosongkan atau webhook-nya sedang error, pendaftaran **tetap tersimpan normal** di database aplikasi — sinkronisasi ke Sheets sifatnya pelengkap, bukan satu-satunya tempat penyimpanan.

**Catatan soal file formulir PDF yang diunggah peserta:** file-nya tidak dikirim sebagai lampiran ke Google Sheets (Apps Script webhook tidak menerima file, cuma data JSON). Yang masuk ke kolom "File Formulir" di spreadsheet adalah **link untuk membuka file itu** (mengarah ke `backend/uploads/formulir/...` di server backend), jadi:
- Backend harus sudah berjalan & bisa diakses dari internet (bukan cuma `localhost`) supaya link itu bisa dibuka siapa pun yang punya akses ke spreadsheet.
- Kalau backend di-deploy di belakang reverse proxy/load balancer, isi `PUBLIC_BASE_URL` di `.env` dengan domain publiknya supaya link yang terkirim tetap benar.
- File aslinya sendiri selalu bisa dilihat/diunduh langsung dari Panel Admin ("📄 Lihat File Formulir" di tiap baris data pendaftaran), tanpa bergantung pada Sheets sama sekali.

## Deploy ke Produksi (ringkas)

- **Backend**: deploy ke Railway/Render/VPS mana pun yang mendukung Node.js. Penyimpanan file JSON cukup untuk skala acara kampus (tanpa perlu proses compile native apa pun); untuk trafik lebih besar atau banyak instance server sekaligus, pertimbangkan pindah ke database sungguhan seperti PostgreSQL.
- **Frontend**: karena tanpa build step, bisa langsung disajikan backend seperti sekarang, atau di-hosting statis terpisah (Netlify/Vercel) — tinggal set `window.DEKANCUP_API_BASE` di `index.html` sebelum `app.js` dimuat agar menunjuk ke URL backend produksi.
- Set `CLIENT_URL` di `.env` backend ke domain frontend produksi (untuk CORS).

## Langkah Lanjutan yang Bisa Saya Bantu

- Integrasi upload logo/foto langsung dari panel admin (saat ini logo diganti manual via file).
- Notifikasi push browser (bukan hanya toast dalam halaman).
- Halaman publik statistik pemain / top scorer.
- Export hasil pertandingan ke PDF/gambar untuk dibagikan ke media sosial HIMA.
