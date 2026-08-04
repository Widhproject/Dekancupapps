import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Token tidak valid atau kedaluwarsa' });
  }
}

export function requireAdmin(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Akses hanya untuk admin' });
  }
  next();
}

// Beberapa aksi (kelola akun admin, hapus akun) cuma boleh dilakukan super_admin,
// bukan admin biasa yang scope-nya dibatasi ke satu cabor.
export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Akses hanya untuk super admin' });
  }
  next();
}

// Cek apakah admin yang login boleh mengelola pertandingan cabor tertentu.
// - super_admin: selalu boleh, semua cabor.
// - admin dengan sport_scope kosong/null: boleh semua cabor (supaya akun admin lama
//   yang dibuat sebelum fitur ini ada tetap berfungsi seperti biasa, tidak tiba-tiba terkunci).
// - admin dengan sport_scope terisi: cuma boleh cabor yang sama persis.
export function canManageSport(user, sportType) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (!user.sport_scope) return true;
  return user.sport_scope === sportType;
}
