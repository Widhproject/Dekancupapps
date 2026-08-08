// ============================================================
// Dekan Cup FST 2026 — Frontend SPA (vanilla JS, tanpa build step)
// ============================================================

// Default: mengikuti origin saat ini (cocok saat backend menyajikan frontend juga).
// Jika frontend di-hosting terpisah dari backend, set window.DEKANCUP_API_BASE sebelum app.js dimuat.
// Default-nya memakai origin (host + port) yang sama dengan halaman ini, karena
// server.js menyajikan frontend dan API dari server yang sama (baik saat development
// lewat "npm run dev" di localhost:4000, maupun saat production di Railway/Render).
const API_BASE = window.DEKANCUP_API_BASE || `${location.protocol}//${location.host}/api`;
const app = document.getElementById('app');
const adminSlot = document.getElementById('admin-nav-slot');

// ---------- Util ----------
function toast(msg) {
  const box = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function getToken() { return localStorage.getItem('dekancup_token'); }
function getUser() { try { return JSON.parse(localStorage.getItem('dekancup_user')); } catch { return null; } }
function setSession(token, user) {
  localStorage.setItem('dekancup_token', token);
  localStorage.setItem('dekancup_user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('dekancup_token');
  localStorage.removeItem('dekancup_user');
}
function isAdmin() {
  const u = getUser();
  return u && ['admin', 'super_admin'].includes(u.role);
}

async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = `Bearer ${getToken()}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan pada server');
  return data;
}

// ---------- Koreksi selisih jam perangkat vs jam server ----------
// Timer basket dihitung mundur dengan membandingkan waktu target ("selesai
// pada jam X") dengan jam SAAT INI di perangkat pemakai. Kalau jam
// HP/laptop admin meleset dari jam server (hal yang sangat umum terjadi —
// banyak perangkat tidak sinkron NTP dengan presisi), hasil hitungannya ikut
// meleset (mis. timer 10 menit tampil jadi 12 menit begitu ditekan Mulai).
// Untuk itu server selalu menyertakan `server_now_ms` di setiap respons
// terkait pertandingan; setiap kali data itu diterima, kita catat selisihnya
// di sini, lalu semua perhitungan sisa waktu dikoreksi otomatis.
let clockOffsetMs = 0;
function updateClockOffset(serverNowMs) {
  if (typeof serverNowMs === 'number') clockOffsetMs = serverNowMs - Date.now();
}
function correctedNow() { return Date.now() + clockOffsetMs; }

// Format detik sisa timer (angka bulat/pecahan) menjadi mm:ss
function fmtCountdown(sec) {
  sec = Math.max(0, Math.round(sec));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(mm)}:${pad(ss)}`;
}

// Hitung sisa detik timer dari state pertandingan (dipakai berulang kali tiap tick,
// bukan cuma sekali render) — kalau timer_end_at ada berarti sedang berjalan (hitung
// selisih ke waktu sekarang, dikoreksi lewat clockOffsetMs di atas), kalau tidak
// berarti sedang di-jeda/belum dimulai (pakai angka yang sudah tersimpan).
function computeRemainingSec(m) {
  if (m.timer_end_at) {
    // Server menyimpan waktu UTC tanpa penanda 'Z' (lihat catatan di atas fmtDate).
    const end = new Date(m.timer_end_at.replace(' ', 'T') + 'Z').getTime();
    return Math.max(0, (end - correctedNow()) / 1000);
  }
  return m.timer_paused_remaining_sec ?? m.timer_duration_sec ?? 0;
}

function fmtDate(str) {
  const d = new Date(str.replace(' ', 'T'));
  return d.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABEL = { scheduled: 'Belum Mulai', live: 'Live', finished: 'Selesai' };
const SPORT_TYPES = ['Futsal', 'Basket', 'Voli', 'Badminton', 'E-Sport Mobile Legends'];

// Ikon cabor: dulu pakai emoji (rendering-nya beda-beda tiap OS/browser dan
// suka pecah/kotak di beberapa perangkat), sekarang diganti ikon SVG garis
// (monoline) buatan sendiri supaya tampilannya konsisten di semua perangkat
// dan senada dengan tema situs (pakai currentColor, jadi otomatis ikut warna
// teks di tempat dia dipasang — lihat .sport-icon-svg di css/style.css).
const SPORT_ICONS = {
  futsal: '<svg class="sport-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.6l3.4 2.5-1.3 4h-4.2l-1.3-4z"/><path d="M12 7.6V4.3M15.4 10.1l3-1.9M8.6 10.1l-3-1.9M10.1 14.1l-2.3 3.2M13.9 14.1l2.3 3.2"/></svg>',
  basket: '<svg class="sport-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.3 5.3c2.4 1.9 3.9 4.2 3.9 6.7s-1.5 4.8-3.9 6.7M18.7 5.3c-2.4 1.9-3.9 4.2-3.9 6.7s1.5 4.8 3.9 6.7"/></svg>',
  voli: '<svg class="sport-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3.2c2.9 2.2 4.3 5.4 4.3 8.8s-1.4 6.6-4.3 8.8M6.2 5.6c2.2 1.5 4.8 2.4 7.6 2.3M4.1 14.2c2.5 1.2 5.3 1.8 8.1 1.5M19.9 14.2c-1.7 1.1-3.6 1.7-5.7 1.8"/></svg>',
  badminton: '<svg class="sport-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8l4 7.4h-8z"/><path d="M8.3 10.2h7.4l1.8 8.4H6.5z"/><circle cx="12" cy="19.6" r="1.6"/></svg>',
  esport: '<svg class="sport-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.8 8.2h10.4a4 4 0 0 1 3.95 4.62l-.58 3.5a1.9 1.9 0 0 1-3.32 1L15 15h-6l-2.25 2.32a1.9 1.9 0 0 1-3.32-1l-.58-3.5A4 4 0 0 1 6.8 8.2z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16.6" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="18.6" cy="13" r=".9" fill="currentColor" stroke="none"/></svg>',
  fotografi: '<svg class="sport-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.6h3.3l1.4-2.1h6.6l1.4 2.1H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.6a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.6" r="3.3"/><circle cx="17.6" cy="10.9" r=".5" fill="currentColor" stroke="none"/></svg>',
  catur: '<svg class="sport-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.2h2v2.1h2V4.2h2v2.1h2V4.2h2v3.9l-1.5 2v7.1H8.5v-7.1l-1.5-2z"/><path d="M6 20h12"/><path d="M8.3 17.2h7.4"/></svg>',
  band: '<svg class="sport-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5v10.3"/><path d="M9 5l8-2.2v10"/><circle cx="7" cy="17.2" r="2.2" fill="currentColor" stroke="none"/><circle cx="15" cy="14.8" r="2.2" fill="currentColor" stroke="none"/></svg>',
  tari: '<svg class="sport-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.6" r="1.8"/><path d="M12 7v4.8"/><path d="M12 8.2L7.2 11M12 8.2l4.6-1.6"/><path d="M12 11.8L8 19M12 11.8l4.8 5.7"/></svg>',
};
const EVENT_LABEL = {
  goal: '⚽ Gol', yellow_card: '🟨 Kartu Kuning', red_card: '🟥 Kartu Merah',
  substitution: '🔁 Pergantian Pemain', note: '📝 Catatan',
};

// ---------- Registrasi Peserta ----------
// Jumlah peserta & kategori per cabor/lomba. Kalau perlu disesuaikan dengan
// aturan panitia yang sesungguhnya, cukup ubah di sini (nilai yang sama juga
// ada di backend/src/routes/registrations.js — jaga supaya tetap sinkron).
// `templateUrl`: link ke template formulir pendaftaran (referensi sebelum
// upload PDF). `forceMajeureUrl`: link ke Surat Pernyataan Force Majeure.
// Saat ini kedua link sama untuk semua cabor (link dari panitia) — kalau
// tiap cabor ternyata butuh link berbeda, timpa per-cabor di bawah (jaga
// sinkron dengan SPORT_CONFIG di backend/src/routes/registrations.js).
// `extraFields`: pertanyaan tambahan khusus cabor tsb, lihat komentar di
// backend/src/routes/registrations.js untuk detail asumsi kategori/jumlah
// peserta pada 4 cabor baru (Fotografi, Catur, Band Competition, Tari).
// Link SOP Pertandingan Dekan Cup FST 2026, sama untuk semua cabor.
const SOP_URL = 'https://drive.google.com/drive/folders/1rzUK1Gxs2JtfK72k1TegGmPyJ_iUKVY3?usp=drive_link';

const SPORT_CONFIG = {
  Futsal: { categories: ['Putra', 'Putri'], minPlayers: 5, maxPlayers: 15, hasSquadStatus: true, icon: SPORT_ICONS.futsal, templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1' },
  Basket: { categories: ['Putra', 'Putri'], minPlayers: 5, maxPlayers: 12, hasSquadStatus: true, icon: SPORT_ICONS.basket, templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1' },
  Voli: { categories: ['Putra', 'Putri'], minPlayers: 6, maxPlayers: 12, hasSquadStatus: true, icon: SPORT_ICONS.voli, templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1' },
  Badminton: {
    categories: ['Ganda Putra', 'Ganda Putri', 'Campuran'],
    minPlayers: 2, maxPlayers: 4, icon: SPORT_ICONS.badminton,
    templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1',
  },
  'E-Sport Mobile Legends': {
    categories: ['Mobile Legends', 'FIFA'],
    minPlayers: 1, maxPlayers: 7, hasSquadStatus: true, icon: SPORT_ICONS.esport,
    categoryPlayers: { 'Mobile Legends': { min: 5, max: 7 }, 'FIFA': { min: 2, max: 4 } },
    templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1',
  },
  Fotografi: {
    categories: ['Fotografi'], minPlayers: 1, maxPlayers: 6, icon: SPORT_ICONS.fotografi,
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
  Catur: { categories: ['Catur'], minPlayers: 4, maxPlayers: 4, icon: SPORT_ICONS.catur, templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1' },
  'Band Competition': {
    categories: ['Band Competition'], minPlayers: 3, maxPlayers: 10, icon: SPORT_ICONS.band,
    templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1',
    extraFields: [{ id: 'nama_band', label: 'Nama Band', type: 'text', required: true }],
  },
  Tari: {
    categories: ['Tari'], minPlayers: 3, maxPlayers: 15, icon: SPORT_ICONS.tari,
    templateUrl: 'https://docs.google.com/document/d/1q_EMgIg-XYeQ3FrrX78g7xNqVEVpRqIHQOdTlbgl81M/edit?tab=t.0', forceMajeureUrl: 'https://drive.google.com/file/d/1JB8LOxjcvxd4o5xZAn9nEUbHfCR0pZ24/view?pli=1',
    extraFields: [{ id: 'nama_grup', label: 'Nama Grup Tari', type: 'text', required: true }],
  },
};
// Slug URL-safe untuk tiap cabor (dipakai di #/daftar/:slug)
const SPORT_SLUGS = {
  futsal: 'Futsal', basket: 'Basket', voli: 'Voli', badminton: 'Badminton', esport: 'E-Sport Mobile Legends',
  fotografi: 'Fotografi', catur: 'Catur', band: 'Band Competition', tari: 'Tari',
};
const sportToSlug = (sport) => Object.entries(SPORT_SLUGS).find(([, v]) => v === sport)?.[0] || '';

function statusBadge(status) {
  return `<span class="badge ${status}">${status === 'live' ? '● ' : ''}${STATUS_LABEL[status] || status}</span>`;
}

// ---------- Web Push: "🔔 Notify Me" per-HIMA ----------
// Konversi VAPID public key (base64url, format dari server) ke Uint8Array —
// bentuk yang diminta PushManager.subscribe().
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// Daftar id HIMA yang diikuti device ini, disimpan lokal di browser cuma buat
// tahu label tombol mana yang harus ditampilkan ("Notify Me" vs "Berhenti") —
// sumber kebenaran sebenarnya tetap di server (db.push_subscriptions).
function getFollowedHimaIds() {
  try { return JSON.parse(localStorage.getItem('dekancup_followed_himas') || '[]'); }
  catch { return []; }
}
function setFollowedHimaIds(ids) {
  localStorage.setItem('dekancup_followed_himas', JSON.stringify(ids));
}

function renderNotifyButton(btn, isFollowing) {
  btn.textContent = isFollowing ? '🔕 Berhenti Notifikasi' : '🔔 Notify Me';
  btn.classList.toggle('primary', !isFollowing);
  btn.classList.toggle('ghost', isFollowing);
}

async function toggleHimaNotification(himaId, btn) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('Browser ini belum mendukung notifikasi. Di iPhone: "Tambahkan ke Layar Utama" dulu, lalu buka dari ikon itu.');
    return;
  }

  const followed = getFollowedHimaIds();
  const isFollowing = followed.includes(himaId);
  btn.disabled = true;

  try {
    const reg = await navigator.serviceWorker.ready;

    if (isFollowing) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint, hima_id: himaId } });
      setFollowedHimaIds(followed.filter((id) => id !== himaId));
      renderNotifyButton(btn, false);
      toast('Berhenti mengikuti notifikasi HIMA ini');
    } else {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('Izin notifikasi ditolak/di-skip. Bisa diaktifkan lagi lewat pengaturan browser.');
        return;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const { enabled, publicKey } = await api('/push/vapid-public-key');
        if (!enabled) { toast('Fitur notifikasi belum diaktifkan oleh panitia.'); return; }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), hima_id: himaId } });
      setFollowedHimaIds([...followed, himaId]);
      renderNotifyButton(btn, true);
      toast('Notifikasi diaktifkan! 🔔');
    }
  } catch (err) {
    console.error(err);
    toast('Gagal mengatur notifikasi: ' + (err.message || 'coba lagi'));
  } finally {
    btn.disabled = false;
  }
}

// ---------- Skeleton loading ----------
// Ditampilkan sebentar saat data dari API belum sampai, sebagai pengganti
// teks "Memuat…" polos — bentuknya menyerupai kartu asli tiap halaman
// (lihat CSS .skel-* di style.css) supaya halaman tidak "melompat" begitu
// data sungguhan datang menggantikannya.
function skeletonMatchList(count = 4) {
  const card = `
    <div class="skel-match-card">
      <div>
        <div class="skel-match-teams">
          <div class="skel-match-team"><div class="skel skel-circle"></div><div class="skel skel-line"></div></div>
          <div class="skel skel-line skel-match-score"></div>
          <div class="skel-match-team"><div class="skel skel-circle"></div><div class="skel skel-line"></div></div>
        </div>
        <div class="skel skel-line w-40" style="margin-top:10px;"></div>
      </div>
      <div class="skel skel-match-status"></div>
    </div>`;
  return `<div class="skel-list">${card.repeat(count)}</div>`;
}
function skeletonHimaGrid(count = 8) {
  const card = `
    <div class="skel-hima-card">
      <div class="skel skel-circle"></div>
      <div class="skel skel-line w-60"></div>
      <div class="skel skel-line w-40"></div>
    </div>`;
  return `<div class="skel-grid-2">${card.repeat(count)}</div>`;
}
function skeletonProfile() {
  return `
    <div class="skel-profile-head">
      <div class="skel skel-circle"></div>
      <div class="skel-lines">
        <div class="skel skel-line w-60" style="height:22px;"></div>
        <div class="skel skel-line w-30"></div>
      </div>
    </div>
    <div class="skel-list">
      <div class="skel skel-line" style="height:60px;"></div>
      <div class="skel skel-line" style="height:60px;"></div>
    </div>`;
}
function skeletonScorecard() {
  return `
    <div class="skel-scorecard">
      <div class="skel skel-line w-30" style="margin:0 auto 14px;"></div>
      <div class="skel-score-row">
        <div class="skel skel-circle"></div>
        <div class="skel skel-line skel-num"></div>
        <div class="skel skel-line skel-num"></div>
        <div class="skel skel-circle"></div>
      </div>
    </div>
    <div class="skel-list" style="margin-top:22px;">
      <div class="skel skel-line" style="height:20px;"></div>
      <div class="skel skel-line" style="height:20px;"></div>
    </div>`;
}
function skeletonFor(path) {
  let body;
  if (path === '/jadwal' || path === '/riwayat') body = skeletonMatchList();
  else if (path === '/hima') body = skeletonHimaGrid();
  else if (path.startsWith('/hima/')) body = skeletonProfile();
  else if (path.startsWith('/match/')) body = skeletonScorecard();
  else body = `<div class="skel-list"><div class="skel skel-line" style="height:26px;width:40%;"></div><div class="skel skel-line" style="height:120px;"></div></div>`;
  return `<div class="wrap"><div class="section-head"><div><div class="skel skel-line w-30" style="height:12px;"></div><div class="skel skel-line w-40" style="height:22px;margin-top:6px;"></div></div></div>${body}</div>`;
}

// Animasi "pop" tiap kali angka skor berubah — supaya perubahan skor terasa
// hidup, tidak langsung "loncat" begitu saja dari angka lama ke angka baru.
// Dipicu ulang tiap kali dipanggil, meski nilainya sama seperti sebelumnya
// (dianggap tetap ada update dari admin, jadi tetap kasih feedback visual).
function bumpScoreEl(el, newValue) {
  if (!el) return;
  el.textContent = newValue;
  el.classList.remove('score-bump');
  // reflow paksa supaya class yang dilepas-tempel-lagi tetap memicu animasi
  void el.offsetWidth;
  el.classList.add('score-bump');
}

// ---------- Router ----------
const routes = {};
function route(path, handler) { routes[path] = handler; }

async function router() {
  const hash = location.hash.slice(1) || '/home';
  const [path, queryStr] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryStr));

  // '[data-route]' sengaja dipakai (bukan cuma '#nav-links a') supaya
  // highlight menu aktif berlaku juga untuk item di bottom-nav (navigasi
  // utama di layar HP), tidak cuma menu di header.
  document.querySelectorAll('[data-route]').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === path);
  });

  document.body.classList.toggle('scoreboard-mode', path === '/layar');
  if (scoreboardTimer) { clearInterval(scoreboardTimer); scoreboardTimer = null; }
  if (scoreboardPoll) { clearInterval(scoreboardPoll); scoreboardPoll = null; }
  if (adminTimerInterval) { clearInterval(adminTimerInterval); adminTimerInterval = null; }

  // route dinamis: /hima/:code , /match/:id
  const segments = path.split('/').filter(Boolean);
  let handler = routes[path];
  let params = {};

  if (!handler && segments[0] === 'hima' && segments[1]) {
    handler = routes['/hima/:id']; params = { id: segments[1] };
  }
  if (!handler && segments[0] === 'match' && segments[1]) {
    handler = routes['/match/:id']; params = { id: segments[1] };
  }
  if (!handler && segments[0] === 'daftar' && segments[1]) {
    handler = routes['/daftar/:sport']; params = { sport: segments[1] };
  }

  renderAdminNav();

  if (!handler) { app.innerHTML = emptyState('Halaman tidak ditemukan.'); return; }
  app.innerHTML = skeletonFor(path);
  try {
    await handler({ params, query });
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty-state">⚠️ ${err.message}</div></div>`;
  }
}
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => { renderAdminNav(); router(); bindNavToggle(); });

function bindNavToggle() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const isOpen = links.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) {
      links.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

function renderAdminNav() {
  const bottomAdminLink = document.getElementById('bottom-admin-link');
  if (isAdmin()) {
    adminSlot.innerHTML = `<a href="#/admin" data-route="/admin">Panel Admin</a><button id="logout-btn">Keluar</button>`;
    document.getElementById('logout-btn').onclick = () => { clearSession(); toast('Berhasil keluar'); router(); };
    if (bottomAdminLink) { bottomAdminLink.href = '#/admin'; bottomAdminLink.dataset.route = '/admin'; }
  } else {
    adminSlot.innerHTML = `<a href="#/login" data-route="/login">Admin</a>`;
    if (bottomAdminLink) { bottomAdminLink.href = '#/login'; bottomAdminLink.dataset.route = '/login'; }
  }
}

function emptyState(text) { return `<div class="wrap"><div class="empty-state">${text}</div></div>`; }

// ============================================================
// HALAMAN: HERO (dipakai di atas jadwal)
// ============================================================
function heroHTML() {
  return `
  <section class="hero">
    <div class="wrap">
      <div class="hero-title">
        Dekan Cup <span class="accent">FST 2026</span>
      </div>
      <div class="hero-sub">Beyond the Rivalry, Chase Your Glory</div>
    </div>
  </section>`;
}

// ============================================================
// HALAMAN: HOME
// ============================================================
// Semua konten di bawah ini sengaja dipisah ke satu tempat supaya gampang
// diganti tanpa perlu utak-atik HTML/logic-nya.
//
// - HOME_BANNERS.atas   : foto landscape paling atas (foto "Our Big Team").
// - HOME_BANNERS.tengah : foto landscape kedua, sekarang ditaruh di antara
//   Visi & Misi dan Team Management.
//   Taruh file fotonya di frontend/assets/home/ lalu ganti `src` di sini.
//   Selama file belum ada / gagal dimuat, otomatis muncul placeholder abu-abu
//   dengan tulisan `label`.
// - HOME_VISI_MISI     : visi & misi Dekan Cup (tanpa foto/nama ketua).
// - HOME_MANAGEMENT_TEAM : 6 anggota tim manajemen (foto + nama + jabatan).
//   Ganti `photo` dengan path foto masing-masing (mis. 'assets/home/kevin.jpg').
//   Kalau foto belum ada / gagal dimuat, otomatis jatuh ke ikon placeholder.

const HOME_BANNERS = {
  atas: { src: 'assets/home/our-big-team.jpg', label: 'Our Big Team' },
  tengah: { src: 'assets/dekancup-reference.png', label: 'Badan Pengurus Inti' },
};

const HOME_VISI_MISI = {
  visi: 'Menjadikan Dekan Cup FST 2026 sebagai wadah unggulan untuk mengembangkan bakat dan kreativitas mahasiswa FST di bidang seni dan olahraga, yang tidak hanya berdaya saing tinggi tetapi juga merefleksikan kemegahan dan martabat Fakultas Sains dan Teknologi',
  misi: [
    'Membangun semangat kompetitif yang sehat, sportif, dan beretika luhur.',
    'Mendorong keterlibatan aktif seluruh mahasiswa FST dalam kegiatan seni dan olahraga',
    'Memperkuat persatuan antar Himpunan melalui kompetisi yang bermartabat.',
    'Meningkatkan kualitas penyelenggaraan dengan peraturan yang tegas dan transparan.',
  ],
};

const HOME_MANAGEMENT_TEAM = [
  { name: 'Panji Wirawan', role: 'Koorlap Konseptor', photo: 'assets/home/team-1.jpg' },
  { name: 'Baari Muhammad', role: 'Koorlap Teknis', photo: 'assets/home/team-2.jpg' },
  { name: 'Halin Ifestarika. A', role: 'Sekretaris 1', photo: 'assets/home/team-3.jpg' },
  { name: 'Riyanti Puspitaningrum', role: 'Sekretaris 2', photo: 'assets/home/team-4.jpg' },
  { name: 'Nabilah Arifah', role: 'Bendahara 1', photo: 'assets/home/team-5.jpg' },
  { name: 'Hanum Nisyaul. A', role: 'Koordinator Perlengkapan', photo: 'assets/home/team-6.jpg' },
];

// ---- EXECUTIVE COMMITTEE (di bawah Team Management) --------------------
// - EXEC_LEAD          : 1 foto di puncak, di tengah-tengah antara grup
//                        "Head of Conceptor" dan "Head of Technical" di bawahnya.
// - EXEC_CONCEPTOR      : 8 anggota Head of Conceptor.
// - EXEC_TECHNICAL      : 9 anggota Head of Technical.
// Ukuran frame fotonya sama persis dengan card di Team Management (dipakai
// ulang class .team-card/.team-grid yang sama). Ganti `name`, `role`, dan
// `photo` sesuai data asli; kalau foto belum ada, otomatis jatuh ke ikon
// placeholder seperti di Team Management.
const EXEC_LEAD = [
  { name: 'Bagas Widhi A.', role: 'Ketua Pelaksana', photo: 'assets/home/exec-lead.jpg' },
];
const EXEC_CONCEPTOR = [
  { name: 'Siti Ropiah', role: 'Koordinator Acara', photo: 'assets/home/conceptor-1.jpg' },
  { name: 'Claudya Zoelovely', role: 'Koordinator PDD', photo: 'assets/home/conceptor-2.jpg' },
  { name: 'Naila Jihan S.', role: 'Koordinator KSK', photo: 'assets/home/conceptor-3.jpg' },
  { name: 'Earlene Aprillia W.', role: 'Koordinator Medis', photo: 'assets/home/conceptor-4.jpg' },
  { name: 'Nimas Ayu P.', role: 'Koordinator Finkom', photo: 'assets/home/conceptor-5.jpg' },
  { name: 'Marco Jonathan P.', role: 'Koordinator KAHUMZIN', photo: 'assets/home/conceptor-6.jpg' },
  { name: 'Galuh Septi T.', role: 'Koordinator Perlengkapan', photo: 'assets/home/conceptor-7.jpg' },
  { name: 'Amirotul Madihah', role: 'Koordinator Sponsorship', photo: 'assets/home/conceptor-8.jpg' },
];
const EXEC_TECHNICAL = [
  { name: 'Steve Rafael', role: 'Koordinator Voli', photo: 'assets/home/technical-1.jpg' },
  { name: 'M. Fanda Akbar', role: 'Koordinator Basket', photo: 'assets/home/technical-2.jpg' },
  { name: 'M. Fadhil Akbar', role: 'Koordinator Futsal', photo: 'assets/home/technical-3.jpg' },
  { name: 'Nabilah Wiedama Putri', role: 'Koordinator Badminton', photo: 'assets/home/technical-4.jpg' },
  { name: 'Qobidh Abu Haekal', role: 'Koordinator Catur', photo: 'assets/home/technical-5.jpg' },
  { name: 'Edelfia Piranti E.', role: 'Koordinator Tari', photo: 'assets/home/technical-6.jpg' },
  { name: 'Cintantya Sih Nareswari', role: 'Koordinator Fotografi', photo: 'assets/home/technical-7.jpg' },
  { name: 'Maharani Surya Citra Dewi', role: 'Koordinator E-Sport', photo: 'assets/home/technical-8.jpg' },
  { name: 'Jonatan Aditia Sihombing', role: 'Koordinator Band Competition', photo: 'assets/home/technical-9.jpg' },
];
const teamCardHTML = (t) => `
  <div class="team-card">
    <img src="${t.photo}" alt="${t.name}" onerror="this.src='assets/logos/_avatar-placeholder.svg'" />
    <div class="team-name">${t.name}</div>
    <div class="team-role">${t.role}</div>
  </div>`;

route('/home', async () => {
  app.innerHTML = `
    <div class="home-banner-frame is-full">
      <div class="home-banner">
        <img src="${HOME_BANNERS.atas.src}" alt="${HOME_BANNERS.atas.label}"
          onerror="this.closest('.home-banner').classList.add('is-placeholder'); this.remove();" />
        <span class="home-banner-label">${HOME_BANNERS.atas.label}</span>
      </div>
    </div>

    <div class="section-divider"><span class="mark"></span></div>

    <div class="wrap">
      <section class="visi-misi">
        <div class="section-head"><div><h2>Visi dan Misi</h2></div></div>
        <div class="visi-misi-card">
          <div class="vm-content">
            <h3>Visi</h3>
            <p>${HOME_VISI_MISI.visi}</p>
            <h3>Misi</h3>
            <ol>
              ${HOME_VISI_MISI.misi.map((m) => `<li>${m}</li>`).join('')}
            </ol>
          </div>
        </div>
      </section>
    </div>

    <div class="home-banner-frame">
      <div class="home-banner">
        <img src="${HOME_BANNERS.tengah.src}" alt="${HOME_BANNERS.tengah.label}"
          onerror="this.closest('.home-banner').classList.add('is-placeholder'); this.remove();" />
        <span class="home-banner-label">${HOME_BANNERS.tengah.label}</span>
      </div>
    </div>

    <div class="section-divider"><span class="mark"></span></div>

    <div class="wrap">
      <section class="team-section">
        <div class="section-head"><div><h2>Team Management</h2><div class="exec-tag">Executive Committee</div></div></div>

        <div class="exec-lead-grid">
          <div class="exec-lead-row">
            ${EXEC_LEAD.map(teamCardHTML).join('')}
          </div>
        </div>

        <div class="team-grid">
          ${HOME_MANAGEMENT_TEAM.map(teamCardHTML).join('')}
        </div>

        <h3 class="exec-subhead">Head of Conceptor</h3>
        <div class="team-grid">
          ${EXEC_CONCEPTOR.map(teamCardHTML).join('')}
        </div>

        <h3 class="exec-subhead">Head of Technical</h3>
        <div class="team-grid">
          ${EXEC_TECHNICAL.map(teamCardHTML).join('')}
        </div>
      </section>
    </div>`;
});

// ============================================================
// HALAMAN: JADWAL
// ============================================================
route('/jadwal', async ({ query }) => {
  const himas = await api('/himas?team_only=true');
  const himaOptions = himas.map((h) => `<option value="${h.id}" ${query.hima === h.id ? 'selected' : ''}>${h.code}</option>`).join('');

  // Matches diambil DULUAN (sebelum render awal) supaya kita sudah tahu ada
  // pertandingan live atau tidak sebelum memutuskan apa yang ditampilkan di
  // posisi hero: judul biasa (kalau tidak ada live), atau langsung tampilan
  // pertandingan yang sedang berlangsung (kalau ada) — jadi tidak perlu lagi
  // menampilkan dua-duanya sekaligus (judul + spotlight terpisah di bawahnya).
  const matches = await api(`/matches?${new URLSearchParams(query).toString()}`);
  const liveMatches = matches.filter((m) => m.status === 'live');
  const scheduledMatches = matches.filter((m) => m.status === 'scheduled');

  const heroSection = liveMatches.length ? `
    <section class="hero hero-live">
      <div class="wrap">
        <div class="live-spotlight-label"><span class="live-dot"></span> Sedang Berlangsung</div>
        <div class="live-spotlight-grid">
          ${liveMatches.map(liveSpotlightCardHTML).join('')}
        </div>
      </div>
    </section>` : heroHTML();

  app.innerHTML = `
    ${heroSection}
    <div class="wrap">
      <div class="section-head">
        <div><div class="eyebrow">Berita Pertandingan</div><h2>Jadwal &amp; Live Score</h2></div>
      </div>
      <div class="filter-bar">
        <div class="filter-group">
          <label>Cabang Olahraga</label>
          <select id="f-sport"><option value="">Semua</option>${SPORT_TYPES.map((s) => `<option value="${s}" ${query.sport_type === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="filter-group">
          <label>HIMA</label>
          <select id="f-hima"><option value="">Semua</option>${himaOptions}</select>
        </div>
      </div>
      <div id="match-list" class="match-list"></div>
    </div>
  `;

  document.getElementById('f-hima').value = query.hima || '';
  document.getElementById('f-sport').value = query.sport_type || '';

  const applyFilter = () => {
    const params = new URLSearchParams();
    const hima = document.getElementById('f-hima').value;
    const sport = document.getElementById('f-sport').value;
    if (hima) params.set('hima', hima);
    if (sport) params.set('sport_type', sport);
    location.hash = `/jadwal?${params.toString()}`;
  };
  ['f-hima', 'f-sport'].forEach((id) => document.getElementById(id).addEventListener('change', applyFilter));

  // Live tampil sebagai hero di atas saja (tidak dobel di list bawah).
  // Yang sudah selesai tidak ditampilkan di halaman ini lagi — otomatis
  // pindah ke tab Riwayat. List di bawah cuma untuk yang belum mulai.
  const list = document.getElementById('match-list');
  const noFilterApplied = !query.hima && !query.sport_type;
  if (scheduledMatches.length) {
    list.innerHTML = scheduledMatches.map(matchCardHTML).join('');
  } else if (matches.length && (liveMatches.length || matches.some((m) => m.status === 'finished'))) {
    // Ada data untuk filter ini, tapi semuanya sudah live/selesai —
    // bukan "coming soon", cuma memang tidak ada lagi yang menunggu.
    list.innerHTML = emptyState('Tidak ada pertandingan yang belum mulai untuk filter ini.');
  } else if (noFilterApplied) {
    // Belum ada pertandingan sama sekali yang dibuat (bukan sekadar hasil
    // filter kosong) — tampilkan "Coming soon!" biar lebih ramah dilihat
    // pengunjung sebelum jadwal resmi diumumkan.
    list.innerHTML = emptyState('Coming soon!');
  } else {
    list.innerHTML = emptyState('Belum ada pertandingan untuk filter ini.');
  }
});

function matchCardHTML(m) {
  return `
  <a class="match-card" href="#/match/${m.id}">
    <div>
      <div class="mc-teams">
        <div class="mc-team"><img src="${m.home_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'"/> ${m.home_hima.code}</div>
        <div class="mc-score">${m.home_score} <span class="mc-vs">–</span> ${m.away_score}</div>
        <div class="mc-team">${m.away_hima.code} <img src="${m.away_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'"/></div>
      </div>
      <div class="mc-meta">${m.sport_type} · ${m.round_name || ''} · ${fmtDate(m.match_date)} · ${m.venue || 'Venue belum ditentukan'}</div>
    </div>
    <div class="mc-status">${statusBadge(m.status)}</div>
  </a>`;
}

function liveSpotlightCardHTML(m) {
  return `
  <a class="spotlight-card" href="#/match/${m.id}">
    <div class="spotlight-top">
      ${statusBadge(m.status)}
      <span class="spotlight-meta">${m.sport_type}${m.round_name ? ' · ' + m.round_name : ''}</span>
    </div>
    <div class="spotlight-teams">
      <div class="spotlight-team">
        <img src="${m.home_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'"/>
        <span>${m.home_hima.code}</span>
      </div>
      <div class="spotlight-score">${m.home_score} <span class="spotlight-dash">–</span> ${m.away_score}</div>
      <div class="spotlight-team">
        <img src="${m.away_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'"/>
        <span>${m.away_hima.code}</span>
      </div>
    </div>
    <div class="spotlight-venue">${m.venue || 'Venue belum ditentukan'}</div>
  </a>`;
}

function adminMatchCardHTML(m) {
  return `
  <div class="admin-match-row">
    ${matchCardHTML(m)}
    <button class="btn small danger" data-delete-match="${m.id}">🗑 Hapus</button>
  </div>`;
}

function bindDeleteMatchButtons() {
  document.querySelectorAll('[data-delete-match]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteMatch;
      if (!confirm('Hapus pertandingan ini? Tindakan ini tidak bisa dibatalkan.')) return;
      try {
        await api(`/matches/${id}`, { method: 'DELETE', auth: true });
        toast('Pertandingan dihapus');
        router();
      } catch (err) { toast(err.message); }
    });
  });
}

// ============================================================
// HALAMAN: DAFTAR HIMA
// ============================================================
route('/hima', async () => {
  const himas = await api('/himas?team_only=true');
  app.innerHTML = `
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Peserta</div><h2>Himpunan Mahasiswa</h2></div></div>
      <div class="hima-grid">
        ${himas.map((h) => `
          <a class="hima-card" href="#/hima/${h.code}">
            <img src="${h.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'" />
            <div class="code">${h.code}</div>
            <div class="full">${h.full_name}</div>
          </a>`).join('')}
      </div>
    </div>`;
});

// ============================================================
// HALAMAN: PROFIL HIMA
// ============================================================
route('/hima/:id', async ({ params }) => {
  const h = await api(`/himas/${params.id}`);
  const isFollowing = getFollowedHimaIds().includes(h.id);
  app.innerHTML = `
    <div class="wrap">
      <div class="section-head"><div class="eyebrow">Profil Peserta</div></div>
      <div class="profile-card">
        <div class="profile-head">
          <img src="${h.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'" />
          <div>
            <h1>${h.full_name}</h1>
            <div class="eyebrow">${h.code}</div>
          </div>
          <button class="btn small ${isFollowing ? 'ghost' : 'primary'}" id="notify-btn" style="margin-left:auto;">
            ${isFollowing ? '🔕 Berhenti Notifikasi' : '🔔 Notify Me'}
          </button>
        </div>
        <p style="white-space:pre-line">${h.description || 'Belum ada deskripsi.'}</p>
        <div class="contact-row">
          <div><span>Email</span>${h.email || '-'}</div>
          <div><span>Instagram</span>${h.instagram || '-'}</div>
        </div>
        ${h.athletes?.length ? `
          <div class="section-head"><h2 style="font-size:1.1rem">Atlet &amp; Perwakilan</h2></div>
          <div class="athlete-grid">
            ${h.athletes.map((a) => `
              <div class="athlete">
                <img src="${a.photo_url || 'assets/logos/_avatar-placeholder.svg'}" />
                <div class="name">${a.name}</div>
                <div class="role">${a.role || ''} ${a.sport_type ? '· ' + a.sport_type : ''}</div>
              </div>`).join('')}
          </div>` : ''}
        ${h.roster_by_sport?.length ? `
          <div class="section-head"><h2 style="font-size:1.1rem">Profil Atlet</h2></div>
          <div class="roster-by-sport">
            ${h.roster_by_sport.map((group, i) => `
              <details class="roster-group" ${i === 0 ? 'open' : ''}>
                <summary class="roster-group-title">
                  <span class="roster-caret">▸</span>
                  ${group.sport_type}
                  <span class="roster-count">(${group.players.length} peserta)</span>
                </summary>
                <table class="roster-table">
                  <thead><tr><th>Nama</th><th>NIM</th></tr></thead>
                  <tbody>
                    ${group.players.map((p) => `
                      <tr><td>${p.name}</td><td>${p.nim || '-'}</td></tr>`).join('')}
                  </tbody>
                </table>
              </details>`).join('')}
          </div>` : ''}
      </div>
    </div>`;

  document.getElementById('notify-btn').addEventListener('click', (e) => toggleHimaNotification(h.id, e.currentTarget));
});

// ============================================================
// HALAMAN: DETAIL MATCH + LIVE SCORE
// ============================================================
let currentSocket = null;
let scoreboardTimer = null;
let scoreboardPoll = null;
let adminTimerInterval = null; // interval lokal buat "mencentang" tampilan timer admin tiap detik

// Update teks tampilan timer di panel admin, lalu (kalau timernya sedang berjalan)
// pasang interval baru supaya angkanya terus "mencentang" tiap detik tanpa perlu
// nge-fetch ulang ke server. Dipanggil ulang tiap ada state timer baru (habis klik
// tombol Set/Mulai/Jeda/Reset, atau saat menerima update lewat socket dari device lain).
function restartAdminTimerInterval(matchLike) {
  if (adminTimerInterval) { clearInterval(adminTimerInterval); adminTimerInterval = null; }
  const el = document.getElementById('admin-timer-display');
  if (el) el.textContent = fmtCountdown(computeRemainingSec(matchLike));
  if (matchLike.timer_end_at) {
    adminTimerInterval = setInterval(() => {
      const target = document.getElementById('admin-timer-display');
      if (target) target.textContent = fmtCountdown(computeRemainingSec(matchLike));
    }, 250);
  }
}

route('/match/:id', async ({ params }) => {
  const m = await api(`/matches/${params.id}`);
  updateClockOffset(m.server_now_ms);
  const admin = isAdmin();

  app.innerHTML = `
    <div class="wrap">
      <div class="scorecard">
        <div class="round">${m.sport_type} · ${m.round_name || '-'}</div>
        ${statusBadge(m.status)}
        <div class="score-row" style="margin-top:14px;">
          <div class="score-team">
            <img src="${m.home_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'"/>
            <div class="name">${m.home_hima.code}</div>
          </div>
          <div class="score-num" id="home-score">${m.home_score}</div>
          <div class="score-sep">vs</div>
          <div class="score-num" id="away-score">${m.away_score}</div>
          <div class="score-team">
            <img src="${m.away_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'"/>
            <div class="name">${m.away_hima.code}</div>
          </div>
        </div>
        <div class="mc-meta" style="margin-top:14px;">${fmtDate(m.match_date)} · ${m.venue || ''}</div>

        <div class="event-feed">
          <h3>Catatan Pertandingan</h3>
          <div id="event-list">
            ${m.events.length ? m.events.map(eventItemHTML).join('') : '<div class="empty-state" style="padding:16px;">Belum ada catatan.</div>'}
          </div>
        </div>

        <div class="photo-feed" style="margin-top:22px;">
          <h3>📷 Dokumentasi</h3>
          <div id="photo-gallery" class="photo-gallery">
            ${(m.photos && m.photos.length) ? m.photos.map(photoItemHTML).join('') : '<div class="empty-state" style="padding:16px;">Belum ada foto pertandingan.</div>'}
          </div>
        </div>
      </div>

      ${admin ? adminControlsHTML(m) : ''}
    </div>

    <div class="lightbox" id="photo-lightbox" style="display:none;">
      <img id="photo-lightbox-img" src="" alt="" />
      <button class="lightbox-close" id="photo-lightbox-close">✕</button>
    </div>`;

  if (admin) bindAdminControls(m);
  if (admin && SPORTS_WITH_TIMER.includes(m.sport_type)) restartAdminTimerInterval(m);
  bindPhotoLightbox();

  // ---- Socket.io: join room match ini, dengarkan update real-time ----
  if (currentSocket) { currentSocket.disconnect(); currentSocket = null; }
  currentSocket = io(API_BASE.replace('/api', ''));
  currentSocket.emit('join_match', m.id);
  currentSocket.on('score_updated', ({ home_score, away_score }) => {
    bumpScoreEl(document.getElementById('home-score'), home_score);
    bumpScoreEl(document.getElementById('away-score'), away_score);
    if (admin) toast('Skor diperbarui!');
  });
  currentSocket.on('timer_updated', (payload) => {
    // Supaya kalau ada 2 admin buka halaman yang sama, timernya tetap sinkron.
    updateClockOffset(payload.server_now_ms);
    m.timer_duration_sec = payload.timer_duration_sec;
    m.timer_end_at = payload.timer_end_at;
    m.timer_paused_remaining_sec = payload.timer_paused_remaining_sec;
    if (document.getElementById('admin-timer-display')) restartAdminTimerInterval(m);
  });
  currentSocket.on('event_added', (ev) => {
    const list = document.getElementById('event-list');
    if (list.querySelector('.empty-state')) list.innerHTML = '';
    list.insertAdjacentHTML('afterbegin', eventItemHTML(ev));
    toast(`Catatan baru: ${EVENT_LABEL[ev.event_type] || ev.event_type}`);
  });
  currentSocket.on('status_updated', ({ status }) => {
    document.querySelectorAll('.badge').forEach((b) => { if (b.closest('.scorecard')) b.outerHTML = statusBadge(status); });
    toast(`Status pertandingan: ${STATUS_LABEL[status]}`);
  });
  currentSocket.on('photo_added', (photo) => {
    const gallery = document.getElementById('photo-gallery');
    if (!gallery) return;
    if (gallery.querySelector('.empty-state')) gallery.innerHTML = '';
    gallery.insertAdjacentHTML('beforeend', photoItemHTML(photo));
    bindPhotoLightbox();
    toast('Foto baru ditambahkan!');
  });
});

function photoItemHTML(p) {
  return `<div class="photo-thumb" data-photo-id="${p.id}">
    <img src="${p.url}" alt="${p.caption || 'Dokumentasi pertandingan'}" loading="lazy" data-fullsrc="${p.url}" />
    ${p.caption ? `<div class="photo-caption">${p.caption}</div>` : ''}
  </div>`;
}

// Klik thumbnail foto → buka versi besar (lightbox sederhana, tanpa library eksternal).
function bindPhotoLightbox() {
  const lightbox = document.getElementById('photo-lightbox');
  const lightboxImg = document.getElementById('photo-lightbox-img');
  if (!lightbox || !lightboxImg) return;
  document.querySelectorAll('#photo-gallery .photo-thumb img').forEach((img) => {
    img.onclick = () => {
      lightboxImg.src = img.dataset.fullsrc;
      lightbox.style.display = 'flex';
    };
  });
  const closeBtn = document.getElementById('photo-lightbox-close');
  if (closeBtn) closeBtn.onclick = () => { lightbox.style.display = 'none'; lightboxImg.src = ''; };
  lightbox.onclick = (e) => { if (e.target === lightbox) { lightbox.style.display = 'none'; lightboxImg.src = ''; } };
}

function eventItemHTML(ev) {
  const t = new Date(ev.created_at.replace(' ', 'T') + 'Z');
  return `<div class="event-item">
    <span class="time">${t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
    <span>${EVENT_LABEL[ev.event_type] || ev.event_type}${ev.description ? ' — ' + ev.description : ''}</span>
  </div>`;
}

function adminControlsHTML(m) {
  const isBasket = m.sport_type === 'Basket';
  const hasTimer = SPORTS_WITH_TIMER.includes(m.sport_type);

  return `
  <div class="admin-score-box" style="margin-top:18px;">
    <div class="eyebrow">Panel Admin · Live Score</div>
    <div class="score-controls">
      <div class="team">
        <strong>${m.home_hima.code}</strong>
        <div class="btns">
          <button class="btn small ghost" data-adj="home" data-delta="-1">−1</button>
          <button class="btn small primary" data-adj="home" data-delta="1">+1</button>
          ${isBasket ? `
            <button class="btn small primary" data-adj="home" data-delta="2">+2</button>
            <button class="btn small primary" data-adj="home" data-delta="3">+3</button>
          ` : ''}
        </div>
      </div>
      <div class="team">
        <strong>${m.away_hima.code}</strong>
        <div class="btns">
          <button class="btn small ghost" data-adj="away" data-delta="-1">−1</button>
          <button class="btn small primary" data-adj="away" data-delta="1">+1</button>
          ${isBasket ? `
            <button class="btn small primary" data-adj="away" data-delta="2">+2</button>
            <button class="btn small primary" data-adj="away" data-delta="3">+3</button>
          ` : ''}
        </div>
      </div>
    </div>

    ${hasTimer ? `
    <div class="eyebrow" style="margin-top:14px;">Timer Pertandingan</div>
    <div class="timer-box">
      <div class="timer-display" id="admin-timer-display">${fmtCountdown(computeRemainingSec(m))}</div>
      <div class="timer-set">
        <input type="number" id="timer-minutes-input" min="1" max="60" step="1"
          value="${m.timer_duration_sec ? Math.round(m.timer_duration_sec / 60) : 10}" />
        <span>menit</span>
        <button class="btn small ghost" id="btn-timer-set">Set</button>
      </div>
      <div class="timer-controls">
        <button class="btn small green" id="btn-timer-start">▶ Mulai</button>
        <button class="btn small ghost" id="btn-timer-pause">⏸ Jeda</button>
        <button class="btn small ghost" id="btn-timer-reset">↺ Reset</button>
      </div>
    </div>` : ''}

    <div class="eyebrow" style="margin-top:14px;">Babak Dimenangkan (untuk layar skor besar)</div>
    <div class="score-controls">
      <div class="team">
        <strong>${m.home_hima.code} — <span id="home-babak-val">${m.home_babak || 0}</span> babak</strong>
        <div class="btns">
          <button class="btn small ghost" data-babak-adj="home" data-delta="-1">−1</button>
          <button class="btn small primary" data-babak-adj="home" data-delta="1">+1</button>
        </div>
      </div>
      <div class="team">
        <strong>${m.away_hima.code} — <span id="away-babak-val">${m.away_babak || 0}</span> babak</strong>
        <div class="btns">
          <button class="btn small ghost" data-babak-adj="away" data-delta="-1">−1</button>
          <button class="btn small primary" data-babak-adj="away" data-delta="1">+1</button>
        </div>
      </div>
    </div>

    <div class="event-buttons">
      <button class="btn small" data-event="goal">⚽ Gol</button>
      <button class="btn small" data-event="yellow_card">🟨 Kartu Kuning</button>
      <button class="btn small" data-event="red_card">🟥 Kartu Merah</button>
      <button class="btn small" data-event="substitution">🔁 Pergantian</button>
    </div>
    <div class="event-buttons">
      ${m.status !== 'live' ? `<button class="btn small green" id="btn-start">▶ Mulai Live</button>` : ''}
      ${m.status !== 'finished' ? `<button class="btn small primary" id="btn-finish">■ Selesaikan Pertandingan</button>` : ''}
    </div>
    ${m.status === 'live' ? `<div class="mc-meta" style="margin-top:10px;"><a href="#/layar" target="_blank">↗ Buka Layar Skor Besar</a></div>` : ''}

    <div class="eyebrow" style="margin-top:14px;">Unggah Foto Dokumentasi</div>
    <form id="photo-upload-form" class="photo-upload-form">
      <input type="file" id="photo-file-input" accept="image/*" required />
      <input type="text" id="photo-caption-input" placeholder="Keterangan foto (opsional)" maxlength="120" />
      <button type="submit" class="btn small primary" id="photo-upload-btn">📤 Unggah Foto</button>
    </form>
    ${(m.photos && m.photos.length) ? `
    <div class="admin-photo-manage">
      ${m.photos.map((p) => `
        <div class="admin-photo-row" data-photo-row="${p.id}">
          <img src="${p.url}" alt="" />
          <span class="mc-meta">${p.caption || '(tanpa keterangan)'}</span>
          <button class="btn small ghost" data-delete-photo="${p.id}">🗑 Hapus</button>
        </div>`).join('')}
    </div>` : ''}
  </div>`;
}

function bindAdminControls(m) {
  let home = m.home_score, away = m.away_score;
  let homeBabak = m.home_babak || 0, awayBabak = m.away_babak || 0;

  document.querySelectorAll('[data-adj]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const side = btn.dataset.adj, delta = parseInt(btn.dataset.delta, 10);
      if (side === 'home') home = Math.max(0, home + delta); else away = Math.max(0, away + delta);
      try {
        await api(`/matches/${m.id}/score`, { method: 'PATCH', auth: true, body: { home_score: home, away_score: away } });
      } catch (err) { toast(err.message); }
    });
  });

  document.querySelectorAll('[data-babak-adj]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const side = btn.dataset.babakAdj, delta = parseInt(btn.dataset.delta, 10);
      if (side === 'home') homeBabak = Math.max(0, homeBabak + delta); else awayBabak = Math.max(0, awayBabak + delta);
      document.getElementById('home-babak-val').textContent = homeBabak;
      document.getElementById('away-babak-val').textContent = awayBabak;
      try {
        await api(`/matches/${m.id}/score`, { method: 'PATCH', auth: true, body: { home_babak: homeBabak, away_babak: awayBabak } });
      } catch (err) { toast(err.message); }
    });
  });

  document.querySelectorAll('[data-event]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/matches/${m.id}/events`, { method: 'POST', auth: true, body: { event_type: btn.dataset.event } });
      } catch (err) { toast(err.message); }
    });
  });

  const startBtn = document.getElementById('btn-start');
  if (startBtn) startBtn.addEventListener('click', async () => {
    await api(`/matches/${m.id}/status`, { method: 'PATCH', auth: true, body: { status: 'live' } });
    router();
  });
  const finishBtn = document.getElementById('btn-finish');
  if (finishBtn) finishBtn.addEventListener('click', async () => {
    if (!confirm('Selesaikan pertandingan ini? Skor akhir akan tersimpan.')) return;
    await api(`/matches/${m.id}/status`, { method: 'PATCH', auth: true, body: { status: 'finished' } });
    router();
  });

  // Timer hitung mundur (Set / Mulai / Jeda / Reset) — tiap aksi memanggil router()
  // lagi supaya halaman ambil state terbaru dari server dan semua tombol/angka
  // ter-update konsisten (mis. tombol Mulai perlu tahu apakah waktunya masih tersisa).
  const timerSetBtn = document.getElementById('btn-timer-set');
  if (timerSetBtn) timerSetBtn.addEventListener('click', async () => {
    const minutes = parseFloat(document.getElementById('timer-minutes-input').value);
    if (!minutes || minutes <= 0) { toast('Isi durasi menit yang valid dulu'); return; }
    try {
      await api(`/matches/${m.id}/timer`, { method: 'PATCH', auth: true, body: { action: 'set', duration_sec: Math.round(minutes * 60) } });
      router();
    } catch (err) { toast(err.message); }
  });
  const timerStartBtn = document.getElementById('btn-timer-start');
  if (timerStartBtn) timerStartBtn.addEventListener('click', async () => {
    try {
      await api(`/matches/${m.id}/timer`, { method: 'PATCH', auth: true, body: { action: 'start' } });
      router();
    } catch (err) { toast(err.message); }
  });
  const timerPauseBtn = document.getElementById('btn-timer-pause');
  if (timerPauseBtn) timerPauseBtn.addEventListener('click', async () => {
    try {
      await api(`/matches/${m.id}/timer`, { method: 'PATCH', auth: true, body: { action: 'pause' } });
      router();
    } catch (err) { toast(err.message); }
  });
  const timerResetBtn = document.getElementById('btn-timer-reset');
  if (timerResetBtn) timerResetBtn.addEventListener('click', async () => {
    try {
      await api(`/matches/${m.id}/timer`, { method: 'PATCH', auth: true, body: { action: 'reset' } });
      router();
    } catch (err) { toast(err.message); }
  });

  // ---- Upload & hapus foto dokumentasi pertandingan ----
  const photoForm = document.getElementById('photo-upload-form');
  if (photoForm) photoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('photo-file-input');
    const file = fileInput.files[0];
    if (!file) { toast('Pilih file foto dulu'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('Ukuran foto maksimal 8 MB'); return; }

    const btn = document.getElementById('photo-upload-btn');
    btn.disabled = true;
    btn.textContent = 'Mengunggah…';
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('caption', document.getElementById('photo-caption-input').value.trim());
      const res = await fetch(`${API_BASE}/matches/${m.id}/photos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Gagal mengunggah foto');
      toast('Foto berhasil diunggah');
      router(); // muat ulang halaman supaya galeri & panel kelola foto ter-update
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = '📤 Unggah Foto';
    }
  });

  document.querySelectorAll('[data-delete-photo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Hapus foto ini?')) return;
      try {
        await api(`/matches/${m.id}/photos/${btn.dataset.deletePhoto}`, { method: 'DELETE', auth: true });
        toast('Foto dihapus');
        router();
      } catch (err) { toast(err.message); }
    });
  });
}

// ============================================================
// HALAMAN: LAYAR SKOR BESAR (untuk ditampilkan/di-share ke proyektor venue)
// Otomatis mengikuti pertandingan mana pun yang sedang berstatus LIVE —
// admin cukup menekan "Mulai Live" di HP/laptopnya, layar ini ikut berubah sendiri.
// ============================================================
function scoreboardIdleHTML() {
  return `
  <div class="sb-stage sb-idle">
    <img class="sb-idle-logo" src="assets/logos/dekancup-emblem.png" alt="Dekan Cup FST" />
    <div class="sb-idle-text">Menunggu pertandingan live…</div>
  </div>`;
}

// Hanya cabor Basket yang punya "jam pertandingan" konvensional (quarter/durasi berjalan).
// Voli dan cabor lain ditampilkan tanpa timer — cukup logo & skor saja.
const SPORTS_WITH_TIMER = ['Basket'];

function scoreboardMatchHTML(m) {
  const showTimer = SPORTS_WITH_TIMER.includes(m.sport_type);
  return `
  <div class="sb-stage">
    ${showTimer ? `<div class="sb-clock"><span class="sb-dot"></span><span id="sb-timer">${fmtCountdown(computeRemainingSec(m))}</span></div>` : ''}
    <div class="sb-row">
      <div class="sb-team">
        <img src="${m.home_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'" />
      </div>
      <div class="sb-scores">
        <div class="sb-side">
          <span class="sb-big" id="sb-home-score">${m.home_score}</span>
          <span class="sb-small" id="sb-home-babak">(${m.home_babak || 0})</span>
        </div>
        <div class="sb-sep">–</div>
        <div class="sb-side sb-side-reverse">
          <span class="sb-small" id="sb-away-babak">(${m.away_babak || 0})</span>
          <span class="sb-big" id="sb-away-score">${m.away_score}</span>
        </div>
      </div>
      <div class="sb-team">
        <img src="${m.away_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'" />
      </div>
    </div>
  </div>`;
}

route('/layar', async () => {
  app.innerHTML = `<div id="sb-root"></div>`;
  const root = document.getElementById('sb-root');

  let current = null; // id pertandingan yang sedang ditampilkan
  // State timer hitung mundur (dipakai oleh interval "mencentang" tiap detik di bawah).
  let timerState = { timer_end_at: null, timer_paused_remaining_sec: null, timer_duration_sec: null };

  function setTimerText() {
    const el = document.getElementById('sb-timer');
    if (el) el.textContent = fmtCountdown(computeRemainingSec(timerState));
  }

  async function refresh() {
    let list = [];
    try { list = await api('/matches?status=live'); } catch { list = []; }
    const m = list[0] || null;

    if (!m) {
      current = null;
      timerState = { timer_end_at: null, timer_paused_remaining_sec: null, timer_duration_sec: null };
      root.innerHTML = scoreboardIdleHTML();
      return;
    }
    updateClockOffset(m.server_now_ms);

    timerState = { timer_end_at: m.timer_end_at, timer_paused_remaining_sec: m.timer_paused_remaining_sec, timer_duration_sec: m.timer_duration_sec };

    if (current !== m.id) {
      current = m.id;
      root.innerHTML = scoreboardMatchHTML(m);
    } else {
      // Set biasa (bukan animasi) karena ini jalur polling cadangan yang jalan
      // tiap 15 detik terlepas skor berubah atau tidak — animasi "pop" hanya
      // dipasang di jalur socket real-time (lihat listener 'live_score_updated'
      // di bawah) supaya cuma memicu saat memang ada perubahan sungguhan.
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('sb-home-score', m.home_score);
      set('sb-away-score', m.away_score);
      set('sb-home-babak', `(${m.home_babak || 0})`);
      set('sb-away-babak', `(${m.away_babak || 0})`);
      setTimerText();
    }
  }

  await refresh();

  // Timer hitung mundur: "mencentang" tiap detik tanpa perlu refetch ke server —
  // angkanya dihitung dari timerState yang di-update lewat socket/polling di bawah.
  scoreboardTimer = setInterval(setTimerText, 1000);

  // Polling cadangan (kalau koneksi socket sempat putus)
  scoreboardPoll = setInterval(refresh, 15000);

  // Socket.io: dengar update skor, timer, & perubahan status pertandingan mana pun secara
  // real-time. Dibungkus try/catch: layar besar wajib tetap tampil (memakai polling 15 detik
  // di atas sebagai cadangan) walau skrip socket gagal dimuat karena jaringan venue bermasalah.
  try {
    if (currentSocket) { currentSocket.disconnect(); currentSocket = null; }
    currentSocket = io(API_BASE.replace('/api', ''));
    currentSocket.on('live_score_updated', (payload) => {
      if (payload.id === current) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        bumpScoreEl(document.getElementById('sb-home-score'), payload.home_score);
        bumpScoreEl(document.getElementById('sb-away-score'), payload.away_score);
        set('sb-home-babak', `(${payload.home_babak || 0})`);
        set('sb-away-babak', `(${payload.away_babak || 0})`);
      } else {
        refresh();
      }
    });
    currentSocket.on('live_timer_updated', (payload) => {
      if (payload.id === current) {
        updateClockOffset(payload.server_now_ms);
        timerState = { timer_end_at: payload.timer_end_at, timer_paused_remaining_sec: payload.timer_paused_remaining_sec, timer_duration_sec: payload.timer_duration_sec };
        setTimerText();
      } else {
        refresh();
      }
    });
    currentSocket.on('schedule_changed', refresh);
  } catch (err) {
    console.warn('Layar skor: real-time socket tidak tersedia, memakai polling saja.', err);
  }
});

// ============================================================
// HALAMAN: BAGAN (bracket knockout, per cabang olahraga)
// ============================================================

// Urutan babak yang dikenali (dari yang paling awal ke final).
// Dicocokkan lewat kata kunci karena admin bebas mengetik nama babak sendiri.
function roundRank(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('final') && !n.includes('semi') && !n.includes('perempat')) return 100;
  if (n.includes('semifinal') || n.includes('semi final') || n.includes('4 besar')) return 90;
  if (n.includes('perempat') || n.includes('quarter') || n.includes('8 besar')) return 80;
  if (n.includes('16 besar') || n.includes('round of 16')) return 70;
  if (n.includes('penyisihan') || n.includes('grup') || n.includes('group')) return 10;
  return 50; // babak tak dikenali diletakkan di tengah
}

function bracketMatchHTML(m, roundIdx, matchIdx) {
  const homeWin = m.status === 'finished' && m.home_score > m.away_score;
  const awayWin = m.status === 'finished' && m.away_score > m.home_score;
  return `
  <a class="bracket-card" data-round="${roundIdx}" data-idx="${matchIdx}" href="#/match/${m.id}">
    <div class="bracket-status">${statusBadge(m.status)}</div>
    <div class="bracket-team ${homeWin ? 'win' : ''}">
      <img src="${m.home_hima?.logo_url || ''}" onerror="this.src='assets/logos/_placeholder.svg'"/>
      <span class="name">${m.home_hima?.code || 'TBD'}</span>
      <span class="score">${m.status === 'scheduled' ? '' : m.home_score}</span>
    </div>
    <div class="bracket-team ${awayWin ? 'win' : ''}">
      <img src="${m.away_hima?.logo_url || ''}" onerror="this.src='assets/logos/_placeholder.svg'"/>
      <span class="name">${m.away_hima?.code || 'TBD'}</span>
      <span class="score">${m.status === 'scheduled' ? '' : m.away_score}</span>
    </div>
    <div class="bracket-meta">${fmtDate(m.match_date)}</div>
  </a>`;
}

// Gambar garis penghubung antar-babak (seperti bagan sistem gugur di kertas):
// dua pertandingan babak sebelumnya ditarik garis siku bertemu ke satu pertandingan di babak berikutnya.
// Hanya digambar untuk pasangan babak yang jumlahnya pas 2:1 (pola knockout normal) — kalau tidak pas,
// babaknya tetap ditampilkan sebagai kolom biasa tanpa garis (supaya tidak menyesatkan).
function drawBracketConnectors(roundsData) {
  const svg = document.getElementById('bracket-svg');
  const board = document.getElementById('bracket-board-inner');
  if (!svg || !board) return;

  const boardRect = board.getBoundingClientRect();
  svg.setAttribute('width', board.scrollWidth);
  svg.setAttribute('height', board.scrollHeight);
  svg.innerHTML = '';

  const ns = 'http://www.w3.org/2000/svg';
  const cardCenter = (roundIdx, matchIdx) => {
    const el = board.querySelector(`.bracket-card[data-round="${roundIdx}"][data-idx="${matchIdx}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: r.left - boardRect.left,
      right: r.right - boardRect.left,
      top: r.top - boardRect.top,
      bottom: r.bottom - boardRect.top,
      midY: r.top - boardRect.top + r.height / 2,
    };
  };

  for (let ri = 0; ri < roundsData.length - 1; ri++) {
    const curr = roundsData[ri];
    const next = roundsData[ri + 1];
    if (curr.length !== next.length * 2) continue; // bukan pola knockout normal, lewati

    for (let k = 0; k < next.length; k++) {
      const a = cardCenter(ri, k * 2);
      const b = cardCenter(ri, k * 2 + 1);
      const target = cardCenter(ri + 1, k);
      if (!a || !b || !target) continue;

      const midX = a.right + 22;
      const path = document.createElementNS(ns, 'path');
      // Garis: keluar dari kartu A & B (horizontal) ke titik tengah, disambung vertikal, lalu masuk ke kartu target (horizontal)
      const pathData =
        `M ${a.right} ${a.midY} H ${midX} ` +
        `M ${b.right} ${b.midY} H ${midX} ` +
        `M ${midX} ${a.midY} V ${b.midY} ` +
        `M ${midX} ${(a.midY + b.midY) / 2} H ${target.left}`;
      path.setAttribute('d', pathData);
      path.style.stroke = 'var(--line-strong)';
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    }
  }
}

function bracketColumnMatchesHTML(roundMatches, roundIdx) {
  const groupsHTML = [];
  for (let i = 0; i < roundMatches.length; i += 2) {
    const a = roundMatches[i];
    const b = roundMatches[i + 1];
    groupsHTML.push(`
      <div class="bracket-pair">
        ${bracketMatchHTML(a, roundIdx, i)}
        ${b ? bracketMatchHTML(b, roundIdx, i + 1) : ''}
      </div>`);
  }
  return groupsHTML.join('');
}

route('/bagan', async ({ query }) => {
  const sport = query.sport || 'Futsal';
  const matches = await api(`/matches?sport_type=${encodeURIComponent(sport)}`);

  // Kelompokkan per nama babak, lalu urutkan babaknya dari penyisihan -> final.
  const groups = {};
  matches.forEach((m) => {
    const key = m.round_name || 'Babak Belum Ditentukan';
    (groups[key] = groups[key] || []).push(m);
  });
  const roundNames = Object.keys(groups).sort((a, b) => roundRank(a) - roundRank(b) || a.localeCompare(b));
  roundNames.forEach((r) => groups[r].sort((a, b) => a.match_date.localeCompare(b.match_date)));
  const roundsData = roundNames.map((r) => groups[r]);

  app.innerHTML = `
    <div class="wrap">
      <div class="section-head">
        <div><div class="eyebrow">Bagan Pertandingan · Sistem Gugur</div><h2>${sport}</h2></div>
        <div class="filter-group">
          <label>Cabang Olahraga</label>
          <select id="sport-select">
            ${SPORT_TYPES.map((s) => `<option ${s === sport ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      ${roundNames.length ? `
      <div class="bracket-board" id="bracket-board">
        <div class="bracket-board-inner" id="bracket-board-inner">
          <svg id="bracket-svg" class="bracket-svg"></svg>
          ${roundNames.map((r, ri) => `
            <div class="bracket-col">
              <div class="bracket-col-title">${r}</div>
              <div class="bracket-col-matches">
                ${bracketColumnMatchesHTML(groups[r], ri)}
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div class="bracket-hint">💡 Geser ke kanan/kiri untuk lihat babak selanjutnya</div>
      ` : emptyState('Belum ada jadwal untuk cabang ini.')}
    </div>`;

  document.getElementById('sport-select').addEventListener('change', (e) => {
    location.hash = `/bagan?sport=${encodeURIComponent(e.target.value)}`;
  });

  if (roundNames.length) {
    const redraw = () => drawBracketConnectors(roundsData);
    requestAnimationFrame(() => requestAnimationFrame(redraw));
    window.addEventListener('resize', redraw);
    // Bersihkan listener saat pindah halaman supaya tidak menumpuk.
    const cleanup = () => { window.removeEventListener('resize', redraw); };
    window.addEventListener('hashchange', cleanup, { once: true });
  }
});

// ============================================================
// HALAMAN: RIWAYAT (pertandingan selesai)
// ============================================================
route('/riwayat', async () => {
  const matches = await api('/matches?status=finished');
  app.innerHTML = `
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Arsip</div><h2>Riwayat Pertandingan</h2></div></div>
      <div class="match-list">${matches.length ? matches.map(matchCardHTML).join('') : emptyState('Belum ada pertandingan yang selesai.')}</div>
    </div>`;
});

// ============================================================
// HALAMAN: REGISTRASI PESERTA
// ============================================================
route('/daftar', async () => {
  app.innerHTML = `
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Pendaftaran</div><h2>Registrasi Peserta Dekan Cup 2026</h2></div></div>
      <p class="mc-meta" style="margin-bottom:18px;">Pilih cabang olahraga untuk mendaftarkan tim/kontingen HIMA Anda. Satu formulir untuk satu tim/kategori.</p>
      <div class="sport-pick-grid">
        ${Object.entries(SPORT_CONFIG).map(([sport, cfg]) => `
          <a class="sport-pick-card" href="#/daftar/${sportToSlug(sport)}">
            <div class="sport-pick-icon">${cfg.icon}</div>
            <div class="sport-pick-name">${sport}</div>
            <div class="sport-pick-meta">${cfg.categories.join(' · ')}</div>
          </a>`).join('')}
      </div>
    </div>`;
});

route('/daftar/:sport', async ({ params }) => {
  const sport = SPORT_SLUGS[params.sport];
  if (!sport) { app.innerHTML = emptyState('Cabang olahraga tidak ditemukan. Kembali ke <a href="#/daftar">halaman registrasi</a>.'); return; }
  const cfg = { ...SPORT_CONFIG[sport] };
  // Ambil konfigurasi terkini dari backend (jumlah min/maks peserta bisa
  // diubah admin lewat Panel Admin > Pengaturan Cabor) supaya form pendaftaran
  // selalu pakai angka terbaru tanpa perlu deploy ulang frontend. Kalau
  // gagal diambil (mis. lagi offline), tetap jalan pakai nilai default di atas.
  try {
    const liveConfig = await api('/registrations/config');
    if (liveConfig?.[sport]) Object.assign(cfg, liveConfig[sport]);
  } catch {
    // biarkan pakai default lokal
  }
  const himas = await api('/himas?team_only=true');

  let currentCategory = cfg.categories[0];
  const limitsFor = (category) => {
    const cl = cfg.categoryPlayers?.[category];
    if (cl && typeof cl === 'object') return { min: cl.min, max: cl.max };
    if (typeof cl === 'number') return { min: cl, max: cl };
    return { min: cfg.minPlayers, max: cfg.maxPlayers };
  };
  let playerCount = limitsFor(currentCategory).min;

  const playerRowHTML = (i) => {
    const { min } = limitsFor(currentCategory);
    const badge = cfg.hasSquadStatus
      ? `<span class="player-status ${i < min ? 'core' : 'reserve'}">${i < min ? 'Inti' : 'Cadangan'}</span>`
      : '';
    return `
    <div class="player-row" data-player-row="${i}">
      <span class="player-num">${i + 1}.</span>
      <input type="text" placeholder="Nama lengkap" data-player-name="${i}" required />
      <input type="text" placeholder="NIM" data-player-nim="${i}" required />
      ${badge}
    </div>`;
  };

  const renderPlayerRows = () => Array.from({ length: playerCount }, (_, i) => playerRowHTML(i)).join('');
  const playerCountLabel = () => {
    const { min, max } = limitsFor(currentCategory);
    return min === max ? `persis ${min}` : `${min}–${max}`;
  };

  app.innerHTML = `
    <div class="wrap">
      <div class="section-head">
        <div><div class="eyebrow">Registrasi Peserta · ${sport}</div><h2>${cfg.icon} Formulir Pendaftaran ${sport}</h2></div>
      </div>
      <p class="mc-meta" style="margin-bottom:14px;"><a href="#/daftar">← Pilih cabang lain</a></p>

      <div class="admin-score-box">
        <form id="reg-form" style="display:grid; gap:14px;">
          <div class="form-grid-2">
            <div class="filter-group"><label>HIMA / Kontingen</label>
              <select id="rg-hima" required>
                <option value="">— Pilih HIMA —</option>
                ${himas.map((h) => `<option value="${h.id}">${h.code} — ${h.full_name}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group"><label>Kategori</label>
              <select id="rg-category" required>
                ${cfg.categories.map((c) => `<option>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="filter-group"><label>Nama Tim (opsional)</label><input id="rg-team-name" placeholder="Kosongkan untuk nama otomatis" /></div>

          ${(cfg.extraFields || []).map((f) => `
          <div class="filter-group">
            <label>${f.label}${f.required ? '' : ' (opsional)'}</label>
            ${f.helper ? `<p class="mc-meta" style="margin:0 0 6px;">${f.helper}</p>` : ''}
            <input type="text" data-extra-field="${f.id}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''} />
          </div>`).join('')}

          <h4 style="margin:4px 0 -4px;">Penanggung Jawab / Ketua Tim</h4>
          <div class="form-grid-3">
            <div class="filter-group"><label>Nama</label><input id="rg-contact-name" required /></div>
            <div class="filter-group"><label>No. WhatsApp</label><input id="rg-contact-wa" placeholder="08xxxxxxxxxx" required /></div>
            <div class="filter-group"><label>Email (opsional)</label><input id="rg-contact-email" type="email" /></div>
          </div>

          <h4 style="margin:4px 0 -4px;">Daftar Peserta <span class="mc-meta" id="player-count-label">(${playerCountLabel()} orang)</span></h4>
          ${cfg.hasSquadStatus ? `<p class="mc-meta" id="squad-status-note" style="margin:0 0 4px;">${limitsFor(currentCategory).min} peserta pertama otomatis berstatus <strong>Inti</strong>, sisanya <strong>Cadangan</strong> — urutan mengikuti urutan pengisian di bawah.</p>` : ''}
          <div id="player-rows">${renderPlayerRows()}</div>
          <div style="display:flex; gap:8px;" id="player-count-btns">
            <button type="button" class="btn small ghost" id="btn-add-player">+ Tambah Peserta</button>
            <button type="button" class="btn small ghost" id="btn-remove-player">− Kurangi Peserta</button>
          </div>

          <div class="filter-group"><label>Catatan Tambahan (opsional)</label><textarea id="rg-notes" rows="3" style="width:100%; font-family:inherit; padding:10px; border:1px solid var(--line); border-radius:6px; background:var(--paper-light);"></textarea></div>

          <div class="filter-group">
            <label>File Formulir Pendaftaran</label>
            <p class="mc-meta" style="margin:0 0 8px;">
              Unduh &amp; isi templatenya lebih dulu:
              <a class="file-link" href="${cfg.templateUrl || '#'}" target="_blank" rel="noopener">📄 TEMPLATE FORMULIR PENDAFTARAN ${sport.toUpperCase()} DEKAN CUP FST 2026</a>
            </p>
            <input type="file" id="rg-formulir-file" accept="application/pdf,.pdf" required />
            <p class="mc-meta" style="margin:6px 0 0;">Upload 1 file yang didukung: PDF. Maks 10 MB.</p>
          </div>

          <div class="filter-group">
            <label>SOP Pertandingan</label>
            <p class="mc-meta" style="margin:0 0 8px;">
              Baca dulu SOP pertandingannya di sini:
              <a class="file-link" href="${SOP_URL}" target="_blank" rel="noopener">📄 SOP PERTANDINGAN DEKAN CUP FST 2026</a>
            </p>
          </div>

          <div class="filter-group">
            <label>Riwayat Penyakit, alergi, atau alergi obat (Saat ini dan Sebelumnya)</label>
            <p class="mc-meta" style="margin:0 0 6px;">
              contoh:<br />
              1. Naila (Asma, cedera ligamen, riwayat dislokasi)<br />
              2. …<br />
              dst — isi "Tidak ada" kalau memang tidak ada peserta yang punya riwayat
            </p>
            <textarea id="rg-health-notes" rows="3" style="width:100%; font-family:inherit; padding:10px; border:1px solid var(--line); border-radius:6px; background:var(--paper-light);" required></textarea>
          </div>

          <div class="filter-group">
            <label>Persetujuan Surat Pernyataan Force Majeure</label>
            <p class="mc-meta" style="margin:0 0 8px;">
              Baca dulu suratnya di sini:
              <a class="file-link" href="${cfg.forceMajeureUrl || '#'}" target="_blank" rel="noopener">📄 SURAT PERNYATAAN FORCE MAJEURE DEKAN CUP FST 2026</a>
            </p>
            <label style="display:flex; gap:8px; align-items:flex-start; font-size:.9rem;">
              <input type="checkbox" id="rg-force-majeure" required style="margin-top:3px;" />
              <span>Saya telah membaca dan menyetujui Surat Pernyataan Force Majeure di atas.</span>
            </label>
          </div>

          <label style="display:flex; gap:8px; align-items:flex-start; font-size:.9rem;">
            <input type="checkbox" id="rg-agreement" required style="margin-top:3px;" />
            <span>Saya menyatakan data yang diisi benar dan bersedia mengikuti seluruh peraturan Dekan Cup FST 2026.</span>
          </label>

          <button class="btn primary" type="submit" style="justify-self:start;">Kirim Pendaftaran</button>
        </form>
      </div>
    </div>`;

  const rowsBox = document.getElementById('player-rows');
  const countLabel = document.getElementById('player-count-label');
  const countBtns = document.getElementById('player-count-btns');

  const refreshCountUI = () => {
    countLabel.textContent = `(${playerCountLabel()} orang)`;
    const { min, max } = limitsFor(currentCategory);
    countBtns.style.display = min === max ? 'none' : 'flex'; // kategori dengan jumlah tetap (mis. Tunggal) tidak perlu tombol +/-
    const squadNote = document.getElementById('squad-status-note');
    if (squadNote) squadNote.innerHTML = `${min} peserta pertama otomatis berstatus <strong>Inti</strong>, sisanya <strong>Cadangan</strong> — urutan mengikuti urutan pengisian di bawah.`;
  };
  refreshCountUI();

  document.getElementById('rg-category').addEventListener('change', (e) => {
    currentCategory = e.target.value;
    playerCount = limitsFor(currentCategory).min;
    rowsBox.innerHTML = renderPlayerRows();
    refreshCountUI();
  });

  document.getElementById('btn-add-player').addEventListener('click', () => {
    const { max } = limitsFor(currentCategory);
    if (playerCount >= max) { toast(`Maksimal ${max} peserta untuk kategori ini`); return; }
    // Cuma tambah 1 baris baru di ujung — baris yang sudah diisi sebelumnya
    // tidak disentuh sama sekali, jadi nilainya tidak ikut hilang.
    const newIndex = playerCount;
    playerCount++;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = playerRowHTML(newIndex).trim();
    rowsBox.appendChild(wrapper.firstElementChild);
  });
  document.getElementById('btn-remove-player').addEventListener('click', () => {
    const { min } = limitsFor(currentCategory);
    if (playerCount <= min) { toast(`Minimal ${min} peserta untuk kategori ini`); return; }
    // Cuma hapus baris terakhir — baris lain (dan isiannya) tidak ikut kena.
    playerCount--;
    const lastRow = rowsBox.querySelector(`[data-player-row="${playerCount}"]`);
    if (lastRow) lastRow.remove();
  });

  document.getElementById('reg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const players = Array.from({ length: playerCount }, (_, i) => ({
      name: document.querySelector(`[data-player-name="${i}"]`).value,
      nim: document.querySelector(`[data-player-nim="${i}"]`).value,
    }));
    const formulirFile = document.getElementById('rg-formulir-file').files[0];
    if (!formulirFile) { toast('File formulir pendaftaran (PDF) wajib diunggah'); return; }
    if (formulirFile.size > 10 * 1024 * 1024) { toast('Ukuran file formulir maksimal 10 MB'); return; }
    const healthNotes = document.getElementById('rg-health-notes').value.trim();
    if (!healthNotes) { toast('Riwayat penyakit/alergi/alergi obat wajib diisi (isi "Tidak ada" kalau memang tidak ada)'); return; }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengirim…';
    try {
      // Pakai FormData (bukan api() yang selalu JSON) karena ada file yang diunggah.
      const fd = new FormData();
      fd.append('sport_type', sport);
      fd.append('hima_id', document.getElementById('rg-hima').value);
      fd.append('category', document.getElementById('rg-category').value);
      fd.append('team_name', document.getElementById('rg-team-name').value);
      fd.append('contact_name', document.getElementById('rg-contact-name').value);
      fd.append('contact_whatsapp', document.getElementById('rg-contact-wa').value);
      fd.append('contact_email', document.getElementById('rg-contact-email').value);
      fd.append('notes', document.getElementById('rg-notes').value);
      fd.append('health_notes', healthNotes);
      fd.append('agreement', document.getElementById('rg-agreement').checked ? 'true' : 'false');
      fd.append('force_majeure_agreement', document.getElementById('rg-force-majeure').checked ? 'true' : 'false');
      fd.append('players', JSON.stringify(players));
      const extraValues = {};
      (cfg.extraFields || []).forEach((f) => {
        extraValues[f.id] = document.querySelector(`[data-extra-field="${f.id}"]`)?.value || '';
      });
      fd.append('extra_fields', JSON.stringify(extraValues));
      fd.append('formulir_file', formulirFile);

      const res = await fetch(`${API_BASE}/registrations`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan pada server');

      app.innerHTML = `
        <div class="wrap">
          <div class="empty-state" style="padding:40px 16px;">
            ✅ <strong>Pendaftaran ${sport} berhasil dikirim!</strong><br/>
            Panitia akan menghubungi penanggung jawab tim untuk konfirmasi lebih lanjut.
            <div style="margin-top:16px;"><a class="btn small primary" href="#/daftar">Daftar Cabang Lain</a></div>
          </div>
        </div>`;
    } catch (err) {
      toast(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Kirim Pendaftaran';
    }
  });
});

// ============================================================
// HALAMAN: LOGIN ADMIN
// ============================================================
route('/login', async () => {
  if (isAdmin()) { location.hash = '/admin'; return; }
  app.innerHTML = `
    <div class="wrap">
      <div class="login-box">
        <div class="eyebrow">Panitia</div>
        <h2>Masuk Admin</h2>
        <form id="login-form" style="margin-top:18px; text-align:left;">
          <label>Email</label>
          <input type="email" id="login-email" required />
          <label>Password</label>
          <input type="password" id="login-password" required />
          <button class="btn primary" style="width:100%;" type="submit">Masuk</button>
        </form>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      setSession(token, user);
      toast(`Selamat datang, ${user.name}`);
      location.hash = '/admin';
    } catch (err) { toast(err.message); }
  });
});

// ============================================================
// HALAMAN: ADMIN DASHBOARD (kelola jadwal)
// ============================================================
// ============================================================
// PANEL ADMIN: kelola data registrasi peserta
// ============================================================
function registrationRowHTML(r) {
  const playersList = r.players.map((p) => `${p.name} (${p.nim})${p.status ? ` <span class="player-status ${p.status === 'Inti' ? 'core' : 'reserve'}">${p.status}</span>` : ''}`).join(', ');
  return `
  <div class="admin-account-row" data-reg-row="${r.id}">
    <div class="info">
      <strong>${r.team_name}</strong>
      <span class="mc-meta">${r.sport_type} · ${r.category}${r.category_code ? ` (${r.category_code})` : ''} · ${r.hima_code} · ${r.players.length} pemain</span>
      <span class="mc-meta">PJ: ${r.contact_name} (${r.contact_whatsapp})${r.contact_email ? ` · ${r.contact_email}` : ''}</span>
      <p class="mc-meta" style="margin:4px 0 0;">${playersList}</p>
      ${r.extra_fields && Object.keys(r.extra_fields).length ? `<span class="mc-meta">${Object.values(r.extra_fields).filter(Boolean).join(' · ')}</span>` : ''}
      <span class="mc-meta">Daftar: ${fmtDate(r.created_at)}</span>
      ${r.formulir_file ? `<span class="mc-meta"><a class="file-link" href="${API_BASE.replace('/api', '')}/uploads/formulir/${r.formulir_file}" target="_blank" rel="noopener">📄 Lihat File Formulir</a></span>` : ''}
      ${r.health_notes ? `<p class="mc-meta" style="margin:4px 0 0;"><strong>Riwayat Penyakit/Alergi:</strong> ${r.health_notes}</p>` : ''}
    </div>
    <button class="btn small danger" data-delete-reg="${r.id}">🗑 Hapus</button>
  </div>`;
}

async function bindRegistrationPanel() {
  const listBox = document.getElementById('reg-list');
  const filterSelect = document.getElementById('reg-filter-sport');
  const exportBtn = document.getElementById('btn-export-reg');

  async function loadRegistrations() {
    listBox.innerHTML = '<div class="empty-state">Memuat…</div>';
    try {
      const qs = filterSelect.value ? `?sport_type=${encodeURIComponent(filterSelect.value)}` : '';
      const rows = await api(`/registrations${qs}`, { auth: true });
      listBox.innerHTML = rows.length ? rows.map(registrationRowHTML).join('') : emptyState('Belum ada pendaftaran masuk.');
      listBox.querySelectorAll('[data-delete-reg]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hapus data pendaftaran ini?')) return;
          try {
            await api(`/registrations/${btn.dataset.deleteReg}`, { method: 'DELETE', auth: true });
            toast('Data pendaftaran dihapus');
            loadRegistrations();
          } catch (err) { toast(err.message); }
        });
      });
    } catch (err) {
      listBox.innerHTML = emptyState(`⚠️ ${err.message}`);
    }
  }
  await loadRegistrations();
  filterSelect.addEventListener('change', loadRegistrations);

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Menyiapkan…';
    try {
      const qs = filterSelect.value ? `?sport_type=${encodeURIComponent(filterSelect.value)}` : '';
      const res = await fetch(`${API_BASE}/registrations/export${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Gagal membuat file Excel'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dekancup-pendaftaran-${filterSelect.value || 'semua-cabor'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { toast(err.message); }
    finally {
      exportBtn.disabled = false;
      exportBtn.textContent = '⬇ Unduh Excel';
    }
  });
}

// ============================================================
// PANEL ADMIN: kelola profil atlet (edit/hapus nama & NIM per orang,
// diambil otomatis dari data pendaftaran per cabor — lihat GET /himas/:id
// di backend, field roster_by_sport)
// ============================================================
function athleteRosterHTML(rosterBySport) {
  if (!rosterBySport?.length) return emptyState('Belum ada pendaftaran atlet untuk HIMA ini.');
  return `
    <div class="roster-by-sport">
      ${rosterBySport.map((group) => `
        <div class="roster-group">
          <div class="roster-group-title">${group.sport_type} <span class="roster-count">(${group.players.length} atlet)</span></div>
          <table class="roster-table admin-roster-table">
            <thead><tr><th>Nama</th><th>NIM</th><th></th></tr></thead>
            <tbody>
              ${group.players.map((p) => `
                <tr data-player-row="${p.id}" data-reg-id="${p.reg_id}">
                  <td><input type="text" data-pa-name value="${p.name}" /></td>
                  <td><input type="text" data-pa-nim value="${p.nim}" /></td>
                  <td style="white-space:nowrap;">
                    <button type="button" class="btn small primary" data-pa-save="${p.id}">Simpan</button>
                    <button type="button" class="btn small danger" data-pa-remove="${p.id}">Hapus</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`).join('')}
    </div>`;
}

async function bindAthleteProfilePanel(himas) {
  const select = document.getElementById('pa-select');
  const box = document.getElementById('pa-roster');

  async function loadRoster() {
    box.innerHTML = '<div class="empty-state">Memuat…</div>';
    try {
      const h = await api(`/himas/${select.value}`);
      box.innerHTML = athleteRosterHTML(h.roster_by_sport);
      bindRosterRowActions();
    } catch (err) {
      box.innerHTML = emptyState(`⚠️ ${err.message}`);
    }
  }

  function bindRosterRowActions() {
    box.querySelectorAll('[data-pa-save]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('[data-player-row]');
        const playerId = row.dataset.playerRow;
        const regId = row.dataset.regId;
        const name = row.querySelector('[data-pa-name]').value.trim();
        const nim = row.querySelector('[data-pa-nim]').value.trim();
        if (!name || !nim) { toast('Nama dan NIM tidak boleh kosong'); return; }
        try {
          await api(`/registrations/${regId}/players/${playerId}`, { method: 'PATCH', auth: true, body: { name, nim } });
          toast('Profil atlet disimpan');
        } catch (err) { toast(err.message); }
      });
    });
    box.querySelectorAll('[data-pa-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('[data-player-row]');
        const playerId = row.dataset.playerRow;
        const regId = row.dataset.regId;
        const name = row.querySelector('[data-pa-name]').value.trim();
        if (!confirm(`Hapus "${name}" dari daftar atlet? (mis. karena mengundurkan diri)`)) return;
        try {
          await api(`/registrations/${regId}/players/${playerId}`, { method: 'DELETE', auth: true });
          toast('Atlet dihapus');
          loadRoster();
        } catch (err) { toast(err.message); }
      });
    });
  }

  if (select.value) await loadRoster();
  select.addEventListener('change', loadRoster);
}

route('/admin', async () => {
  if (!isAdmin()) { location.hash = '/login'; return; }
  const [matches, himas, sportConfig] = await Promise.all([api('/matches'), api('/himas?team_only=true'), api('/registrations/config')]);
  const himaOptions = himas.map((h) => `<option value="${h.id}">${h.code}</option>`).join('');

  app.innerHTML = `
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Panel Panitia</div><h2>Kelola Jadwal Pertandingan</h2></div></div>

      <div class="admin-score-box">
        <h3 style="margin-bottom:10px;">Tambah Pertandingan Baru</h3>
        <form id="new-match-form" class="form-grid-2" style="gap:10px;">
          <div class="filter-group"><label>Cabang Olahraga</label>
            <select id="nm-sport"><option>Futsal</option><option>Basket</option><option>Voli</option><option>Badminton</option><option>E-Sport Mobile Legends</option></select>
          </div>
          <div class="filter-group"><label>Ronde</label><input id="nm-round" placeholder="Penyisihan Grup A" /></div>
          <div class="filter-group"><label>Tim Tuan Rumah</label><select id="nm-home">${himaOptions}</select></div>
          <div class="filter-group"><label>Tim Tamu</label><select id="nm-away">${himaOptions}</select></div>
          <div class="filter-group"><label>Tanggal &amp; Waktu</label><input type="datetime-local" id="nm-date" required /></div>
          <div class="filter-group"><label>Venue</label><input id="nm-venue" placeholder="Lapangan Futsal FST A" /></div>
          <button class="btn primary" type="submit" style="grid-column:1/-1;">+ Tambah ke Jadwal</button>
        </form>
      </div>

      <div class="admin-score-box">
        <h3 style="margin-bottom:10px;">Kelola Profil HIMA</h3>
        <div class="filter-group" style="margin-bottom:10px;">
          <label>Pilih HIMA</label>
          <select id="hp-select">${himas.map((h) => `<option value="${h.id}">${h.code} — ${h.full_name}</option>`).join('')}</select>
        </div>
        <form id="hima-profile-form" style="display:grid; gap:10px;">
          <div class="filter-group"><label>Deskripsi</label><textarea id="hp-description" rows="6" style="width:100%; font-family:inherit; padding:10px; border:1px solid var(--line); border-radius:6px; background:var(--paper-light);"></textarea></div>
          <div class="form-grid-2">
            <div class="filter-group"><label>Email</label><input id="hp-email" type="email" /></div>
            <div class="filter-group"><label>Instagram</label><input id="hp-instagram" placeholder="@namahima" /></div>
          </div>
          <div class="filter-group"><label>URL Logo</label><input id="hp-logo" placeholder="assets/logos/kode.svg" /></div>
          <button class="btn primary" type="submit">Simpan Profil HIMA</button>
        </form>
      </div>

      <div class="admin-score-box">
        <h3 style="margin-bottom:4px;">Pengaturan Jumlah Peserta per Cabor</h3>
        <p class="mc-meta" style="margin:0 0 14px;">Atur sendiri minimal &amp; maksimal jumlah peserta tiap cabor (mis. Badminton 2–4 orang termasuk cadangan). Untuk cabor yang tiap kategorinya beda jumlah peserta (mis. E-Sport), atur per kategori di bawahnya. Perubahan langsung berlaku di form pendaftaran, tanpa perlu deploy ulang.</p>
        <div id="sport-limits-list" style="display:grid; gap:10px;">
          ${Object.entries(sportConfig).map(([sport, cfg]) => {
            if (cfg.categoryPlayers) {
              // Cabor dengan jumlah peserta berbeda tiap kategori (mis. E-Sport:
              // Mobile Legends 5–7 vs FIFA 1–2) — satu baris pengaturan PER KATEGORI,
              // supaya ubah satu kategori tidak ikut mengubah kategori lain.
              return `
                <div style="padding:10px; border:1px solid var(--line); border-radius:8px;">
                  <label>${SPORT_CONFIG[sport]?.icon || ''} ${sport}</label>
                  <div style="display:grid; gap:8px; margin-top:8px;">
                    ${cfg.categories.map((cat) => {
                      const lim = cfg.categoryPlayers[cat] || { min: cfg.minPlayers, max: cfg.maxPlayers };
                      const key = `${sport}|||${cat}`;
                      return `
                        <div class="sport-limit-row" data-sport-limit-row="${key}" style="display:grid; grid-template-columns:1.4fr .7fr .7fr auto; gap:10px; align-items:end;">
                          <div><label style="font-weight:normal;">↳ ${cat}</label></div>
                          <div><label>Minimal</label><input type="number" min="1" data-sl-min value="${lim.min}" /></div>
                          <div><label>Maksimal</label><input type="number" min="1" data-sl-max value="${lim.max}" /></div>
                          <button type="button" class="btn small primary" data-sl-save="${key}" data-sl-sport="${sport}" data-sl-category="${cat}">Simpan</button>
                        </div>`;
                    }).join('')}
                  </div>
                </div>`;
            }
            return `
            <div class="filter-group sport-limit-row" data-sport-limit-row="${sport}" style="display:grid; grid-template-columns:1.4fr .7fr .7fr auto; gap:10px; align-items:end; padding:10px; border:1px solid var(--line); border-radius:8px;">
              <div><label>${SPORT_CONFIG[sport]?.icon || ''} ${sport}</label><p class="mc-meta" style="margin:2px 0 0;">Kategori: ${cfg.categories.join(', ')}</p></div>
              <div><label>Minimal</label><input type="number" min="1" data-sl-min value="${cfg.minPlayers}" /></div>
              <div><label>Maksimal</label><input type="number" min="1" data-sl-max value="${cfg.maxPlayers}" /></div>
              <button type="button" class="btn small primary" data-sl-save="${sport}" data-sl-sport="${sport}">Simpan</button>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="admin-score-box">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
          <h3>Data Registrasi Peserta</h3>
          <div style="display:flex; gap:8px; align-items:center;">
            <select id="reg-filter-sport" style="padding:6px 10px; border-radius:6px; border:1px solid var(--line); background:var(--paper-light); color:var(--ink);">
              <option value="">Semua Cabang</option>
              ${Object.keys(SPORT_CONFIG).map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <button class="btn small primary" id="btn-export-reg">⬇ Unduh Excel</button>
          </div>
        </div>
        <div id="reg-list"><div class="empty-state">Memuat…</div></div>
      </div>

      <div class="admin-score-box">
        <h3 style="margin-bottom:4px;">Kelola Profil Atlet</h3>
        <p class="mc-meta" style="margin:0 0 14px;">Nama &amp; NIM atlet di sini otomatis diambil dari data pendaftaran per cabor. Kalau ada atlet yang mengundurkan diri atau salah input, tinggal edit/hapus langsung dari sini — tidak perlu ubah data pendaftaran atau kode. Perubahan langsung muncul di halaman profil HIMA.</p>
        <div class="filter-group" style="margin-bottom:10px;">
          <label>Pilih HIMA</label>
          <select id="pa-select">${himas.map((h) => `<option value="${h.id}">${h.code} — ${h.full_name}</option>`).join('')}</select>
        </div>
        <div id="pa-roster"><div class="empty-state">Memuat…</div></div>
      </div>

      <div class="section-head"><h2 style="font-size:1.2rem;">Semua Pertandingan</h2></div>
      <div class="match-list">${matches.length ? matches.map(adminMatchCardHTML).join('') : emptyState('Belum ada pertandingan.')}</div>
    </div>`;

  bindDeleteMatchButtons();
  bindRegistrationPanel();
  bindAthleteProfilePanel(himas);

  document.querySelectorAll('[data-sl-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-sl-save');
      const sport = btn.getAttribute('data-sl-sport');
      const category = btn.getAttribute('data-sl-category') || null;
      const row = document.querySelector(`[data-sport-limit-row="${key}"]`);
      const minPlayers = Number(row.querySelector('[data-sl-min]').value);
      const maxPlayers = Number(row.querySelector('[data-sl-max]').value);
      if (!Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers) || minPlayers < 1 || maxPlayers < minPlayers) {
        toast('Minimal harus ≥ 1 dan Maksimal harus ≥ Minimal');
        return;
      }
      try {
        await api(`/registrations/config/${encodeURIComponent(sport)}`, {
          method: 'PUT', auth: true,
          body: category ? { minPlayers, maxPlayers, category } : { minPlayers, maxPlayers },
        });
        toast(`Jumlah peserta ${sport}${category ? ` (${category})` : ''} disimpan: ${minPlayers}–${maxPlayers} orang`);
      } catch (err) {
        toast(err.message || 'Gagal menyimpan pengaturan cabor');
      }
    });
  });

  const himaById = Object.fromEntries(himas.map((h) => [h.id, h]));
  const fillHimaProfileForm = (id) => {
    const h = himaById[id];
    if (!h) return;
    document.getElementById('hp-description').value = h.description || '';
    document.getElementById('hp-email').value = h.email || '';
    document.getElementById('hp-instagram').value = h.instagram || '';
    document.getElementById('hp-logo').value = h.logo_url || '';
  };
  const hpSelect = document.getElementById('hp-select');
  if (hpSelect.value) fillHimaProfileForm(hpSelect.value);
  hpSelect.addEventListener('change', (e) => fillHimaProfileForm(e.target.value));

  document.getElementById('hima-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const id = hpSelect.value;
      const updated = await api(`/himas/${id}`, {
        method: 'PATCH', auth: true,
        body: {
          description: document.getElementById('hp-description').value,
          email: document.getElementById('hp-email').value,
          instagram: document.getElementById('hp-instagram').value,
          logo_url: document.getElementById('hp-logo').value,
        },
      });
      himaById[id] = { ...himaById[id], ...updated };
      toast('Profil HIMA disimpan');
    } catch (err) { toast(err.message); }
  });

  document.getElementById('new-match-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/matches', {
        method: 'POST', auth: true,
        body: {
          sport_type: document.getElementById('nm-sport').value,
          round_name: document.getElementById('nm-round').value,
          home_hima_id: document.getElementById('nm-home').value,
          away_hima_id: document.getElementById('nm-away').value,
          match_date: document.getElementById('nm-date').value.replace('T', ' '),
          venue: document.getElementById('nm-venue').value,
        },
      });
      toast('Pertandingan ditambahkan ke jadwal');
      router();
    } catch (err) { toast(err.message); }
  });
});
