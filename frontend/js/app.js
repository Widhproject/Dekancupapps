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
  // Jadwal boleh dibuat tanpa waktu (match_date null) — tampilkan sebagai
  // "To Be Announced" alih-alih error atau tanggal "Invalid Date".
  if (!str) return 'To Be Announced';
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
  // Khusus Basket — kartu kuning/merah/pergantian pemain tidak berlaku di
  // basket, jadi diganti kejadian yang sesuai olahraga ini.
  foul: '🚫 Foul', technical_foul: '⚠️ Technical Foul', timeout: '⏱️ Time Out',
  free_throw: '🎯 Free Throw',
};

// Tombol "kejadian pertandingan" yang muncul di panel admin — beda per
// cabor, karena kartu kuning/merah & pergantian pemain cuma relevan untuk
// olahraga seperti Futsal, bukan Basket atau Voli.
const SPORT_EVENT_BUTTONS = {
  default: [
    { type: 'goal', label: '⚽ Gol' },
    { type: 'yellow_card', label: '🟨 Kartu Kuning' },
    { type: 'red_card', label: '🟥 Kartu Merah' },
    { type: 'substitution', label: '🔁 Pergantian' },
  ],
  Basket: [
    { type: 'foul', label: '🚫 Foul' },
    { type: 'technical_foul', label: '⚠️ Technical Foul' },
    { type: 'timeout', label: '⏱️ Time Out' },
    { type: 'free_throw', label: '🎯 Free Throw' },
  ],
  Voli: [
    { type: 'timeout', label: '⏱️ Time Out' },
    { type: 'note', label: '📝 Catatan' },
  ],
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

// ---------- Filter ala "chip" ----------
// Dipakai di halaman Jadwal & Riwayat sebagai pengganti <select> dropdown:
// semua pilihan langsung berjejer ke samping (scroll ke kanan kalau tidak
// muat di layar sempit) dan bisa ditekan langsung, tanpa perlu buka dropdown
// dulu untuk lihat opsinya.
function chipRowHTML(options, selectedValue) {
  const chip = (value, label, active) => `<button type="button" class="chip${active ? ' active' : ''}" data-value="${value}">${label}</button>`;
  return chip('', 'Semua', !selectedValue) + options.map((o) => chip(o.value, o.label, o.value === selectedValue)).join('');
}
function chipFilterGroupHTML(id, label, options, selectedValue) {
  return `
    <div class="chip-filter-group">
      <label>${label}</label>
      <div class="chip-row" id="${id}">${chipRowHTML(options, selectedValue)}</div>
    </div>`;
}
// Event delegation: sekali dipasang ke elemen .chip-row, klik salah satu chip
// akan memindahkan class "active" lalu memanggil onSelect(value). Dipanggil
// ulang tiap kali isi baris di-render ulang (mis. daftar Kategori berubah
// setelah cabor lain dipilih) supaya listener-nya ikut baru.
function bindChipRow(rowEl, onSelect) {
  if (!rowEl) return;
  rowEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn || btn.classList.contains('active')) return;
    rowEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    onSelect(btn.dataset.value);
  });
}

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
  // Tutup koneksi socket dari halaman sebelumnya secara default — halaman
  // yang memang butuh live update (/jadwal, /match/:id, /layar) akan buka
  // koneksi barunya sendiri lagi setelah ini. Mencegah koneksi menggantung
  // saat pindah ke halaman yang tidak perlu real-time (mis. /hima, /bagan).
  if (currentSocket) { currentSocket.disconnect(); currentSocket = null; }

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
  { name: 'Hanum Nisyaul. A', role: 'Bendahara 2', photo: 'assets/home/team-6.jpg' },
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
  // Matches diambil DULUAN (sebelum render awal) supaya kita sudah tahu ada
  // pertandingan live atau tidak sebelum memutuskan apa yang ditampilkan di
  // posisi hero: judul biasa (kalau tidak ada live), atau langsung tampilan
  // pertandingan yang sedang berlangsung (kalau ada) — jadi tidak perlu lagi
  // menampilkan dua-duanya sekaligus (judul + spotlight terpisah di bawahnya).
  //
  // Sengaja cuma filter by sport_type — TIDAK ada filter Kategori/HIMA lagi
  // (dulu ada, dihapus atas permintaan: cukup pilih cabor, kategori Putra &
  // Putri-nya otomatis ikut tampil bareng tanpa perlu dipilah lagi).
  const matches = await api(`/matches?${new URLSearchParams(query.sport_type ? { sport_type: query.sport_type } : {}).toString()}`);
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
        ${chipFilterGroupHTML('f-sport', 'Cabang Olahraga', SPORT_TYPES.map((s) => ({ value: s, label: s })), query.sport_type || '')}
      </div>
      <div id="match-list" class="match-list"></div>
    </div>
  `;

  let selectedSport = query.sport_type || '';

  const applyFilter = () => {
    const params = new URLSearchParams();
    if (selectedSport) params.set('sport_type', selectedSport);
    location.hash = `/jadwal?${params.toString()}`;
  };

  bindChipRow(document.getElementById('f-sport'), (value) => { selectedSport = value; applyFilter(); });

  // Live tampil sebagai hero di atas saja (tidak dobel di list bawah).
  // Yang sudah selesai tidak ditampilkan di halaman ini lagi — otomatis
  // pindah ke tab Riwayat. List di bawah cuma untuk yang belum mulai.
  const list = document.getElementById('match-list');
  const noFilterApplied = !query.sport_type;
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

  // ---- Koneksi real-time khusus halaman ini ----
  // Sebelumnya kartu live di sini cuma dirender sekali (statis) — kalau
  // pengunjung tidak masuk ke halaman detail pertandingannya, skor yang
  // tampil di sini tidak pernah ter-update walau pertandingannya terus
  // berjalan. Sekarang halaman jadwal ikut dengar 2 event global:
  // 'live_score_updated' (skor berubah → update angka di kartu, dengan
  // animasi "pop" yang sama seperti di halaman detail) dan
  // 'schedule_changed' (ada pertandingan mulai/selesai/dibuat baru →
  // muat ulang seluruh halaman supaya kartu hero & daftar tetap akurat).
  //
  // Dibungkus try/catch dengan sengaja: ini fitur "bonus" di atas halaman
  // yang sudah selesai dirender di atas — kalau karena sebab apa pun skrip
  // socket.io gagal dimuat (mis. koneksi lambat, pemblokir iklan), jangan
  // sampai seluruh halaman yang sudah tampil malah ikut hilang/error;
  // cukup live-update-nya saja yang tidak aktif, pengunjung masih bisa
  // pakai halaman & filter seperti biasa.
  try {
    if (currentSocket) { currentSocket.disconnect(); currentSocket = null; }
    currentSocket = io(API_BASE.replace('/api', ''));
    currentSocket.on('live_score_updated', (payload) => {
      const card = document.querySelector(`.spotlight-card[data-match-id="${payload.id}"]`);
      if (!card) return; // pertandingan ini sedang tidak tampil di hero, abaikan
      bumpScoreEl(card.querySelector('[data-role="home-score"]'), payload.home_score);
      bumpScoreEl(card.querySelector('[data-role="away-score"]'), payload.away_score);
    });
    currentSocket.on('schedule_changed', () => router());
  } catch (err) {
    console.warn('Live-update halaman jadwal tidak aktif:', err.message);
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
      <div class="mc-meta">${m.sport_type}${m.category ? ' · ' + m.category : ''} · ${m.round_name || ''} · ${fmtDate(m.match_date)} · ${m.venue || 'Venue belum ditentukan'}</div>
    </div>
    <div class="mc-status">${statusBadge(m.status)}</div>
  </a>`;
}

function liveSpotlightCardHTML(m) {
  return `
  <a class="spotlight-card" href="#/match/${m.id}" data-match-id="${m.id}">
    <div class="spotlight-top">
      ${statusBadge(m.status)}
      <span class="spotlight-meta">${m.sport_type}${m.category ? ' · ' + m.category : ''}${m.round_name ? ' · ' + m.round_name : ''}</span>
    </div>
    <div class="spotlight-teams">
      <div class="spotlight-team">
        <img src="${m.home_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'"/>
        <span>${m.home_hima.code}</span>
      </div>
      <div class="spotlight-score">
        <span class="spotlight-score-num" data-role="home-score">${m.home_score}</span>
        <span class="spotlight-dash">–</span>
        <span class="spotlight-score-num" data-role="away-score">${m.away_score}</span>
      </div>
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
        <div class="round">${m.sport_type}${m.category ? ' · ' + m.category : ''} · ${m.round_name || '-'}</div>
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
            ${m.events.length ? m.events.map((ev) => eventItemHTML(ev, m)).join('') : '<div class="empty-state" style="padding:16px;">Belum ada catatan.</div>'}
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

  const adminState = admin ? bindAdminControls(m) : null;
  if (admin && SPORTS_WITH_TIMER.includes(m.sport_type)) restartAdminTimerInterval(m);
  bindPhotoLightbox();

  // ---- Socket.io: join room match ini, dengarkan update real-time ----
  if (currentSocket) { currentSocket.disconnect(); currentSocket = null; }
  currentSocket = io(API_BASE.replace('/api', ''));
  currentSocket.emit('join_match', m.id);
  currentSocket.on('score_updated', (payload) => {
    const { home_score, away_score, home_babak, away_babak, home_fouls, away_fouls } = payload;
    bumpScoreEl(document.getElementById('home-score'), home_score);
    bumpScoreEl(document.getElementById('away-score'), away_score);
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('home-babak-val', home_babak ?? 0);
    setText('away-babak-val', away_babak ?? 0);
    setText('home-foul-val', home_fouls ?? 0);
    setText('away-foul-val', away_fouls ?? 0);
    // Penting: sinkronkan juga state yang dipakai tombol +1/-1 admin (bukan cuma
    // tampilannya). Tanpa ini, kalau ADA admin lain (device lain) yang mengubah
    // skor/babak/foul, klik +1/-1 berikutnya di device ini akan menghitung dari
    // nilai lama yang sudah basi dan balik menimpa perubahan device lain itu
    // (lost update). Lihat juga bindAdminControls().
    if (adminState) {
      adminState.home = home_score;
      adminState.away = away_score;
      adminState.homeBabak = home_babak ?? 0;
      adminState.awayBabak = away_babak ?? 0;
      adminState.homeFouls = home_fouls ?? 0;
      adminState.awayFouls = away_fouls ?? 0;
    }
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
    list.insertAdjacentHTML('afterbegin', eventItemHTML(ev, m));
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

function eventItemHTML(ev, m) {
  const t = new Date(ev.created_at.replace(' ', 'T') + 'Z');
  // Kode tim (mis. "HIMAKI") kalau kejadian ini terkait salah satu tim yang
  // sedang bertanding — m opsional (dipakai lagi lewat listener socket di
  // bawah, yang juga selalu mengirim m dari closure-nya).
  let teamCode = '';
  if (m && ev.hima_id) {
    if (ev.hima_id === m.home_hima_id) teamCode = m.home_hima?.code;
    else if (ev.hima_id === m.away_hima_id) teamCode = m.away_hima?.code;
  }
  const who = [ev.player_name, teamCode ? `(${teamCode})` : ''].filter(Boolean).join(' ');
  return `<div class="event-item">
    <span class="time">${t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
    <span>${EVENT_LABEL[ev.event_type] || ev.event_type}${who ? ' — ' + who : ''}${ev.description ? ' — ' + ev.description : ''}</span>
  </div>`;
}

function adminControlsHTML(m) {
  const isBasket = m.sport_type === 'Basket';
  const isVoli = m.sport_type === 'Voli';
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

    ${isVoli ? `
    <div class="event-buttons" style="margin-top:8px;">
      <button class="btn small ghost" id="btn-score-reset">↺ Reset Skor (set selesai → mulai set berikutnya)</button>
    </div>
    <p class="mc-meta" style="margin-top:4px;">Cuma me-reset skor kedua tim ke 0-0. Jangan lupa tekan +1 di "Babak Dimenangkan" di bawah dulu untuk tim yang menang set-nya, baru tekan tombol ini.</p>` : ''}

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

    ${isBasket ? `
    <div class="eyebrow" style="margin-top:14px;">Foul Tim (untuk layar skor besar)</div>
    <div class="score-controls">
      <div class="team">
        <strong>${m.home_hima.code} — <span id="home-foul-val">${m.home_fouls || 0}</span> foul</strong>
        <div class="btns">
          <button class="btn small ghost" data-foul-adj="home" data-delta="-1">−1</button>
          <button class="btn small primary" data-foul-adj="home" data-delta="1">+1</button>
        </div>
      </div>
      <div class="team">
        <strong>${m.away_hima.code} — <span id="away-foul-val">${m.away_fouls || 0}</span> foul</strong>
        <div class="btns">
          <button class="btn small ghost" data-foul-adj="away" data-delta="-1">−1</button>
          <button class="btn small primary" data-foul-adj="away" data-delta="1">+1</button>
        </div>
      </div>
    </div>
    <div class="event-buttons" style="margin-top:8px;">
      <button class="btn small ghost" id="btn-foul-reset">↺ Reset Foul (kedua tim — mis. pergantian babak)</button>
    </div>` : ''}

    <div class="eyebrow" style="margin-top:14px;">Catat Kejadian</div>
    <!-- Pilih tim & (opsional) nama pemain SEBELUM klik tombol kejadian di
         bawah — nilainya dikirim bareng saat tombol diklik, lalu nama pemain
         otomatis dikosongkan lagi supaya siap diisi untuk kejadian berikutnya. -->
    <div class="event-recorder">
      <select id="event-team-select">
        <option value="${m.home_hima_id}">${m.home_hima.code}</option>
        <option value="${m.away_hima_id}">${m.away_hima.code}</option>
      </select>
      <input type="text" id="event-player-input" placeholder="Nama pemain (opsional)" maxlength="80" />
    </div>
    <div class="event-buttons">
      ${(SPORT_EVENT_BUTTONS[m.sport_type] || SPORT_EVENT_BUTTONS.default)
        .map((e) => `<button class="btn small" data-event="${e.type}">${e.label}</button>`).join('')}
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

// Mengembalikan objek `state` (bukan sekadar mengikat event) supaya pemanggil
// (route handler) bisa menyinkronkan skor/babak/foul kalau ada update dari
// device admin lain lewat socket — lihat komentar di listener 'score_updated'
// pada route('/match/:id'). Kalau cuma pakai variabel `let` biasa di sini,
// closure-nya tidak bisa diakses dari luar sehingga rawan "lost update".
function bindAdminControls(m) {
  const state = {
    home: m.home_score, away: m.away_score,
    homeBabak: m.home_babak || 0, awayBabak: m.away_babak || 0,
    homeFouls: m.home_fouls || 0, awayFouls: m.away_fouls || 0,
  };

  document.querySelectorAll('[data-adj]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const side = btn.dataset.adj, delta = parseInt(btn.dataset.delta, 10);
      if (side === 'home') state.home = Math.max(0, state.home + delta); else state.away = Math.max(0, state.away + delta);
      try {
        await api(`/matches/${m.id}/score`, { method: 'PATCH', auth: true, body: { home_score: state.home, away_score: state.away } });
      } catch (err) { toast(err.message); }
    });
  });

  // Reset skor kedua tim ke 0-0 (khusus Voli) — dipakai admin begitu satu set
  // selesai dan mau lanjut ke set berikutnya, karena skor per-set di voli
  // selalu mulai dari nol lagi (beda dari "Babak Dimenangkan" di bawah, yang
  // menghitung TOTAL set yang sudah dimenangkan sepanjang pertandingan dan
  // sengaja TIDAK direset tombol ini).
  const scoreResetBtn = document.getElementById('btn-score-reset');
  if (scoreResetBtn) scoreResetBtn.addEventListener('click', async () => {
    if (!confirm('Reset skor kedua tim ke 0-0 untuk mulai set baru?\n\n(Jumlah babak/set yang sudah dimenangkan TIDAK ikut berubah — kalau belum ditekan, catat dulu pemenang set ini lewat tombol +1 di "Babak Dimenangkan".)')) return;
    state.home = 0; state.away = 0;
    bumpScoreEl(document.getElementById('home-score'), 0);
    bumpScoreEl(document.getElementById('away-score'), 0);
    try {
      await api(`/matches/${m.id}/score`, { method: 'PATCH', auth: true, body: { home_score: 0, away_score: 0 } });
      toast('Skor direset — set baru dimulai');
    } catch (err) { toast(err.message); }
  });

  document.querySelectorAll('[data-babak-adj]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const side = btn.dataset.babakAdj, delta = parseInt(btn.dataset.delta, 10);
      if (side === 'home') state.homeBabak = Math.max(0, state.homeBabak + delta); else state.awayBabak = Math.max(0, state.awayBabak + delta);
      document.getElementById('home-babak-val').textContent = state.homeBabak;
      document.getElementById('away-babak-val').textContent = state.awayBabak;
      try {
        await api(`/matches/${m.id}/score`, { method: 'PATCH', auth: true, body: { home_babak: state.homeBabak, away_babak: state.awayBabak } });
      } catch (err) { toast(err.message); }
    });
  });

  document.querySelectorAll('[data-foul-adj]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const side = btn.dataset.foulAdj, delta = parseInt(btn.dataset.delta, 10);
      if (side === 'home') state.homeFouls = Math.max(0, state.homeFouls + delta); else state.awayFouls = Math.max(0, state.awayFouls + delta);
      document.getElementById('home-foul-val').textContent = state.homeFouls;
      document.getElementById('away-foul-val').textContent = state.awayFouls;
      try {
        await api(`/matches/${m.id}/score`, { method: 'PATCH', auth: true, body: { home_fouls: state.homeFouls, away_fouls: state.awayFouls } });
      } catch (err) { toast(err.message); }
    });
  });

  // Reset foul kedua tim sekaligus (dipakai admin tiap pergantian babak/kuarter,
  // karena foul tim di basket dihitung ulang dari nol tiap kuarter baru).
  const foulResetBtn = document.getElementById('btn-foul-reset');
  if (foulResetBtn) foulResetBtn.addEventListener('click', async () => {
    if (!confirm('Reset foul kedua tim ke 0?')) return;
    state.homeFouls = 0; state.awayFouls = 0;
    document.getElementById('home-foul-val').textContent = 0;
    document.getElementById('away-foul-val').textContent = 0;
    try {
      await api(`/matches/${m.id}/score`, { method: 'PATCH', auth: true, body: { home_fouls: 0, away_fouls: 0 } });
      toast('Foul kedua tim direset');
    } catch (err) { toast(err.message); }
  });

  // Kejadian yang nama pemainnya penting dicatat (dipakai nanti untuk fitur
  // statistik/top scorer) — untuk tipe ini nama pemain diwajibkan supaya
  // datanya konsisten, bukan campur ada-nama/tidak-ada-nama.
  const EVENTS_NEED_PLAYER = ['goal', 'yellow_card', 'red_card', 'substitution', 'free_throw'];
  document.querySelectorAll('[data-event]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const teamSelect = document.getElementById('event-team-select');
      const playerInput = document.getElementById('event-player-input');
      const eventType = btn.dataset.event;
      const playerName = playerInput ? playerInput.value.trim() : '';

      if (EVENTS_NEED_PLAYER.includes(eventType) && !playerName) {
        toast(`Isi dulu nama pemain sebelum mencatat "${EVENT_LABEL[eventType] || eventType}"`);
        playerInput?.focus();
        return;
      }

      try {
        await api(`/matches/${m.id}/events`, {
          method: 'POST',
          auth: true,
          body: {
            event_type: eventType,
            hima_id: teamSelect ? teamSelect.value : null,
            player_name: playerName || null,
          },
        });
        if (playerInput) playerInput.value = '';

        // Tombol kejadian "🚫 Foul" (khusus Basket) sengaja juga menaikkan counter
        // foul tim yang dipilih, supaya admin tidak perlu klik dua kali (sekali di
        // sini, sekali lagi di kontrol "Foul Tim" di atas) — dan supaya counter foul
        // di layar skor besar tidak pernah ketinggalan/berbeda dari catatan kejadian.
        if (eventType === 'foul' && m.sport_type === 'Basket' && teamSelect) {
          const isHome = teamSelect.value === m.home_hima_id;
          if (isHome) state.homeFouls += 1; else state.awayFouls += 1;
          const valEl = document.getElementById(isHome ? 'home-foul-val' : 'away-foul-val');
          if (valEl) valEl.textContent = isHome ? state.homeFouls : state.awayFouls;
          try {
            await api(`/matches/${m.id}/score`, { method: 'PATCH', auth: true, body: { home_fouls: state.homeFouls, away_fouls: state.awayFouls } });
          } catch (err) { toast(err.message); }
        }
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

  return state;
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

// Pilihan background layar skor besar (/layar) — dipilih admin lewat Panel
// Admin > Background Layar Skor Besar. class-nya (sb-bg-{id}) dipakai
// bareng di dua tempat: layar besar sungguhan (app.js route('/layar')) dan
// pratinjau swatch di panel admin — lihat .sb-bg-* & .bg-preset-swatch di
// style.css. 'custom' otomatis ditambahkan ke daftar ini oleh
// scoreboardBgPresetOptions() begitu admin pernah unggah gambar sendiri.
const SCOREBOARD_BG_PRESETS = [
  { id: 'vintage', label: 'Vintage (Bawaan)' },
  { id: 'midnight', label: 'Malam Emas' },
  { id: 'sunset', label: 'Sunset Stadium' },
  { id: 'ocean', label: 'Ocean' },
];

// Terapkan konfigurasi background (preset atau gambar sendiri) ke elemen
// #sb-bg-layer. Dipanggil sekali saat halaman /layar dimuat, dan lagi setiap
// kali ada event socket 'scoreboard_bg_updated' (admin ganti background dari
// device lain) — supaya layar besar yang sedang menyala di venue ikut
// berubah otomatis tanpa perlu di-refresh manual.
function applyScoreboardBg(bgLayerEl, config) {
  if (!bgLayerEl || !config) return;
  const validIds = [...SCOREBOARD_BG_PRESETS.map((p) => p.id), 'custom'];
  const preset = validIds.includes(config.scoreboard_bg_preset) ? config.scoreboard_bg_preset : 'vintage';
  validIds.forEach((id) => bgLayerEl.classList.remove(`sb-bg-${id}`));
  bgLayerEl.classList.add(`sb-bg-${preset}`);
  bgLayerEl.style.backgroundImage = (preset === 'custom' && config.scoreboard_bg_custom_url)
    ? `url('${config.scoreboard_bg_custom_url}')`
    : '';
}

// Label "babak yang dimenangkan" disesuaikan istilah per cabor supaya lebih
// natural dibaca di layar besar — Voli pakai "Set" (istilah baku voli),
// cabor lain pakai "Babak" (generik).
function sbBabakLabel(sportType) {
  return sportType === 'Voli' ? 'Set' : 'Babak';
}

function scoreboardMatchHTML(m) {
  const showTimer = SPORTS_WITH_TIMER.includes(m.sport_type);
  const babakLabel = sbBabakLabel(m.sport_type);
  const roundText = [m.round_name, m.category].filter(Boolean).join(' · ') || m.sport_type;
  return `
  <div class="sb-stage">
    <div class="sb-topbar">
      <span class="sb-live-badge"><span class="sb-live-dot"></span>LIVE</span>
      <span class="sb-round-badge">${roundText}</span>
    </div>
    ${showTimer ? `<div class="sb-clock"><span class="sb-dot"></span><span id="sb-timer">${fmtCountdown(computeRemainingSec(m))}</span></div>` : ''}
    <div class="sb-row">
      <div class="sb-team-col">
        <div class="sb-team">
          <img src="${m.home_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'" />
        </div>
        <div class="sb-team-name">${m.home_hima.code}</div>
      </div>
      <div class="sb-scores">
        <div class="sb-side">
          <span class="sb-big" id="sb-home-score">${m.home_score}</span>
          <span class="sb-small sb-babak-pill" id="sb-home-babak">${babakLabel} ${m.home_babak || 0}</span>
        </div>
        <div class="sb-sep">–</div>
        <div class="sb-side">
          <span class="sb-small sb-babak-pill" id="sb-away-babak">${babakLabel} ${m.away_babak || 0}</span>
          <span class="sb-big" id="sb-away-score">${m.away_score}</span>
        </div>
      </div>
      <div class="sb-team-col">
        <div class="sb-team">
          <img src="${m.away_hima.logo_url}" onerror="this.src='assets/logos/_placeholder.svg'" />
        </div>
        <div class="sb-team-name">${m.away_hima.code}</div>
      </div>
    </div>
    ${showTimer ? `
    <div class="sb-fouls">
      <div class="sb-foul-box">
        <span class="sb-foul-label">Foul</span>
        <span class="sb-foul-num" id="sb-home-fouls">${m.home_fouls || 0}</span>
      </div>
      <div class="sb-foul-box">
        <span class="sb-foul-label">Foul</span>
        <span class="sb-foul-num" id="sb-away-fouls">${m.away_fouls || 0}</span>
      </div>
    </div>` : ''}
  </div>`;
}

route('/layar', async () => {
  app.innerHTML = `<div id="sb-bg-layer" class="sb-bg-layer"></div><div id="sb-root"></div>`;
  const root = document.getElementById('sb-root');
  const bgLayer = document.getElementById('sb-bg-layer');

  // Muat & terapkan background pilihan admin. Dibungkus try/catch: kalau
  // gagal (mis. server belum sempat migrasi field baru), layar besar tetap
  // tampil dengan fallback CSS bawaan (.sb-bg-layer polos) alih-alih blank.
  try {
    const config = await api('/himas/config/event');
    applyScoreboardBg(bgLayer, config);
  } catch (err) {
    console.warn('Layar skor: gagal memuat konfigurasi background.', err);
    applyScoreboardBg(bgLayer, { scoreboard_bg_preset: 'vintage' });
  }

  let current = null; // id pertandingan yang sedang ditampilkan
  let currentSportType = null; // dipakai supaya listener socket tahu label "Set"/"Babak" yang benar tanpa perlu refetch
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
      currentSportType = null;
      timerState = { timer_end_at: null, timer_paused_remaining_sec: null, timer_duration_sec: null };
      root.innerHTML = scoreboardIdleHTML();
      return;
    }
    updateClockOffset(m.server_now_ms);

    timerState = { timer_end_at: m.timer_end_at, timer_paused_remaining_sec: m.timer_paused_remaining_sec, timer_duration_sec: m.timer_duration_sec };

    if (current !== m.id) {
      current = m.id;
      currentSportType = m.sport_type;
      root.innerHTML = scoreboardMatchHTML(m);
    } else {
      // Set biasa (bukan animasi) karena ini jalur polling cadangan yang jalan
      // tiap 15 detik terlepas skor berubah atau tidak — animasi "pop" hanya
      // dipasang di jalur socket real-time (lihat listener 'live_score_updated'
      // di bawah) supaya cuma memicu saat memang ada perubahan sungguhan.
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      const babakLabel = sbBabakLabel(m.sport_type);
      set('sb-home-score', m.home_score);
      set('sb-away-score', m.away_score);
      set('sb-home-babak', `${babakLabel} ${m.home_babak || 0}`);
      set('sb-away-babak', `${babakLabel} ${m.away_babak || 0}`);
      set('sb-home-fouls', m.home_fouls || 0);
      set('sb-away-fouls', m.away_fouls || 0);
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
        const babakLabel = sbBabakLabel(currentSportType);
        set('sb-home-babak', `${babakLabel} ${payload.home_babak || 0}`);
        set('sb-away-babak', `${babakLabel} ${payload.away_babak || 0}`);
        set('sb-home-fouls', payload.home_fouls || 0);
        set('sb-away-fouls', payload.away_fouls || 0);
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
    currentSocket.on('scoreboard_bg_updated', (config) => applyScoreboardBg(bgLayer, config));
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
  // Kategori (mis. Putra/Putri) dipilih terpisah dari cabor — kalau belum
  // dipilih lewat URL, pakai kategori pertama yang tersedia untuk cabor ini
  // (lihat SPORT_CONFIG). Ini mencegah bagan mencampur pertandingan Putra &
  // Putri jadi satu pohon turnamen yang sama.
  const availableCategories = SPORT_CONFIG[sport]?.categories || [];
  const category = availableCategories.includes(query.category) ? query.category : (availableCategories[0] || '');
  const matches = await api(`/matches?${new URLSearchParams({ sport_type: sport, ...(category ? { category } : {}) }).toString()}`);

  // Kelompokkan per nama babak, lalu urutkan babaknya dari penyisihan -> final.
  const groups = {};
  matches.forEach((m) => {
    const key = m.round_name || 'Babak Belum Ditentukan';
    (groups[key] = groups[key] || []).push(m);
  });
  const roundNames = Object.keys(groups).sort((a, b) => roundRank(a) - roundRank(b) || a.localeCompare(b));
  // Sama seperti pengurutan jadwal di backend: pertandingan yang belum
  // punya waktu (match_date null, "To Be Announced") ditaruh paling
  // belakang dalam babaknya, bukan bikin error localeCompare(null).
  roundNames.forEach((r) => groups[r].sort((a, b) => {
    if (!a.match_date && !b.match_date) return 0;
    if (!a.match_date) return 1;
    if (!b.match_date) return -1;
    return a.match_date.localeCompare(b.match_date);
  }));
  const roundsData = roundNames.map((r) => groups[r]);

  app.innerHTML = `
    <div class="wrap">
      <div class="section-head">
        <div><div class="eyebrow">Bagan Pertandingan · Sistem Gugur</div><h2>${sport}${category ? ' · ' + category : ''}</h2></div>
        <div class="filter-group">
          <label>Cabang Olahraga</label>
          <select id="sport-select">
            ${SPORT_TYPES.map((s) => `<option ${s === sport ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        ${availableCategories.length > 1 ? `
        <div class="filter-group">
          <label>Kategori</label>
          <select id="category-select">
            ${availableCategories.map((c) => `<option ${c === category ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>` : ''}
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
    // Ganti cabor → kategori ikut direset ke default (kategori pertama cabor
    // baru itu), karena daftar kategori tiap cabor berbeda-beda.
    location.hash = `/bagan?sport=${encodeURIComponent(e.target.value)}`;
  });
  const categorySelect = document.getElementById('category-select');
  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      location.hash = `/bagan?sport=${encodeURIComponent(sport)}&category=${encodeURIComponent(e.target.value)}`;
    });
  }

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
route('/riwayat', async ({ query }) => {
  // Sama seperti /jadwal: cuma filter by sport_type, tidak ada
  // Kategori/HIMA lagi — pilih cabor, Putra & Putri-nya otomatis tampil bareng.
  const apiParams = new URLSearchParams({ status: 'finished' });
  if (query.sport_type) apiParams.set('sport_type', query.sport_type);
  const matches = await api(`/matches?${apiParams.toString()}`);

  app.innerHTML = `
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Arsip</div><h2>Riwayat Pertandingan</h2></div></div>
      <div class="filter-bar">
        ${chipFilterGroupHTML('f-sport', 'Cabang Olahraga', SPORT_TYPES.map((s) => ({ value: s, label: s })), query.sport_type || '')}
      </div>
      <div class="match-list">${matches.length ? matches.map(matchCardHTML).join('') : emptyState('Belum ada pertandingan yang selesai untuk filter ini.')}</div>
    </div>`;

  let selectedSport = query.sport_type || '';

  const applyFilter = () => {
    const params = new URLSearchParams();
    if (selectedSport) params.set('sport_type', selectedSport);
    location.hash = `/riwayat?${params.toString()}`;
  };

  bindChipRow(document.getElementById('f-sport'), (value) => { selectedSport = value; applyFilter(); });
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
  const countLabel = document.getElementById('reg-count-label');

  async function loadRegistrations() {
    listBox.innerHTML = '<div class="empty-state">Memuat…</div>';
    try {
      const qs = filterSelect.value ? `?sport_type=${encodeURIComponent(filterSelect.value)}` : '';
      const rows = await api(`/registrations${qs}`, { auth: true });
      // Tampilkan jumlah pendaftar di judul section (bahkan saat section-nya
      // masih ditutup) supaya panitia tahu ada berapa banyak tanpa perlu
      // buka dulu.
      if (countLabel) {
        const totalPlayers = rows.reduce((sum, r) => sum + (r.players?.length || 0), 0);
        countLabel.textContent = `${rows.length} tim terdaftar · ${totalPlayers} atlet`;
      }
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

// ============================================================
// Status buka/tutup tiap section di panel admin (lihat route('/admin', ...)
// di bawah). Disimpan di luar fungsi route (bertahan selama sesi/tab
// terbuka, bukan disimpan permanen) supaya begitu panitia submit form atau
// hapus data — yang otomatis memanggil router() untuk render ulang seluruh
// halaman admin — section yang tadinya sedang dibuka tidak ikut tertutup
// lagi. "Tambah Pertandingan Baru" dibuka duluan (default) karena biasanya
// itu aksi pertama yang dicari panitia; section berisi daftar panjang
// (Data Registrasi Peserta, Semua Pertandingan) sengaja tertutup duluan
// supaya halaman admin tidak langsung penuh scroll begitu pendaftar sudah
// banyak.
const ADMIN_OPEN_SECTIONS = {
  'new-match': true,
  'hima-profile': false,
  'sport-limits': false,
  'registrations': false,
  'athlete-profile': false,
  'all-matches': false,
  'scoreboard-bg': false,
};

route('/admin', async () => {
  if (!isAdmin()) { location.hash = '/login'; return; }
  const [matches, himas, sportConfig, scoreboardConfig] = await Promise.all([
    api('/matches'),
    api('/himas?team_only=true'),
    api('/registrations/config'),
    api('/himas/config/event'),
  ]);
  const himaOptions = himas.map((h) => `<option value="${h.id}">${h.code}</option>`).join('');

  // Ikon panah bawah untuk penanda buka/tutup tiap section — dirotasi 180°
  // lewat CSS (.admin-section[open] > summary .chevron) saat section terbuka.
  const CHEVRON_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  // Section mana yang lagi dibuka/ditutup diingat di ADMIN_OPEN_SECTIONS
  // (variabel module-level, lihat definisinya di luar route ini) — supaya
  // tiap kali halaman admin di-render ulang (submit form, tambah/hapus
  // data, dsb selalu memanggil router() lagi), section yang tadinya sudah
  // dibuka panitia tidak ikut tertutup lagi.
  const sectionOpen = (key) => (ADMIN_OPEN_SECTIONS[key] ? 'open' : '');

  app.innerHTML = `
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Panel Panitia</div><h2>Kelola Jadwal Pertandingan</h2></div></div>

      <details class="admin-score-box admin-section" data-section-key="backup" ${sectionOpen('backup')}>
        <summary>
          <div class="admin-section-title">Backup Data<small>Unduh salinan HIMA, jadwal &amp; riwayat pertandingan, dst sebagai JSON</small></div>
          <span class="chevron">${CHEVRON_ICON}</span>
        </summary>
        <div class="admin-section-body">
          <p class="mc-meta" style="margin-bottom:10px;">
            Semua data aplikasi ini (termasuk <strong>riwayat pertandingan</strong>) disimpan di satu file di server,
            bukan di database terpisah — jadi tidak ikut "aman otomatis" kalau suatu saat servernya di-deploy ulang
            tanpa penyimpanan permanen (Volume) yang benar. Unduh backup ini secara berkala, dan <strong>WAJIB sebelum
            melakukan update/deploy besar</strong>, supaya ada salinan yang bisa dipulihkan kalau data di server
            ternyata ikut ter-reset.
          </p>
          <button class="btn primary" id="btn-download-backup" type="button">⬇️ Unduh Backup (.json)</button>
        </div>
      </details>

      <details class="admin-score-box admin-section" data-section-key="scoreboard-bg" ${sectionOpen('scoreboard-bg')}>
        <summary>
          <div class="admin-section-title">Background Layar Skor Besar<small>Atur tampilan halaman /layar untuk proyektor/TV di venue</small></div>
          <span class="chevron">${CHEVRON_ICON}</span>
        </summary>
        <div class="admin-section-body">
          <p class="mc-meta" style="margin-bottom:6px;">Pilih salah satu tampilan di bawah, atau unggah foto/gambar sendiri. Perubahan langsung tampil di layar besar yang sedang menyala (tanpa perlu refresh manual).</p>
          <div class="bg-preset-grid" id="bg-preset-grid">
            ${SCOREBOARD_BG_PRESETS.map((p) => `
              <div class="bg-preset-swatch sb-bg-${p.id} ${scoreboardConfig.scoreboard_bg_preset === p.id ? 'active' : ''}" data-preset="${p.id}">
                ${scoreboardConfig.scoreboard_bg_preset === p.id ? '<div class="bg-preset-swatch-check">✓</div>' : ''}
                <div class="bg-preset-swatch-label">${p.label}</div>
              </div>
            `).join('')}
            ${scoreboardConfig.scoreboard_bg_custom_url ? `
              <div class="bg-preset-swatch ${scoreboardConfig.scoreboard_bg_preset === 'custom' ? 'active' : ''}" data-preset="custom" style="background-image:url('${scoreboardConfig.scoreboard_bg_custom_url}')">
                ${scoreboardConfig.scoreboard_bg_preset === 'custom' ? '<div class="bg-preset-swatch-check">✓</div>' : ''}
                <div class="bg-preset-swatch-label">Gambar Sendiri</div>
              </div>
            ` : `
              <div class="bg-preset-swatch custom-empty">
                <div class="bg-preset-swatch-label">Belum ada gambar sendiri</div>
              </div>
            `}
          </div>
          <input type="file" id="bg-upload-input" accept="image/*" style="display:none;" />
          <button class="btn small ghost" id="btn-upload-bg" type="button">📷 ${scoreboardConfig.scoreboard_bg_custom_url ? 'Ganti' : 'Unggah'} Gambar Sendiri</button>
          <p class="mc-meta" style="margin-top:6px;">Format gambar biasa (JPG/PNG/WebP), maksimal 8 MB. Disarankan foto yang tidak terlalu ramai di bagian tengah, karena logo & skor akan ditampilkan menimpa di atasnya.</p>
        </div>
      </details>

      <details class="admin-score-box admin-section" data-section-key="new-match" ${sectionOpen('new-match')}>
        <summary>
          <div class="admin-section-title">Tambah Pertandingan Baru<small>Buat jadwal baru untuk salah satu cabor</small></div>
          <span class="chevron">${CHEVRON_ICON}</span>
        </summary>
        <div class="admin-section-body">
          <form id="new-match-form" class="form-grid-2" style="gap:10px;">
            <div class="filter-group"><label>Cabang Olahraga</label>
              <select id="nm-sport"><option>Futsal</option><option>Basket</option><option>Voli</option><option>Badminton</option><option>E-Sport Mobile Legends</option></select>
            </div>
            <div class="filter-group"><label>Kategori</label>
              <select id="nm-category"></select>
            </div>
            <div class="filter-group"><label>Ronde</label><input id="nm-round" placeholder="Penyisihan Grup A" /></div>
            <div class="filter-group"><label>Tim Tuan Rumah</label><select id="nm-home">${himaOptions}</select></div>
            <div class="filter-group"><label>Tim Tamu</label><select id="nm-away">${himaOptions}</select></div>
            <div class="filter-group"><label>Tanggal &amp; Waktu <span class="mc-meta" style="font-weight:400;">(opsional — kosongkan jika belum pasti, akan tampil "To Be Announced")</span></label><input type="datetime-local" id="nm-date" /></div>
            <div class="filter-group"><label>Venue</label><input id="nm-venue" placeholder="Lapangan Futsal FST A" /></div>
            <button class="btn primary" type="submit" style="grid-column:1/-1;">+ Tambah ke Jadwal</button>
          </form>
        </div>
      </details>

      <details class="admin-score-box admin-section" data-section-key="hima-profile" ${sectionOpen('hima-profile')}>
        <summary>
          <div class="admin-section-title">Kelola Profil HIMA<small>Deskripsi, kontak, dan logo tiap HIMA</small></div>
          <span class="chevron">${CHEVRON_ICON}</span>
        </summary>
        <div class="admin-section-body">
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
      </details>

      <details class="admin-score-box admin-section" data-section-key="sport-limits" ${sectionOpen('sport-limits')}>
        <summary>
          <div class="admin-section-title">Pengaturan Jumlah Peserta per Cabor<small>Minimal &amp; maksimal pemain tiap cabor/kategori</small></div>
          <span class="chevron">${CHEVRON_ICON}</span>
        </summary>
        <div class="admin-section-body">
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
      </details>

      <details class="admin-score-box admin-section" data-section-key="registrations" ${sectionOpen('registrations')}>
        <summary>
          <div class="admin-section-title">Data Registrasi Peserta<small id="reg-count-label">Daftar tim &amp; pemain yang mendaftar per cabor</small></div>
          <span class="chevron">${CHEVRON_ICON}</span>
        </summary>
        <div class="admin-section-body">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
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
      </details>

      <details class="admin-score-box admin-section" data-section-key="athlete-profile" ${sectionOpen('athlete-profile')}>
        <summary>
          <div class="admin-section-title">Kelola Profil Atlet<small>Edit/hapus nama &amp; NIM atlet per HIMA</small></div>
          <span class="chevron">${CHEVRON_ICON}</span>
        </summary>
        <div class="admin-section-body">
          <p class="mc-meta" style="margin:0 0 14px;">Nama &amp; NIM atlet di sini otomatis diambil dari data pendaftaran per cabor. Kalau ada atlet yang mengundurkan diri atau salah input, tinggal edit/hapus langsung dari sini — tidak perlu ubah data pendaftaran atau kode. Perubahan langsung muncul di halaman profil HIMA.</p>
          <div class="filter-group" style="margin-bottom:10px;">
            <label>Pilih HIMA</label>
            <select id="pa-select">${himas.map((h) => `<option value="${h.id}">${h.code} — ${h.full_name}</option>`).join('')}</select>
          </div>
          <div id="pa-roster"><div class="empty-state">Memuat…</div></div>
        </div>
      </details>

      <details class="admin-score-box admin-section" data-section-key="all-matches" ${sectionOpen('all-matches')}>
        <summary>
          <div class="admin-section-title">Semua Pertandingan<small>${matches.length} pertandingan terjadwal</small></div>
          <span class="chevron">${CHEVRON_ICON}</span>
        </summary>
        <div class="admin-section-body">
          <div class="match-list">${matches.length ? matches.map(adminMatchCardHTML).join('') : emptyState('Belum ada pertandingan.')}</div>
        </div>
      </details>
    </div>`;

  // Ingat status buka/tutup tiap section setiap kali panitia klik
  // summary-nya, supaya bertahan lewat re-render berikutnya (lihat
  // sectionOpen() di atas).
  document.querySelectorAll('.admin-section').forEach((el) => {
    el.addEventListener('toggle', () => {
      ADMIN_OPEN_SECTIONS[el.dataset.sectionKey] = el.open;
    });
  });

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

  // Opsi Kategori mengikuti cabor yang dipilih (mis. Futsal → Putra/Putri,
  // Badminton → Ganda Putra/Ganda Putri/Campuran) — diambil dari SPORT_CONFIG
  // yang sama dipakai formulir pendaftaran, supaya penamaan kategori selalu
  // konsisten antara jadwal pertandingan & data pendaftaran tim.
  document.getElementById('btn-download-backup').addEventListener('click', async () => {
    const btn = document.getElementById('btn-download-backup');
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/admin/export`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Gagal mengunduh backup');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dekancup-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Backup berhasil diunduh');
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // Background layar skor besar: klik salah satu swatch preset → langsung
  // PATCH (tanpa perlu tombol simpan terpisah, biar cepat dicoba-coba admin
  // saat gladi bersih), atau unggah gambar sendiri lewat file input
  // tersembunyi yang dipicu oleh tombol "Unggah/Ganti Gambar Sendiri".
  document.querySelectorAll('#bg-preset-grid [data-preset]').forEach((swatch) => {
    swatch.addEventListener('click', async () => {
      const preset = swatch.dataset.preset;
      if (preset === 'custom' && !scoreboardConfig.scoreboard_bg_custom_url) return; // belum ada gambar yg diunggah
      try {
        await api('/himas/config/event', { method: 'PATCH', auth: true, body: { scoreboard_bg_preset: preset } });
        toast('Background layar skor besar diperbarui');
        router();
      } catch (err) { toast(err.message); }
    });
  });

  const bgUploadInput = document.getElementById('bg-upload-input');
  document.getElementById('btn-upload-bg').addEventListener('click', () => bgUploadInput.click());
  bgUploadInput.addEventListener('change', async () => {
    const file = bgUploadInput.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('Ukuran file maksimal 8 MB'); bgUploadInput.value = ''; return; }
    const fd = new FormData();
    fd.append('background', file);
    try {
      const res = await fetch(`${API_BASE}/himas/config/scoreboard-bg`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Gagal mengunggah gambar');
      }
      toast('Gambar berhasil diunggah & langsung dipakai');
      router();
    } catch (err) {
      toast(err.message);
      bgUploadInput.value = '';
    }
  });

  const nmSportSelect = document.getElementById('nm-sport');
  const nmCategorySelect = document.getElementById('nm-category');
  const refreshCategoryOptions = () => {
    const categories = SPORT_CONFIG[nmSportSelect.value]?.categories || [];
    nmCategorySelect.innerHTML = categories.map((c) => `<option value="${c}">${c}</option>`).join('');
  };
  refreshCategoryOptions();
  nmSportSelect.addEventListener('change', refreshCategoryOptions);

  document.getElementById('new-match-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/matches', {
        method: 'POST', auth: true,
        body: {
          sport_type: document.getElementById('nm-sport').value,
          category: document.getElementById('nm-category').value,
          round_name: document.getElementById('nm-round').value,
          home_hima_id: document.getElementById('nm-home').value,
          away_hima_id: document.getElementById('nm-away').value,
          // Field waktu boleh dikosongkan (jadwal "To Be Announced") — kirim
          // null, bukan string kosong, supaya konsisten dengan yang dibaca
          // backend & fmtDate() di frontend.
          match_date: document.getElementById('nm-date').value
            ? document.getElementById('nm-date').value.replace('T', ' ')
            : null,
          venue: document.getElementById('nm-venue').value,
        },
      });
      toast('Pertandingan ditambahkan ke jadwal');
      router();
    } catch (err) { toast(err.message); }
  });
});
