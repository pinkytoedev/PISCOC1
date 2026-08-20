/**
 * Compatibility shim.
 *
 * `setupInstagramRoutes` moved to `./instagram/routes`. `server/routes.ts`
 * imports it from this path, so the name is re-exported here unchanged.
 */

export { setupInstagramRoutes } from './instagram/routes';
