import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { unlink } from "fs/promises";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { setupAirtableRoutes, deleteAirtableRecord } from "./integrations/airtable";
import { setupArticleReceiveEndpoint } from "./integrations/articleReceive";
import { setupInstagramRoutes } from "./integrations/instagramRoutes";
import { postArticleToInstagram } from "./integrations/instagram";
import { setupImgBBRoutes } from "./integrations/imgbb";
import { notifyArticlePublished, notifyArticleEdited, notifyArticleDeleted } from "./utils/webhookNotifier";
import { setupDirectUploadRoutes } from "./integrations/directUpload";
import { setupPublicUploadRoutes } from "./integrations/publicUpload";
import { setupTokenFreePublicUploadRoutes } from "./integrations/tokenFreePublicUpload";
import { setupTeamPublicUploadRoutes } from "./integrations/teamPublicUpload";
import { registerAirtableTestRoutes } from "./integrations/airtableTest";
import { getMigrationProgress } from "./utils/migrationProgress";
import { getAllApiStatuses } from "./api-status";
import { log } from "./vite";
import * as path from "path";
import { upload as teamMemberImageUpload } from "./utils/fileUpload";
import { uploadImageToImgBB } from "./utils/imgbbUploader";
import { insertTeamMemberSchema, insertArticleSchema, insertCarouselQuoteSchema, insertImageAssetSchema, insertIntegrationSettingSchema, insertActivityLogSchema, insertAdminRequestSchema } from "@shared/schema";
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
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database: !!process.env.DATABASE_URL,
      session_secret: !!process.env.SESSION_SECRET
    });
  });

  // Setup authentication routes
  setupAuth(app);

  // Set up direct upload routes
  setupDirectUploadRoutes(app);

  // Set up public upload routes
  setupPublicUploadRoutes(app);

  // Set up new token-free public upload routes
  setupTokenFreePublicUploadRoutes(app);

  // Set up team public upload routes
  setupTeamPublicUploadRoutes(app);

  // Serve Privacy Policy without authentication
  app.get("/privacy", (req, res) => {
    res.sendFile(path.join(process.cwd(), "client/public/privacy.html"));
  });

  // Config routes - provide configuration status to the frontend
  app.get("/api/config/facebook", (req, res) => {
    // Only confirm if Facebook is configured without exposing the actual App ID
    const isFacebookConfigured = !!process.env.FACEBOOK_APP_ID;
    res.json({
      status: 'success',
      configured: isFacebookConfigured,
      // For backward compatibility, providing a placeholder value
      // that will be replaced on the client side with the environment variable
      appId: isFacebookConfigured ? 'CONFIGURED' : ''
    });
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

  app.post("/api/team-members/upload-image", isAuthenticated, teamMemberImageUpload.single("image"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const filePath = req.file.path;

    try {
      const imgbbResult = await uploadImageToImgBB({
        path: req.file.path,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });

      if (!imgbbResult) {
        return res.status(500).json({ message: "Failed to upload image to ImgBB. Please verify your ImgBB configuration." });
      }

      let updatedTeamMember = null;
      const rawTeamMemberId = Array.isArray(req.body?.teamMemberId)
        ? req.body.teamMemberId[0]
        : req.body?.teamMemberId;

      if (rawTeamMemberId !== undefined && rawTeamMemberId !== null && `${rawTeamMemberId}`.trim() !== "") {
        const teamMemberId = Number(rawTeamMemberId);

        if (Number.isNaN(teamMemberId)) {
          return res.status(400).json({ message: "Invalid team member ID provided" });
        }

        const teamMember = await storage.updateTeamMember(teamMemberId, {
          imageUrl: imgbbResult.url,
          imageType: "url",
          imagePath: null,
        });

        if (!teamMember) {
          return res.status(404).json({ message: "Team member not found" });
        }

        updatedTeamMember = teamMember;

        await storage.createActivityLog({
          userId: req.user?.id,
          action: "update",
          resourceType: "team_member",
          resourceId: teamMemberId.toString(),
          details: {
            imageUrl: imgbbResult.url,
            updatedField: "imageUrl",
          },
        });
      }

      return res.json({
        imageUrl: imgbbResult.url,
        imgbb: imgbbResult,
        teamMember: updatedTeamMember,
      });
    } catch (error) {
      console.error("Error uploading team member image:", error);

      if (!res.headersSent) {
        const message = error instanceof Error ? error.message : "Failed to upload team member image";
        res.status(500).json({ message });
      }
    } finally {
      await unlink(filePath).catch(() => {});
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
      // Debug log the incoming data
      console.log("Creating article with data:", {
        title: req.body.title,
        imageUrl: req.body.imageUrl,
        imageType: req.body.imageType,
        instagramImageUrl: req.body.instagramImageUrl,
        status: req.body.status
      });

      const validatedData = insertArticleSchema.parse(req.body);
      const newArticle = await storage.createArticle(validatedData);

      // Debug log the created article
      console.log("Article created in database:", {
        id: newArticle.id,
        title: newArticle.title,
        imageUrl: newArticle.imageUrl,
        imageType: newArticle.imageType,
        instagramImageUrl: newArticle.instagramImageUrl
      });

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

      // Check if this is a status change to "published"
      const statusChangedToPublished = validatedData.status === 'published';

      // Get the existing article before updating it, if we need to check status
      let previousArticle = null;
      if (statusChangedToPublished) {
        previousArticle = await storage.getArticle(id);

        if (!previousArticle) {
          return res.status(404).json({ message: "Article not found" });
        }
      }

      // Update the article
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

      // If status was changed to "published" from a different status, trigger Instagram post
      if (statusChangedToPublished &&
        previousArticle &&
        previousArticle.status !== 'published') {

        log(`Article status changed to published, triggering Instagram post for article ID ${id}`, 'instagram');

        // Send webhook notification for newly published article
        await notifyArticlePublished(id, updatedArticle.title);

        // Post to Instagram
        const instagramResult = await postArticleToInstagram(updatedArticle);

        // Log the result of the Instagram post attempt 
        if (instagramResult.success) {
          log(`Successfully posted article to Instagram: ${updatedArticle.title}`, 'instagram');

          // Add Instagram posting result to the response
          const responseWithInstagram = {
            ...updatedArticle,
            _instagram: {
              posted: true,
              mediaId: instagramResult.mediaId
            }
          };

          return res.json(responseWithInstagram);
        } else {
          log(`Failed to post article to Instagram: ${instagramResult.error}`, 'instagram');

          // Still return the updated article but include the error information
          const responseWithInstagramError = {
            ...updatedArticle,
            _instagram: {
              posted: false,
              error: instagramResult.error
            }
          };

          return res.json(responseWithInstagramError);
        }
      }

      // Check if this is an edit to an already published article
      if (updatedArticle.status === 'published' && !statusChangedToPublished) {
        // This is an edit to an already published article
        await notifyArticleEdited(id, updatedArticle.title);
      }

      // Return the updated article (if we didn't already return with Instagram info)
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

      // Send webhook notification if the deleted article was published
      if (article.status === 'published') {
        await notifyArticleDeleted(id, article.title);
      }

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

  // Admin requests routes
  app.get("/api/admin-requests", async (req, res) => {
    try {
      // Check if we need to filter by status, category or urgency
      const { status, category, urgency } = req.query;

      let requests;

      if (status) {
        requests = await storage.getAdminRequestsByStatus(status as string);
      } else if (category) {
        requests = await storage.getAdminRequestsByCategory(category as string);
      } else if (urgency) {
        requests = await storage.getAdminRequestsByUrgency(urgency as string);
      } else {
        requests = await storage.getAdminRequests();
      }

      res.json(requests);
    } catch (error) {
      console.error("Error fetching admin requests", error);
      res.status(500).json({ message: "Failed to fetch admin requests" });
    }
  });

  app.get("/api/admin-requests/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      const request = await storage.getAdminRequest(id);

      if (!request) {
        return res.status(404).json({ message: "Admin request not found" });
      }

      res.json(request);
    } catch (error) {
      console.error(`Error fetching admin request with ID ${req.params.id}`, error);
      res.status(500).json({ message: "Failed to fetch admin request" });
    }
  });

  app.post("/api/admin-requests", isAuthenticated, async (req, res) => {
    try {
      // Use Zod for validation
      const validatedData = insertAdminRequestSchema.parse({
        ...req.body,
        status: 'open',
        createdBy: 'web',
        createdAt: new Date(),
        ...(req.user ? { userId: req.user.id } : {})
      });

      // Create admin request
      const request = await storage.createAdminRequest(validatedData);

      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id || null,
        action: 'create',
        resourceType: 'admin_request',
        resourceId: request.id.toString(),
        details: {
          title: request.title,
          category: request.category,
          urgency: request.urgency
        }
      });

      res.status(201).json(request);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      console.error("Error creating admin request", error);
      res.status(500).json({ message: "Failed to create admin request" });
    }
  });



  app.patch("/api/admin-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      // Get current admin request
      const currentRequest = await storage.getAdminRequest(id);

      if (!currentRequest) {
        return res.status(404).json({ message: "Admin request not found" });
      }

      // Validate the update data using Zod
      const validatedData = insertAdminRequestSchema.partial().parse({
        ...req.body,
        updatedAt: new Date()
      });

      // Update the request
      const updatedRequest = await storage.updateAdminRequest(id, validatedData);

      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id || null,
        action: 'update',
        resourceType: 'admin_request',
        resourceId: id.toString(),
        details: {
          changes: validatedData,
          previousStatus: currentRequest.status
        }
      });

      res.json(updatedRequest);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json(handleZodError(error));
      }
      console.error(`Error updating admin request with ID ${req.params.id}`, error);
      res.status(500).json({ message: "Failed to update admin request" });
    }
  });

  app.delete("/api/admin-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      // Get current admin request for logging
      const request = await storage.getAdminRequest(id);

      if (!request) {
        return res.status(404).json({ message: "Admin request not found" });
      }

      // Delete the request
      const deleted = await storage.deleteAdminRequest(id);

      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete admin request" });
      }

      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id || null,
        action: 'delete',
        resourceType: 'admin_request',
        resourceId: id.toString(),
        details: {
          title: request.title,
          category: request.category
        }
      });

      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting admin request with ID ${req.params.id}`, error);
      res.status(500).json({ message: "Failed to delete admin request" });
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
      const draftArticles = await storage.getArticlesByStatus("draft");

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

      // Get migration progress data
      const migrationProgress = getMigrationProgress();

      const metrics = {
        totalArticles,
        pendingArticles: pendingArticles.length,
        draftArticles: draftArticles.length,
        publishedToday: publishedToday.length,
        articleGrowth: `${articleGrowth}%`,
        migration: migrationProgress
      };

      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // Endpoint to get just migration progress
  app.get("/api/migration-progress", (req, res) => {
    try {
      // Add cache control headers to prevent caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const progress = getMigrationProgress();
      res.json(progress);
    } catch (error) {
      console.error('Error getting migration progress:', error);
      res.status(500).json({
        error: 'Failed to fetch migration progress',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // API Status endpoint
  app.get('/api/status', async (req, res) => {
    try {
      // Add cache control headers to prevent caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const apiStatuses = await getAllApiStatuses();
      res.json(apiStatuses);
    } catch (error) {
      console.error('Error fetching API statuses:', error);
      res.status(500).json({
        message: 'Failed to fetch API statuses',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Integration status endpoint for Keys page
  app.get('/api/integration-status', isAuthenticated, async (req, res) => {
    try {
      const apiStatuses = await getAllApiStatuses();

      // Transform the API status data to match what the Keys page expects
      const integrationStatuses = apiStatuses.statuses.map(status => ({
        name: status.name.toLowerCase(),
        configured: status.status === 'online' || status.status === 'unknown',
        lastChecked: status.lastChecked.toISOString(),
        error: status.message
      }));

      res.json(integrationStatuses);
    } catch (error) {
      console.error('Error fetching integration statuses:', error);
      res.status(500).json({
        message: 'Failed to fetch integration statuses',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Facebook OAuth callback route
  app.get('/auth/facebook/callback', (req, res) => {
    // This route handles OAuth redirects from Facebook
    // The Facebook SDK will handle the token exchange client-side
    // This route can be used for additional server-side processing if needed
    res.redirect('/?auth=success');
  });

  // Expose Facebook App ID to frontend
  app.get('/api/config/facebook', (req, res) => {
    const appId = process.env.FACEBOOK_APP_ID;

    if (!appId) {
      // Return a structured error response
      return res.status(503).json({
        status: 'error',
        message: 'Facebook integration is not configured',
        code: 'FB_APP_ID_MISSING'
      });
    }

    res.json({
      status: 'success',
      appId
    });
  });

  // Test webhook endpoint for debugging
  app.post("/api/test-webhook", isAuthenticated, async (req, res) => {
    try {
      const { articleId = 999, action = "published", title = "Test Article" } = req.body;

      log(`🧪 Manual webhook test triggered by user ${req.user?.username}`, "webhook");

      if (action === "published") {
        await notifyArticlePublished(articleId, title);
      } else if (action === "edited") {
        await notifyArticleEdited(articleId, title);
      } else if (action === "deleted") {
        await notifyArticleDeleted(articleId, title);
      } else {
        return res.status(400).json({ message: "Invalid action. Use 'published', 'edited', or 'deleted'" });
      }

      res.json({
        message: "Test webhook sent",
        details: { articleId, action, title }
      });
    } catch (error) {
      log(`❌ Test webhook failed: ${String(error)}`, "webhook");
      res.status(500).json({ message: "Test webhook failed", error: String(error) });
    }
  });

  setupArticleReceiveEndpoint(app);
  setupAirtableRoutes(app);
  setupInstagramRoutes(app);

  setupImgBBRoutes(app);
  registerAirtableTestRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}