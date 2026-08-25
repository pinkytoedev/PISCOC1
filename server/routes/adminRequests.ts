/**
 * Admin request endpoints — internal tickets raised from the dashboard.
 */

import { Router } from 'express';
import { z } from 'zod';
import { insertAdminRequestSchema } from '@shared/schema';
import { storage } from '../storage';
import { asyncHandler, HttpError, parseId } from '../lib/httpError';
import { isAuthenticated } from '../middleware/auth';
import { recordActivity } from '../services/activity';

/** Only one filter applies at a time; the first present wins, as before. */
const filterSchema = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  urgency: z.string().optional(),
});

export function adminRequestsRouter(): Router {
  const router = Router();

  router.use(isAuthenticated);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { status, category, urgency } = filterSchema.parse(req.query);

      if (status) return res.json(await storage.getAdminRequestsByStatus(status));
      if (category) return res.json(await storage.getAdminRequestsByCategory(category));
      if (urgency) return res.json(await storage.getAdminRequestsByUrgency(urgency));

      res.json(await storage.getAdminRequests());
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const request = await storage.getAdminRequest(parseId(req.params.id));
      if (!request) throw HttpError.notFound('Admin request not found');
      res.json(request);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const data = insertAdminRequestSchema.parse({
        ...req.body,
        // Server-controlled fields: a caller must not be able to open a ticket
        // that is already closed or attributed to someone else.
        status: 'open',
        createdBy: req.user?.username ?? 'web',
        createdAt: new Date(),
      });

      const request = await storage.createAdminRequest(data);

      await recordActivity({
        action: 'create',
        resource: 'admin_request',
        resourceId: request.id,
        userId: req.user?.id,
        details: { title: request.title, category: request.category, urgency: request.urgency },
      });

      res.status(201).json(request);
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);

      const current = await storage.getAdminRequest(id);
      if (!current) throw HttpError.notFound('Admin request not found');

      const patch = insertAdminRequestSchema.partial().parse({
        ...req.body,
        updatedAt: new Date(),
      });

      const updated = await storage.updateAdminRequest(id, patch);
      if (!updated) throw HttpError.notFound('Admin request not found');

      await recordActivity({
        action: 'update',
        resource: 'admin_request',
        resourceId: id,
        userId: req.user?.id,
        details: {
          fields: Object.keys(patch),
          previousStatus: current.status,
          status: updated.status,
        },
      });

      res.json(updated);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);

      const request = await storage.getAdminRequest(id);
      if (!request) throw HttpError.notFound('Admin request not found');

      if (!(await storage.deleteAdminRequest(id))) {
        throw HttpError.internal('Failed to delete admin request');
      }

      await recordActivity({
        action: 'delete',
        resource: 'admin_request',
        resourceId: id,
        userId: req.user?.id,
        details: { title: request.title, category: request.category },
      });

      res.status(204).send();
    }),
  );

  return router;
}
