import { env } from "./lib/env";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import type { Server } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupStaticServing } from "./middleware/staticMiddleware";
import { setupHTTPS } from "./https-dev";
import { startPublishScheduler, stopPublishScheduler } from "./scheduler";
import { issueCsrfToken, verifyCsrfToken } from "./middleware/csrf";
import { HttpError } from "./lib/httpError";
import { ZodError } from "zod";
import { closeDatabase } from "./db";

const app = express();
export { app };

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(cookieParser());

// CSRF: hand out the cookie on every request, require the matching header on
// anything that changes state.
app.use(issueCsrfToken);
app.use(verifyCsrfToken);

setupStaticServing(app);

/**
 * Request log. Deliberately records only method, path, status and duration —
 * the previous version serialized the response body, which meant password
 * hashes and integration API keys were written to the logs.
 */
app.use((req, res, next) => {
  const start = Date.now();
  const requestPath = req.path;

  res.on("finish", () => {
    if (!requestPath.startsWith("/api")) return;
    const duration = Date.now() - start;
    log(`${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`);
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Central error handler. Every route reports failures by throwing, so this is
  // the only place that decides status codes and response shape.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;

    if (err instanceof HttpError) {
      return res.status(err.status).json({
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }

    // Schema violations are the caller's fault; report the offending fields.
    if (err instanceof ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: err.errors.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    // Multer signals oversized uploads with this code rather than an HttpError.
    if (typeof err === "object" && err && (err as { code?: string }).code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "File is too large" });
    }

    const message = err instanceof Error ? err.message : String(err);

    // body-parser and other Express middleware attach a status to client-side
    // faults such as malformed JSON. Honouring it keeps those as 4xx instead of
    // reporting a caller's bad request as a server failure.
    const status = (err as { status?: number; statusCode?: number })?.status
      ?? (err as { statusCode?: number })?.statusCode;

    if (typeof status === "number" && status >= 400 && status < 500) {
      return res.status(status).json({ message });
    }

    console.error("[error]", message, err instanceof Error ? err.stack : undefined);

    // Internal details stay in the logs; the client gets a generic message.
    res.status(500).json({ message: "Internal server error" });
  });

  if (env.isDevelopment) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const listening = await startServer(server);

  if (env.isDevelopment) {
    setupHTTPS(app, 3001);
  }

  startPublishScheduler(env.scheduler.intervalMs);

  installShutdownHandlers(listening);
})().catch((error) => {
  console.error("[boot] Failed to start server:", error);
  process.exit(1);
});

/**
 * Binds the server.
 *
 * When PORT is set (Railway, Docker) that port is authoritative and a failure
 * to bind is fatal — silently listening somewhere else would make the service
 * unreachable. Only local development falls back through candidate ports.
 */
async function startServer(server: Server): Promise<Server> {
  if (env.port !== undefined) {
    await listen(server, env.port);
    log(`🚀 Server listening on port ${env.port}`);
    return server;
  }

  const candidates = [3000, 3001, 3002, 3003, 3004, 5000, 5001, 5002];

  for (const port of candidates) {
    try {
      await listen(server, port);
      log(`🚀 Server listening on port ${port}`);
      log(`📱 http://localhost:${port}`);
      return server;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
        log(`Port ${port} in use, trying the next one...`);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`No available port among ${candidates.join(", ")}`);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ port, host: "0.0.0.0" });
  });
}

/**
 * Graceful shutdown and last-resort crash handlers.
 *
 * Railway sends SIGTERM on redeploy; without this, in-flight requests are cut
 * off and the scheduler can be interrupted mid-publish.
 */
function installShutdownHandlers(server: Server) {
  let shuttingDown = false;

  const shutdown = async (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Received ${signal}, shutting down...`);

    stopPublishScheduler();

    const forceExit = setTimeout(() => {
      console.error("[shutdown] Timed out waiting for connections; exiting.");
      process.exit(exitCode || 1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      try {
        await closeDatabase();
      } catch (error) {
        console.error("[shutdown] Error closing database:", error);
      }
      clearTimeout(forceExit);
      process.exit(exitCode);
    });
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // After an uncaught exception the process is in an undefined state. Log it,
  // then exit so the platform restarts a clean instance — keeping it alive, as
  // the previous handler did, only lets the corruption spread.
  process.on("uncaughtException", (error) => {
    console.error("[process] Uncaught exception:", error);
    void shutdown("uncaughtException", 1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[process] Unhandled rejection:", reason);
    void shutdown("unhandledRejection", 1);
  });
}
