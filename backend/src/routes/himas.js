import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, save } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Label tampilan untuk satu grup roster (sport_type + category). Dipakai
// supaya kategori yang berbeda dalam satu cabor (mis. Voli Putra vs Voli
// Putri, Basket Putra vs Putri, Badminton Ganda Putra/Ganda Putri/Campuran,
// atau Mobile Legends vs FIFA di E-Sport) TIDAK tercampur jadi satu daftar,
// melainkan tampil sebagai grup terpisah di halaman profil atlet — sesuai
// kategori yang dipilih pendaftar saat isi form (lihat SPORT_CONFIG di
// registrations.js untuk daftar kategori tiap cabor).
function rosterGroupLabel(sport_type, category) {
  // Nama cabor pendaftaran E-Sport masih "E-Sport Mobile Legends" (nama
  // lama), padahal menaungi 2 kategori berbeda: Mobile Legends & FIFA.
  // Supaya labelnya jelas, tampilkan sebagai "E-Sport - Mobile Legends" /
  // "E-Sport - FIFA", bukan "E-Sport Mobile Legends - FIFA" yang rancu.
  if (sport_type === 'E-Sport Mobile Legends') {
    return `E-Sport - ${category || 'Lainnya'}`;
  }
  // Cabor dengan kategori tunggal yang namanya sama dengan cabor itu sendiri
  // (Fotografi, Catur, Band Competition, Tari) tidak perlu label ganda.
  if (category && category !== sport_type) {
    return `${sport_type} - ${category}`;
  }
  return sport_type;
}

// Isi field hanya jika value dikirim (meniru COALESCE(?, kolom) versi SQL lama)
function applyIfProvided(target, patch, keys) {
  for (const key of keys) {
    const value = patch[key];
    if (value !== undefined && value !== null) target[key] = value;
  }
}

// GET semua hima (bisa filter is_team)
router.get('/', (req, res) => {
  const { team_only } = req.query;
  let rows = [...db.himas].sort((a, b) => a.code.localeCompare(b.code));
  if (team_only === 'true') rows = rows.filter((h) => h.is_team === 1);
  res.json(rows);
});

// GET satu hima + daftar atlet + roster pemain per cabor (otomatis dari
// pendaftaran yang masuk lewat form "/daftar/:cabor" — bukan diketik manual
// oleh admin). Roster cuma menampilkan Nama & NIM tiap peserta, dikelompokkan
// per sport_type (cabor), supaya begitu ada pendaftaran baru masuk untuk
// HIMA ini, otomatis muncul di halaman profil HIMA tanpa perlu input ulang.
router.get('/:id', (req, res) => {
  const hima = db.himas.find((h) => h.id === req.params.id || h.code === req.params.id);
  if (!hima) return res.status(404).json({ message: 'HIMA tidak ditemukan' });
  const athletes = db.athletes.filter((a) => a.hima_id === hima.id);

  // Kumpulkan semua pendaftaran milik HIMA ini, lalu kelompokkan pemainnya
  // per cabor + KATEGORI (sport_type + category). Satu cabor bisa punya
  // beberapa pendaftaran dengan kategori berbeda (mis. Voli Putra & Voli
  // Putri, Basket Putra & Putri, Badminton Ganda Putra/Ganda Putri/
  // Campuran, atau E-Sport Mobile Legends & FIFA) — supaya tidak tercampur
  // di halaman profil atlet, tiap kombinasi sport_type+category jadi
  // grupnya sendiri-sendiri.
  const roster = {};
  for (const r of db.registrations) {
    if (r.hima_id !== hima.id) continue;
    const key = `${r.sport_type}::${r.category || ''}`;
    if (!roster[key]) roster[key] = { sport_type: r.sport_type, category: r.category || null, players: [] };
    for (const p of r.players || []) {
      // reg_id & id (id atlet di dalam pendaftaran) disertakan supaya Panel
      // Admin bisa edit/hapus atlet ini satu-satu lewat
      // PATCH/DELETE /registrations/:reg_id/players/:id — halaman profil
      // publik cukup pakai name & nim saja, field lain diabaikan di sana.
      roster[key].players.push({ id: p.id, reg_id: r.id, name: p.name, nim: p.nim });
    }
  }
  // Ubah dari objek { key: {...} } menjadi array supaya urutannya konsisten
  // & gampang di-render frontend, diurutkan alfabet berdasarkan label
  // tampilan grupnya (mis. "Badminton - Campuran" sebelum "Badminton -
  // Ganda Putra"). Field `sport_type` diisi label tampilan (bukan nama
  // cabor mentah) supaya frontend yang sudah pakai `group.sport_type`
  // otomatis menampilkan kategori tanpa perlu diubah; `category` disertakan
  // terpisah untuk kebutuhan lain di masa depan.
  const roster_by_sport = Object.keys(roster)
    .map((key) => ({
      sport_type: rosterGroupLabel(roster[key].sport_type, roster[key].category),
      category: roster[key].category,
      players: roster[key].players,
    }))
    .sort((a, b) => a.sport_type.localeCompare(b.sport_type));

  res.json({ ...hima, athletes, roster_by_sport });
});

// UPDATE profil hima (admin) — logo, deskripsi, kontak
router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  const hima = db.himas.find((h) => h.id === req.params.id);
  if (!hima) return res.status(404).json({ message: 'HIMA tidak ditemukan' });

  applyIfProvided(hima, req.body, ['logo_url', 'description', 'email', 'instagram', 'color']);
  save();

  res.json(hima);
});

// Tambah atlet
router.post('/:id/athletes', requireAuth, requireAdmin, (req, res) => {
  const { name, sport_type, role, photo_url } = req.body;
  if (!name) return res.status(400).json({ message: 'Nama atlet wajib diisi' });

  const athlete = {
    id: uuid(),
    hima_id: req.params.id,
    name,
    sport_type: sport_type || null,
    role: role || null,
    photo_url: photo_url || null,
  };
  db.athletes.push(athlete);
  save();

  res.status(201).json(athlete);
});

// Konfigurasi event (logo Dekan Cup, BEM, Kabinet)
router.get('/config/event', (req, res) => {
  res.json(db.event_config);
});

router.patch('/config/event', requireAuth, requireAdmin, (req, res) => {
  applyIfProvided(db.event_config, req.body, [
    'event_name',
    'event_year',
    'faculty_name',
    'logo_url',
    'bem_logo_url',
    'kabinet_logo_url',
    // 'custom' otomatis diset lewat endpoint upload di bawah begitu admin
    // unggah file — di sini cukup terima nilai preset bawaan (vintage,
    // midnight, sunset, ocean) yang dipilih dari galeri pilihan.
    'scoreboard_bg_preset',
  ]);
  save();

  const io = req.app.get('io');
  io.emit('scoreboard_bg_updated', db.event_config);

  res.json(db.event_config);
});

// ============================================================
// BACKGROUND LAYAR SKOR BESAR — upload gambar sendiri (file diunggah
// langsung dari device admin, bukan URL), disimpan di
// backend/uploads/scoreboard-bg dan disajikan lewat static route /uploads
// (lihat server.js). Pola sama seperti upload foto pertandingan.
// ============================================================
const scoreboardBgDir = path.join(__dirname, '..', '..', 'uploads', 'scoreboard-bg');
fs.mkdirSync(scoreboardBgDir, { recursive: true });

const bgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, scoreboardBgDir),
  filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname) || '.jpg'}`),
});
const uploadBg = multer({
  storage: bgStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // maks 8 MB, samakan dengan validasi di frontend
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('File harus berupa gambar'));
    }
    cb(null, true);
  },
});
function uploadScoreboardBg(req, res, next) {
  uploadBg.single('background')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Gagal mengunggah gambar' });
    next();
  });
}

// Unggah background sendiri — otomatis jadi preset aktif ('custom') begitu berhasil.
router.post('/config/scoreboard-bg', requireAuth, requireAdmin, uploadScoreboardBg, (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'File gambar wajib diisi' });

  // File lama (kalau ada) dihapus supaya folder upload tidak menumpuk file
  // yatim tiap kali admin ganti-ganti gambar.
  const oldFilename = db.event_config.scoreboard_bg_custom_url
    ? path.basename(db.event_config.scoreboard_bg_custom_url)
    : null;
  if (oldFilename) {
    fs.unlink(path.join(scoreboardBgDir, oldFilename), () => {});
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  db.event_config.scoreboard_bg_custom_url = `${baseUrl}/uploads/scoreboard-bg/${req.file.filename}`;
  db.event_config.scoreboard_bg_preset = 'custom';
  save();

  const io = req.app.get('io');
  io.emit('scoreboard_bg_updated', db.event_config);

  res.status(201).json(db.event_config);
});

export default router;
