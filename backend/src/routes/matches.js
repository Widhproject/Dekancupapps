import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db, save, nowStr } from '../db.js';
import { requireAuth, requireAdmin, canManageSport } from '../middleware/auth.js';
import { notifyHimaFollowers } from '../lib/push.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

function attachHimas(match) {
  const pickPublicFields = (h) =>
    h ? { id: h.id, code: h.code, full_name: h.full_name, logo_url: h.logo_url, color: h.color } : null;
  const home = db.himas.find((h) => h.id === match.home_hima_id);
  const away = db.himas.find((h) => h.id === match.away_hima_id);
  return {
    ...match,
    home_babak: match.home_babak ?? 0,
    away_babak: match.away_babak ?? 0,
    live_started_at: match.live_started_at ?? null,
    // Timer hitung mundur (dipakai khusus Basket): timer_end_at diisi kalau timer sedang
    // berjalan (dihitung dari sisi server supaya semua device yang nonton tetap sinkron),
    // timer_paused_remaining_sec diisi kalau timer sedang di-jeda.
    timer_duration_sec: match.timer_duration_sec ?? null,
    timer_end_at: match.timer_end_at ?? null,
    timer_paused_remaining_sec: match.timer_paused_remaining_sec ?? null,
    // Jam server saat respons ini dibuat (epoch ms). Dipakai frontend untuk
    // mengoreksi selisih jam perangkat pemakai vs server — tanpa ini, timer
    // basket bisa salah tampil (mis. "10 menit" jadi terlihat "12 menit")
    // kalau jam HP/laptop admin tidak persis sama dengan jam server.
    server_now_ms: Date.now(),
    photos: match.photos ?? [],
    home_hima: pickPublicFields(home),
    away_hima: pickPublicFields(away),
  };
}

// Ubah angka epoch-ms jadi format timestamp yang sama dengan nowStr() di db.js
// ("YYYY-MM-DD HH:MM:SS", UTC, tanpa akhiran 'Z').
function msToDbTimestamp(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

// Hitung sisa waktu timer (dalam milidetik) berdasarkan state pertandingan saat ini.
function getRemainingMs(match) {
  if (match.timer_end_at) {
    const endMs = new Date(match.timer_end_at.replace(' ', 'T') + 'Z').getTime();
    return Math.max(0, endMs - Date.now());
  }
  const remainingSec = match.timer_paused_remaining_sec ?? match.timer_duration_sec ?? 0;
  return Math.max(0, remainingSec * 1000);
}

// GET jadwal dengan filter ?hima=&date=YYYY-MM-DD&status=
router.get('/', (req, res) => {
  const { hima, date, status, sport_type } = req.query;
  let rows = [...db.matches];

  if (status) rows = rows.filter((m) => m.status === status);
  if (sport_type) rows = rows.filter((m) => m.sport_type === sport_type);
  if (date) rows = rows.filter((m) => m.match_date.slice(0, 10) === date);
  if (hima) rows = rows.filter((m) => m.home_hima_id === hima || m.away_hima_id === hima);

  if (status === 'live') {
    // Untuk layar skor: pertandingan yang paling baru dimulai muncul duluan
    rows.sort((a, b) => (b.live_started_at || b.match_date).localeCompare(a.live_started_at || a.match_date));
  } else {
    rows.sort((a, b) => a.match_date.localeCompare(b.match_date));
  }

  res.json(rows.map(attachHimas));
});

router.get('/:id', (req, res) => {
  const match = db.matches.find((m) => m.id === req.params.id);
  if (!match) return res.status(404).json({ message: 'Pertandingan tidak ditemukan' });
  const events = db.match_events
    .filter((e) => e.match_id === match.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ ...attachHimas(match), events });
});

// Buat jadwal baru (admin)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { sport_type, home_hima_id, away_hima_id, venue, match_date, round_name } = req.body;
  if (!sport_type || !home_hima_id || !away_hima_id || !match_date) {
    return res.status(400).json({ message: 'Data pertandingan belum lengkap' });
  }
  if (!canManageSport(req.user, sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${sport_type}` });
  }

  const match = {
    id: uuid(),
    sport_type,
    home_hima_id,
    away_hima_id,
    home_score: 0,
    away_score: 0,
    home_babak: 0,
    away_babak: 0,
    live_started_at: null,
    timer_duration_sec: null,
    timer_end_at: null,
    timer_paused_remaining_sec: null,
    photos: [],
    venue: venue || null,
    match_date,
    status: 'scheduled',
    round_name: round_name || null,
    created_by: req.user.id,
    created_at: nowStr(),
    updated_at: nowStr(),
  };
  db.matches.push(match);
  save();

  res.status(201).json(attachHimas(match));
});

// Hapus pertandingan (admin) — juga membatalkan kontribusinya ke klasemen jika sudah selesai
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const match = db.matches.find((m) => m.id === req.params.id);
  if (!match) return res.status(404).json({ message: 'Pertandingan tidak ditemukan' });
  if (!canManageSport(req.user, match.sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${match.sport_type}` });
  }

  if (match.status === 'finished') reverseStandings(match);

  db.matches = db.matches.filter((m) => m.id !== req.params.id);
  db.match_events = db.match_events.filter((e) => e.match_id !== req.params.id);
  save();

  const io = req.app.get('io');
  io.emit('schedule_changed');

  res.json({ message: 'Pertandingan dihapus' });
});

// Ubah status pertandingan (mulai / selesai)
router.patch('/:id/status', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body; // 'scheduled' | 'live' | 'finished'
  if (!['scheduled', 'live', 'finished'].includes(status)) {
    return res.status(400).json({ message: 'Status tidak valid' });
  }

  const match = db.matches.find((m) => m.id === req.params.id);
  if (!match) return res.status(404).json({ message: 'Pertandingan tidak ditemukan' });
  if (!canManageSport(req.user, match.sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${match.sport_type}` });
  }

  match.status = status;
  match.updated_at = nowStr();
  // Setiap kali pertandingan mulai/di-restart ke "live", jam berjalan (stopwatch) di layar skor
  // mulai dihitung ulang dari titik ini.
  if (status === 'live') match.live_started_at = nowStr();

  if (status === 'finished') updateStandings(match);
  save();

  const io = req.app.get('io');
  io.to(`match_${req.params.id}`).emit('status_updated', { status });
  io.emit('schedule_changed'); // beri tahu halaman jadwal (& layar skor) untuk refresh

  if (status === 'live') {
    const home = db.himas.find((h) => h.id === match.home_hima_id);
    const away = db.himas.find((h) => h.id === match.away_hima_id);
    const title = `🔴 LIVE: ${home?.code || '?'} vs ${away?.code || '?'}`;
    const body = `Pertandingan ${match.sport_type} baru saja dimulai${match.venue ? ` di ${match.venue}` : ''}!`;
    const url = `/#/match/${match.id}`;
    // Kirim ke penonton yang follow tim manapun (home atau away) — dibiarkan
    // berjalan di belakang (tidak di-await) supaya respons ke admin tetap cepat.
    notifyHimaFollowers(match.home_hima_id, { title, body, url });
    notifyHimaFollowers(match.away_hima_id, { title, body, url });
  }

  res.json(attachHimas(match));
});

// Update skor (admin) — inti fitur live score
router.patch('/:id/score', requireAuth, requireAdmin, (req, res) => {
  const { home_score, away_score, home_babak, away_babak } = req.body;
  const match = db.matches.find((m) => m.id === req.params.id);
  if (!match) return res.status(404).json({ message: 'Pertandingan tidak ditemukan' });
  if (!canManageSport(req.user, match.sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${match.sport_type}` });
  }

  match.home_score = home_score ?? match.home_score;
  match.away_score = away_score ?? match.away_score;
  match.home_babak = home_babak ?? match.home_babak ?? 0;
  match.away_babak = away_babak ?? match.away_babak ?? 0;
  match.updated_at = nowStr();
  save();

  const io = req.app.get('io');
  const payload = {
    home_score: match.home_score, away_score: match.away_score,
    home_babak: match.home_babak, away_babak: match.away_babak,
  };
  io.to(`match_${req.params.id}`).emit('score_updated', payload);
  // Broadcast global juga (tidak terikat room), dipakai oleh layar skor besar yang
  // otomatis mengikuti pertandingan mana pun yang sedang live.
  io.emit('live_score_updated', { id: match.id, ...payload });

  res.json(attachHimas(match));
});

// Kontrol timer hitung mundur (khusus dipakai Basket) — admin bisa set durasi,
// mulai, jeda, dan reset. Sisa waktu selalu dihitung dari sisi server (bukan client)
// supaya semua device yang menonton (panel admin & layar skor besar) tetap sinkron
// walau ada yang koneksinya lag beberapa detik.
router.patch('/:id/timer', requireAuth, requireAdmin, (req, res) => {
  const { action, duration_sec } = req.body;
  const match = db.matches.find((m) => m.id === req.params.id);
  if (!match) return res.status(404).json({ message: 'Pertandingan tidak ditemukan' });
  if (!canManageSport(req.user, match.sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${match.sport_type}` });
  }

  if (action === 'set') {
    if (!Number.isFinite(duration_sec) || duration_sec <= 0) {
      return res.status(400).json({ message: 'Durasi timer tidak valid' });
    }
    match.timer_duration_sec = Math.round(duration_sec);
    match.timer_paused_remaining_sec = Math.round(duration_sec);
    match.timer_end_at = null;
  } else if (action === 'start') {
    const remainingMs = getRemainingMs(match);
    if (remainingMs <= 0) {
      return res.status(400).json({ message: 'Waktu sudah habis — set ulang durasinya dulu' });
    }
    match.timer_end_at = msToDbTimestamp(Date.now() + remainingMs);
    match.timer_paused_remaining_sec = null;
  } else if (action === 'pause') {
    const remainingMs = getRemainingMs(match);
    match.timer_paused_remaining_sec = Math.round(remainingMs / 1000);
    match.timer_end_at = null;
  } else if (action === 'reset') {
    match.timer_paused_remaining_sec = match.timer_duration_sec ?? 0;
    match.timer_end_at = null;
  } else {
    return res.status(400).json({ message: 'Aksi timer tidak dikenali' });
  }

  match.updated_at = nowStr();
  save();

  const payload = {
    timer_duration_sec: match.timer_duration_sec,
    timer_end_at: match.timer_end_at,
    timer_paused_remaining_sec: match.timer_paused_remaining_sec,
    server_now_ms: Date.now(),
  };
  const io = req.app.get('io');
  io.to(`match_${req.params.id}`).emit('timer_updated', payload);
  io.emit('live_timer_updated', { id: match.id, ...payload });

  res.json(attachHimas(match));
});

// Tambah catatan kejadian (gol, kartu, pergantian pemain, pelanggaran basket, dll)
router.post('/:id/events', requireAuth, requireAdmin, (req, res) => {
  const { event_type, minute, description, hima_id } = req.body;
  if (!event_type) return res.status(400).json({ message: 'Jenis kejadian wajib diisi' });

  const match = db.matches.find((m) => m.id === req.params.id);
  if (!match) return res.status(404).json({ message: 'Pertandingan tidak ditemukan' });
  if (!canManageSport(req.user, match.sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${match.sport_type}` });
  }

  const event = {
    id: uuid(),
    match_id: req.params.id,
    hima_id: hima_id || null,
    event_type,
    minute: minute || null,
    description: description || null,
    created_by: req.user.id,
    created_at: nowStr(),
  };
  db.match_events.push(event);
  save();

  const io = req.app.get('io');
  io.to(`match_${req.params.id}`).emit('event_added', event);

  res.status(201).json(event);
});

// ============================================================
// FOTO/DOKUMENTASI PERTANDINGAN — upload file langsung dari device panitia
// (bukan URL), disimpan di backend/uploads/match-photos dan disajikan lewat
// static route /uploads (lihat server.js). Pola sama seperti upload_formulir
// pendaftaran di registrations.js.
// ============================================================
const matchPhotosDir = path.join(__dirname, '..', '..', 'uploads', 'match-photos');
fs.mkdirSync(matchPhotosDir, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, matchPhotosDir),
  filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname) || '.jpg'}`),
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // maks 8 MB, samakan dengan validasi di frontend
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('File harus berupa gambar'));
    }
    cb(null, true);
  },
});
// Bungkus upload.single supaya error multer (file terlalu besar, bukan gambar, dll)
// dibalas sebagai JSON rapi, bukan HTML error bawaan Express — dan supaya
// "Failed to fetch" di sisi frontend (yang sebelumnya terjadi karena endpoint
// ini tidak pernah benar-benar membaca multipart/form-data) tidak terjadi lagi.
function uploadMatchPhoto(req, res, next) {
  uploadPhoto.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Gagal mengunggah foto' });
    next();
  });
}

// Tambah foto/dokumentasi pertandingan (file diunggah langsung dari device panitia).
router.post('/:id/photos', requireAuth, requireAdmin, uploadMatchPhoto, (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'File foto wajib diisi' });

  const match = db.matches.find((m) => m.id === req.params.id);
  if (!match) {
    fs.unlink(path.join(matchPhotosDir, req.file.filename), () => {});
    return res.status(404).json({ message: 'Pertandingan tidak ditemukan' });
  }
  if (!canManageSport(req.user, match.sport_type)) {
    fs.unlink(path.join(matchPhotosDir, req.file.filename), () => {});
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${match.sport_type}` });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  if (!match.photos) match.photos = [];
  const photo = {
    id: uuid(),
    url: `${baseUrl}/uploads/match-photos/${req.file.filename}`,
    filename: req.file.filename,
    caption: req.body.caption || null,
    created_at: nowStr(),
  };
  match.photos.push(photo);
  save();

  const io = req.app.get('io');
  io.to(`match_${req.params.id}`).emit('photo_added', photo);

  res.status(201).json(photo);
});

router.delete('/:id/photos/:photoId', requireAuth, requireAdmin, (req, res) => {
  const match = db.matches.find((m) => m.id === req.params.id);
  if (!match) return res.status(404).json({ message: 'Pertandingan tidak ditemukan' });
  if (!canManageSport(req.user, match.sport_type)) {
    return res.status(403).json({ message: `Akun Anda tidak diizinkan mengelola cabor ${match.sport_type}` });
  }

  const photo = (match.photos || []).find((p) => p.id === req.params.photoId);
  match.photos = (match.photos || []).filter((p) => p.id !== req.params.photoId);
  save();
  if (photo?.filename) fs.unlink(path.join(matchPhotosDir, photo.filename), () => {});

  res.json({ message: 'Foto dihapus' });
});

// Hitung ulang klasemen sederhana (3 poin menang, 1 seri, 0 kalah)
function updateStandings(match) {
  const sport = match.sport_type;
  for (const [himaId, gf, ga] of [
    [match.home_hima_id, match.home_score, match.away_score],
    [match.away_hima_id, match.away_score, match.home_score],
  ]) {
    const existing = db.standings.find((s) => s.hima_id === himaId && s.sport_type === sport);
    const won = gf > ga ? 1 : 0;
    const drawn = gf === ga ? 1 : 0;
    const lost = gf < ga ? 1 : 0;
    const points = won * 3 + drawn * 1;

    if (existing) {
      existing.played += 1;
      existing.won += won;
      existing.drawn += drawn;
      existing.lost += lost;
      existing.goals_for += gf;
      existing.goals_against += ga;
      existing.points += points;
    } else {
      db.standings.push({
        id: uuid(),
        hima_id: himaId,
        sport_type: sport,
        played: 1,
        won,
        drawn,
        lost,
        goals_for: gf,
        goals_against: ga,
        points,
      });
    }
  }
}

// Batalkan kontribusi sebuah pertandingan yang sudah selesai dari klasemen (dipakai saat hapus pertandingan)
function reverseStandings(match) {
  const sport = match.sport_type;
  for (const [himaId, gf, ga] of [
    [match.home_hima_id, match.home_score, match.away_score],
    [match.away_hima_id, match.away_score, match.home_score],
  ]) {
    const existing = db.standings.find((s) => s.hima_id === himaId && s.sport_type === sport);
    if (!existing) continue;
    const won = gf > ga ? 1 : 0;
    const drawn = gf === ga ? 1 : 0;
    const lost = gf < ga ? 1 : 0;
    const points = won * 3 + drawn * 1;

    existing.played -= 1;
    existing.won -= won;
    existing.drawn -= drawn;
    existing.lost -= lost;
    existing.goals_for -= gf;
    existing.goals_against -= ga;
    existing.points -= points;
  }
  db.standings = db.standings.filter((s) => s.played > 0);
}

// GET klasemen per cabang olahraga
router.get('/standings/:sport_type', (req, res) => {
  const rows = db.standings
    .filter((s) => s.sport_type === req.params.sport_type)
    .map((s) => {
      const h = db.himas.find((hima) => hima.id === s.hima_id);
      return { ...s, code: h?.code, full_name: h?.full_name, logo_url: h?.logo_url };
    })
    .sort((a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against));
  res.json(rows);
});

export default router;
