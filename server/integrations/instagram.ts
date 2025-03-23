import { Express } from "express";
import { storage } from "../storage";
import { Article } from "@shared/schema";

export function setupInstagramRoutes(app: Express) {
  // Get Instagram integration settings
  app.get("/api/instagram/settings", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const settings = await storage.getIntegrationSettings("instagram");
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch Instagram settings" });
    }
  });

  // Update Instagram integration settings
  app.post("/api/instagram/settings", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { key, value, enabled } = req.body;
      
      if (!key || !value) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      
      // Check if setting already exists
      const existingSetting = await storage.getIntegrationSettingByKey("instagram", key);
      
      if (existingSetting) {
        // Update existing setting
        const updatedSetting = await storage.updateIntegrationSetting(existingSetting.id, {
          value,
          enabled: enabled !== undefined ? enabled : existingSetting.enabled
        });
        
        return res.json(updatedSetting);
      } else {
        // Create new setting
        const newSetting = await storage.createIntegrationSetting({
          service: "instagram",
          key,
          value,
          enabled: enabled !== undefined ? enabled : true
        });
        
        return res.status(201).json(newSetting);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to update Instagram settings" });
    }
  });

  // OAuth redirect handler
  app.get("/api/instagram/auth/callback", async (req, res) => {
    try {
      const { code } = req.query;
      
      if (!code) {
        return res.status(400).json({ message: "Authorization code is required" });
      }
      
      const clientIdSetting = await storage.getIntegrationSettingByKey("instagram", "client_id");
      const clientSecretSetting = await storage.getIntegrationSettingByKey("instagram", "client_secret");
      const redirectUriSetting = await storage.getIntegrationSettingByKey("instagram", "redirect_uri");
      
      if (!clientIdSetting?.value || !clientSecretSetting?.value || !redirectUriSetting?.value) {
        return res.status(400).json({ message: "Instagram settings are not fully configured" });
      }
      
      const clientId = clientIdSetting.value;
      const clientSecret = clientSecretSetting.value;
      const redirectUri = redirectUriSetting.value;
      
      // Exchange code for access token
      const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code: code as string
        })
      });
      
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        return res.status(tokenResponse.status).json({
          message: "Failed to exchange code for token",
          error: errorText
        });
      }
      
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      const userId = tokenData.user_id;
      
      // Save the access token
      let accessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "access_token");
      
      if (accessTokenSetting) {
        await storage.updateIntegrationSetting(accessTokenSetting.id, {
          value: accessToken
        });
      } else {
        await storage.createIntegrationSetting({
          service: "instagram",
          key: "access_token",
          value: accessToken,
          enabled: true
        });
      }
      
      // Save the user ID
      let userIdSetting = await storage.getIntegrationSettingByKey("instagram", "user_id");
      
      if (userIdSetting) {
        await storage.updateIntegrationSetting(userIdSetting.id, {
          value: userId
        });
      } else {
        await storage.createIntegrationSetting({
          service: "instagram",
          key: "user_id",
          value: userId,
          enabled: true
        });
      }
      
      // Redirect to the Instagram integration page
      res.redirect("/integrations/instagram?connected=true");
    } catch (error) {
      console.error("Instagram auth callback error:", error);
      res.status(500).json({ message: "Failed to process Instagram authorization" });
    }
  });

  // Get Instagram authorization URL
  app.get("/api/instagram/auth-url", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const clientIdSetting = await storage.getIntegrationSettingByKey("instagram", "client_id");
      const redirectUriSetting = await storage.getIntegrationSettingByKey("instagram", "redirect_uri");
      
      if (!clientIdSetting?.value || !redirectUriSetting?.value) {
        return res.status(400).json({ message: "Instagram settings are not fully configured" });
      }
      
      const clientId = clientIdSetting.value;
      const redirectUri = redirectUriSetting.value;
      
      const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user_profile,user_media&response_type=code`;
      
      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate Instagram authorization URL" });
    }
  });

  // Check Instagram connection status
  app.get("/api/instagram/status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const accessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "access_token");
      const userIdSetting = await storage.getIntegrationSettingByKey("instagram", "user_id");
      
      const connected = !!(accessTokenSetting?.value && userIdSetting?.value);
      
      res.json({ connected });
    } catch (error) {
      res.status(500).json({ message: "Failed to check Instagram connection status" });
    }
  });

  // Publish an article to Instagram
  app.post("/api/instagram/publish/:articleId", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const articleId = parseInt(req.params.id);
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      // Check if we have necessary settings and article has an image
      const accessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "access_token");
      
      if (!accessTokenSetting?.value) {
        return res.status(400).json({ message: "Instagram access token not configured" });
      }
      
      if (!article.imageUrl) {
        return res.status(400).json({ message: "Article must have an image to publish to Instagram" });
      }
      
      // Note: Due to limitations of the Instagram API, a real implementation would need to:
      // 1. Download the image
      // 2. Upload it using the Facebook Graph API (Instagram API is part of Facebook's Graph API)
      // 3. Create a media container
      // 4. Publish the container
      
      // For demonstration purposes, we'll simulate a successful publish
      
      // Update the article with Instagram as source if needed
      if (!article.source.includes("instagram")) {
        await storage.updateArticle(articleId, {
          source: article.source === "manual" ? "instagram" : `${article.source},instagram`
        });
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "publish",
        resourceType: "article",
        resourceId: article.id.toString(),
        details: { 
          service: "instagram",
          article: article.title
        }
      });
      
      res.json({ 
        message: "Article published to Instagram successfully",
        note: "This is a simulated response - actual Instagram publishing requires a Facebook Developer account with Instagram Graph API permissions"
      });
    } catch (error) {
      console.error("Instagram publish error:", error);
      res.status(500).json({ message: "Failed to publish article to Instagram" });
    }
  });

  // Get Instagram recent posts (simulated)
  app.get("/api/instagram/recent-posts", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const accessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "access_token");
      
      if (!accessTokenSetting?.value) {
        return res.status(400).json({ message: "Instagram access token not configured" });
      }
      
      // Get articles that were published to Instagram
      const allArticles = await storage.getArticles();
      const instagramArticles = allArticles.filter(article => 
        article.source === "instagram" || article.source.includes("instagram")
      );
      
      // Convert to Instagram post format
      const recentPosts = instagramArticles.map((article: Article) => ({
        id: `ig_${article.id}`,
        caption: `${article.title}\n\n${article.description}\n\n${article.hashtags || ''}`,
        media_url: article.imageUrl,
        timestamp: article.publishedAt || article.createdAt,
        permalink: `https://instagram.com/p/${article.id}`, // Simulated permalink
        media_type: "IMAGE"
      }));
      
      res.json({ data: recentPosts });
    } catch (error) {
      console.error("Instagram recent posts error:", error);
      res.status(500).json({ message: "Failed to fetch Instagram recent posts" });
    }
  });
}
