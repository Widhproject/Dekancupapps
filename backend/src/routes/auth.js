import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { db, save, nowStr } from '../db.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password wajib diisi' });
  }

  const user = db.users.find((u) => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Email atau password salah' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role, sport_scope: user.sport_scope ?? null },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, email: user.email, sport_scope: user.sport_scope ?? null },
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ---- Kelola akun admin (super_admin saja) ----
// Dipakai untuk fitur "admin per-cabor": super_admin bisa membuatkan akun admin
// yang aksesnya dibatasi cuma ke satu cabang olahraga (mis. admin futsal tidak
// bisa keliru mengubah skor pertandingan basket).

router.get('/admins', requireAuth, requireSuperAdmin, (req, res) => {
  const admins = db.users
    .map(({ password_hash, ...rest }) => rest)
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(admins);
});

router.post('/admins', requireAuth, requireSuperAdmin, (req, res) => {
  const { name, email, password, sport_scope } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Nama, email, dan password wajib diisi' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password minimal 6 karakter' });
  }
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ message: 'Email sudah dipakai akun lain' });
  }

  const user = {
    id: uuid(),
    name,
    email,
    password_hash: bcrypt.hashSync(password, 10),
    role: 'admin',
    sport_scope: sport_scope || null, // null = boleh kelola semua cabor
    created_at: nowStr(),
  };
  db.users.push(user);
  save();

  const { password_hash, ...safeUser } = user;
  res.status(201).json(safeUser);
});

router.delete('/admins/:id', requireAuth, requireSuperAdmin, (req, res) => {
  const target = db.users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ message: 'Akun tidak ditemukan' });
  if (target.role === 'super_admin') {
    return res.status(400).json({ message: 'Tidak bisa menghapus akun super admin' });
  }

  db.users = db.users.filter((u) => u.id !== req.params.id);
  save();
  res.json({ message: 'Akun admin dihapus' });
});

export default router;
