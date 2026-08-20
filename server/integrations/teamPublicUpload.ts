/**
 * Public team profile updates.
 *
 * An admin can open a link that lets team members correct their own name, role,
 * bio and photo without an account. The toggle behind it lives in integration
 * settings (`team_upload.public_link_active`) and every public route below is
 * refused while it is off.
 *
 * What changed and why:
 *
 *   - The feature gate ran *after* multer, so a 10 MB image was written to disk
 *     and only then rejected with "public upload is currently disabled" — and
 *     the cleanup for that path, like the one for a missing member, was a
 *     `existsSync`/`unlinkSync` pair repeated at each early return. On the
 *     unauthenticated route that is a disk-fill primitive: post large files at a
 *     closed link until the volume is full. The gate is now a middleware that
 *     runs before any bytes are accepted, and `cleanupUploadedFile` removes the
 *     temp file when the response finishes regardless of outcome.
 *
 *   - The hand-rolled rate limiter kept an entry per IP in a `Map` that was
 *     never pruned, so the process leaked memory for the life of the deploy.
 *     Replaced with the shared `express-rate-limit` limiters.
 *
 *   - The image was uploaded to ImgBB on trust; it is now checked against its
 *     magic bytes, and a hosting failure is reported instead of quietly
 *     returning success with the photo unchanged.
 */

import type { Express } from 'express';
import { z } from 'zod';
import type { InsertTeamMember, TeamMember } from '@shared/schema';
import { storage } from '../storage';
import { HttpError, asyncHandler, parseId } from '../lib/httpError';
import { createLogger } from '../lib/logger';
import { isAdmin } from '../middleware/auth';
import { publicApiRateLimit, uploadRateLimit } from '../middleware/rateLimit';
import { assertFileKind, cleanupUploadedFile, imageUpload } from '../middleware/upload';
import { recordActivity } from '../services/activity';
import { getSettingValue, putSetting } from '../services/settings';
import { uploadImageToImgBB } from '../utils/imgbbUploader';

const log = createLogger('upload:team-public');

const SERVICE_NAME = 'team_upload';
const SETTING_KEY = 'public_link_active';

/**
 * Roles offered to the member, mirroring the Airtable single-select in
 * server/integrations/airtable.ts.
 */
const AVAILABLE_ROLES = [
  'Special Projects',
  'Photo',
  'Dev',
  'E-Board',
  'Writer',
] as const;

/** Text a member may edit, bounded because this endpoint takes no credentials. */
const profileSchema = z.object({
  name: z.string().trim().max(200).optional(),
  role: z.string().trim().max(100).optional(),
  bio: z.string().trim().max(5000).optional(),
});

/** The subset of a member record that is safe to hand to an anonymous caller. */
function publicView(member: TeamMember) {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    // Current values, so the form can be pre-filled with what is already there.
    bio: member.bio,
    imageUrl: member.imageUrl,
  };
}

async function isPublicUploadEnabled(): Promise<boolean> {
  return (await getSettingValue(SERVICE_NAME, SETTING_KEY)) === 'true';
}

/**
 * Refuses every public route while the link is switched off.
 *
 * Deliberately the first middleware on the upload route — ahead of multer — so
 * a request that will be rejected never reaches the filesystem.
 */
const requirePublicUploadEnabled = asyncHandler(async (_req, _res, next) => {
  if (!(await isPublicUploadEnabled())) {
    throw HttpError.forbidden('Public upload is currently disabled');
  }
  next();
});

export function setupTeamPublicUploadRoutes(app: Express) {
  // Whether the public page should render at all. Readable while the feature is
  // off — that answer *is* the response.
  app.get(
    '/api/public/team-upload-status',
    publicApiRateLimit,
    asyncHandler(async (_req, res) => {
      res.json({ enabled: await isPublicUploadEnabled() });
    }),
  );

  // Roles the member can pick from (public, gated).
  app.get(
    '/api/public/team-roles',
    publicApiRateLimit,
    requirePublicUploadEnabled,
    (_req, res) => {
      res.json([...AVAILABLE_ROLES]);
    },
  );

  // Toggle the public link (admin only).
  app.post(
    '/api/public/team-upload-status',
    isAdmin,
    asyncHandler(async (req, res) => {
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

      await putSetting(SERVICE_NAME, SETTING_KEY, String(enabled));

      // Opening or closing anonymous write access to team profiles is worth an
      // audit entry.
      await recordActivity({
        userId: req.user?.id,
        action: 'update',
        resource: 'integration_setting',
        resourceId: `${SERVICE_NAME}.${SETTING_KEY}`,
        details: { enabled },
      });

      res.json({ enabled });
    }),
  );

  // The list the member picks themselves out of (public, gated).
  app.get(
    '/api/public/team-members-list',
    publicApiRateLimit,
    requirePublicUploadEnabled,
    asyncHandler(async (_req, res) => {
      const members = await storage.getTeamMembers();
      res.json(members.map(publicView));
    }),
  );

  // Apply the member's edits (public, gated).
  app.post(
    '/api/public/team-member-update',
    uploadRateLimit,
    requirePublicUploadEnabled,
    cleanupUploadedFile,
    imageUpload.single('file'),
    asyncHandler(async (req, res) => {
      const memberId = parseId(req.body?.memberId, 'member ID');
      const { name, role, bio } = profileSchema.parse(req.body);

      const member = await storage.getTeamMember(memberId);
      if (!member) throw HttpError.notFound('Team member not found');

      // A blank field means "leave it alone", which is how the form submits an
      // untouched input.
      const updates: Partial<InsertTeamMember> = {
        name: name || member.name,
        role: role || member.role,
        bio: bio || member.bio,
      };

      if (req.file) {
        await assertFileKind(req.file.path, 'image');

        const uploaded = await uploadImageToImgBB({
          path: req.file.path,
          filename: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        });

        // Previously a null result was ignored, so the member was told their
        // profile was updated while the old photo stayed in place.
        if (!uploaded) {
          throw HttpError.internal('Image hosting is unavailable; try again shortly');
        }

        updates.imageUrl = uploaded.url;
        updates.imageType = 'url';
      }

      const updated = await storage.updateTeamMember(member.id, updates);
      if (!updated) throw HttpError.internal('Failed to update team member');

      log.info('Team member updated via public link', {
        memberId: member.id,
        withImage: Boolean(req.file),
      });

      await recordActivity({
        // No userId: there is no account behind a public-link edit.
        action: 'update',
        resource: 'team_member',
        resourceId: member.id,
        details: { source: 'public-link', updatedFields: Object.keys(updates) },
      });

      res.json(publicView(updated));
    }),
  );
}
