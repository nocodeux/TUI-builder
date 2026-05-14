import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { query, isAvailable } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sign(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || process.env.CORS_ORIGINS?.split(',')[0] || 'http://localhost:3001').trim();
}

// In-memory OAuth state store (10-min TTL, cleared after use)
const oauthStates = new Map();
function storeState(state, data) {
  oauthStates.set(state, { ...data, exp: Date.now() + 10 * 60_000 });
}
function consumeState(state) {
  const d = oauthStates.get(state);
  if (!d || d.exp < Date.now()) { oauthStates.delete(state); return null; }
  oauthStates.delete(state);
  return d;
}

// PKCE helpers
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function pkce() {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function upsertUser({ email, displayName, avatarUrl, xId, xHandle, googleId, role = 'user' }) {
  const existing = await query(
    'SELECT id FROM users WHERE email = $1 OR (x_id IS NOT NULL AND x_id = $2) OR (google_id IS NOT NULL AND google_id = $3)',
    [email, xId || null, googleId || null]
  );
  if (existing.rows.length) {
    const id = existing.rows[0].id;
    await query(
      `UPDATE users SET
         display_name = COALESCE($2, display_name),
         avatar_url   = COALESCE($3, avatar_url),
         x_id         = COALESCE($4, x_id),
         x_handle     = COALESCE($5, x_handle),
         google_id    = COALESCE($6, google_id),
         last_login   = now()
       WHERE id = $1`,
      [id, displayName || null, avatarUrl || null, xId || null, xHandle || null, googleId || null]
    );
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0];
  }
  const { rows } = await query(
    `INSERT INTO users (email, display_name, avatar_url, x_id, x_handle, google_id, role, last_login)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING *`,
    [email, displayName || null, avatarUrl || null, xId || null, xHandle || null, googleId || null, role]
  );
  return rows[0];
}

function userToken(user) {
  return sign({ userId: user.id, email: user.email, role: user.role, displayName: user.display_name });
}

function userPublic(user) {
  return { userId: user.id, email: user.email, role: user.role, displayName: user.display_name, avatarUrl: user.avatar_url, xHandle: user.x_handle };
}

// ─── Register ────────────────────────────────────────────────────────────────

authRouter.post('/register', async (req, res) => {
  if (!await isAvailable()) {
    return res.status(503).json({ error: 'Registration requires a database — set DATABASE_URL to enable.' });
  }
  const { email, password, displayName } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, 'user') RETURNING *`,
    [email, password_hash, displayName || email.split('@')[0]]
  );
  const user = rows[0];
  res.json({ token: userToken(user), ...userPublic(user) });
});

// ─── Login ────────────────────────────────────────────────────────────────────

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'JWT_SECRET not configured' });

  // DB path (multi-user mode)
  if (await isAvailable()) {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (user?.password_hash && await bcrypt.compare(password, user.password_hash)) {
      await query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);
      return res.json({ token: userToken(user), ...userPublic(user) });
    }
    // If user exists but no password_hash, they registered via OAuth
    if (user && !user.password_hash) {
      return res.status(401).json({ error: 'This account uses social login — use X or Google to sign in' });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Fallback: single-user env vars (no DB)
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    return res.json({ token: sign({ email, role: 'admin' }), email, role: 'admin' });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

// ─── Me ───────────────────────────────────────────────────────────────────────

authRouter.get('/me', requireAuth, async (req, res) => {
  if (req.user.userId && await isAvailable()) {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (rows.length) return res.json(userPublic(rows[0]));
  }
  res.json(req.user);
});

// ─── Logout ───────────────────────────────────────────────────────────────────

authRouter.post('/logout', (_req, res) => res.json({ ok: true }));

// ─── X (Twitter) OAuth2 — PKCE ────────────────────────────────────────────────

authRouter.get('/x', (req, res) => {
  if (!process.env.X_CLIENT_ID) return res.status(501).json({ error: 'X OAuth not configured — set X_CLIENT_ID and X_CLIENT_SECRET' });
  const state = base64url(randomBytes(16));
  const { verifier, challenge } = pkce();
  storeState(state, { verifier });
  const callback = process.env.X_CALLBACK_URL || `${frontendUrl()}/api/auth/x/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: callback,
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  res.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
});

authRouter.get('/x/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${frontendUrl()}/#error=${encodeURIComponent(error)}`);

  const stored = consumeState(state);
  if (!stored) return res.redirect(`${frontendUrl()}/#error=invalid_state`);

  try {
    const callback = process.env.X_CALLBACK_URL || `${frontendUrl()}/api/auth/x/callback`;
    const basicAuth = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callback, client_id: process.env.X_CLIENT_ID, code_verifier: stored.verifier }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'Token exchange failed');

    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const { data: xUser } = await userRes.json();

    const user = await upsertUser({ email: `${xUser.username}@x.tuify`, displayName: xUser.name, avatarUrl: xUser.profile_image_url, xId: xUser.id, xHandle: xUser.username });
    res.redirect(`${frontendUrl()}/#token=${userToken(user)}`);
  } catch (err) {
    console.error('[auth] X callback error:', err.message);
    res.redirect(`${frontendUrl()}/#error=${encodeURIComponent(err.message)}`);
  }
});

// ─── Google OAuth2 ────────────────────────────────────────────────────────────

authRouter.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ error: 'Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' });
  const state = base64url(randomBytes(16));
  storeState(state, {});
  const callback = process.env.GOOGLE_CALLBACK_URL || `${frontendUrl()}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: callback,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${frontendUrl()}/#error=${encodeURIComponent(error)}`);

  if (!consumeState(state)) return res.redirect(`${frontendUrl()}/#error=invalid_state`);

  try {
    const callback = process.env.GOOGLE_CALLBACK_URL || `${frontendUrl()}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: callback, grant_type: 'authorization_code' }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'Token exchange failed');

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const gUser = await infoRes.json();

    const user = await upsertUser({ email: gUser.email, displayName: gUser.name, avatarUrl: gUser.picture, googleId: gUser.sub });
    res.redirect(`${frontendUrl()}/#token=${userToken(user)}`);
  } catch (err) {
    console.error('[auth] Google callback error:', err.message);
    res.redirect(`${frontendUrl()}/#error=${encodeURIComponent(err.message)}`);
  }
});
