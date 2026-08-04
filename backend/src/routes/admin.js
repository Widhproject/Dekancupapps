import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Export seluruh data (HIMA, atlet, jadwal, klasemen, konfigurasi event) sebagai
// satu file JSON yang bisa diunduh — dipakai sebagai backup manual. Password admin
// SENGAJA tidak pernah ikut ter-export, walau yang mengunduh adalah admin sendiri.
router.get('/export', requireAuth, requireAdmin, (req, res) => {
  const usersSafe = db.users.map(({ password_hash, ...rest }) => rest);

  const exportPayload = {
    exported_at: new Date().toISOString(),
    himas: db.himas,
    athletes: db.athletes,
    matches: db.matches,
    match_events: db.match_events,
    standings: db.standings,
    event_config: db.event_config,
    users: usersSafe,
  };

  const filename = `dekancup-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(exportPayload, null, 2));
});

export default router;
