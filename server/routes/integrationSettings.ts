/**
 * Integration settings endpoints.
 *
 * These rows hold the Airtable, ImgBB and GitHub credentials, so
 * everything here is admin-only and every response is redacted.
 */

import { Router } from 'express';
import { insertIntegrationSettingSchema } from '@shared/schema';
import { storage } from '../storage';
import { asyncHandler, HttpError, parseId } from '../lib/httpError';
import { isAdmin } from '../middleware/auth';
import { recordActivity } from '../services/activity';
import { redactIntegrationSetting } from '../lib/redact';
import { invalidateSettings } from '../services/settings';

export function integrationSettingsRouter(): Router {
  const router = Router();

  router.use(isAdmin);

  router.get(
    '/:service',
    asyncHandler(async (req, res) => {
      const settings = await storage.getIntegrationSettings(req.params.service);
      res.json(settings.map(redactIntegrationSetting));
    }),
  );

  router.get(
    '/:service/:key',
    asyncHandler(async (req, res) => {
      const setting = await storage.getIntegrationSettingByKey(
        req.params.service,
        req.params.key,
      );
      if (!setting) throw HttpError.notFound('Integration setting not found');
      res.json(redactIntegrationSetting(setting));
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const data = insertIntegrationSettingSchema.parse(req.body);
      const setting = await storage.createIntegrationSetting(data);

      // The settings cache is keyed by service; a new credential must be
      // visible to the next request rather than up to 30s later.
      invalidateSettings(setting.service);

      await recordActivity({
        action: 'create',
        resource: 'integration_setting',
        resourceId: setting.id,
        userId: req.user?.id,
        // Only which setting changed. The previous version stored the whole row
        // in `details`, which wrote the plaintext API key into the activity log.
        details: { service: setting.service, key: setting.key },
      });

      res.status(201).json(redactIntegrationSetting(setting));
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const patch = insertIntegrationSettingSchema.partial().parse(req.body);

      const setting = await storage.updateIntegrationSetting(id, patch);
      if (!setting) throw HttpError.notFound('Integration setting not found');

      invalidateSettings(setting.service);

      await recordActivity({
        action: 'update',
        resource: 'integration_setting',
        resourceId: id,
        userId: req.user?.id,
        details: { service: setting.service, key: setting.key, fields: Object.keys(patch) },
      });

      res.json(redactIntegrationSetting(setting));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);

      const existing = await storage.getIntegrationSetting(id);
      if (!existing) throw HttpError.notFound('Integration setting not found');

      if (!(await storage.deleteIntegrationSetting(id))) {
        throw HttpError.internal('Failed to delete integration setting');
      }

      invalidateSettings(existing.service);

      await recordActivity({
        action: 'delete',
        resource: 'integration_setting',
        resourceId: id,
        userId: req.user?.id,
        details: { service: existing.service, key: existing.key },
      });

      res.status(204).send();
    }),
  );

  return router;
}
