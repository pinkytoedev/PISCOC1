import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { setupDiscordRoutes } from "./integrations/discord";
import { setupDiscordBotRoutes, setupArticleReceiveEndpoint, autoStartDiscordBot } from "./integrations/discordBot";
import { setupAirtableRoutes, deleteAirtableRecord } from "./integrations/airtable";
import { setupInstagramRoutes } from "./integrations/instagramRoutes";
import { setupImgurRoutes } from "./integrations/imgur";
import * as path from "path";
import { insertTeamMemberSchema, insertArticleSchema, insertCarouselQuoteSchema, insertImageAssetSchema, insertIntegrationSettingSchema, insertActivityLogSchema } from "@shared/schema";
import { ZodError } from "zod";

// Middleware for validating if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: Function) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

// Helper function to handle validation errors
const handleZodError = (error: ZodError) => {
  return {
    message: "Validation error",
    errors: error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message
    }))
  };
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);
  
  // Serve Privacy Policy without authentication
  app.get("/privacy", (req, res) => {
    res.sendFile(path.join(process.cwd(), "client/public/privacy.html"));
  });

  // Team member routes
  app.get("/api/team-members", async (req, res) => {
    try {
      const teamMembers = await storage.getTeamMembers();
      res.json(teamMembers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get("/api/team-members/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const teamMember = await storage.getTeamMember(id);
      
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      res.json(teamMember);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team member" });
    }
  });

  app.post("/api/team-members", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertTeamMemberSchema.parse(req.body);
      const newTeamMember = await storage.createTeamMember(validatedData);
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "create",
        resourceType: "team_member",
        resourceId: newTeamMember.id.toString(),
        details: { teamMember: newTeamMember }
      });
      
      res.status(201).json(newTeamMember);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  app.put("/api/team-members/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertTeamMemberSchema.partial().parse(req.body);
      
      const updatedTeamMember = await storage.updateTeamMember(id, validatedData);
      
      if (!updatedTeamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "update",
        resourceType: "team_member",
        resourceId: id.toString(),
        details: { teamMember: updatedTeamMember }
      });
      
      res.json(updatedTeamMember);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      res.status(500).json({ message: "Failed to update team member" });
    }
  });

  app.delete("/api/team-members/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteTeamMember(id);
      
      if (!success) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "delete",
        resourceType: "team_member",
        resourceId: id.toString(),
        details: { id }
      });
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete team member" });
    }
  });

  // Article routes
  app.get("/api/articles", async (req, res) => {
    try {
      const articles = await storage.getArticles();
      res.json(articles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch articles" });
    }
  });

  app.get("/api/articles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const article = await storage.getArticle(id);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      res.json(article);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch article" });
    }
  });

  app.post("/api/articles", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertArticleSchema.parse(req.body);
      const newArticle = await storage.createArticle(validatedData);
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "create",
        resourceType: "article",
        resourceId: newArticle.id.toString(),
        details: { article: newArticle }
      });
      
      res.status(201).json(newArticle);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      res.status(500).json({ message: "Failed to create article" });
    }
  });

  app.put("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertArticleSchema.partial().parse(req.body);
      
      const updatedArticle = await storage.updateArticle(id, validatedData);
      
      if (!updatedArticle) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "update",
        resourceType: "article",
        resourceId: id.toString(),
        details: { article: updatedArticle }
      });
      
      res.json(updatedArticle);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      res.status(500).json({ message: "Failed to update article" });
    }
  });

  app.delete("/api/articles/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Fetch article to check if it has an externalId to remove from Airtable
      const article = await storage.getArticle(id);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      // If the article has an externalId and is from Airtable, delete it from Airtable first
      if (article.externalId && article.source === 'airtable') {
        try {
          // Get Airtable settings
          const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
          const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
          const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");
          
          if (apiKeySetting?.value && baseIdSetting?.value && tableNameSetting?.value) {
            // Delete the record from Airtable using the imported function
            await deleteAirtableRecord(
              apiKeySetting.value,
              baseIdSetting.value,
              tableNameSetting.value,
              article.externalId
            );
            
            console.log(`Successfully deleted article "${article.title}" (ID: ${article.externalId}) from Airtable`);
            
            // Log the Airtable deletion activity
            await storage.createActivityLog({
              userId: req.user?.id,
              action: "delete",
              resourceType: "airtable_article",
              resourceId: article.externalId,
              details: { 
                id: article.id, 
                title: article.title,
                externalId: article.externalId
              }
            });
          }
        } catch (airtableError) {
          console.error("Failed to delete article from Airtable:", airtableError);
          // We'll still proceed with the local deletion even if Airtable deletion fails
        }
      }
      
      // Now delete from local database
      const success = await storage.deleteArticle(id);
      
      if (!success) {
        return res.status(404).json({ message: "Failed to delete article from local database" });
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "delete",
        resourceType: "article",
        resourceId: id.toString(),
        details: { id }
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting article:", error);
      res.status(500).json({ message: "Failed to delete article" });
    }
  });

  app.get("/api/articles/status/:status", async (req, res) => {
    try {
      const status = req.params.status;
      const articles = await storage.getArticlesByStatus(status);
      res.json(articles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch articles by status" });
    }
  });

  app.get("/api/articles/featured", async (req, res) => {
    try {
      const articles = await storage.getFeaturedArticles();
      res.json(articles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch featured articles" });
    }
  });

  // Carousel quote routes
  app.get("/api/carousel-quotes", async (req, res) => {
    try {
      const quotes = await storage.getCarouselQuotes();
      res.json(quotes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch carousel quotes" });
    }
  });

  app.get("/api/carousel-quotes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quote = await storage.getCarouselQuote(id);
      
      if (!quote) {
        return res.status(404).json({ message: "Carousel quote not found" });
      }
      
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch carousel quote" });
    }
  });

  app.post("/api/carousel-quotes", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertCarouselQuoteSchema.parse(req.body);
      const newQuote = await storage.createCarouselQuote(validatedData);
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "create",
        resourceType: "carousel_quote",
        resourceId: newQuote.id.toString(),
        details: { quote: newQuote }
      });
      
      res.status(201).json(newQuote);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      res.status(500).json({ message: "Failed to create carousel quote" });
    }
  });

  app.put("/api/carousel-quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertCarouselQuoteSchema.partial().parse(req.body);
      
      const updatedQuote = await storage.updateCarouselQuote(id, validatedData);
      
      if (!updatedQuote) {
        return res.status(404).json({ message: "Carousel quote not found" });
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "update",
        resourceType: "carousel_quote",
        resourceId: id.toString(),
        details: { quote: updatedQuote }
      });
      
      res.json(updatedQuote);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      res.status(500).json({ message: "Failed to update carousel quote" });
    }
  });

  app.delete("/api/carousel-quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteCarouselQuote(id);
      
      if (!success) {
        return res.status(404).json({ message: "Carousel quote not found" });
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "delete",
        resourceType: "carousel_quote",
        resourceId: id.toString(),
        details: { id }
      });
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete carousel quote" });
    }
  });

  app.get("/api/carousel-quotes/by-carousel/:carousel", async (req, res) => {
    try {
      const carousel = req.params.carousel;
      const quotes = await storage.getQuotesByCarousel(carousel);
      res.json(quotes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch quotes by carousel" });
    }
  });

  // Image asset routes
  app.get("/api/image-assets", async (req, res) => {
    try {
      const assets = await storage.getImageAssets();
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch image assets" });
    }
  });

  app.get("/api/image-assets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const asset = await storage.getImageAsset(id);
      
      if (!asset) {
        return res.status(404).json({ message: "Image asset not found" });
      }
      
      res.json(asset);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch image asset" });
    }
  });

  app.post("/api/image-assets", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertImageAssetSchema.parse(req.body);
      const newAsset = await storage.createImageAsset(validatedData);
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "create",
        resourceType: "image_asset",
        resourceId: newAsset.id.toString(),
        details: { asset: newAsset }
      });
      
      res.status(201).json(newAsset);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      res.status(500).json({ message: "Failed to create image asset" });
    }
  });

  app.delete("/api/image-assets/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteImageAsset(id);
      
      if (!success) {
        return res.status(404).json({ message: "Image asset not found" });
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "delete",
        resourceType: "image_asset",
        resourceId: id.toString(),
        details: { id }
      });
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete image asset" });
    }
  });

  // Integration settings routes
  app.get("/api/integration-settings/:service", isAuthenticated, async (req, res) => {
    try {
      const service = req.params.service;
      const settings = await storage.getIntegrationSettings(service);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch integration settings" });
    }
  });

  app.get("/api/integration-settings/:service/:key", isAuthenticated, async (req, res) => {
    try {
      const service = req.params.service;
      const key = req.params.key;
      const setting = await storage.getIntegrationSettingByKey(service, key);
      
      if (!setting) {
        return res.status(404).json({ message: "Integration setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch integration setting" });
    }
  });

  app.post("/api/integration-settings", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertIntegrationSettingSchema.parse(req.body);
      const newSetting = await storage.createIntegrationSetting(validatedData);
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "create",
        resourceType: "integration_setting",
        resourceId: newSetting.id.toString(),
        details: { setting: newSetting }
      });
      
      res.status(201).json(newSetting);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      res.status(500).json({ message: "Failed to create integration setting" });
    }
  });

  app.put("/api/integration-settings/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertIntegrationSettingSchema.partial().parse(req.body);
      
      const updatedSetting = await storage.updateIntegrationSetting(id, validatedData);
      
      if (!updatedSetting) {
        return res.status(404).json({ message: "Integration setting not found" });
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "update",
        resourceType: "integration_setting",
        resourceId: id.toString(),
        details: { setting: updatedSetting }
      });
      
      res.json(updatedSetting);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      res.status(500).json({ message: "Failed to update integration setting" });
    }
  });

  app.delete("/api/integration-settings/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteIntegrationSetting(id);
      
      if (!success) {
        return res.status(404).json({ message: "Integration setting not found" });
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "delete",
        resourceType: "integration_setting",
        resourceId: id.toString(),
        details: { id }
      });
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete integration setting" });
    }
  });

  // Activity log routes
  app.get("/api/activity-logs", isAuthenticated, async (req, res) => {
    try {
      const logs = await storage.getActivityLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // Metrics endpoints for dashboard
  app.get("/api/metrics", isAuthenticated, async (req, res) => {
    try {
      const allArticles = await storage.getArticles();
      const pendingArticles = await storage.getArticlesByStatus("pending");
      
      // Published today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const publishedToday = allArticles.filter(article => {
        if (!article.publishedAt) return false;
        const publishDate = new Date(article.publishedAt);
        return publishDate >= today;
      });
      
      // Calculate growth (simple placeholder)
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const articlesLastMonth = allArticles.filter(article => {
        if (!article.createdAt) return false;
        const createDate = new Date(article.createdAt);
        return createDate < today && createDate >= lastMonth;
      });
      
      const totalArticles = allArticles.length;
      const articleGrowth = articlesLastMonth.length > 0
        ? Math.round((publishedToday.length / articlesLastMonth.length) * 100)
        : 0;
      
      const metrics = {
        totalArticles,
        pendingArticles: pendingArticles.length,
        publishedToday: publishedToday.length,
        articleGrowth: `${articleGrowth}%`
      };
      
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // Set up integration-specific routes
  setupDiscordRoutes(app);
  setupDiscordBotRoutes(app);
  setupArticleReceiveEndpoint(app);
  setupAirtableRoutes(app);
  setupInstagramRoutes(app);
  setupImgurRoutes(app);
  
  // Auto-start Discord bot if settings are available
  autoStartDiscordBot();

  const httpServer = createServer(app);
  return httpServer;
}
