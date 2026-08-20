/**
 * Image asset inventory endpoints.
 *
 * These are records of images already hosted elsewhere (ImgBB), created as a
 * side effect of article uploads. The routes here are for browsing and pruning
 * that inventory; uploading happens through the upload routes.
 */

import { Router } from 'express';
import { insertImageAssetSchema } from '@shared/schema';
import { storage } from '../storage';
import { asyncHandler, HttpError, parseId } from '../lib/httpError';
import { isAuthenticated } from '../middleware/auth';
import { recordActivity } from '../services/activity';

export function imageAssetsRouter(): Router {
  const router = Router();

  router.use(isAuthenticated);

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await storage.getImageAssets());
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const asset = await storage.getImageAsset(parseId(req.params.id));
      if (!asset) throw HttpError.notFound('Image asset not found');
      res.json(asset);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const asset = await storage.createImageAsset(insertImageAssetSchema.parse(req.body));

      await recordActivity({
        action: 'create',
        resource: 'image',
        resourceId: asset.id,
        userId: req.user?.id,
        details: { filename: asset.originalFilename, category: asset.category },
      });

      res.status(201).json(asset);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);

      if (!(await storage.deleteImageAsset(id))) {
        throw HttpError.notFound('Image asset not found');
      }

      await recordActivity({
        action: 'delete',
        resource: 'image',
        resourceId: id,
        userId: req.user?.id,
      });

      res.status(204).send();
    }),
  );

  return router;
}
