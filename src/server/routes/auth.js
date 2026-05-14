import express from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Server auth not configured (JWT_SECRET missing)' });
  }

  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign(
      { email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    return res.json({ token, email, role: 'admin' });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
