import { Express } from "express";
import { storage } from "../storage";
import { InsertArticle, InsertTeamMember, InsertCarouselQuote } from "@shared/schema";

// Type definitions for Airtable responses
interface AirtableRecord<T> {
  id: string;
  fields: T;
  createdTime: string;
}

interface AirtableResponse<T> {
  records: AirtableRecord<T>[];
  offset?: string;
}

// Interface for URL objects from Airtable
interface UrlObject {
  url: string;
}

interface AirtableArticle {
  title: string;
  description: string;
  content: string;
  contentFormat?: string;
  imageUrl?: string;
  excerpt?: string;
  featured?: string;
  publishedAt?: string;
  author: string;
  photo?: string;
  photoCredit?: string;
  status?: string;
  hashtags?: string;
}

interface AirtableTeamMember {
  name: string;
  role: string;
  bio: string;
  imageUrl: string;
}

interface AirtableCarouselQuote {
  carousel: string;
  quote: string;
}

// Helper function to make Airtable API requests
async function airtableRequest(
  apiKey: string,
  baseId: string,
  tableName: string,
  method: string = "GET",
  data?: any
) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
  
  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  };
  
  if (data && (method === "POST" || method === "PATCH")) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

export function setupAirtableRoutes(app: Express) {
  // Get Airtable integration settings
  app.get("/api/airtable/settings", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const settings = await storage.getIntegrationSettings("airtable");
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch Airtable settings" });
    }
  });

  // Update Airtable integration settings
  app.post("/api/airtable/settings", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { key, value, enabled } = req.body;
      
      if (!key || !value) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      
      // Check if setting already exists
      const existingSetting = await storage.getIntegrationSettingByKey("airtable", key);
      
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
          service: "airtable",
          key,
          value,
          enabled: enabled !== undefined ? enabled : true
        });
        
        return res.status(201).json(newSetting);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to update Airtable settings" });
    }
  });

  // Sync articles from Airtable
  app.post("/api/airtable/sync/articles", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
      const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
      const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");
      
      if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
        return res.status(400).json({ message: "Airtable settings are not fully configured" });
      }
      
      if (!apiKeySetting.enabled || !baseIdSetting.enabled || !tableNameSetting.enabled) {
        return res.status(400).json({ message: "Some Airtable settings are disabled" });
      }
      
      const apiKey = apiKeySetting.value;
      const baseId = baseIdSetting.value;
      const tableName = tableNameSetting.value;
      
      // Fetch articles from Airtable
      const response = await airtableRequest(apiKey, baseId, tableName) as AirtableResponse<AirtableArticle>;
      
      const syncResults = {
        created: 0,
        updated: 0,
        errors: 0,
        details: [] as string[]
      };
      
      // Process each article
      for (const record of response.records) {
        try {
          const fields = record.fields;
          
          // Debug log to see what fields we're actually receiving from Airtable
          console.log(`Processing Airtable record ${record.id}, fields:`, JSON.stringify(fields));
          
          // Create default values for all required fields
          const defaultTitle = `Untitled Article (ID: ${record.id})`;
          const defaultContent = "This article content is not available.";
          const defaultDescription = "No description provided.";
          const defaultImageUrl = "https://placehold.co/600x400?text=No+Image"; 
          const defaultAuthor = "Unknown Author";
          
          // Apply defaults for missing fields and log what we're doing
          if (!fields.title) {
            fields.title = defaultTitle;
            syncResults.details.push(`Record ${record.id}: Missing title, using default`);
          }
          
          if (!fields.content) {
            fields.content = defaultContent;
            syncResults.details.push(`Record ${record.id}: Missing content, using default`);
          }
          
          if (!fields.description) {
            fields.description = defaultDescription;
            syncResults.details.push(`Record ${record.id}: Missing description, using default`);
          }
          
          if (!fields.imageUrl) {
            fields.imageUrl = defaultImageUrl;
            syncResults.details.push(`Record ${record.id}: Missing imageUrl, using default`);
          }
          
          if (!fields.author) {
            fields.author = defaultAuthor;
            syncResults.details.push(`Record ${record.id}: Missing author, using default`);
          }
          
          // Check if article already exists
          const existingArticle = await storage.getArticleByExternalId(record.id);
          
          const articleData: InsertArticle = {
            title: fields.title,
            description: fields.description || "",
            excerpt: fields.excerpt || null,
            content: fields.content,
            contentFormat: fields.contentFormat || "plaintext",
            imageUrl: fields.imageUrl || "",
            imageType: "url",
            imagePath: null,
            featured: fields.featured || "no",
            publishedAt: fields.publishedAt ? new Date(fields.publishedAt) : null,
            author: fields.author,
            photo: fields.photo || "",
            photoCredit: fields.photoCredit || null,
            status: fields.status || "draft",
            hashtags: fields.hashtags || null,
            externalId: record.id,
            source: "airtable"
          };
          
          if (existingArticle) {
            // Update existing article
            await storage.updateArticle(existingArticle.id, articleData);
            syncResults.updated++;
            syncResults.details.push(`Updated article: ${fields.title}`);
          } else {
            // Create new article
            await storage.createArticle(articleData);
            syncResults.created++;
            syncResults.details.push(`Created article: ${fields.title}`);
          }
        } catch (error) {
          console.error("Error processing Airtable record:", error);
          syncResults.errors++;
          syncResults.details.push(`Error processing record ${record.id}: ${String(error)}`);
        }
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "sync",
        resourceType: "articles",
        details: { 
          source: "airtable",
          results: syncResults
        }
      });
      
      res.json({
        message: "Articles synced from Airtable",
        results: syncResults
      });
    } catch (error) {
      console.error("Airtable sync error:", error);
      res.status(500).json({ message: "Failed to sync articles from Airtable" });
    }
  });

  // Sync team members from Airtable
  app.post("/api/airtable/sync/team-members", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
      const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
      const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "team_members_table");
      
      if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
        return res.status(400).json({ message: "Airtable settings are not fully configured" });
      }
      
      if (!apiKeySetting.enabled || !baseIdSetting.enabled || !tableNameSetting.enabled) {
        return res.status(400).json({ message: "Some Airtable settings are disabled" });
      }
      
      const apiKey = apiKeySetting.value;
      const baseId = baseIdSetting.value;
      const tableName = tableNameSetting.value;
      
      // Fetch team members from Airtable
      const response = await airtableRequest(apiKey, baseId, tableName) as AirtableResponse<AirtableTeamMember>;
      
      const syncResults = {
        created: 0,
        updated: 0,
        errors: 0,
        details: [] as string[]
      };
      
      // Process each team member
      for (const record of response.records) {
        try {
          const fields = record.fields;
          
          // Check for missing required fields, but provide defaults
          let missingFields = [];
          
          if (!fields.name) {
            fields.name = `Team Member (ID: ${record.id})`;
            missingFields.push("name");
          }
          
          if (!fields.role) {
            fields.role = "Team Member";
            missingFields.push("role");
          }
          
          if (!fields.bio) {
            fields.bio = "Bio information not available.";
            missingFields.push("bio");
          }
          
          if (missingFields.length > 0) {
            syncResults.details.push(`Record ${record.id}: Using default values for missing fields: ${missingFields.join(", ")}`);
          }
          
          // Check if team member already exists
          const existingMember = await storage.getTeamMemberByExternalId(record.id);
          
          const memberData: InsertTeamMember = {
            name: fields.name,
            role: fields.role,
            bio: fields.bio,
            imageUrl: fields.imageUrl || "",
            imageType: "url",
            imagePath: null,
            externalId: record.id
          };
          
          if (existingMember) {
            // Update existing team member
            await storage.updateTeamMember(existingMember.id, memberData);
            syncResults.updated++;
            syncResults.details.push(`Updated team member: ${fields.name}`);
          } else {
            // Create new team member
            await storage.createTeamMember(memberData);
            syncResults.created++;
            syncResults.details.push(`Created team member: ${fields.name}`);
          }
        } catch (error) {
          console.error("Error processing Airtable record:", error);
          syncResults.errors++;
          syncResults.details.push(`Error processing record ${record.id}: ${String(error)}`);
        }
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "sync",
        resourceType: "team_members",
        details: { 
          source: "airtable",
          results: syncResults
        }
      });
      
      res.json({
        message: "Team members synced from Airtable",
        results: syncResults
      });
    } catch (error) {
      console.error("Airtable sync error:", error);
      res.status(500).json({ message: "Failed to sync team members from Airtable" });
    }
  });

  // Sync carousel quotes from Airtable
  app.post("/api/airtable/sync/carousel-quotes", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
      const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
      const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "quotes_table");
      
      if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
        return res.status(400).json({ message: "Airtable settings are not fully configured" });
      }
      
      if (!apiKeySetting.enabled || !baseIdSetting.enabled || !tableNameSetting.enabled) {
        return res.status(400).json({ message: "Some Airtable settings are disabled" });
      }
      
      const apiKey = apiKeySetting.value;
      const baseId = baseIdSetting.value;
      const tableName = tableNameSetting.value;
      
      // Fetch carousel quotes from Airtable
      const response = await airtableRequest(apiKey, baseId, tableName) as AirtableResponse<AirtableCarouselQuote>;
      
      const syncResults = {
        created: 0,
        updated: 0,
        errors: 0,
        details: [] as string[]
      };
      
      // Process each carousel quote
      for (const record of response.records) {
        try {
          const fields = record.fields;
          
          // Check for missing required fields, but provide defaults
          let missingFields = [];
          
          if (!fields.carousel) {
            fields.carousel = "default";
            missingFields.push("carousel");
          }
          
          if (!fields.quote) {
            fields.quote = "Quote information not available.";
            missingFields.push("quote");
          }
          
          if (missingFields.length > 0) {
            syncResults.details.push(`Record ${record.id}: Using default values for missing fields: ${missingFields.join(", ")}`);
          }
          
          // Get all quotes to check if this one exists
          const allQuotes = await storage.getCarouselQuotes();
          const existingQuote = allQuotes.find(q => q.externalId === record.id);
          
          const quoteData: InsertCarouselQuote = {
            carousel: fields.carousel,
            quote: fields.quote,
            externalId: record.id
          };
          
          if (existingQuote) {
            // Update existing quote
            await storage.updateCarouselQuote(existingQuote.id, quoteData);
            syncResults.updated++;
            syncResults.details.push(`Updated carousel quote for: ${fields.carousel}`);
          } else {
            // Create new quote
            await storage.createCarouselQuote(quoteData);
            syncResults.created++;
            syncResults.details.push(`Created carousel quote for: ${fields.carousel}`);
          }
        } catch (error) {
          console.error("Error processing Airtable record:", error);
          syncResults.errors++;
          syncResults.details.push(`Error processing record ${record.id}: ${String(error)}`);
        }
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "sync",
        resourceType: "carousel_quotes",
        details: { 
          source: "airtable",
          results: syncResults
        }
      });
      
      res.json({
        message: "Carousel quotes synced from Airtable",
        results: syncResults
      });
    } catch (error) {
      console.error("Airtable sync error:", error);
      res.status(500).json({ message: "Failed to sync carousel quotes from Airtable" });
    }
  });

  // Push an article to Airtable
  app.post("/api/airtable/push/article/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const articleId = parseInt(req.params.id);
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
      const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
      const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");
      
      if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
        return res.status(400).json({ message: "Airtable settings are not fully configured" });
      }
      
      if (!apiKeySetting.enabled || !baseIdSetting.enabled || !tableNameSetting.enabled) {
        return res.status(400).json({ message: "Some Airtable settings are disabled" });
      }
      
      const apiKey = apiKeySetting.value;
      const baseId = baseIdSetting.value;
      const tableName = tableNameSetting.value;
      
      // Prepare the data for Airtable
      const fields: any = {
        title: article.title,
        description: article.description,
        content: article.content,
        contentFormat: article.contentFormat,
        imageUrl: article.imageUrl,
        featured: article.featured,
        author: article.author,
        status: article.status
      };
      
      // Add optional fields if they exist
      if (article.excerpt) fields.excerpt = article.excerpt;
      if (article.publishedAt) fields.publishedAt = article.publishedAt.toISOString();
      if (article.photo) fields.photo = article.photo;
      if (article.photoCredit) fields.photoCredit = article.photoCredit;
      if (article.hashtags) fields.hashtags = article.hashtags;
      
      let response;
      
      // If the article has an external ID, update it
      if (article.externalId) {
        response = await airtableRequest(
          apiKey,
          baseId,
          tableName,
          "PATCH",
          {
            records: [
              {
                id: article.externalId,
                fields
              }
            ]
          }
        );
        
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: "update",
          resourceType: "article",
          resourceId: article.id.toString(),
          details: { 
            service: "airtable",
            article: article.title
          }
        });
      } else {
        // Create a new record
        response = await airtableRequest(
          apiKey,
          baseId,
          tableName,
          "POST",
          {
            records: [
              {
                fields
              }
            ]
          }
        );
        
        // Get the Airtable ID
        const airtableId = response.records[0].id;
        
        // Update the article with the Airtable ID
        await storage.updateArticle(articleId, {
          externalId: airtableId
        });
        
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: "create",
          resourceType: "article",
          resourceId: article.id.toString(),
          details: { 
            service: "airtable",
            article: article.title,
            airtableId
          }
        });
      }
      
      res.json({
        message: "Article pushed to Airtable successfully",
        response
      });
    } catch (error) {
      console.error("Airtable push error:", error);
      res.status(500).json({ message: "Failed to push article to Airtable" });
    }
  });
}
