/**
 * Contributor upload links.
 *
 * A link is a random secret in a URL. It is the whole credential, so:
 *
 *   - only its SHA-256 is stored; the plaintext is returned once, at creation
 *   - it is scoped to a single article and an explicit set of asset types
 *   - it expires, and can be revoked
 *
 * Hashing is a plain SHA-256 rather than a slow KDF on purpose. The secret is
 * 256 bits of `randomBytes`, so there is no guessable input to protect against
 * — and lookup happens on every upload request, where a slow hash would be a
 * denial-of-service surface of its own.
 */

import crypto from 'crypto';
import type { UploadToken } from '@shared/schema';
import { storage } from '../storage';
import { env } from '../lib/env';

/** Asset types a link may authorize. */
export type UploadAssetType = 'image' | 'instagram-image' | 'html-zip';

export interface IssuedToken {
  /** Plaintext secret — returned once and never persisted. */
  token: string;
  /** Ready-to-send contributor URL. */
  url: string;
  expiresAt: Date;
  uploadTypes: UploadAssetType[];
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Resolves the origin used to build contributor links.
 * Falls back through explicit config before guessing, so a link never points at
 * an attacker-supplied Host header.
 */
function publicOrigin(): string {
  if (env.baseUrl) return env.baseUrl.replace(/\/$/, '');
  if (env.publicDomain) return `https://${env.publicDomain}`;
  return `http://localhost:${env.port ?? 3000}`;
}

export function buildUploadUrl(token: string): string {
  return `${publicOrigin()}/upload/${token}`;
}

export interface CreateTokenInput {
  articleId: number;
  uploadTypes: UploadAssetType[];
  createdById?: number;
  name?: string;
  notes?: string;
  /** Overrides the default lifetime. */
  ttlDays?: number;
  /**
   * 0 (the default) allows unlimited uploads until expiry, which is what makes
   * a single link usable for a whole multi-asset submission.
   */
  maxUses?: number;
}

export async function createUploadToken(input: CreateTokenInput): Promise<IssuedToken> {
  const token = crypto.randomBytes(32).toString('hex');
  const ttlDays = input.ttlDays ?? env.uploadTokenTtlDays;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await storage.createUploadToken({
    tokenHash: hashToken(token),
    articleId: input.articleId,
    uploadTypes: input.uploadTypes,
    createdById: input.createdById,
    expiresAt,
    maxUses: input.maxUses ?? 0,
    active: true,
    name: input.name,
    notes: input.notes,
  } as Parameters<typeof storage.createUploadToken>[0]);

  return { token, url: buildUploadUrl(token), expiresAt, uploadTypes: input.uploadTypes };
}

export type TokenRejection =
  | 'not-found'
  | 'inactive'
  | 'expired'
  | 'exhausted'
  | 'type-not-allowed';

export type TokenValidation =
  | { ok: true; token: UploadToken; uploadTypes: UploadAssetType[] }
  | { ok: false; reason: TokenRejection };

/**
 * Validates a plaintext token.
 *
 * `assetType` is optional so the contributor page can look up a link's metadata
 * before knowing which file the user will pick.
 */
export async function validateToken(
  plaintext: string,
  assetType?: UploadAssetType,
): Promise<TokenValidation> {
  const record = await storage.getUploadTokenByHash(hashToken(plaintext));
  if (!record) return { ok: false, reason: 'not-found' };
  if (!record.active) return { ok: false, reason: 'inactive' };

  if (record.expiresAt.getTime() <= Date.now()) {
    // Flip the stored flag so listings reflect reality without a sweep job.
    await storage.updateUploadToken(record.id, { active: false });
    return { ok: false, reason: 'expired' };
  }

  const maxUses = record.maxUses ?? 0;
  const uses = record.uses ?? 0;
  if (maxUses > 0 && uses >= maxUses) {
    return { ok: false, reason: 'exhausted' };
  }

  const uploadTypes = (Array.isArray(record.uploadTypes) ? record.uploadTypes : []) as UploadAssetType[];
  if (assetType && !uploadTypes.includes(assetType)) {
    return { ok: false, reason: 'type-not-allowed' };
  }

  return { ok: true, token: record, uploadTypes };
}

/** Human-readable reason, safe to show a contributor. */
export function rejectionMessage(reason: TokenRejection): string {
  switch (reason) {
    case 'not-found':
      return 'This upload link is not valid.';
    case 'inactive':
      return 'This upload link has been revoked.';
    case 'expired':
      return 'This upload link has expired. Ask for a new one.';
    case 'exhausted':
      return 'This upload link has already been used.';
    case 'type-not-allowed':
      return 'This upload link does not accept that kind of file.';
  }
}

/** Deactivates every link for an article. */
export async function revokeArticleTokens(articleId: number): Promise<void> {
  const tokens = await storage.getUploadTokensByArticle(articleId);
  await Promise.all(
    tokens
      .filter((token) => token.active)
      .map((token) => storage.updateUploadToken(token.id, { active: false })),
  );
}
