/**
 * Team member endpoints, including the profile-image upload.
 */

import { Router } from 'express';
import { insertTeamMemberSchema } from '@shared/schema';
import { storage } from '../storage';
import { asyncHandler, HttpError, parseId } from '../lib/httpError';
import { isAuthenticated } from '../middleware/auth';
import { recordActivity } from '../services/activity';
import { cleanupUploadedFile, imageUpload, assertFileKind } from '../middleware/upload';
import { uploadImageToImgBB } from '../utils/imgbbUploader';

export function teamMembersRouter(): Router {
  const router = Router();

  router.use(isAuthenticated);

  router.post(
    '/upload-image',
    // Registered before "/:id" so the literal path is reachable, and cleanup is
    // installed before multer so the temp file is removed on every outcome.
    cleanupUploadedFile,
    imageUpload.single('image'),
    asyncHandler(async (req, res) => {
      if (!req.file) throw HttpError.badRequest('No file uploaded');

      await assertFileKind(req.file.path, 'image');

      const hosted = await uploadImageToImgBB({
        path: req.file.path,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });

      if (!hosted) throw HttpError.internal('Image hosting is unavailable; try again shortly');

      // The upload can be used standalone (returning a URL for a form to hold)
      // or bound to an existing member, which is what teamMemberId signals.
      const rawId = Array.isArray(req.body?.teamMemberId)
        ? req.body.teamMemberId[0]
        : req.body?.teamMemberId;

      if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
        return res.json({ imageUrl: hosted.url, imgbb: hosted, teamMember: null });
      }

      const teamMemberId = parseId(rawId, 'teamMemberId');
      const teamMember = await storage.updateTeamMember(teamMemberId, {
        imageUrl: hosted.url,
        imageType: 'url',
        imagePath: null,
      });

      if (!teamMember) throw HttpError.notFound('Team member not found');

      await recordActivity({
        action: 'update',
        resource: 'team_member',
        resourceId: teamMemberId,
        userId: req.user?.id,
        details: { updatedField: 'imageUrl' },
      });

      res.json({ imageUrl: hosted.url, imgbb: hosted, teamMember });
    }),
  );

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await storage.getTeamMembers());
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const member = await storage.getTeamMember(parseId(req.params.id));
      if (!member) throw HttpError.notFound('Team member not found');
      res.json(member);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const member = await storage.createTeamMember(insertTeamMemberSchema.parse(req.body));

      await recordActivity({
        action: 'create',
        resource: 'team_member',
        resourceId: member.id,
        userId: req.user?.id,
        details: { name: member.name, role: member.role },
      });

      res.status(201).json(member);
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const patch = insertTeamMemberSchema.partial().parse(req.body);

      const member = await storage.updateTeamMember(id, patch);
      if (!member) throw HttpError.notFound('Team member not found');

      await recordActivity({
        action: 'update',
        resource: 'team_member',
        resourceId: id,
        userId: req.user?.id,
        details: { fields: Object.keys(patch) },
      });

      res.json(member);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);

      if (!(await storage.deleteTeamMember(id))) {
        throw HttpError.notFound('Team member not found');
      }

      await recordActivity({
        action: 'delete',
        resource: 'team_member',
        resourceId: id,
        userId: req.user?.id,
      });

      res.status(204).send();
    }),
  );

  return router;
}
