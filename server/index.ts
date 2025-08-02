import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupStaticServing } from "./middleware/staticMiddleware";
import { setupHTTPS } from "./https-dev";

const app = express();
export { app };
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Set up enhanced static file serving with proper headers
setupStaticServing(app);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Try different ports with fallback system
  // Start with 3000, then try 3001, 3002, etc. if ports are occupied
  const tryPorts = [3000, 3001, 3002, 3003, 3004, 5000, 5001, 5002];
  let serverStarted = false;

  const startServer = (portIndex: number = 0): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (portIndex >= tryPorts.length) {
        reject(new Error('No available ports found'));
        return;
      }

      const port = process.env.PORT ? parseInt(process.env.PORT) : tryPorts[portIndex];

      const serverInstance = server.listen({
        port,
        host: "0.0.0.0",
        reusePort: false,
      }, () => {
        serverStarted = true;
        log(`🚀 Server successfully started on port ${port}`);
        log(`📱 Access your app at: http://localhost:${port}`);
        resolve();
      });

      serverInstance.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          log(`Port ${port} is already in use, trying next port...`);
          startServer(portIndex + 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  };

  try {
    await startServer();

    // Also setup HTTPS for Facebook SDK in development
    if (app.get("env") === "development") {
      setupHTTPS(app, 3001);
    }
  } catch (error) {
    log('❌ Failed to start server on any available port');
    process.exit(1);
  }
})();
