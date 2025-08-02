import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./vite";
import { setupStaticServing } from "./middleware/staticMiddleware";

const app = express();
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

// Initialize routes
await registerRoutes(app);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
});

// In production, serve static files
serveStatic(app);

export default app;