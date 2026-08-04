import webpush from 'web-push';
import { db, save } from '../db.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@dekancup.fst.ac.id';

export const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn(
    '⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY belum di-set — fitur notifikasi "Notify Me" dimatikan sampai env variable itu diisi.'
  );
}

export { VAPID_PUBLIC_KEY };

// Kirim notifikasi ke semua device yang mengikuti (follow) satu HIMA tertentu.
// Kalau ternyata sudah tidak valid lagi (browser di-uninstall, user clear data, dll —
// web-push akan melempar status 404/410), langganan itu otomatis dibuang dari database
// supaya tidak terus-menerus dicoba kirim ke alamat yang sudah mati.
export async function notifyHimaFollowers(himaId, { title, body, url }) {
  if (!pushEnabled) return;

  const subscribers = db.push_subscriptions.filter((s) => s.followed_hima_ids.includes(himaId));
  if (subscribers.length === 0) return;

  const payload = JSON.stringify({ title, body, url: url || '/' });
  let changed = false;

  await Promise.all(
    subscribers.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.push_subscriptions = db.push_subscriptions.filter((s) => s.id !== sub.id);
          changed = true;
        } else {
          console.warn('Gagal kirim push notification:', err.message);
        }
      }
    })
  );

  if (changed) save();
}
