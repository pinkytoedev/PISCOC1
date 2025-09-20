import type { Express, Request, Response } from "express";

/**
 * Registers a minimal article receive endpoint to satisfy runtime references.
 * Extend this to perform actual processing if needed.
 */
export function setupArticleReceiveEndpoint(app: Express): void {
  app.post("/api/articles/receive", (req: Request, res: Response) => {
    res.status(200).json({ status: "received" });
  });
}


