import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

let cachedFirebaseApiKey: string | null = null;

function getFirebaseWebApiKey(): string {
  if (cachedFirebaseApiKey) return cachedFirebaseApiKey;
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { apiKey?: string };
    cachedFirebaseApiKey = parsed.apiKey || '';
  } catch {
    cachedFirebaseApiKey = '';
  }
  return cachedFirebaseApiKey;
}

function getAllowedAdminEmails(): Set<string> {
  const configured = process.env.ADMIN_EMAILS || 'sovereign.empirex@gmail.com';
  return new Set(
    configured
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export interface AuthenticatedAdmin {
  uid: string;
  email: string;
  displayName?: string;
}

export type AdminRequest = Request & { adminUser?: AuthenticatedAdmin };

const verifiedTokenCache = new Map<string, { admin: AuthenticatedAdmin; expiresAt: number }>();

export function hashIp(ip: string | undefined): string {
  return createHash('sha256')
    .update(ip || 'unknown')
    .digest('hex')
    .slice(0, 16);
}

export async function verifyFirebaseAdminToken(idToken: string): Promise<AuthenticatedAdmin | null> {
  const tokenHash = createHash('sha256').update(idToken).digest('hex');
  const cached = verifiedTokenCache.get(tokenHash);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.admin;
  }

  const apiKey = getFirebaseWebApiKey();
  if (!apiKey) return null;

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
      }>;
    };

    const user = data.users?.[0];
    if (!user?.localId || !user.email || !user.emailVerified) {
      return null;
    }

    const allowed = getAllowedAdminEmails();
    if (!allowed.has(user.email.toLowerCase())) {
      return null;
    }

    const admin: AuthenticatedAdmin = {
      uid: user.localId,
      email: user.email,
      displayName: user.displayName,
    };

    verifiedTokenCache.set(tokenHash, {
      admin,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return admin;
  } catch {
    return null;
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match?.[1]) {
    res.status(401).json({
      success: false,
      error: {
        code: 'ADMIN_AUTH_REQUIRED',
        message: 'Sign in with an authorized administrator Google account to access this console.',
      },
    });
    return;
  }

  const admin = await verifyFirebaseAdminToken(match[1]);
  if (!admin) {
    res.status(403).json({
      success: false,
      error: {
        code: 'ADMIN_FORBIDDEN',
        message: 'Your account is not authorized or email verification is missing for NOVA administrative access.',
      },
    });
    return;
  }

  (req as AdminRequest).adminUser = admin;
  next();
}
