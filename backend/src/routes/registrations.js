import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db, save, nowStr } from '../db.js';
import { requireAuth, requireAdmin, canManageSport } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// ============================================================
// Konfigurasi tiap cabang/lomba: kategori yang tersedia + jumlah peserta
// per pendaftaran + field tambahan (kalau ada). Kalau butuh disesuaikan
// (mis. field di Google Form aslinya beda), cukup ubah di sini — validasi
// & pesan error otomatis mengikuti.
//
// `templateUrl`: link ke file template formulir pendaftaran (referensi
// sebelum upload PDF). `forceMajeureUrl`: link ke Surat Pernyataan Force
// Majeure yang wajib dibaca & disetujui peserta. Saat ini kedua link sama
// untuk semua cabor (link yang diberikan panitia) — kalau tiap cabor
// ternyata butuh link template/surat yang berbeda, tinggal timpa per-cabor
// di bawah.
//
// `extraFields`: pertanyaan tambahan khusus cabor tsb (di luar field umum).
// Setiap item: { id, label, type: 'text', required, placeholder?, helper? }
// ============================================================
// `hasSquadStatus`: kalau true, N pemain pertama yang didaftarkan otomatis
// berstatus "Inti" (N = minPlayers, atau categoryPlayers[kategori].min kalau
// ada), sisanya (sampai maxPlayers) otomatis "Cadangan". Pendaftar tetap
// menambah sendiri lewat tombol "+ Tambah Peserta" seperti biasa — status
// cuma ditentukan otomatis dari urutan pengisian.
export const SPORT_CONFIG = {
  Futsal: { categories: ['Putra', 'Putri'], minPlayers: 5, maxPlayers: 15, hasSquadStatus: true, templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1' },
  Basket: { categories: ['Putra', 'Putri'], minPlayers: 5, maxPlayers: 12, hasSquadStatus: true, templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1' },
  Voli: { categories: ['Putra', 'Putri'], minPlayers: 6, maxPlayers: 12, hasSquadStatus: true, templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1' },
  Badminton: {
    categories: ['Ganda Putra', 'Ganda Putri', 'Campuran'],
    minPlayers: 2, maxPlayers: 4,
    templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1',
  },
  'E-Sport Mobile Legends': {
    categories: ['Mobile Legends', 'FIFA'],
    minPlayers: 1, maxPlayers: 7, hasSquadStatus: true,
    // FIFA: minimum dinaikkan jadi 2 sesuai permintaan ("2 inti"), maksimum
    // ikut dinaikkan ke 4 (2 inti + sampai 2 cadangan) — sebelumnya max FIFA
    // cuma 2, jadi tidak akan pernah ada slot cadangan kalau tidak dinaikkan.
    // Sesuaikan lagi kalau panitia mau batas cadangan FIFA yang berbeda.
    categoryPlayers: { 'Mobile Legends': { min: 5, max: 7 }, 'FIFA': { min: 2, max: 4 } },
    templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1',
  },
  Fotografi: {
    categories: ['Fotografi'], minPlayers: 1, maxPlayers: 6,
    templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1',
    extraFields: [
      {
        id: 'cabang_lain',
        label: 'Cabang perlombaan lain yang diikuti selain Fotografi',
        type: 'text',
        required: true,
        placeholder: '-',
        helper: 'Jawab (-) jika hanya mengikuti perlombaan Fotografi pada Dekan Cup FST 2026',
      },
    ],
  },
  Catur: { categories: ['Catur'], minPlayers: 4, maxPlayers: 4, templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1' },
  'Band Competition': {
    categories: ['Band Competition'], minPlayers: 3, maxPlayers: 10,
    templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1',
    extraFields: [{ id: 'nama_band', label: 'Nama Band', type: 'text', required: true }],
  },
  Tari: {
    categories: ['Tari'], minPlayers: 3, maxPlayers: 15,
    templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1',
    extraFields: [{ id: 'nama_grup', label: 'Nama Grup Tari', type: 'text', required: true }],
  },
};
const SPORT_TYPES = Object.keys(SPORT_CONFIG);

// ============================================================
// KODE KATEGORI — dipakai di kolom "Kode Kategori" spreadsheet supaya sheet
// per cabor (mis. Voli, yang punya kategori Putra & Putri) bisa dibedakan
// dengan kode singkat, bukan cuma teks panjang. Kategori yang belum
// terdaftar di sini otomatis tampil apa adanya (fallback ke nama
// kategorinya sendiri) — tinggal tambah barisnya kalau perlu kode khusus.
// ============================================================
const CATEGORY_CODES = {
  'Putra': 'PA',
  'Putri': 'PI',
  'Ganda Putra': 'GPA',
  'Ganda Putri': 'GPI',
  'Campuran': 'CPR',
  'Mobile Legends': 'ML',
  'FIFA': 'FIFA',
};
function categoryCode(category) {
  return CATEGORY_CODES[category] || category;
}

// ============================================================
// KONFIGURASI JUMLAH PESERTA YANG BISA DIATUR ADMIN (Panel Admin > Pengaturan
// Cabor), tersimpan persisten di db.sport_limits. Kalau sebuah cabor belum
// pernah diubah admin, dipakai nilai default SPORT_CONFIG di atas.
// getEffectiveSportConfig() = SPORT_CONFIG digabung dengan override admin,
// dan inilah yang dipakai baik untuk endpoint GET /config (dibaca frontend
// form pendaftaran) maupun untuk validasi saat pendaftaran masuk — supaya
// begitu admin ubah angkanya, langsung berlaku di mana-mana tanpa deploy ulang.
//
// Untuk cabor yang tiap kategorinya beda jumlah peserta (categoryPlayers,
// mis. E-Sport: Mobile Legends 5–7 vs FIFA 1–1), override BISA per-kategori
// (db.sport_limits[sport].categoryPlayers[kategori]) supaya admin bisa ubah
// FIFA saja tanpa ikut mengubah Mobile Legends, atau sebaliknya. Untuk cabor
// lain (satu rentang berlaku untuk semua kategori), override tetap global
// seperti sebelumnya — perilaku cabor-cabor itu TIDAK berubah.
export function getEffectiveSportConfig() {
  const effective = {};
  for (const sport of SPORT_TYPES) {
    const base = SPORT_CONFIG[sport];
    const override = db.sport_limits[sport];
    if (!override) {
      effective[sport] = base;
      continue;
    }
    const merged = { ...base };
    if (override.minPlayers !== undefined) merged.minPlayers = override.minPlayers;
    if (override.maxPlayers !== undefined) merged.maxPlayers = override.maxPlayers;
    if (override.categoryPlayers) {
      merged.categoryPlayers = { ...(base.categoryPlayers || {}), ...override.categoryPlayers };
    }
    effective[sport] = merged;
  }
  return effective;
}

router.get('/config', (req, res) => res.json(getEffectiveSportConfig()));

// Admin mengubah jumlah peserta minimum/maksimum.
// Body: { minPlayers, maxPlayers, category? }
// - Tanpa `category`: berlaku untuk seluruh cabor (perilaku lama, dipakai
//   cabor yang jumlah pesertanya sama untuk semua kategori).
// - Dengan `category`: hanya berlaku untuk kategori itu saja (dipakai cabor
//   seperti E-Sport yang tiap kategori beda jumlah pesertanya).
router.put('/config/:sport', requireAuth, requireAdmin, (req, res) => {
  const { sport } = req.params;
  if (!SPORT_TYPES.includes(sport)) {
    return res.status(404).json({ message: 'Cabor tidak ditemukan' });
  }
  const { category } = req.body || {};
  const minPlayers = Number(req.body?.minPlayers);
  const maxPlayers = Number(req.body?.maxPlayers);
  if (!Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers) || minPlayers < 1 || maxPlayers < minPlayers) {
    return res.status(400).json({ message: 'minPlayers/maxPlayers harus angka bulat, minPlayers ≥ 1, dan maxPlayers ≥ minPlayers' });
  }
  const base = SPORT_CONFIG[sport];
  if (category) {
    if (!base.categories.includes(category)) {
      return res.status(400).json({ message: `Kategori "${category}" tidak ditemukan untuk ${sport}` });
    }
    db.sport_limits[sport] = db.sport_limits[sport] || {};
    db.sport_limits[sport].categoryPlayers = db.sport_limits[sport].categoryPlayers || {};
    db.sport_limits[sport].categoryPlayers[category] = { min: minPlayers, max: maxPlayers };
  } else {
    db.sport_limits[sport] = { ...(db.sport_limits[sport] || {}), minPlayers, maxPlayers };
  }
  save();
  res.json(getEffectiveSportConfig()[sport]);
});

// Admin mengembalikan cabor (atau satu kategori tertentu lewat ?category=)
// ke nilai default (hapus override).
router.delete('/config/:sport', requireAuth, requireAdmin, (req, res) => {
  const { sport } = req.params;
  if (!SPORT_TYPES.includes(sport)) {
    return res.status(404).json({ message: 'Cabor tidak ditemukan' });
  }
  const { category } = req.query;
  if (category && db.sport_limits[sport]?.categoryPlayers) {
    delete db.sport_limits[sport].categoryPlayers[category];
  } else {
    delete db.sport_limits[sport];
  }
  save();
  res.json(getEffectiveSportConfig()[sport]);
});

// ============================================================
// UPLOAD FILE FORMULIR PENDAFTARAN (PDF) — disimpan di backend/uploads/formulir
// dan disajikan lewat static route /uploads (lihat server.js).
// ============================================================
const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'formulir');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname) || '.pdf'}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // maks 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('File formulir harus berformat PDF'));
    }
    cb(null, true);
  },
});
// Bungkus upload.single supaya error multer (file terlalu besar, bukan PDF, dll)
// dibalas sebagai JSON rapi, bukan HTML error bawaan Express.
function uploadFormulir(req, res, next) {
  upload.single('formulir_file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Gagal mengunggah file formulir' });
    next();
  });
}

// ============================================================
// PENDAFTARAN BARU — endpoint publik, siapa saja boleh mengisi (tanpa login)
// ============================================================
router.post('/', uploadFormulir, async (req, res) => {
  // Body dikirim sebagai multipart/form-data (karena ada file), jadi semua field
  // teks berupa string — "players", "extra_fields", & checkbox perlu di-parse dulu.
  const { sport_type, hima_id, category, team_name, contact_name, contact_whatsapp, contact_email, notes, health_notes } = req.body || {};
  const agreement = req.body?.agreement === 'true' || req.body?.agreement === 'on';
  const forceMajeureAgreement = req.body?.force_majeure_agreement === 'true' || req.body?.force_majeure_agreement === 'on';
  let players = [];
  try {
    players = JSON.parse(req.body?.players || '[]');
  } catch {
    players = [];
  }
  let extraFieldsInput = {};
  try {
    extraFieldsInput = JSON.parse(req.body?.extra_fields || '{}');
  } catch {
    extraFieldsInput = {};
  }

  // Kalau validasi di bawah gagal, file yang sudah kadung terupload dibuang lagi
  // supaya tidak menumpuk file yatim di folder uploads.
  const cleanupUploadedFile = () => {
    if (req.file) fs.unlink(req.file.path, () => {});
  };

  if (!SPORT_TYPES.includes(sport_type)) {
    cleanupUploadedFile();
    return res.status(400).json({ message: 'Cabang/lomba tidak valid' });
  }
  const config = getEffectiveSportConfig()[sport_type];

  const hima = db.himas.find((h) => h.id === hima_id);
  if (!hima) {
    cleanupUploadedFile();
    return res.status(400).json({ message: 'HIMA/kontingen wajib dipilih' });
  }

  if (!config.categories.includes(category)) {
    cleanupUploadedFile();
    return res.status(400).json({ message: `Kategori tidak valid untuk ${sport_type}` });
  }
  if (!contact_name || !contact_whatsapp) {
    cleanupUploadedFile();
    return res.status(400).json({ message: 'Nama dan No. WhatsApp penanggung jawab wajib diisi' });
  }
  if (!health_notes || !health_notes.trim()) {
    cleanupUploadedFile();
    return res.status(400).json({ message: 'Riwayat penyakit/alergi/alergi obat tiap peserta wajib diisi (isi "Tidak ada" kalau memang tidak ada)' });
  }
  if (!agreement) {
    cleanupUploadedFile();
    return res.status(400).json({ message: 'Anda harus menyetujui pernyataan kesediaan mengikuti peraturan' });
  }
  if (!forceMajeureAgreement) {
    cleanupUploadedFile();
    return res.status(400).json({ message: 'Anda harus menyetujui Surat Pernyataan Force Majeure' });
  }

  // Validasi pertanyaan tambahan khusus cabor (mis. Nama Grup Tari, Nama Band, dst).
  const cleanExtraFields = {};
  for (const field of config.extraFields || []) {
    const raw = (extraFieldsInput?.[field.id] ?? '').toString().trim();
    if (field.required && !raw) {
      cleanupUploadedFile();
      return res.status(400).json({ message: `${field.label} wajib diisi` });
    }
    cleanExtraFields[field.id] = raw;
  }

  if (!req.file) {
    return res.status(400).json({ message: 'File formulir pendaftaran (PDF) wajib diunggah' });
  }
  const cleanPlayers = Array.isArray(players)
    ? players.filter((p) => p && p.name && p.name.trim()).map((p) => ({ id: uuid(), name: p.name.trim(), nim: (p.nim || '').trim() }))
    : [];
  // categoryPlayers per kategori bisa berupa angka tetap (mis. 2 untuk ganda)
  // atau rentang { min, max } (mis. E-Sport: Mobile Legends 5–7, FIFA 1–1).
  const categoryLimit = config.categoryPlayers?.[category];
  const minP = typeof categoryLimit === 'object' ? categoryLimit.min : categoryLimit ?? config.minPlayers;
  const maxP = typeof categoryLimit === 'object' ? categoryLimit.max : categoryLimit ?? config.maxPlayers;
  if (cleanPlayers.length < minP || cleanPlayers.length > maxP) {
    cleanupUploadedFile();
    return res.status(400).json({
      message: `Jumlah peserta untuk ${sport_type} (${category}) harus ${minP === maxP ? `persis ${minP}` : `antara ${minP}–${maxP}`} orang, saat ini ${cleanPlayers.length}`,
    });
  }
  if (cleanPlayers.some((p) => !p.nim)) {
    cleanupUploadedFile();
    return res.status(400).json({ message: 'NIM setiap peserta wajib diisi' });
  }

  // N pemain pertama yang diisi (N = jumlah minimum/inti di atas) otomatis
  // berstatus "Inti", sisanya "Cadangan" — hanya untuk cabor yang
  // hasSquadStatus-nya true (lihat SPORT_CONFIG).
  const playersWithStatus = config.hasSquadStatus
    ? cleanPlayers.map((p, i) => ({ ...p, status: i < minP ? 'Inti' : 'Cadangan' }))
    : cleanPlayers;

  const registration = {
    id: uuid(),
    sport_type,
    hima_id,
    category,
    category_code: categoryCode(category),
    team_name: (team_name || '').trim() || `${hima.code} — ${sport_type} (${category})`,
    contact_name: contact_name.trim(),
    contact_whatsapp: contact_whatsapp.trim(),
    contact_email: (contact_email || '').trim(),
    players: playersWithStatus,
    notes: (notes || '').trim() || null,
    health_notes: health_notes.trim(),
    extra_fields: cleanExtraFields,
    force_majeure_agreement: true,
    formulir_file: req.file.filename,
    formulir_original_name: req.file.originalname,
    status: 'submitted',
    created_at: nowStr(),
  };
  db.registrations.push(registration);
  save();

  const io = req.app.get('io');
  io?.emit('registration_added', { sport_type, hima_code: hima.code });

  // URL publik ke file formulir PDF yang baru diunggah, supaya link-nya bisa
  // langsung diklik dari Google Sheets (bukan cuma nama file). Pakai
  // PUBLIC_BASE_URL kalau di-set di .env (disarankan untuk deploy produksi,
  // karena req.protocol/host bisa salah di belakang reverse proxy), kalau
  // tidak fallback ke origin dari request itu sendiri.
  const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const formulirFileUrl = `${baseUrl}/uploads/formulir/${registration.formulir_file}`;

  syncToSheets({ ...registration, hima_code: hima.code, hima_name: hima.full_name, formulir_file_url: formulirFileUrl }).catch((err) => {
    console.warn('Sinkronisasi ke Google Sheets gagal (data tetap tersimpan di server):', err.message);
  });

  res.status(201).json(registration);
});

// ============================================================
// DAFTAR PENDAFTARAN — khusus admin, dibatasi sesuai sport_scope masing-masing
// ============================================================
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const { sport_type } = req.query;
  let rows = db.registrations.filter((r) => canManageSport(req.user, r.sport_type));
  if (sport_type) rows = rows.filter((r) => r.sport_type === sport_type);
  rows = rows
    .map((r) => {
      const hima = db.himas.find((h) => h.id === r.hima_id);
      return { ...r, hima_code: hima?.code || '?', hima_name: hima?.full_name || '?' };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(rows);
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const reg = db.registrations.find((r) => r.id === req.params.id);
  if (!reg) return res.status(404).json({ message: 'Data pendaftaran tidak ditemukan' });
  if (!canManageSport(req.user, reg.sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${reg.sport_type}` });
  }
  if (reg.formulir_file) {
    fs.unlink(path.join(uploadsDir, reg.formulir_file), () => {});
  }
  db.registrations = db.registrations.filter((r) => r.id !== req.params.id);
  save();
  res.json({ message: 'Data pendaftaran dihapus' });
});

// ============================================================
// EXPORT KE EXCEL (.xlsx) — satu sheet per cabang/lomba yang boleh
// dilihat admin tsb. Dipakai sebagai cara paling sederhana memindahkan
// data ke spreadsheet (buka file-nya lewat Google Sheets → File > Import).
// ============================================================
router.get('/export', requireAuth, requireAdmin, async (req, res) => {
  const { sport_type } = req.query;
  let rows = db.registrations.filter((r) => canManageSport(req.user, r.sport_type));
  if (sport_type) rows = rows.filter((r) => r.sport_type === sport_type);

  if (rows.length === 0) {
    return res.status(404).json({ message: 'Belum ada data pendaftaran untuk diunduh' });
  }

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const bySport = {};
  for (const r of rows) (bySport[r.sport_type] ??= []).push(r);

  for (const [sport, list] of Object.entries(bySport)) {
    const extraFieldDefs = SPORT_CONFIG[sport]?.extraFields || [];
    const sheetRows = list.map((r) => {
      const hima = db.himas.find((h) => h.id === r.hima_id);
      const base = {
        'Waktu Daftar': r.created_at,
        'HIMA': hima?.code || '?',
        'Nama Tim': r.team_name,
        'Kategori': r.category,
        'Kode Kategori': r.category_code || categoryCode(r.category),
        'Penanggung Jawab': r.contact_name,
        'No. WhatsApp': r.contact_whatsapp,
        'Email': r.contact_email,
        'Jumlah Peserta': r.players.length,
        'Riwayat Penyakit/Alergi': r.health_notes || '',
        'Catatan': r.notes || '',
        'File Formulir': r.formulir_original_name || '',
      };
      for (const field of extraFieldDefs) {
        base[field.label] = r.extra_fields?.[field.id] || '';
      }
      r.players.forEach((p, i) => {
        base[`Peserta ${i + 1} — Nama`] = p.name;
        base[`Peserta ${i + 1} — NIM`] = p.nim;
        if (p.status) base[`Peserta ${i + 1} — Status`] = p.status;
      });
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, sport.slice(0, 31)); // nama sheet Excel maks 31 karakter
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `dekancup-pendaftaran-${sport_type || 'semua-cabor'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// ============================================================
// KELOLA PROFIL ATLET SATU-PER-SATU (Panel Admin) — supaya kalau ada atlet
// yang mengundurkan diri/salah input, admin tinggal edit/hapus dari sini,
// TANPA perlu ubah kode. Nama & NIM di sini otomatis ikut berubah di
// halaman profil publik HIMA (karena profil publik ambil datanya langsung
// dari pendaftaran ini, bukan salinan terpisah).
// ============================================================

// Ubah nama/NIM satu atlet.
router.patch('/:regId/players/:playerId', requireAuth, requireAdmin, (req, res) => {
  const reg = db.registrations.find((r) => r.id === req.params.regId);
  if (!reg) return res.status(404).json({ message: 'Data pendaftaran tidak ditemukan' });
  if (!canManageSport(req.user, reg.sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${reg.sport_type}` });
  }
  const player = reg.players.find((p) => p.id === req.params.playerId);
  if (!player) return res.status(404).json({ message: 'Atlet tidak ditemukan' });

  const { name, nim } = req.body || {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ message: 'Nama tidak boleh kosong' });
    player.name = name.trim();
  }
  if (nim !== undefined) {
    if (!nim.trim()) return res.status(400).json({ message: 'NIM tidak boleh kosong' });
    player.nim = nim.trim();
  }
  save();
  res.json(player);
});

// Hapus satu atlet dari pendaftaran (mis. mengundurkan diri) tanpa perlu
// menghapus seluruh data pendaftaran timnya.
router.delete('/:regId/players/:playerId', requireAuth, requireAdmin, (req, res) => {
  const reg = db.registrations.find((r) => r.id === req.params.regId);
  if (!reg) return res.status(404).json({ message: 'Data pendaftaran tidak ditemukan' });
  if (!canManageSport(req.user, reg.sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${reg.sport_type}` });
  }
  const before = reg.players.length;
  reg.players = reg.players.filter((p) => p.id !== req.params.playerId);
  if (reg.players.length === before) {
    return res.status(404).json({ message: 'Atlet tidak ditemukan' });
  }
  save();
  res.json({ message: 'Atlet dihapus dari pendaftaran', players: reg.players });
});

// ============================================================
// SINKRONISASI KE GOOGLE SHEETS (opsional)
// ============================================================
// Cara paling ringan untuk "otomatis masuk ke spreadsheet" TANPA perlu setup
// Google Cloud/service account: panitia deploy 1 Google Apps Script kecil
// (Extensions > Apps Script pada spreadsheet tujuan) sebagai Web App, lalu
// tempel URL Web App itu ke SHEETS_WEBHOOK_URL di file .env backend.
// Setiap ada pendaftaran baru, server ini kirim POST JSON ke URL tersebut.
// Kalau SHEETS_WEBHOOK_URL tidak di-set, langkah ini otomatis dilewati saja
// — data tetap aman tersimpan di database aplikasi (lihat db.registrations)
// dan tetap bisa diunduh sebagai .xlsx lewat endpoint /export di atas.
// Contoh kode Apps Script tersedia di README.md bagian "Registrasi Peserta".
async function syncToSheets(record) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Webhook membalas status ${res.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

export default router;
