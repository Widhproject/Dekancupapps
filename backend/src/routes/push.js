import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, save, nowStr } from '../db.js';
import { pushEnabled, VAPID_PUBLIC_KEY } from '../lib/push.js';

const router = Router();

// Frontend butuh public key ini untuk mendaftarkan langganan push di browser.
router.get('/vapid-public-key', (req, res) => {
  res.json({ enabled: pushEnabled, publicKey: VAPID_PUBLIC_KEY });
});

// Dipanggil saat penonton klik "🔔 Notify Me" di halaman profil HIMA.
// Satu subscription (device/browser) bisa mengikuti beberapa HIMA sekaligus —
// endpoint push browser dipakai sebagai kunci unik supaya klik ulang tidak
// membuat entri duplikat.
router.post('/subscribe', (req, res) => {
  const { subscription, hima_id } = req.body || {};
  if (!subscription?.endpoint || !hima_id) {
    return res.status(400).json({ message: 'Data langganan tidak lengkap' });
  }
  const hima = db.himas.find((h) => h.id === hima_id);
  if (!hima) return res.status(404).json({ message: 'HIMA tidak ditemukan' });

  let existing = db.push_subscriptions.find((s) => s.subscription.endpoint === subscription.endpoint);
  if (existing) {
    if (!existing.followed_hima_ids.includes(hima_id)) existing.followed_hima_ids.push(hima_id);
    existing.subscription = subscription; // keys bisa saja diperbarui browser, simpan versi terbaru
  } else {
    existing = {
      id: uuid(),
      subscription,
      followed_hima_ids: [hima_id],
      created_at: nowStr(),
    };
    db.push_subscriptions.push(existing);
  }
  save();

  res.status(201).json({ message: `Notifikasi untuk ${hima.code} diaktifkan` });
});

// Berhenti ikuti satu HIMA saja (langganan device-nya tetap ada kalau masih
// mengikuti HIMA lain).
router.post('/unsubscribe', (req, res) => {
  const { endpoint, hima_id } = req.body || {};
  if (!endpoint || !hima_id) {
    return res.status(400).json({ message: 'Data tidak lengkap' });
  }

  const sub = db.push_subscriptions.find((s) => s.subscription.endpoint === endpoint);
  if (!sub) return res.json({ message: 'Sudah tidak berlangganan' });

  sub.followed_hima_ids = sub.followed_hima_ids.filter((id) => id !== hima_id);
  if (sub.followed_hima_ids.length === 0) {
    db.push_subscriptions = db.push_subscriptions.filter((s) => s.id !== sub.id);
  }
  save();

  res.json({ message: 'Berhenti mengikuti notifikasi HIMA ini' });
});

export default router;
