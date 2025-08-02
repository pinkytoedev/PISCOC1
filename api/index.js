// Simple proxy to the built app without build dependencies
const app = await import('../dist/app.js').then(m => m.default);

export default app;