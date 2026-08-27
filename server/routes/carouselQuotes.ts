/**
 * Carousel quote endpoints.
 */

import { Router } from 'express';
import { insertCarouselQuoteSchema } from '@shared/schema';
import { storage } from '../storage';
import { asyncHandler, HttpError, parseId } from '../lib/httpError';
import { isAuthenticated } from '../middleware/auth';
import { recordActivity } from '../services/activity';
import {
  deleteCarouselQuoteFromAirtable,
  syncCarouselQuoteToAirtable,
} from '../integrations/airtable/push';

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

  /**
   * Creating and saving both push to Airtable.
   *
   * The public site reads Airtable, so a quote that only reaches Postgres looks
   * saved in the CMS while the live page shows nothing (or the old text). The
   * push is best-effort — the row is stored either way — and the response
   * carries `syncedToAirtable` so the editor is told when the live site has not
   * caught up rather than being left to assume it has.
   */
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const created = await storage.createCarouselQuote(
        insertCarouselQuoteSchema.parse(req.body),
      );
      const { quote, syncedToAirtable } = await syncCarouselQuoteToAirtable(created);

      await recordActivity({
        action: 'create',
        resource: 'carousel_quote',
        resourceId: quote.id,
        userId: req.user?.id,
        details: { carousel: quote.carousel, syncedToAirtable },
      });

      res.status(201).json({ ...quote, syncedToAirtable });
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const patch = insertCarouselQuoteSchema.partial().parse(req.body);

      const updated = await storage.updateCarouselQuote(id, patch);
      if (!updated) throw HttpError.notFound('Carousel quote not found');

      const { quote, syncedToAirtable } = await syncCarouselQuoteToAirtable(updated);

      await recordActivity({
        action: 'update',
        resource: 'carousel_quote',
        resourceId: id,
        userId: req.user?.id,
        details: { fields: Object.keys(patch), syncedToAirtable },
      });

      res.json({ ...quote, syncedToAirtable });
    }),
  );

  /**
   * Deletes the quote from Airtable first, then locally.
   *
   * Airtable is the copy the public site reads, so a local-only delete left the
   * quote on the live page and the next pull re-created the row here.
   *
   * Airtable going first is deliberate: it is the only ordering where a failure
   * is still visible. The local row is then deleted regardless — an editor who
   * pressed delete should not be left with the quote still in the CMS — and the
   * response reports whether Airtable was actually cleared, so they know if the
   * live site needs a push to catch up.
   */
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);

      const quote = await storage.getCarouselQuote(id);
      if (!quote) throw HttpError.notFound('Carousel quote not found');

      const clearedInAirtable = quote.externalId
        ? await deleteCarouselQuoteFromAirtable(quote.externalId)
        : true;

      if (!(await storage.deleteCarouselQuote(id))) {
        throw HttpError.notFound('Carousel quote not found');
      }

      await recordActivity({
        action: 'delete',
        resource: 'carousel_quote',
        resourceId: id,
        userId: req.user?.id,
        details: { externalId: quote.externalId ?? undefined, clearedInAirtable },
      });

      // The quote is gone from the CMS either way; the flag tells the editor
      // whether the live site will still be showing it.
      res.json({ id, clearedInAirtable });
    }),
  );

  return router;
}
