import jwt from 'jsonwebtoken';
import { query, isAvailable } from '../db/index.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'Server misconfigured' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check revocation list when DB is available
    if (payload.jti && await isAvailable()) {
      const { rows } = await query('SELECT 1 FROM token_blacklist WHERE jti = $1', [payload.jti]);
      if (rows.length) return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}
