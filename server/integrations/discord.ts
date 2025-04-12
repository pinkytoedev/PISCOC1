import { Express } from "express";
import { storage } from "../storage";
import { InsertArticle } from "@shared/schema";

// Type definitions for Discord webhook data
interface DiscordWebhookData {
  content: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: {
    text: string;
    icon_url?: string;
  };
  timestamp?: string;
}

export function setupDiscordRoutes(app: Express) {
  // Get Discord integration settings
  app.get("/api/discord/settings", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const settings = await storage.getIntegrationSettings("discord");
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch Discord settings" });
    }
  });
  
  // Get all Discord webhooks
  app.get("/api/discord/webhooks", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const allSettings = await storage.getIntegrationSettings("discord");
      const webhookSettings = allSettings.filter(setting => 
        setting.key === 'webhook_url' || setting.key.startsWith('webhook_')
      );
      
      // Transform into a more usable format for the frontend
      const webhooks = webhookSettings.map(setting => {
        // For the default webhook
        if (setting.key === 'webhook_url') {
          return {
            id: 'default',
            name: 'Default Webhook',
            url: setting.value,
            enabled: setting.enabled
          };
        }
        
        // For named webhooks with IDs (webhook_123456)
        const webhookId = setting.key.replace('webhook_', '');
        // Try to find a corresponding label setting
        const labelSetting = allSettings.find(s => s.key === `webhook_label_${webhookId}`);
        
        return {
          id: webhookId,
          name: labelSetting?.value || `Webhook ${webhookId}`,
          url: setting.value,
          enabled: setting.enabled
        };
      });
      
      res.json(webhooks);
    } catch (error) {
      console.error("Error fetching Discord webhooks:", error);
      res.status(500).json({ message: "Failed to fetch Discord webhooks" });
    }
  });

  // Update Discord integration settings
  app.post("/api/discord/settings", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { key, value, enabled } = req.body;
      
      if (!key || !value) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      
      // Check if setting already exists
      const existingSetting = await storage.getIntegrationSettingByKey("discord", key);
      
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
          service: "discord",
          key,
          value,
          enabled: enabled !== undefined ? enabled : true
        });
        
        return res.status(201).json(newSetting);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to update Discord settings" });
    }
  });

  // Webhook endpoint for Discord to submit content
  app.post("/api/discord/webhook", async (req, res) => {
    try {
      // Validate the webhook secret if configured
      const webhookSecretSetting = await storage.getIntegrationSettingByKey("discord", "webhook_secret");
      
      if (webhookSecretSetting?.enabled && webhookSecretSetting.value) {
        const providedSecret = req.headers["x-discord-signature"] || req.query.secret;
        
        if (!providedSecret || providedSecret !== webhookSecretSetting.value) {
          return res.status(401).json({ message: "Invalid webhook signature" });
        }
      }
      
      const { content, embeds } = req.body;
      
      // Simple content submission
      if (typeof content === "string" && content.trim()) {
        // Parse the content to extract article information
        // This is a simple implementation - in practice, you would have a more robust parser
        const lines = content.split("\n");
        const title = lines[0]?.trim() || "Untitled Article";
        const description = lines.slice(1, 3).join("\n").trim() || "No description provided";
        const contentBody = lines.slice(3).join("\n").trim() || content;
        
        // Create a new article
        const newArticle: InsertArticle = {
          title,
          description,
          content: contentBody,
          contentFormat: "plaintext",
          imageUrl: "", // Default empty image URL
          imageType: "url",
          imagePath: null,
          featured: "no",
          publishedAt: null,
          author: "Discord User", // Default author
          photo: "",
          status: "pending", // Set status to pending for review
          source: "discord"
        };
        
        const article = await storage.createArticle(newArticle);
        
        // Log the activity
        await storage.createActivityLog({
          action: "create",
          resourceType: "article",
          resourceId: article.id.toString(),
          details: { 
            article,
            source: "discord_webhook"
          }
        });
        
        return res.status(201).json({
          message: "Article created successfully",
          article
        });
      }
      
      // Process embeds if available
      if (Array.isArray(embeds) && embeds.length > 0) {
        const embed = embeds[0];
        
        if (embed.title) {
          const newArticle: InsertArticle = {
            title: embed.title || "Untitled Article",
            description: embed.description || "No description provided",
            content: embed.description || "",
            contentFormat: "plaintext",
            imageUrl: embed.image?.url || embed.thumbnail?.url || "",
            imageType: "url",
            imagePath: null,
            featured: "no",
            publishedAt: null,
            author: embed.author?.name || "Discord User",
            photo: "",
            status: "pending",
            source: "discord"
          };
          
          const article = await storage.createArticle(newArticle);
          
          // Log the activity
          await storage.createActivityLog({
            action: "create",
            resourceType: "article",
            resourceId: article.id.toString(),
            details: { 
              article,
              source: "discord_webhook"
            }
          });
          
          return res.status(201).json({
            message: "Article created from embed",
            article
          });
        }
      }
      
      return res.status(400).json({ message: "Invalid content format" });
    } catch (error) {
      console.error("Discord webhook error:", error);
      res.status(500).json({ message: "Failed to process Discord webhook" });
    }
  });

  // Send a test message to Discord
  app.post("/api/discord/test", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const webhookUrlSetting = await storage.getIntegrationSettingByKey("discord", "webhook_url");
      
      if (!webhookUrlSetting || !webhookUrlSetting.enabled || !webhookUrlSetting.value) {
        return res.status(400).json({ message: "Discord webhook URL not configured" });
      }
      
      const webhookUrl = webhookUrlSetting.value;
      
      // Create a test message
      const message: DiscordWebhookData = {
        content: "Test message from Discord-Airtable Integration System",
        embeds: [
          {
            title: "Integration Test",
            description: "This is a test message to verify the Discord integration.",
            color: 5865242, // Discord blue color
            footer: {
              text: "Discord-Airtable Integration System"
            },
            timestamp: new Date().toISOString()
          }
        ],
        username: "Integration Bot"
      };
      
      // Send the message to Discord
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(message)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          message: "Failed to send test message to Discord",
          error: errorText
        });
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "test",
        resourceType: "integration",
        resourceId: "discord",
        details: { success: true }
      });
      
      res.json({ message: "Test message sent to Discord successfully" });
    } catch (error) {
      console.error("Discord test error:", error);
      
      // Log the failure
      if (req.user) {
        await storage.createActivityLog({
          userId: req.user.id,
          action: "test",
          resourceType: "integration",
          resourceId: "discord",
          details: { success: false, error: String(error) }
        });
      }
      
      res.status(500).json({ message: "Failed to send test message to Discord" });
    }
  });
  
  // Send a custom message to Discord
  app.post("/api/discord/send-message", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { message, username, webhookId } = req.body;
      
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      let webhookUrl;
      
      // Check if we're using a specific webhook from a setting
      if (webhookId) {
        try {
          // Special case for the default webhook
          if (webhookId === 'default') {
            const defaultWebhookSetting = await storage.getIntegrationSettingByKey("discord", "webhook_url");
            if (defaultWebhookSetting && defaultWebhookSetting.value && defaultWebhookSetting.enabled) {
              webhookUrl = defaultWebhookSetting.value;
              console.log("Using default webhook:", webhookUrl);
            }
          } else {
            // Look for a specific webhook URL in settings
            const webhookSetting = await storage.getIntegrationSettingByKey("discord", `webhook_${webhookId}`);
            if (webhookSetting && webhookSetting.value && webhookSetting.enabled) {
              webhookUrl = webhookSetting.value;
              console.log("Using specific webhook:", webhookId, webhookUrl);
            }
          }
        } catch (error) {
          console.error("Error fetching webhook setting:", error);
          // If we can't find the webhook setting, we'll fall back to the default one
        }
      }
      
      // If no specific webhook was found or requested, use the default one
      if (!webhookUrl) {
        const webhookUrlSetting = await storage.getIntegrationSettingByKey("discord", "webhook_url");
        
        if (!webhookUrlSetting || !webhookUrlSetting.enabled || !webhookUrlSetting.value) {
          return res.status(400).json({ message: "Discord webhook URL not configured" });
        }
        
        webhookUrl = webhookUrlSetting.value;
      }
      
      // Create the message payload
      const discordMessage: DiscordWebhookData = {
        content: message,
        username: username || "Website User"
      };
      
      // Send the message to Discord
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(discordMessage)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          message: "Failed to send message to Discord",
          error: errorText
        });
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "send_message",
        resourceType: "integration",
        resourceId: "discord",
        details: { 
          success: true,
          username: username,
          messageContent: message.substring(0, 100) + (message.length > 100 ? '...' : '') // Log a truncated version
        }
      });
      
      res.json({ message: "Message sent to Discord successfully" });
    } catch (error) {
      console.error("Discord message send error:", error);
      
      // Log the failure
      if (req.user) {
        await storage.createActivityLog({
          userId: req.user.id,
          action: "send_message",
          resourceType: "integration",
          resourceId: "discord",
          details: { success: false, error: String(error) }
        });
      }
      
      res.status(500).json({ message: "Failed to send message to Discord" });
    }
  });

  // Submit an article to Discord
  app.post("/api/discord/publish/:articleId", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const articleId = parseInt(req.params.articleId);
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      const webhookUrlSetting = await storage.getIntegrationSettingByKey("discord", "webhook_url");
      
      if (!webhookUrlSetting || !webhookUrlSetting.enabled || !webhookUrlSetting.value) {
        return res.status(400).json({ message: "Discord webhook URL not configured" });
      }
      
      const webhookUrl = webhookUrlSetting.value;
      
      // Create an embed for the article
      const embed: DiscordEmbed = {
        title: article.title,
        description: article.description || article.excerpt || "",
        color: 5865242, // Discord blue color
        timestamp: new Date().toISOString()
      };
      
      // Add image if available
      if (article.imageUrl) {
        embed.image = { url: article.imageUrl };
      }
      
      // Add author info
      embed.author = {
        name: article.author
      };
      
      // Add hashtags if available
      if (article.hashtags) {
        embed.footer = {
          text: article.hashtags
        };
      }
      
      const message: DiscordWebhookData = {
        content: `New article published: **${article.title}**`,
        embeds: [embed],
        username: "Content Publisher"
      };
      
      // Send the article to Discord
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(message)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          message: "Failed to publish article to Discord",
          error: errorText
        });
      }
      
      // Update the article to mark it as published if needed
      if (article.status !== "published") {
        await storage.updateArticle(articleId, {
          status: "published",
          publishedAt: new Date()
        });
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "publish",
        resourceType: "article",
        resourceId: article.id.toString(),
        details: { 
          service: "discord",
          article: article.title
        }
      });
      
      res.json({ message: "Article published to Discord successfully" });
    } catch (error) {
      console.error("Discord publish error:", error);
      res.status(500).json({ message: "Failed to publish article to Discord" });
    }
  });
}
