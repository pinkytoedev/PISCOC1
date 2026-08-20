/**
 * Compatibility shim.
 *
 * The Instagram integration now lives in `./instagram/`. `server/routes.ts` and
 * `server/scheduler.ts` import `postArticleToInstagram` from this path, so it
 * stays as a re-export rather than forcing an edit to files this refactor does
 * not own.
 */

export * from './instagram/index';
