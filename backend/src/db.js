import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR bisa di-set lewat environment variable (misalnya untuk mengarahkan
// ke folder Volume yang persisten di hosting seperti Railway). Kalau tidak
// di-set, default-nya tetap folder backend/data seperti biasa.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'dekancup.json');

export function nowStr() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function defaultData() {
  return {
    users: [],
    himas: [],
    athletes: [],
    matches: [],
    match_events: [],
    standings: [],
    event_config: null,
    // Override jumlah peserta minimum/maksimum per cabor, diatur lewat Panel
    // Admin > Pengaturan Cabor. Kalau sebuah cabor belum pernah diatur admin,
    // dipakai nilai default dari SPORT_CONFIG di routes/registrations.js.
    // Bentuk: { [sport_type]: { minPlayers, maxPlayers, categoryPlayers? } }
    sport_limits: {},
    // Langganan Web Push: satu entri per device/browser yang pernah klik "Notify Me",
    // berisi endpoint push milik browser + daftar id HIMA yang mereka ikuti.
    push_subscriptions: [],
    // Pendaftaran peserta per cabang olahraga (form publik "/daftar/:cabor").
    registrations: [],
    // Penanda "data contoh (demo) sudah pernah dibuat". Dipakai supaya
    // seed() di bawah cuma mengisi data contoh SEKALI SAJA (pas pertama
    // kali aplikasi dijalankan) — kalau admin menghapus semua HIMA/
    // pertandingan lalu server di-restart/redeploy, data contoh TIDAK
    // akan otomatis muncul lagi.
    demo_seeded: false,
  };
}

function load() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(dbPath)) {
    const initial = defaultData();
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    // File sudah pernah ada sebelumnya = seed() sudah pernah jalan di masa
    // lalu, jadi demo_seeded dipaksa true di sini (walau file lama belum
    // punya field ini) supaya data contoh tidak pernah otomatis dibuat ulang.
    return { ...defaultData(), ...JSON.parse(raw), demo_seeded: true };
  } catch (err) {
    console.error('Gagal membaca database JSON, membuat ulang dari kosong:', err.message);
    const initial = defaultData();
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}

// ============ "DATABASE" (objek in-memory, dipersist ke file JSON) ============
export const db = load();

export function save() {
  // Tulis ke file sementara lalu rename, supaya file JSON tidak korup kalau proses berhenti di tengah tulis
  const tmpPath = `${dbPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2));
  fs.renameSync(tmpPath, dbPath);
}

// ============ SEED ============
function seed() {
  // Kalau data contoh sudah pernah dibuat sebelumnya (di deploy manapun),
  // jangan buat lagi — walau HIMA/pertandingan sekarang sengaja dikosongkan
  // admin. Ini mencegah data demo "hidup lagi" tiap kali server di-restart.
  if (db.demo_seeded) return;

  if (db.himas.length === 0) {
    console.log('Seeding data HIMA Dekan Cup FST 2026...');
    const himas = [
      ['HIMAKI', 'Himpunan Mahasiswa Kimia', '#7A2A28'],
      ['HIMBIO', 'Himpunan Mahasiswa Biologi', '#33473A'],
      ['HIMAFI', 'Himpunan Mahasiswa Fisika', '#7A2A28'],
      ['HIMASTA', 'Himpunan Mahasiswa Statistika', '#33473A'],
      ['HIMATIKA', 'Himpunan Mahasiswa Matematika', '#7A2A28'],
      ['HMTB', 'Himpunan Mahasiswa Teknik Biomedis', '#33473A'],
      ['HMTL', 'Himpunan Mahasiswa Teknik Lingkungan', '#7A2A28'],
      ['HIMSI', 'Himpunan Mahasiswa Sistem Informasi', '#33473A'],
    ];

    for (const [code, full_name, color] of himas) {
      db.himas.push({
        id: uuid(),
        code,
        full_name,
        logo_url: `assets/logos/${code.toLowerCase()}.svg`,
        description: code === 'HIMAKI'
          ? 'HIMAKI atau Himpunan Mahasiswa Kimia berdiri pada tahun 1984. HIMAKI ada sejak berdirinya Fakultas Matematika dan Ilmu Pengetahuan Alam Universitas Airlangga (FMIPA UNAIR), yang kini berganti nama menjadi Fakultas Sains dan Teknologi Universitas Airlangga mulai tahun 2008.\nPada awal berdirinya, HIMAKI merupakan Himpunan Mahasiswa Jurusan yang menaungi mahasiswa program studi Kimia dalam menampung segala potensi, ide, saran, kreativitas dari mahasiswa Kimia di Universitas Airlangga yang berasaskan kekeluargaan. Kemudian berdasarkan Surat Keputusan Rektor pada 22 Oktober 2001, dimana dengan adanya keputusan pembentukan departemen di FMIPA UNAIR yang meliputi Departemen Kimia, Fisika, Biologi, dan Matematika, maka HIMAKI yang awalnya merupakan HIMA Jurusan beralih menjadi HIMA Departemen.'
          : `${full_name} — bagian dari Fakultas Sains dan Teknologi, berpartisipasi dalam Dekan Cup FST 2026.`,
        email: code === 'HIMAKI' ? 'himakiunair2@gmail.com' : `${code.toLowerCase()}@fst.ac.id`,
        instagram: code === 'HIMAKI' ? '@himakimiaunair' : `@${code.toLowerCase()}.fst`,
        color,
        is_team: 1,
        created_at: nowStr(),
      });
    }

    // BEM & Kabinet sebagai entitas non-tim (penyelenggara)
    db.himas.push({
      id: uuid(),
      code: 'BEM',
      full_name: 'Badan Eksekutif Mahasiswa FST',
      logo_url: 'assets/logos/bem.svg',
      description: 'Penyelenggara Dekan Cup FST 2026.',
      email: 'bem@fst.ac.id',
      instagram: '@bem.fst',
      color: '#B8860B',
      is_team: 0,
      created_at: nowStr(),
    });
    db.himas.push({
      id: uuid(),
      code: 'KABINET',
      full_name: 'Kabinet BEM FST 2026',
      logo_url: 'assets/logos/kabinet.svg',
      description: 'Kabinet BEM FST periode 2026, penyelenggara Dekan Cup.',
      email: 'kabinet@fst.ac.id',
      instagram: '@kabinet.fst',
      color: '#B8860B',
      is_team: 0,
      created_at: nowStr(),
    });
  }

  if (db.users.length === 0) {
    console.log('Membuat akun admin default...');
    const email = process.env.ADMIN_EMAIL || 'admin@dekancup.fst.ac.id';
    const password = process.env.ADMIN_PASSWORD || 'DekanCup2026!';
    const hash = bcrypt.hashSync(password, 10);
    db.users.push({
      id: uuid(),
      name: 'Panitia Dekan Cup',
      email,
      password_hash: hash,
      role: 'super_admin',
      created_at: nowStr(),
    });
    console.log(`   -> Login admin: ${email} / ${password}`);
  }

  if (db.matches.length === 0) {
    console.log('Membuat contoh jadwal pertandingan...');
    const getHimaId = (code) => db.himas.find((h) => h.code === code).id;
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
    const addHours = (h) => {
      const d = new Date(today);
      d.setHours(d.getHours() + h);
      return d;
    };

    const makeMatch = (sport_type, home, away, home_score, away_score, venue, hoursOffset, status, round_name) => ({
      id: uuid(),
      sport_type,
      home_hima_id: getHimaId(home),
      away_hima_id: getHimaId(away),
      home_score,
      away_score,
      home_babak: 0,
      away_babak: 0,
      live_started_at: status === 'live' ? fmt(addHours(hoursOffset)) : null,
      venue,
      match_date: fmt(addHours(hoursOffset)),
      status,
      round_name,
      created_by: null,
      created_at: nowStr(),
      updated_at: nowStr(),
    });

    db.matches.push(makeMatch('Futsal', 'HIMAKI', 'HIMASTA', 2, 1, 'Lapangan Futsal FST A', -1, 'live', 'Penyisihan Grup A'));
    db.matches.push(makeMatch('Basket', 'HIMATIKA', 'HIMSI', 0, 0, 'GOR FST', 2, 'scheduled', 'Penyisihan Grup B'));
    db.matches.push(makeMatch('Voli', 'HMTL', 'HMTB', 0, 0, 'Lapangan Voli FST', 5, 'scheduled', 'Penyisihan Grup A'));
    db.matches.push(makeMatch('Futsal', 'HIMAFI', 'HIMBIO', 3, 2, 'Lapangan Futsal FST B', -26, 'finished', 'Penyisihan Grup B'));
  }

  if (!db.event_config) {
    db.event_config = {
      id: 1,
      event_name: 'Dekan Cup',
      event_year: '2026',
      faculty_name: 'Fakultas Sains dan Teknologi',
      logo_url: 'assets/dekancup-logo.svg',
      bem_logo_url: 'assets/logos/bem.svg',
      kabinet_logo_url: 'assets/logos/kabinet.svg',
    };
  }

  db.demo_seeded = true;
  save();
}

seed();

if (process.argv.includes('--seed-only')) {
  console.log('Seed selesai.');
  process.exit(0);
}
