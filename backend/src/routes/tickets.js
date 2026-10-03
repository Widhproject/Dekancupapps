import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import QRCode from 'qrcode';
import midtransClient from 'midtrans-client';
import { db, save, nowStr } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// Tiket Masuk Penonton (Final Basket, dsb) — alurnya:
//   1. Penonton isi nama+WA di "/tiket" -> POST /checkout -> Snap popup Midtrans muncul.
//   2. Setelah bayar, Midtrans kirim notifikasi server-to-server ke POST /notification
//      (BUKAN dari browser penonton) -> status tiket di-update jadi 'paid' di sini.
//      Ini sengaja TIDAK mengandalkan callback sukses di sisi browser saja, karena
//      callback browser bisa dipalsukan/di-skip; status resmi selalu dari webhook ini.
//   3. Browser penonton polling GET /status/:order_id sampai statusnya 'paid', lalu
//      diarahkan ke "/tiket/:kode" yang menampilkan QR untuk di-screenshot.
//   4. Panitia di pintu masuk scan QR itu lewat Panel Admin -> POST /scan, yang
//      menandai tiket "sudah dipakai" supaya tidak bisa dipakai masuk dua kali.
// ============================================================

function isMidtransConfigured() {
  return Boolean(process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_CLIENT_KEY);
}

function getSnapClient() {
  return new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
  });
}

// Kode tiket: 8 karakter huruf besar+angka, cukup pendek untuk diketik manual
// sebagai cadangan kalau QR-nya susah discan (layar HP retak, dsb), tapi
// tetap dicek keunikannya terhadap tiket yang sudah ada.
function generateUniqueTicketCode() {
  let code;
  do {
    code = uuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  } while (db.tickets.some((t) => t.ticket_code === code));
  return code;
}

// Jumlah orang per paket SENGAJA dikunci ke 3 pilihan ini (bukan bebas
// berapa pun) — harga tiap paket tetap bisa diatur admin lewat PUT /config,
// tapi jumlah tiernya sendiri tetap tiga supaya UI pemilihan paket di
// halaman "/tiket" sederhana (3 kartu), bukan input angka bebas.
const PACKAGE_TIERS = [1, 3, 5];

function publicTicketConfig() {
  return {
    event_label: db.ticket_config.event_label,
    venue: db.ticket_config.venue,
    package_prices: db.ticket_config.package_prices,
    client_key: process.env.MIDTRANS_CLIENT_KEY || null,
    is_production: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    configured: isMidtransConfigured(),
  };
}

// GET /api/tickets/config — publik, dipakai halaman "/tiket" utk tahu harga,
// label event, dan client key Midtrans (buat memuat Snap.js versi yang benar:
// sandbox vs production pakai domain skrip berbeda).
router.get('/config', (req, res) => {
  res.json(publicTicketConfig());
});

// PUT /api/tickets/config — admin, ubah label/venue/harga per paket tanpa
// perlu deploy ulang. package_prices dikirim sebagai object { "1": angka,
// "3": angka, "5": angka } — tiap key opsional, cuma yang dikirim yang diubah.
router.put('/config', requireAuth, requireAdmin, (req, res) => {
  const { event_label, venue, package_prices } = req.body;
  if (event_label !== undefined) db.ticket_config.event_label = String(event_label).trim();
  if (venue !== undefined) db.ticket_config.venue = String(venue).trim();
  if (package_prices && typeof package_prices === 'object') {
    for (const tier of PACKAGE_TIERS) {
      const raw = package_prices[tier] ?? package_prices[String(tier)];
      if (raw === undefined) continue;
      const p = Number(raw);
      if (!Number.isFinite(p) || p < 0) {
        return res.status(400).json({ message: `Harga paket ${tier} orang tidak valid` });
      }
      db.ticket_config.package_prices[tier] = Math.round(p);
    }
  }
  save();
  res.json(publicTicketConfig());
});

// POST /api/tickets/checkout — publik. Satu transaksi Snap bisa mewakili
// SATU paket (1/3/5 orang) — kalau quantity>1, dibikin N baris tiket
// terpisah (masing-masing QR & kode sendiri-sendiri, karena tetap "1 tiket
// = 1 orang" saat discan di pintu masuk) yang berbagi order_id yang sama,
// supaya satu pembayaran bisa menghasilkan beberapa tiket sekaligus.
router.post('/checkout', async (req, res) => {
  const { buyer_name, buyer_phone, quantity } = req.body;
  if (!buyer_name?.trim() || !buyer_phone?.trim()) {
    return res.status(400).json({ message: 'Nama dan nomor WhatsApp wajib diisi' });
  }
  const qty = Number(quantity) || 1;
  if (!PACKAGE_TIERS.includes(qty)) {
    return res.status(400).json({ message: `Paket tidak valid. Pilihan yang tersedia: ${PACKAGE_TIERS.join(', ')} orang` });
  }
  if (!isMidtransConfigured()) {
    return res.status(503).json({ message: 'Pembayaran belum dikonfigurasi oleh admin. Hubungi panitia.' });
  }

  const amount = db.ticket_config.package_prices[qty];
  const order_id = `TIX-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  // Bikin `qty` baris tiket sekaligus, semuanya 'pending' dulu — baru
  // di-update serentak jadi 'paid' oleh webhook kalau pembayarannya sukses.
  const newTickets = Array.from({ length: qty }, () => ({
    id: uuid(),
    order_id,
    ticket_code: generateUniqueTicketCode(),
    buyer_name: buyer_name.trim(),
    buyer_phone: buyer_phone.trim(),
    // amount per tiket = harga paket dibagi rata, cuma buat catatan/laporan;
    // yang dipakai Midtrans tetap total paketnya (lihat gross_amount di bawah).
    amount: Math.round(amount / qty),
    status: 'pending',
    payment_type: null,
    midtrans_transaction_id: null,
    used: false,
    used_at: null,
    used_by: null,
    created_at: nowStr(),
    updated_at: nowStr(),
    paid_at: null,
  }));

  try {
    const snap = getSnapClient();
    const transaction = await snap.createTransaction({
      transaction_details: { order_id, gross_amount: amount },
      customer_details: { first_name: buyer_name.trim(), phone: buyer_phone.trim() },
      item_details: [{
        id: `tiket-paket-${qty}`,
        price: amount,
        quantity: 1,
        // Nama item di Midtrans dibatasi 50 karakter.
        name: `Paket ${qty} Orang - ${db.ticket_config.event_label || 'Tiket Masuk'}`.slice(0, 50),
      }],
    });

    db.tickets.push(...newTickets);
    save();

    res.status(201).json({ token: transaction.token, redirect_url: transaction.redirect_url, order_id, quantity: qty });
  } catch (err) {
    console.error('Gagal membuat transaksi Midtrans:', err.message);
    res.status(502).json({ message: 'Gagal menghubungi payment gateway. Coba lagi sebentar lagi.' });
  }
});

// POST /api/tickets/notification — webhook server-to-server dari Midtrans.
// INI sumber kebenaran status pembayaran, bukan callback di browser penonton.
router.post('/notification', async (req, res) => {
  const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status, payment_type, transaction_id } = req.body;

  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return res.status(400).json({ message: 'Payload notifikasi tidak lengkap' });
  }

  // Verifikasi signature — WAJIB, supaya endpoint ini tidak bisa dipalsukan
  // orang luar untuk menandai tiket manapun jadi "lunas" secara cuma-cuma.
  const expectedSignature = crypto
    .createHash('sha512')
    .update(order_id + status_code + gross_amount + process.env.MIDTRANS_SERVER_KEY)
    .digest('hex');
  if (expectedSignature !== signature_key) {
    console.warn('Notifikasi Midtrans dengan signature tidak valid, diabaikan. order_id:', order_id);
    return res.status(403).json({ message: 'Signature tidak valid' });
  }

  // Satu order_id bisa punya BEBERAPA tiket sekaligus (paket 3/5 orang) —
  // semuanya dibayar dalam satu transaksi yang sama, jadi semuanya juga
  // harus di-update status-nya bareng-bareng di sini.
  const ticketsInOrder = db.tickets.filter((t) => t.order_id === order_id);
  if (ticketsInOrder.length === 0) return res.status(404).json({ message: 'Order tidak ditemukan' });

  let newStatus = ticketsInOrder[0].status;
  if (transaction_status === 'capture') {
    newStatus = fraud_status === 'accept' ? 'paid' : 'pending';
  } else if (transaction_status === 'settlement') {
    newStatus = 'paid';
  } else if (['cancel', 'deny', 'expire'].includes(transaction_status)) {
    newStatus = transaction_status === 'expire' ? 'expired' : 'failed';
  } else if (transaction_status === 'pending') {
    newStatus = 'pending';
  }

  for (const ticket of ticketsInOrder) {
    ticket.status = newStatus;
    ticket.payment_type = payment_type || ticket.payment_type;
    ticket.midtrans_transaction_id = transaction_id || ticket.midtrans_transaction_id;
    ticket.updated_at = nowStr();
    if (newStatus === 'paid' && !ticket.paid_at) ticket.paid_at = nowStr();
  }
  save();

  req.app.get('io').emit('ticket_updated');

  res.status(200).json({ message: 'OK' });
});

// GET /api/tickets/status/:order_id — publik, dipoll browser penonton setelah
// nutup popup Snap, buat tahu apakah webhook di atas sudah kelar diproses.
// Status cukup diwakili tiket pertama di order itu — semuanya SELALU sama
// (lihat POST /notification, update-nya serentak buat seluruh order).
router.get('/status/:order_id', (req, res) => {
  const ticketsInOrder = db.tickets.filter((t) => t.order_id === req.params.order_id);
  if (ticketsInOrder.length === 0) return res.status(404).json({ message: 'Order tidak ditemukan' });
  res.json({ status: ticketsInOrder[0].status, order_id: req.params.order_id, quantity: ticketsInOrder.length });
});

// GET /api/tickets/order/:order_id — publik, halaman "paket tiket" yang
// menampilkan SEMUA tiket (QR masing-masing) dalam satu pembelian sekaligus.
router.get('/order/:order_id', async (req, res) => {
  const ticketsInOrder = db.tickets.filter((t) => t.order_id === req.params.order_id);
  if (ticketsInOrder.length === 0) return res.status(404).json({ message: 'Order tidak ditemukan' });
  if (ticketsInOrder[0].status !== 'paid') {
    return res.status(403).json({ message: 'Pesanan ini belum lunas atau pembayarannya gagal', status: ticketsInOrder[0].status });
  }

  const tickets = await Promise.all(ticketsInOrder.map(async (t, i) => ({
    ticket_code: t.ticket_code,
    buyer_name: t.buyer_name,
    seq: i + 1,
    used: t.used,
    used_at: t.used_at,
    qr_data_url: await QRCode.toDataURL(t.ticket_code, { width: 480, margin: 2 }),
  })));

  res.json({
    order_id: req.params.order_id,
    event_label: db.ticket_config.event_label,
    venue: db.ticket_config.venue,
    quantity: tickets.length,
    tickets,
  });
});

// ---------- Endpoint admin (butuh login) ----------

// GET /api/tickets — daftar semua tiket, buat Panel Admin.
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const { status, q } = req.query;
  let rows = [...db.tickets];
  if (status) rows = rows.filter((t) => t.status === status);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((t) =>
      t.buyer_name.toLowerCase().includes(needle) ||
      t.buyer_phone.includes(needle) ||
      t.ticket_code.toLowerCase().includes(needle) ||
      t.order_id.toLowerCase().includes(needle)
    );
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(rows);
});

// GET /api/tickets/export/xlsx — unduh rekap penjualan tiket sbg Excel.
router.get('/export/xlsx', requireAuth, requireAdmin, async (req, res) => {
  if (db.tickets.length === 0) {
    return res.status(404).json({ message: 'Belum ada data tiket untuk diunduh' });
  }
  const XLSX = await import('xlsx');
  const rows = [...db.tickets]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((t) => ({
      'Waktu Beli': t.created_at,
      'Order ID': t.order_id,
      'Kode Tiket': t.ticket_code,
      'Nama Pembeli': t.buyer_name,
      'No. WhatsApp': t.buyer_phone,
      'Harga': t.amount,
      'Status': t.status,
      'Metode Bayar': t.payment_type || '',
      'Waktu Bayar': t.paid_at || '',
      'Sudah Discan Masuk?': t.used ? 'Ya' : 'Belum',
      'Waktu Scan': t.used_at || '',
    }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Tiket');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="dekancup-tiket-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buffer);
});

// POST /api/tickets/scan — panitia di pintu masuk scan QR / ketik kode manual.
router.post('/scan', requireAuth, requireAdmin, (req, res) => {
  const code = (req.body.ticket_code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ valid: false, message: 'Kode tiket kosong' });

  const ticket = db.tickets.find((t) => t.ticket_code === code);
  if (!ticket) {
    return res.status(404).json({ valid: false, message: 'Tiket tidak ditemukan — kode salah atau palsu' });
  }
  if (ticket.status !== 'paid') {
    return res.status(400).json({ valid: false, message: `Tiket ini belum lunas (status: ${ticket.status})` });
  }
  if (ticket.used) {
    return res.status(409).json({
      valid: false,
      already_used: true,
      message: `Tiket ini SUDAH PERNAH discan sebelumnya pada ${ticket.used_at}`,
      buyer_name: ticket.buyer_name,
      used_at: ticket.used_at,
    });
  }

  ticket.used = true;
  ticket.used_at = nowStr();
  ticket.used_by = req.user.id;
  ticket.updated_at = nowStr();
  save();

  req.app.get('io').emit('ticket_updated');

  res.json({ valid: true, message: 'Tiket sah — silakan masuk!', buyer_name: ticket.buyer_name, ticket_code: ticket.ticket_code });
});

// GET /api/tickets/:code — publik, halaman tiket (QR) yang di-screenshot
// penonton. QR di-generate on-the-fly (bukan disimpan di db) supaya file
// database tidak membengkak oleh gambar base64.
// SENGAJA diletakkan PALING BAWAH (setelah semua route spesifik lain
// seperti /export/xlsx, /scan, /config) — ":code" cocok dengan path satu
// segmen apa pun, jadi kalau ditaruh di atas route spesifik yang juga satu
// segmen, ia bisa "mencuri" request yang harusnya ke route lain.
router.get('/:code', async (req, res) => {
  const ticket = db.tickets.find((t) => t.ticket_code === req.params.code.toUpperCase());
  if (!ticket) return res.status(404).json({ message: 'Tiket tidak ditemukan' });
  if (ticket.status !== 'paid') {
    return res.status(403).json({ message: 'Tiket ini belum lunas atau pembayarannya gagal', status: ticket.status });
  }

  const qr_data_url = await QRCode.toDataURL(ticket.ticket_code, { width: 480, margin: 2 });

  res.json({
    ticket_code: ticket.ticket_code,
    buyer_name: ticket.buyer_name,
    event_label: db.ticket_config.event_label,
    venue: db.ticket_config.venue,
    used: ticket.used,
    used_at: ticket.used_at,
    qr_data_url,
  });
});

export default router;
