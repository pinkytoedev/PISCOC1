import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // Try different ports for Vite HMR WebSocket to avoid conflicts
  const tryHmrPorts = [5174, 5175, 5176, 5177, 5178, 24678, 24679];
  let hmrPort = 5174; // Default fallback

  // Find an available port for HMR
  for (const port of tryHmrPorts) {
    try {
      // Simple check if port is available
      const net = await import('net');
      const server = net.createServer();
      await new Promise<void>((resolve, reject) => {
        server.listen(port, () => {
          server.close(() => resolve());
        });
        server.on('error', reject);
      });
      hmrPort = port;
      break;
    } catch {
      // Port is in use, try next one
      continue;
    }
  }

  const serverOptions = {
    middlewareMode: true,
    hmr: {
      port: hmrPort,
    }
  };

  log(`🔥 Vite HMR WebSocket server will use port ${hmrPort}`);

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      // Additional check for malformed URLs at the Vite level
      try {
        decodeURIComponent(url);
      } catch (decodeError) {
        log(`Malformed URL in Vite handler: ${url}`, "vite");
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Malformed URL'
        });
      }

      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      // Enhanced error logging
      if (e instanceof Error) {
        log(`Vite error for URL ${url}: ${e.message}`, "vite");
        if (e.message.includes('URI malformed')) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid URL format'
          });
        }
      }
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
