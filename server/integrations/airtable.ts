import { Express } from "express";
import { storage } from "../storage";
import { Article, InsertArticle, InsertTeamMember, InsertCarouselQuote } from "@shared/schema";

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
interface Attachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
  thumbnails?: {
    small: { url: string; width: number; height: number };
    large: { url: string; width: number; height: number };
    full: { url: string; width: number; height: number };
  };
}

interface UrlObject {
  url: string;
}

interface AirtableArticle {
  Name: string;                    // Long text
  _createdTime?: string;           // Date
  _publishedTime?: string;         // Date
  _updatedTime?: string;           // Date
  Author?: string[];               // Link to another record (array of IDs)
  Body: string;                    // Long text (content)
  Date?: string;                   // Date
  Description?: string;            // Long text
  Featured?: boolean;              // Checkbox
  Finished?: boolean;              // Checkbox
  Hashtags?: string;               // Long text
  instaPhoto?: Attachment[];       // Attachment
  MainImage?: Attachment[];        // Attachment
  message_sent?: boolean;          // Checkbox
  "Name (from Author)"?: string[]; // Lookup
  "Name (from Photo)"?: string[];  // Lookup
  Photo?: string[];                // Link to another record (array of IDs)
}

interface AirtableTeamMember {
  Name: string;                   // Long text
  AuthorSub?: string[];           // Link to another record
  Bio?: string;                   // Long text
  "Collection ID"?: number;       // Number
  "Created On"?: string;          // Date
  DiscordID?: string;             // Single line text
  First?: string[];               // Link to another record
  "First 2"?: string[];           // Link to another record
  image_url?: Attachment[];       // Attachment
  "Item ID"?: string;             // Long text
  PhotoSub?: string[];            // Link to another record
  "Published On"?: string;        // Date
  Role?: string;                  // Long text
  "Secret Page?"?: boolean;       // Checkbox
  Slug?: string;                  // Long text
  "Updated On"?: string;          // Date
}

interface AirtableCarouselQuote {
  main: string;
  philo: string;
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

// Helper function to convert an Article to Airtable format
async function convertToAirtableFormat(article: Article): Promise<Partial<AirtableArticle>> {
  // Get the team member for author reference (if applicable)
  let authorRecord = null;
  if (article.author && article.author !== "Anonymous") {
    const teamMembers = await storage.getTeamMembers();
    const authorMember = teamMembers.find(m => m.name === article.author);
    if (authorMember && authorMember.externalId) {
      authorRecord = [authorMember.externalId];
    }
  }
  
  // Convert to Airtable format
  const airtableData: Partial<AirtableArticle> = {
    Name: article.title,
    Body: article.content,
    Description: article.description || "",
    Featured: article.featured === "yes",
    Finished: article.finished || article.status === "published", // Use either finished field or derive from status
    Hashtags: article.hashtags || ""
  };
  
  // Handle date mapping - Use the specific date field if available, fallback to publishedAt
  // Airtable expects date in full ISO format with time
  if (article.date) {
    // If we have a direct date field, use it (this is the preferred field)
    // This should already be in ISO format from our updated form handling
    airtableData.Date = article.date;
  } else if (article.publishedAt) {
    // Fall back to publishedAt if date not available
    // Make sure it's a complete ISO string with time
    const date = new Date(article.publishedAt);
    airtableData.Date = date.toISOString();
  }
  
  // Add author reference if we found one
  if (authorRecord) {
    airtableData.Author = authorRecord;
  }
  
  // Handle MainImage field if article has an imageUrl
  if (article.imageUrl && article.imageUrl !== "") {
    // Only add MainImage if it's a URL - for other image types we'd need a different approach
    if (article.imageType === "url") {
      // Create the Airtable Attachment structure
      const imageAttachment: Attachment = {
        id: `img_${Date.now()}`, // Generate a temporary id
        url: article.imageUrl,
        filename: article.imageUrl.split('/').pop() || 'image.jpg',
        size: 0, // We don't know the size, but Airtable requires this field
        type: "image/jpeg" // Assume JPEG as default, could be improved with MIME detection
      };
      
      airtableData.MainImage = [imageAttachment];
      
      // For Instagram-sourced articles, also set the instaPhoto field to the same image
      // This ensures proper syncing back to Airtable for Instagram-sourced content
      if (article.source === "instagram") {
        airtableData.instaPhoto = [imageAttachment];
      }
    }
  }
  
  return airtableData;
}

export function setupAirtableRoutes(app: Express) {
  // Test Airtable API connection
  app.get("/api/airtable/test-connection", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Get Airtable settings
      const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
      const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
      
      if (!apiKeySetting?.value || !baseIdSetting?.value) {
        return res.status(400).json({ 
          success: false, 
          message: "Airtable settings are not fully configured",
          missing: [
            !apiKeySetting?.value ? "API Key" : null,
            !baseIdSetting?.value ? "Base ID" : null
          ].filter(Boolean)
        });
      }
      
      // Test the connection by fetching base metadata
      try {
        const url = `https://api.airtable.com/v0/meta/bases/${baseIdSetting.value}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKeySetting.value}`,
            "Content-Type": "application/json"
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          
          if (response.status === 403) {
            return res.status(403).json({
              success: false,
              message: "Authentication failed with Airtable. Please check your API key and permissions.",
              error: errorText
            });
          } else if (response.status === 404) {
            return res.status(404).json({
              success: false,
              message: "Base not found in Airtable. Please check your Base ID.",
              error: errorText
            });
          }
          
          throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
        }
        
        const baseData = await response.json();
        
        // Return success with some base data
        return res.json({
          success: true,
          message: "Successfully connected to Airtable",
          base: {
            id: baseData.id,
            name: baseData.name,
            permissionLevel: baseData.permissionLevel
          }
        });
      } catch (error) {
        console.error("Airtable connection test error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to connect to Airtable API",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (error) {
      console.error("Airtable connection test error:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to test Airtable connection" 
      });
    }
  });
  
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

  // Update Airtable API key from environment variable
  app.post("/api/airtable/update-api-key", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check for API key in environment
      const apiKey = process.env.AIRTABLE_API_KEY;
      
      if (!apiKey) {
        return res.status(400).json({ message: "AIRTABLE_API_KEY environment variable not set" });
      }
      
      // Get the current API key setting
      const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
      
      if (apiKeySetting) {
        // Update existing setting
        await storage.updateIntegrationSetting(apiKeySetting.id, {
          value: apiKey,
          enabled: true
        });
        
        console.log("Updated Airtable API key from environment variable");
      } else {
        // Create new setting if it doesn't exist
        await storage.createIntegrationSetting({
          service: "airtable",
          key: "api_key",
          value: apiKey,
          enabled: true
        });
        
        console.log("Created Airtable API key from environment variable");
      }
      
      return res.json({ message: "Airtable API key updated successfully", success: true });
    } catch (error) {
      console.error("Error updating Airtable API key:", error);
      return res.status(500).json({ message: "Error updating Airtable API key", success: false });
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
          if (!fields.Name) {
            fields.Name = defaultTitle;
            syncResults.details.push(`Record ${record.id}: Missing Name, using default`);
          }
          
          if (!fields.Body) {
            fields.Body = defaultContent;
            syncResults.details.push(`Record ${record.id}: Missing Body, using default`);
          }
          
          if (!fields.Description) {
            fields.Description = defaultDescription;
            syncResults.details.push(`Record ${record.id}: Missing Description, using default`);
          }
          
          // Get the image URL from MainImage attachment if it exists
          let imageUrl = defaultImageUrl;
          if (fields.MainImage && fields.MainImage.length > 0) {
            imageUrl = fields.MainImage[0].url;
          } else if (fields.instaPhoto && fields.instaPhoto.length > 0) {
            // Use instaPhoto as fallback if MainImage is not available
            imageUrl = fields.instaPhoto[0].url;
            syncResults.details.push(`Record ${record.id}: Using instaPhoto as MainImage is not available`);
          }
          
          // Get the author name as a string (first one if it's an array)
          let authorName = defaultAuthor;
          if (fields["Name (from Author)"] && fields["Name (from Author)"].length > 0) {
            authorName = fields["Name (from Author)"][0];
          }
          
          // Get the photo name as a string (first one if it's an array)
          let photoName = "";
          if (fields["Name (from Photo)"] && fields["Name (from Photo)"].length > 0) {
            photoName = fields["Name (from Photo)"][0];
          }
          
          // Check if article already exists
          const existingArticle = await storage.getArticleByExternalId(record.id);
          
          const articleData: InsertArticle = {
            title: fields.Name,
            description: fields.Description || "",
            excerpt: null, // Removed as requested
            content: fields.Body,
            contentFormat: "html", // Most Airtable content is rich text
            imageUrl: imageUrl,
            imageType: "url",
            imagePath: null,
            featured: fields.Featured ? "yes" : "no",
            publishedAt: fields.Date ? new Date(fields.Date) : null,
            date: fields.Date || "", // Store the raw date string from Airtable
            finished: !!fields.Finished, // Store the finished state directly
            author: authorName,
            photo: photoName,
            photoCredit: null, // Not available in new schema
            status: fields.Finished ? "published" : "draft",
            hashtags: fields.Hashtags || null,
            externalId: record.id,
            source: "airtable"
          };
          
          if (existingArticle) {
            // Update existing article
            await storage.updateArticle(existingArticle.id, articleData);
            syncResults.updated++;
            syncResults.details.push(`Updated article: ${fields.Name}`);
          } else {
            // Create new article
            await storage.createArticle(articleData);
            syncResults.created++;
            syncResults.details.push(`Created article: ${fields.Name}`);
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
          
          // Debug log to see what fields we're actually receiving from Airtable
          console.log(`Processing Airtable team member record ${record.id}, fields:`, JSON.stringify(fields));
          
          // Check for missing required fields, but provide defaults
          let missingFields = [];
          
          // Default values
          const defaultName = `Team Member (ID: ${record.id})`;
          const defaultRole = "Team Member";
          const defaultBio = "Bio information not available.";
          const defaultImageUrl = "https://placehold.co/600x400?text=No+Image";
          
          if (!fields.Name) {
            fields.Name = defaultName;
            missingFields.push("Name");
          }
          
          if (!fields.Role) {
            fields.Role = defaultRole;
            missingFields.push("Role");
          }
          
          if (!fields.Bio) {
            fields.Bio = defaultBio;
            missingFields.push("Bio");
          }
          
          if (missingFields.length > 0) {
            syncResults.details.push(`Record ${record.id}: Using default values for missing fields: ${missingFields.join(", ")}`);
          }
          
          // Get the image URL from image_url attachment if it exists
          let imageUrl = defaultImageUrl;
          if (fields.image_url && fields.image_url.length > 0) {
            imageUrl = fields.image_url[0].url;
          }
          
          // Check if team member already exists
          const existingMember = await storage.getTeamMemberByExternalId(record.id);
          
          const memberData: InsertTeamMember = {
            name: fields.Name,
            role: fields.Role || defaultRole,
            bio: fields.Bio || defaultBio,
            imageUrl: imageUrl,
            imageType: "url",
            imagePath: null,
            externalId: record.id
          };
          
          if (existingMember) {
            // Update existing team member
            await storage.updateTeamMember(existingMember.id, memberData);
            syncResults.updated++;
            syncResults.details.push(`Updated team member: ${fields.Name}`);
          } else {
            // Create new team member
            await storage.createTeamMember(memberData);
            syncResults.created++;
            syncResults.details.push(`Created team member: ${fields.Name}`);
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

  // Update an article in Airtable
  app.post("/api/airtable/update/article/:id", async (req, res) => {
    // Store article info for error logging
    let articleId: number | undefined;
    let articleDetails: { externalId?: string, title?: string } = {};
    
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      articleId = parseInt(req.params.id);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: "Invalid article ID" });
      }
      
      // Get the article from the database
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      // Save article details for error handling
      articleDetails = {
        externalId: article.externalId,
        title: article.title
      };
      
      // Check if this is an Airtable article
      if (article.source !== "airtable" || !article.externalId) {
        return res.status(400).json({ message: "This article is not from Airtable" });
      }
      
      // Get Airtable settings
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
      
      // Convert article data to Airtable format
      const airtableData = await convertToAirtableFormat(article);
      
      // Update the record in Airtable using the records array format
      // which is what the Airtable API expects for table-level operations
      const response = await airtableRequest(
        apiKey,
        baseId,
        tableName,
        "PATCH",
        {
          records: [
            {
              id: article.externalId,
              fields: airtableData
            }
          ]
        }
      );
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "update",
        resourceType: "article",
        resourceId: articleId.toString(),
        details: { 
          source: "airtable",
          externalId: article.externalId
        }
      });
      
      res.json({
        message: "Article updated in Airtable",
        article: response
      });
    } catch (error) {
      console.error("Airtable update error:", error);
      
      let errorMessage = "Failed to update article in Airtable";
      let statusCode = 500;
      
      // Check for specific error types to provide better error messages
      if (error instanceof Error) {
        const errorText = error.message;
        console.log("Detailed Airtable error:", errorText);
        
        if (errorText.includes("403")) {
          errorMessage = "Authentication failed with Airtable. Please check your API key and permissions.";
          statusCode = 403;
        } else if (errorText.includes("404")) {
          errorMessage = "Record not found in Airtable. The record may have been deleted or the table structure changed.";
          statusCode = 404;
        } else if (errorText.includes("422")) {
          errorMessage = "Invalid data format for Airtable. Please check the field mappings.";
          statusCode = 422;
        } else if (errorText.includes("INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND")) {
          errorMessage = "Invalid permissions or model not found in Airtable. Please check your API key permissions and that the table name is correct.";
          statusCode = 403;
        }
        
        // Log article details that were captured earlier
        if (articleId && articleDetails) {
          console.log(`Article update failed for ID ${articleId}, externalId: ${articleDetails.externalId}, title: "${articleDetails.title}"`);
        }
      }
      
      res.status(statusCode).json({ 
        message: errorMessage,
        error: error instanceof Error ? error.message : String(error)
      });
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
          
          if (!fields.main) {
            fields.main = "default";
            missingFields.push("main");
          }
          
          if (!fields.philo) {
            fields.philo = "Quote information not available.";
            missingFields.push("philo");
          }
          
          if (missingFields.length > 0) {
            syncResults.details.push(`Record ${record.id}: Using default values for missing fields: ${missingFields.join(", ")}`);
          }
          
          // Get all quotes to check if this one exists
          const allQuotes = await storage.getCarouselQuotes();
          const existingQuote = allQuotes.find(q => q.externalId === record.id);
          
          const quoteData: InsertCarouselQuote = {
            carousel: fields.main,
            quote: fields.philo,
            externalId: record.id
          };
          
          if (existingQuote) {
            // Update existing quote
            await storage.updateCarouselQuote(existingQuote.id, quoteData);
            syncResults.updated++;
            syncResults.details.push(`Updated carousel quote for: ${fields.main}`);
          } else {
            // Create new quote
            await storage.createCarouselQuote(quoteData);
            syncResults.created++;
            syncResults.details.push(`Created carousel quote for: ${fields.main}`);
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
    // Store article info for error logging
    let articleId: number | undefined;
    let articleDetails: { externalId?: string, title?: string } = {};
    
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      articleId = parseInt(req.params.id);
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      // Save article details for error handling
      articleDetails = {
        externalId: article.externalId,
        title: article.title
      };
      
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
        Name: article.title,
        Description: article.description,
        Body: article.content,
        // Convert featured from "yes"/"no" to boolean
        Featured: article.featured === "yes" ? true : false,
        // Use the dedicated finished field or fall back to status
        Finished: article.finished !== undefined ? article.finished : (article.status === "published")
      };
      
      // Date handling: prioritize the date field from Airtable
      if (article.date) {
        // Use the direct date field if available (preferred)
        // Keep the full ISO format for Airtable which expects timestamps
        fields.Date = article.date;
      } else if (article.publishedAt) {
        // Fall back to publishedAt if date not available
        // Use the full ISO string with time for Airtable (not just YYYY-MM-DD)
        fields.Date = new Date(article.publishedAt).toISOString();
      }
      
      // Add hashtags if they exist
      if (article.hashtags) fields.Hashtags = article.hashtags;
      
      // Handle author relationship
      // Note: this doesn't actually create the relationship in Airtable
      // but we store the author name for reference
      if (article.author) {
        // We don't set Author directly as it's a linked record - 
        // this would require creating/finding the author record first
        // Just log that this would need proper linking
        console.log(`Author ${article.author} would need to be linked in Airtable`);
      }
      
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
      
      let errorMessage = "Failed to push article to Airtable";
      let statusCode = 500;
      
      if (error instanceof Error) {
        const errorText = error.message;
        console.log("Detailed Airtable push error:", errorText);
        
        if (errorText.includes("403")) {
          errorMessage = "Authentication failed with Airtable. Please check your API key and permissions.";
          statusCode = 403;
        } else if (errorText.includes("404")) {
          errorMessage = "Table not found in Airtable. Please check your table name.";
          statusCode = 404;
        } else if (errorText.includes("422")) {
          errorMessage = "Invalid data format for Airtable. Please check the field mappings.";
          statusCode = 422;
        } else if (errorText.includes("INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND")) {
          errorMessage = "Invalid permissions or model not found in Airtable. Please check your API key permissions and that the table name is correct.";
          statusCode = 403;
        }
        
        // Log article details that were captured earlier
        if (articleId !== undefined && articleDetails) {
          console.log(`Article push failed for ID ${articleId}, title: "${articleDetails.title}", externalId: ${articleDetails.externalId || 'none'}`);
        }
      }
      
      res.status(statusCode).json({ 
        message: errorMessage,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
