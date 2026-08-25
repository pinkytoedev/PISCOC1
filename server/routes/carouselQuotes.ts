/**
 * Carousel quote endpoints.
 */

import { Router } from 'express';
import { insertCarouselQuoteSchema } from '@shared/schema';
import { storage } from '../storage';
import { asyncHandler, HttpError, parseId } from '../lib/httpError';
import { isAuthenticated } from '../middleware/auth';
import { recordActivity } from '../services/activity';

export function carouselQuotesRouter(): Router {
  const router = Router();

  router.use(isAuthenticated);

  router.get(
    '/by-carousel/:carousel',
    asyncHandler(async (req, res) => {
      res.json(await storage.getQuotesByCarousel(req.params.carousel));
    }),
  );

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await storage.getCarouselQuotes());
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const quote = await storage.getCarouselQuote(parseId(req.params.id));
      if (!quote) throw HttpError.notFound('Carousel quote not found');
      res.json(quote);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const quote = await storage.createCarouselQuote(
        insertCarouselQuoteSchema.parse(req.body),
      );

      await recordActivity({
        action: 'create',
        resource: 'carousel_quote',
        resourceId: quote.id,
        userId: req.user?.id,
        details: { carousel: quote.carousel },
      });

      res.status(201).json(quote);
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const patch = insertCarouselQuoteSchema.partial().parse(req.body);

      const quote = await storage.updateCarouselQuote(id, patch);
      if (!quote) throw HttpError.notFound('Carousel quote not found');

      await recordActivity({
        action: 'update',
        resource: 'carousel_quote',
        resourceId: id,
        userId: req.user?.id,
        details: { fields: Object.keys(patch) },
      });

      res.json(quote);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);

      if (!(await storage.deleteCarouselQuote(id))) {
        throw HttpError.notFound('Carousel quote not found');
      }

      await recordActivity({
        action: 'delete',
        resource: 'carousel_quote',
        resourceId: id,
        userId: req.user?.id,
      });

      res.status(204).send();
    }),
  );

  return router;
}
