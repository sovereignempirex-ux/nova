import { Router } from 'express';
import { hashIp } from '../middleware/adminAuth.ts';
import { checkRateLimit } from '../gateway/reliability.ts';
import { createTemporarySignedUrl, getSupabaseStatus } from '../services/supabaseService.ts';

export const supabaseRouter = Router();

supabaseRouter.get('/status', async (_req, res) => {
  const status = await getSupabaseStatus();
  res.json(status);
});

supabaseRouter.get('/signed-url', async (req, res) => {
  const rl = checkRateLimit(`supa_sign:${hashIp(req.ip)}`, 60, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    res.status(429).json({ error: `Rate limit exceeded. Retry after ${rl.retryAfterSec}s.` });
    return;
  }

  const storagePath = typeof req.query.path === 'string' ? req.query.path : '';
  const expiresIn = Number(req.query.expiresIn) || 3600;
  if (!storagePath) {
    res.status(400).json({ error: 'path query parameter is required.' });
    return;
  }

  try {
    const signedUrl = await createTemporarySignedUrl(storagePath, expiresIn);
    res.json({ signedUrl, expiresIn });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to sign URL.' });
  }
});
