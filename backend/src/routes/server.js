import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import './db.js'; // inisialisasi + seed database saat start
import { db, save } from './db.js';
import authRoutes from './routes/auth.js';
import himaRoutes from './routes/himas.js';
import matchRoutes from './routes/matches.js';
import adminRoutes from './routes/admin.js';
import pushRoutes from './routes/push.js';
import registrationRoutes from './routes/registrations.js';
import { notifyHimaFollowers } from './lib/push.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', event: 'Dekan Cup FST 2026' }));

app.use('/api/auth', authRoutes);
app.use('/api/himas', himaRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/registrations', registrationRoutes);

// Menyajikan file formulir pendaftaran (PDF) yang diunggah peserta, supaya admin
// bisa membuka/mengunduhnya langsung dari panel admin.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Menyajikan frontend statis (mode all-in-one, opsional — frontend juga bisa di-hosting terpisah)
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath, { dotfiles: 'allow' }));
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || '*' },
});
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join_match', (matchId) => socket.join(`match_${matchId}`));
  socket.on('leave_match', (matchId) => socket.leave(`match_${matchId}`));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n🏆  Dekan Cup FST 2026 — Live Score API`);
  console.log(`    Berjalan di http://localhost:${PORT}`);
  console.log(`    Socket.io siap menerima koneksi real-time.\n`);
});

// ---- Scheduler: notifikasi "30 menit lagi main" ----
// Dicek tiap 1 menit. Kalau ada pertandingan berstatus 'scheduled' yang waktu mulainya
// sudah masuk jendela 25-30 menit dari sekarang (jendela dikasih toleransi 5 menit
// supaya tidak ada yang "terlewat" gara-gara timing pas dan interval cuma jalan tiap
// 60 detik), kirim notifikasi ke follower kedua HIMA yang akan bertanding, lalu tandai
// match itu `notified_30min = true` supaya tidak dikirim berulang-ulang.
const THIRTY_MIN_MS = 30 * 60 * 1000;
const REMINDER_WINDOW_MS = 5 * 60 * 1000;

function checkUpcomingMatchReminders() {
  const now = Date.now();
  let changed = false;

  for (const match of db.matches) {
    if (match.status !== 'scheduled' || match.notified_30min) continue;

    // match_date disimpan sebagai "YYYY-MM-DD HH:MM:SS" UTC (lihat nowStr() di db.js).
    const matchTimeMs = new Date(match.match_date.replace(' ', 'T') + 'Z').getTime();
    if (Number.isNaN(matchTimeMs)) continue;

    const msUntilMatch = matchTimeMs - now;
    const isInReminderWindow = msUntilMatch <= THIRTY_MIN_MS && msUntilMatch > THIRTY_MIN_MS - REMINDER_WINDOW_MS;
    if (!isInReminderWindow) continue;

    const home = db.himas.find((h) => h.id === match.home_hima_id);
    const away = db.himas.find((h) => h.id === match.away_hima_id);
    const title = `⏰ 30 menit lagi: ${home?.code || '?'} vs ${away?.code || '?'}`;
    const body = `Pertandingan ${match.sport_type}${match.venue ? ` di ${match.venue}` : ''} akan segera dimulai.`;
    const url = `/#/match/${match.id}`;

    notifyHimaFollowers(match.home_hima_id, { title, body, url });
    notifyHimaFollowers(match.away_hima_id, { title, body, url });

    match.notified_30min = true;
    changed = true;
  }

  if (changed) save();
}

setInterval(checkUpcomingMatchReminders, 60 * 1000);
checkUpcomingMatchReminders(); // langsung jalan sekali saat server start (jaga-jaga ada yg terlewat pas restart)
