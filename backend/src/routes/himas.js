import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, save } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

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
  // per cabor (sport_type). Satu cabor bisa punya beberapa pendaftaran
  // (misalnya kategori Putra & Putri Voli terpisah) — pemain dari
  // semua pendaftaran itu digabung jadi satu daftar per cabor.
  const roster = {};
  for (const r of db.registrations) {
    if (r.hima_id !== hima.id) continue;
    roster[r.sport_type] = roster[r.sport_type] || [];
    for (const p of r.players || []) {
      // reg_id & id (id atlet di dalam pendaftaran) disertakan supaya Panel
      // Admin bisa edit/hapus atlet ini satu-satu lewat
      // PATCH/DELETE /registrations/:reg_id/players/:id — halaman profil
      // publik cukup pakai name & nim saja, field lain diabaikan di sana.
      roster[r.sport_type].push({ id: p.id, reg_id: r.id, name: p.name, nim: p.nim });
    }
  }
  // Ubah dari objek { sport_type: [...] } menjadi array supaya urutannya
  // konsisten & gampang di-render frontend, diurutkan alfabet nama cabor.
  const roster_by_sport = Object.keys(roster)
    .sort((a, b) => a.localeCompare(b))
    .map((sport_type) => ({ sport_type, players: roster[sport_type] }));

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
  ]);
  save();

  res.json(db.event_config);
});

export default router;
