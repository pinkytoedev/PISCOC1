import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { Article, InsertArticle, InsertTeamMember, InsertCarouselQuote } from "@shared/schema";
import { upload } from "../utils/fileUpload";
import {
  uploadImageToAirtable,
  uploadImageUrlToAirtable,
  uploadImageUrlAsLinkField,
  cleanupUploadedFile
} from "../utils/imageUploader";
import { uploadImageToImgBB, uploadImageUrlToImgBB } from "../utils/imgbbUploader";

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

// Interface for attachment objects from Airtable (response format)
export interface Attachment {
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

// Interface for attachment objects to be sent to Airtable (upload format)
// Airtable API only requires url and filename for attachments when uploading
// But our codebase expects Attachment type for the fields, so we include minimal required properties
interface UploadAttachment {
  url: string;        // The actual image URL
  filename: string;   // Name of the file
  thumbnails?: {
    small?: { url: string; width?: number; height?: number };
    large?: { url: string; width?: number; height?: number };
    full?: { url: string; width?: number; height?: number };
  };
}

interface UrlObject {
  url: string;
}

// For response data (reading from Airtable)
interface AirtableArticleResponse {
  Name: string;                    // Long text
  _createdTime?: string;           // Date
  _publishedTime?: string;         // Date
  _updatedTime?: string;           // Date
  Author?: string[];               // Link to another record (array of IDs)
  Body: string;                    // Long text (content)
  Date?: string;                   // Date (creation timestamp)
  Scheduled?: string;              // Date (publication date)
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

// For request data (writing to Airtable)
interface AirtableArticleRequest {
  Name: string;                    // Long text
  _createdTime?: string;           // Date
  _publishedTime?: string;         // Date
  _updatedTime?: string;           // Date
  Author?: string[];               // Link to another record (array of IDs)
  Body: string;                    // Long text (content)
  Date?: string;                   // Date (creation timestamp)
  Scheduled?: string;              // Date (publication date)
  Description?: string;            // Long text
  Featured?: boolean;              // Checkbox
  Finished?: boolean;              // Checkbox
  Hashtags?: string;               // Long text
  instaPhoto?: UploadAttachment[]; // Attachment
  MainImage?: UploadAttachment[];  // Attachment
  MainImageLink?: string;          // URL field (replacement for MainImage attachment)
  InstaPhotoLink?: string;         // URL field (replacement for instaPhoto attachment)
  message_sent?: boolean;          // Checkbox
  "Name (from Author)"?: string[]; // Lookup
  "Name (from Photo)"?: string[];  // Lookup
  Photo?: string[];                // Link to another record (array of IDs)
}

// Type alias for compatibility with existing code
type AirtableArticle = AirtableArticleRequest;

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

// Helper function to make Airtable API requests with pagination support
async function airtableRequest(
  apiKey: string,
  baseId: string,
  tableName: string,
  method: string = "GET",
  data?: any,
  queryParams?: Record<string, string | number | boolean>
) {
  // Only implement pagination for GET requests
  if (method === "GET") {
    return await airtableRequestWithPagination(apiKey, baseId, tableName, queryParams);
  }

  // For non-GET requests, use the regular implementation
  // Build the URL with query parameters if provided
  let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;

  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      params.append(key, String(value));
    }
    url += `?${params.toString()}`;
  }

  console.log(`Airtable API request: ${method} ${url.split('?')[0]} ${queryParams ? JSON.stringify(queryParams) : ''}`);

  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  };

  if (data && (method === "POST" || method === "PATCH" || method === "DELETE")) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Helper function that implements pagination for GET requests
async function airtableRequestWithPagination(
  apiKey: string,
  baseId: string,
  tableName: string,
  queryParams?: Record<string, string | number | boolean>
) {
  // Initialize the result object with empty records array
  const result: any = { records: [] };

  // Initialize pagination parameters
  let offset: string | undefined = undefined;
  let hasMorePages = true;
  let pageCount = 0;

  // Clone the query parameters to avoid modifying the original
  const params = queryParams ? { ...queryParams } : {};

  // Airtable has a maximum limit of 100 records per request
  // If no limit is specified, we use the maximum
  if (!params.maxRecords) {
    // A very high number to effectively get all records
    params.maxRecords = 10000;
  }

  // Default page size if not specified is 100 (Airtable's maximum)
  if (!params.pageSize) {
    params.pageSize = 100;
  }

  console.log(`Starting paginated Airtable request for table: ${tableName}`);

  // Fetch all pages
  while (hasMorePages) {
    // Build the URL with pagination parameters
    let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
    const urlParams = new URLSearchParams();

    // Add all query parameters
    for (const [key, value] of Object.entries(params)) {
      urlParams.append(key, String(value));
    }

    // Add the offset parameter if we have one
    if (offset) {
      urlParams.append('offset', offset);
    }

    url += `?${urlParams.toString()}`;

    console.log(`Airtable API request (page ${pageCount + 1}): GET ${url.split('?')[0]}`);

    const options: RequestInit = {
      method: 'GET',
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    };

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }

    const pageData = await response.json();

    // Add records from this page to our result
    if (pageData.records && Array.isArray(pageData.records)) {
      result.records = [...result.records, ...pageData.records];
    }

    // Check if there are more pages
    if (pageData.offset) {
      offset = pageData.offset;
      pageCount++;
    } else {
      hasMorePages = false;
    }
  }

  console.log(`Completed paginated Airtable request. Retrieved ${result.records.length} records from ${pageCount + 1} pages.`);

  return result;
}

// Helper function to delete a record from Airtable
export async function deleteAirtableRecord(
  apiKey: string,
  baseId: string,
  tableName: string,
  recordId: string
) {
  try {
    // Airtable allows deleting records using the DELETE HTTP method with recordIds
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;

    console.log(`Deleting Airtable record: ${recordId} from table ${tableName}`);

    const options: RequestInit = {
      method: 'DELETE',
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    };

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API delete error: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error) {
    console.error("Error deleting Airtable record:", error);
    throw error;
  }
}

// Helper function to convert an Article to Airtable format
async function convertToAirtableFormat(article: Article): Promise<Partial<AirtableArticleRequest>> {
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
  const airtableData: Partial<AirtableArticleRequest> = {
    Name: article.title,
    Body: article.content || "",
    Description: article.description || "",
    Featured: article.featured === "yes",
    // Always set Finished to true if status is "published" regardless of the finished field value
    Finished: article.status === "published" ? true : (article.finished === true),
    Hashtags: article.hashtags || "",
    message_sent: article.status === "published" // If the article is published, assume it was sent
  };

  // Log for debugging
  console.log("Finished status:", airtableData.Finished, "Article status:", article.status);

  // Add _updatedTime to track when this article was last updated
  airtableData._updatedTime = new Date().toISOString();

  // Set the creation timestamp in the "Date" field (always update this on push)
  // If we don't have a creation date recorded, use current time
  airtableData.Date = article.date || new Date().toISOString();

  // Handle publication schedule in the "Scheduled" field if available
  if (article.Scheduled) {
    // For scheduled publication time, use the Scheduled field
    airtableData.Scheduled = article.Scheduled;
  } else if (article.publishedAt) {
    // Fall back to publishedAt if scheduled not available
    // Make sure it's a complete ISO string with time
    const date = new Date(article.publishedAt);
    airtableData.Scheduled = date.toISOString();
  }

  // Add author reference if we found one
  if (authorRecord) {
    airtableData.Author = authorRecord;
  }

  // Handle Photo field - if we have a photo reference
  if (article.photo && article.photo !== "none") {
    // Try to find the photo reference in the team members
    const teamMembers = await storage.getTeamMembers();
    const photoMember = teamMembers.find(m => m.name === article.photo);
    if (photoMember && photoMember.externalId) {
      airtableData.Photo = [photoMember.externalId];
    }
  } else {
    // Explicitly set to empty array when "none" or no photo is selected
    airtableData.Photo = [];
  }

  // Handle MainImage field if article has an imageUrl
  if (article.imageUrl && article.imageUrl !== "") {
    // Only add MainImage if it's a URL - for other image types we'd need a different approach
    if (article.imageType === "url") {
      try {
        // Extract file extension to determine proper MIME type
        const urlLower = article.imageUrl.toLowerCase();
        let mimeType = "image/jpeg"; // Default
        let fileExt = "jpg";

        // Determine MIME type based on URL extension
        if (urlLower.endsWith('.png')) {
          mimeType = "image/png";
          fileExt = "png";
        } else if (urlLower.endsWith('.gif')) {
          mimeType = "image/gif";
          fileExt = "gif";
        } else if (urlLower.endsWith('.webp')) {
          mimeType = "image/webp";
          fileExt = "webp";
        } else if (urlLower.endsWith('.svg')) {
          mimeType = "image/svg+xml";
          fileExt = "svg";
        }

        // Extract filename or create a default one with proper extension
        const filename = article.imageUrl.split('/').pop() || `main_image.${fileExt}`;

        // Using Link field for MainImage instead of attachment field
        // Use the MainImageLink field which accepts a URL string
        // Use the MainImageLink field which accepts a URL string
        airtableData.MainImageLink = article.imageUrl;

        console.log("Setting MainImageLink:", article.imageUrl);
      } catch (error) {
        console.error("Error creating MainImage attachment:", error);
      }
    }
  }

  // Handle instaPhoto field separately if we have an Instagram image URL
  if (article.instagramImageUrl && article.instagramImageUrl !== "") {
    try {
      // Extract file extension to determine proper MIME type
      const urlLower = article.instagramImageUrl.toLowerCase();
      let mimeType = "image/jpeg"; // Default for Instagram
      let fileExt = "jpg";

      // Determine MIME type based on URL extension
      if (urlLower.endsWith('.png')) {
        mimeType = "image/png";
        fileExt = "png";
      } else if (urlLower.endsWith('.gif')) {
        mimeType = "image/gif";
        fileExt = "gif";
      } else if (urlLower.endsWith('.webp')) {
        mimeType = "image/webp";
        fileExt = "webp";
      }

      // Extract filename or create a default one with proper extension
      const filename = article.instagramImageUrl.split('/').pop() || `instagram_image.${fileExt}`;

      // Using Link field for instaPhoto instead of attachment field
      // Use the InstaPhotoLink field which accepts a URL string
      airtableData.InstaPhotoLink = article.instagramImageUrl;

      console.log("Setting InstaPhotoLink:", article.instagramImageUrl);
    } catch (error) {
      console.error("Error creating instaPhoto attachment:", error);
    }
  }
  // For Instagram-sourced articles without a specific Instagram image, 
  // use the main image for the instaPhoto field
  else if (article.source === "instagram" && article.imageUrl && article.imageUrl !== "") {
    try {
      // Extract file extension to determine proper MIME type
      const urlLower = article.imageUrl.toLowerCase();
      let mimeType = "image/jpeg"; // Default
      let fileExt = "jpg";

      // Determine MIME type based on URL extension
      if (urlLower.endsWith('.png')) {
        mimeType = "image/png";
        fileExt = "png";
      } else if (urlLower.endsWith('.gif')) {
        mimeType = "image/gif";
        fileExt = "gif";
      } else if (urlLower.endsWith('.webp')) {
        mimeType = "image/webp";
        fileExt = "webp";
      }

      // Extract filename or create a default one with proper extension
      const filename = article.imageUrl.split('/').pop() || `instagram_fallback.${fileExt}`;

      // Using Link field for instaPhoto fallback instead of attachment field
      // Use the InstaPhotoLink field which accepts a URL string
      airtableData.InstaPhotoLink = article.imageUrl;

      console.log("Using main image for InstaPhotoLink:", article.imageUrl);
    } catch (error) {
      console.error("Error creating fallback instaPhoto attachment:", error);
    }
  }

  return airtableData;
}

// Helper function to convert from database model to Airtable format
async function convertCarouselQuoteToAirtableFormat(quote: any): Promise<Partial<AirtableCarouselQuote>> {
  return {
    main: quote.main || quote.carousel,
    philo: quote.philo || quote.quote
  };
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
      const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "quotes_table");

      if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
        return res.status(400).json({
          success: false,
          message: "Airtable settings are not fully configured",
          missing: [
            !apiKeySetting?.value ? "API Key" : null,
            !baseIdSetting?.value ? "Base ID" : null,
            !tableNameSetting?.value ? "Table Name" : null
          ].filter(Boolean)
        });
      }

      // Test the connection by fetching a single record
      // Instead of using /meta/bases which requires special permissions,
      // we'll test by attempting to access the table directly with maxRecords=1
      try {
        const apiKey = apiKeySetting.value;
        const baseId = baseIdSetting.value;
        const tableName = tableNameSetting.value;

        // Make a simple request to get one record from the table
        // This requires less permissions than accessing base metadata
        const response = await airtableRequest(
          apiKey,
          baseId,
          tableName,
          "GET",
          null,
          { maxRecords: 1 }
        );

        // If we get here, the connection was successful
        return res.json({
          success: true,
          message: "Successfully connected to Airtable",
          details: {
            recordCount: response.records?.length || 0,
            baseId: baseId,
            tableName: tableName
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

      console.log(`Airtable sync: Received ${response.records.length} records from Airtable`);

      // Log first few records to see the data structure
      if (response.records.length > 0) {
        console.log("Sample Airtable record structure (first record):");
        console.log(JSON.stringify(response.records[0], null, 2));

        // Log all field names from the first record
        if (response.records[0].fields) {
          console.log("Available fields in Airtable records:");
          console.log(Object.keys(response.records[0].fields));
        }
      }

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

          // Debug log - only log first 3 records to avoid spam
          if (syncResults.created + syncResults.updated + syncResults.errors < 3) {
            console.log(`Processing Airtable record ${record.id}, fields:`, JSON.stringify(fields));
          }

          // Create default values for all required fields
          const defaultTitle = `Untitled Article (ID: ${record.id})`;
          const defaultContent = "This article content is not available.";
          const defaultDescription = "No description provided.";
          const defaultImageUrl = "https://placehold.co/600x400?text=No+Image";
          const defaultAuthor = "Unknown Author";

          // Check if fields object is empty or has unexpected structure
          const fieldCount = Object.keys(fields).length;
          if (fieldCount === 0) {
            console.warn(`Record ${record.id} has no fields!`);
            syncResults.errors++;
            syncResults.details.push(`Record ${record.id}: No fields found in record`);
            continue;
          }

          // Apply defaults for missing fields and log what we're doing
          if (!fields.Name) {
            // Check if there might be a lowercase version or different field name
            const possibleNameFields = ['name', 'title', 'Title', 'NAME'];
            const foundNameField = possibleNameFields.find(f => (fields as any)[f]);
            if (foundNameField) {
              fields.Name = (fields as any)[foundNameField];
              console.log(`Record ${record.id}: Using '${foundNameField}' field for Name`);
            } else {
              fields.Name = defaultTitle;
              syncResults.details.push(`Record ${record.id}: Missing Name, using default`);
            }
          }

          if (!fields.Body) {
            // Check for alternative field names
            const possibleBodyFields = ['body', 'content', 'Content', 'BODY'];
            const foundBodyField = possibleBodyFields.find(f => (fields as any)[f]);
            if (foundBodyField) {
              fields.Body = (fields as any)[foundBodyField];
              console.log(`Record ${record.id}: Using '${foundBodyField}' field for Body`);
            } else {
              fields.Body = defaultContent;
              syncResults.details.push(`Record ${record.id}: Missing Body, using default`);
            }
          }

          if (!fields.Description) {
            // Check for alternative field names
            const possibleDescFields = ['description', 'desc', 'Desc', 'DESCRIPTION'];
            const foundDescField = possibleDescFields.find(f => (fields as any)[f]);
            if (foundDescField) {
              fields.Description = (fields as any)[foundDescField];
              console.log(`Record ${record.id}: Using '${foundDescField}' field for Description`);
            } else {
              fields.Description = defaultDescription;
              syncResults.details.push(`Record ${record.id}: Missing Description, using default`);
            }
          }

          // Use helper function that correctly prioritizes the link fields over attachment fields
          // Default image URL to use if no images are found
          let imageUrl = defaultImageUrl;
          let instagramImageUrl = "";

          try {
            // Check for MainImageLink first (preferred) then fallback to MainImage attachment
            if (fields.MainImageLink && typeof fields.MainImageLink === 'string') {
              imageUrl = fields.MainImageLink;
              syncResults.details.push(`Record ${record.id}: Found MainImageLink: ${imageUrl.substring(0, 50)}...`);
            }
            // If no MainImageLink, try MainImage attachment
            else if (fields.MainImage && fields.MainImage.length > 0) {
              console.log(`Record ${record.id}: MainImage attachment structure:`, JSON.stringify(fields.MainImage[0], null, 2));

              // Extract the URL from the attachment object
              if (fields.MainImage[0].url) {
                imageUrl = fields.MainImage[0].url;
              } else if (fields.MainImage[0].thumbnails && fields.MainImage[0].thumbnails.full) {
                imageUrl = fields.MainImage[0].thumbnails.full.url;
              } else if (fields.MainImage[0].thumbnails && fields.MainImage[0].thumbnails.large) {
                imageUrl = fields.MainImage[0].thumbnails.large.url;
              }

              syncResults.details.push(`Record ${record.id}: Found MainImage attachment: ${imageUrl.substring(0, 50)}...`);
            }

            // Check for InstaPhotoLink first (preferred) then fallback to instaPhoto attachment
            if (fields.InstaPhotoLink && typeof fields.InstaPhotoLink === 'string') {
              instagramImageUrl = fields.InstaPhotoLink;
              syncResults.details.push(`Record ${record.id}: Found InstaPhotoLink: ${instagramImageUrl.substring(0, 50)}...`);
            }
            // If no InstaPhotoLink, try instaPhoto attachment
            else if (fields.instaPhoto && fields.instaPhoto.length > 0) {
              console.log(`Record ${record.id}: instaPhoto attachment structure:`, JSON.stringify(fields.instaPhoto[0], null, 2));

              // Extract the URL from the attachment object
              if (fields.instaPhoto[0].url) {
                instagramImageUrl = fields.instaPhoto[0].url;
              } else if (fields.instaPhoto[0].thumbnails && fields.instaPhoto[0].thumbnails.full) {
                instagramImageUrl = fields.instaPhoto[0].thumbnails.full.url;
              } else if (fields.instaPhoto[0].thumbnails && fields.instaPhoto[0].thumbnails.large) {
                instagramImageUrl = fields.instaPhoto[0].thumbnails.large.url;
              }

              syncResults.details.push(`Record ${record.id}: Found instaPhoto attachment: ${instagramImageUrl.substring(0, 50)}...`);
            }

            // Use instaPhoto/InstaPhotoLink as fallback if no main image
            if (imageUrl === defaultImageUrl && instagramImageUrl !== "") {
              imageUrl = instagramImageUrl;
              syncResults.details.push(`Record ${record.id}: Using Instagram image as main image fallback`);
            }
          } catch (error) {
            console.error(`Error processing images for record ${record.id}:`, error);
            syncResults.details.push(`Record ${record.id}: Error processing images, using defaults`);
          }

          // Get the author name as a string (first one if it's an array)
          let authorName = defaultAuthor;
          if (fields["Name (from Author)"] && fields["Name (from Author)"].length > 0) {
            authorName = fields["Name (from Author)"][0];
          }

          // Get the photo name as a string (first one if it's an array)
          // Default to "none" for empty values to work with the Select component
          let photoName = "none";
          if (fields["Name (from Photo)"] && fields["Name (from Photo)"].length > 0) {
            photoName = fields["Name (from Photo)"][0];
          }

          // Check if article already exists
          const existingArticle = await storage.getArticleByExternalId(record.id);

          if (existingArticle) {
            console.log(`Found existing article with external ID ${record.id}: ${existingArticle.title}`);
          } else {
            console.log(`No existing article found for external ID ${record.id}, will create new`);
          }

          const articleData: InsertArticle = {
            title: fields.Name,
            description: fields.Description || "",
            excerpt: null, // Removed as requested
            content: fields.Body,
            contentFormat: "html", // Most Airtable content is rich text
            imageUrl: imageUrl,
            imageType: "url",
            imagePath: null,
            instagramImageUrl: instagramImageUrl, // Store instaPhoto URL separately
            featured: fields.Featured ? "yes" : "no",
            publishedAt: fields.Scheduled ? new Date(fields.Scheduled) : null,
            date: fields.Date || "", // Store the creation timestamp from Airtable
            Scheduled: fields.Scheduled || "", // Store the publication date from Airtable
            finished: !!fields.Finished, // Store the finished state directly
            author: authorName,
            photo: photoName,
            photoCredit: null, // Not available in new schema
            status: fields.Finished ? "published" : "draft",
            hashtags: fields.Hashtags || "",
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

      // Log summary of what was synced
      console.log("\n=== Airtable Sync Summary ===");
      console.log(`Total records from Airtable: ${response.records.length}`);
      console.log(`Created: ${syncResults.created}`);
      console.log(`Updated: ${syncResults.updated}`);
      console.log(`Errors: ${syncResults.errors}`);

      // Show sample of synced data
      if (syncResults.details.length > 0) {
        console.log("\nFirst 5 sync actions:");
        syncResults.details.slice(0, 5).forEach(detail => console.log(`  - ${detail}`));
      }
      console.log("==============================\n");

      res.json({
        message: `Articles synced from Airtable (${response.records.length} total records processed)`,
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
            try {
              // Log the full structure to better understand the Airtable format
              console.log(`Team Member Record ${record.id}: image_url attachment structure:`, JSON.stringify(fields.image_url[0], null, 2));

              // Extract the URL from the attachment object
              // First try the url property, then check for thumbnails
              if (fields.image_url[0].url) {
                imageUrl = fields.image_url[0].url;
              } else if (fields.image_url[0].thumbnails && fields.image_url[0].thumbnails.full) {
                imageUrl = fields.image_url[0].thumbnails.full.url;
              } else if (fields.image_url[0].thumbnails && fields.image_url[0].thumbnails.large) {
                imageUrl = fields.image_url[0].thumbnails.large.url;
              }

              syncResults.details.push(`Record ${record.id}: Found team member image: ${imageUrl.substring(0, 50)}...`);
            } catch (error) {
              console.error(`Error parsing image_url for team member record ${record.id}:`, error);
              syncResults.details.push(`Record ${record.id}: Error parsing image_url, using default`);
              imageUrl = defaultImageUrl;
            }
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
        externalId: article.externalId || undefined,
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
          externalId: article.externalId || undefined
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
  // Update a single carousel quote in Airtable
  app.post("/api/airtable/update-quote/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const quoteData = req.body;

      if (!quoteData.externalId) {
        return res.status(400).json({
          success: false,
          message: "External ID (Airtable record ID) is required"
        });
      }

      // Get API key and base ID from settings
      const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
      const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
      const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "quotes_table");

      if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
        return res.status(400).json({
          success: false,
          message: "Airtable settings are not fully configured"
        });
      }

      const apiKey = apiKeySetting.value;
      const baseId = baseIdSetting.value;
      const tableName = tableNameSetting.value;

      // Convert to Airtable format
      const airtableFields = await convertCarouselQuoteToAirtableFormat(quoteData);

      // Log the fields being sent to Airtable for debugging
      console.log("Sending to Airtable for quote update:", {
        quoteId: id,
        externalId: quoteData.externalId,
        fields: airtableFields,
        originalData: {
          main: quoteData.main,
          philo: quoteData.philo
        }
      });

      // Create the Airtable update payload
      const airtableData = {
        records: [
          {
            id: quoteData.externalId,
            fields: airtableFields
          }
        ]
      };

      // Update the record in Airtable
      try {
        const response = await airtableRequest(
          apiKey,
          baseId,
          tableName,
          "PATCH",
          airtableData
        );

        // Update the local database record with the new Airtable fields
        const quote = await storage.getCarouselQuote(parseInt(id));
        if (quote) {
          await storage.updateCarouselQuote(quote.id, {
            main: quoteData.main || null,
            philo: quoteData.philo || null
          });
        }

        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: "update",
          resourceType: "carousel_quote",
          details: {
            id: parseInt(id),
            airtableId: quoteData.externalId,
            source: "direct"
          }
        });

        return res.json({
          success: true,
          message: "Quote updated in Airtable",
          data: response
        });
      } catch (error) {
        console.error("Error updating quote in Airtable:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update quote in Airtable",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (error) {
      console.error("Error in update quote endpoint:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  });

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

  // Push all carousel quotes to Airtable (batch)
  app.post("/api/airtable/push/carousel-quotes", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get Airtable settings
      const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
      const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
      const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "quotes_table");

      if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
        return res.status(400).json({
          success: false,
          message: "Airtable settings are not fully configured"
        });
      }

      const apiKey = apiKeySetting.value;
      const baseId = baseIdSetting.value;
      const tableName = tableNameSetting.value;

      // Get all quotes from the database
      const quotes = await storage.getCarouselQuotes();

      // Split into create (no externalId) and update (with externalId) operations
      const quotesToCreate = quotes.filter(q => !q.externalId);
      const quotesToUpdate = quotes.filter(q => q.externalId);

      const results = {
        created: 0,
        updated: 0,
        errors: 0,
        details: [] as string[]
      };

      // Process updates first (Airtable has a limit on batch operations, so we need to be careful)
      if (quotesToUpdate.length > 0) {
        // Convert quotes to Airtable format
        const updateRecords = await Promise.all(
          quotesToUpdate.map(async (quote) => {
            const fields = await convertCarouselQuoteToAirtableFormat(quote);
            return {
              id: quote.externalId,
              fields
            };
          })
        );

        // Batch update records in Airtable (max 10 at a time)
        for (let i = 0; i < updateRecords.length; i += 10) {
          const batch = updateRecords.slice(i, i + 10);
          try {
            await airtableRequest(
              apiKey,
              baseId,
              tableName,
              "PATCH",
              { records: batch }
            );
            results.updated += batch.length;
            results.details.push(`Updated ${batch.length} quotes in batch ${Math.floor(i / 10) + 1}`);
          } catch (error) {
            console.error(`Error updating batch ${Math.floor(i / 10) + 1}:`, error);
            results.errors += batch.length;
            results.details.push(`Error updating batch ${Math.floor(i / 10) + 1}: ${String(error)}`);
          }
        }
      }

      // Process creates next (for quotes without externalId)
      if (quotesToCreate.length > 0) {
        // Convert quotes to Airtable format
        const createRecords = await Promise.all(
          quotesToCreate.map(async (quote) => {
            const fields = await convertCarouselQuoteToAirtableFormat(quote);
            return { fields };
          })
        );

        // Batch create records in Airtable (max 10 at a time)
        for (let i = 0; i < createRecords.length; i += 10) {
          const batch = createRecords.slice(i, i + 10);
          try {
            const response = await airtableRequest(
              apiKey,
              baseId,
              tableName,
              "POST",
              { records: batch }
            ) as AirtableResponse<AirtableCarouselQuote>;

            // Update local records with the new external IDs
            for (let j = 0; j < response.records.length; j++) {
              const record = response.records[j];
              const quoteIndex = i + j;
              if (quoteIndex < quotesToCreate.length) {
                const quote = quotesToCreate[quoteIndex];
                // Update the quote with the externalId
                await storage.updateCarouselQuote(quote.id, {
                  externalId: record.id
                });
              }
            }

            results.created += batch.length;
            results.details.push(`Created ${batch.length} quotes in batch ${Math.floor(i / 10) + 1}`);
          } catch (error) {
            console.error(`Error creating batch ${Math.floor(i / 10) + 1}:`, error);
            results.errors += batch.length;
            results.details.push(`Error creating batch ${Math.floor(i / 10) + 1}: ${String(error)}`);
          }
        }
      }

      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "push",
        resourceType: "carousel_quotes",
        details: {
          source: "airtable",
          results
        }
      });

      res.json({
        message: "Carousel quotes pushed to Airtable",
        updated: results.updated,
        created: results.created,
        errors: results.errors,
        details: results.details
      });
    } catch (error) {
      console.error("Error pushing carousel quotes to Airtable:", error);
      res.status(500).json({
        success: false,
        message: "Failed to push carousel quotes to Airtable",
        error: error instanceof Error ? error.message : String(error)
      });
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
        externalId: article.externalId || undefined,
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

      // Always create a new record - don't check for existing record
      console.log("Creating new record in Airtable");
      console.log("Pushing article to Airtable:", JSON.stringify(fields, null, 2));

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

      // Update the article with the Airtable ID and change its source
      await storage.updateArticle(articleId, {
        externalId: airtableId,
        source: 'airtable'  // Change the source to 'airtable'
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

  // Upload an image file to Airtable for a specific article and field
  app.post("/api/airtable/upload-image/:articleId/:fieldName", upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const articleId = parseInt(req.params.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: "Invalid article ID" });
      }

      const fieldName = req.params.fieldName;
      if (!fieldName || (fieldName !== 'MainImage' && fieldName !== 'instaPhoto' && fieldName !== 'MainImageLink' && fieldName !== 'InstaPhotoLink')) {
        return res.status(400).json({ message: "Invalid field name. Must be 'MainImage', 'MainImageLink', 'instaPhoto', or 'InstaPhotoLink'" });
      }

      // Get the article from the database
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }

      // Check if this is an Airtable article
      if (article.source !== "airtable" || !article.externalId) {
        return res.status(400).json({ message: "This article is not from Airtable" });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      // Check if ImgBB integration is enabled
      const imgbbApiKeySetting = await storage.getIntegrationSettingByKey('imgbb', 'api_key');
      const isImgBBEnabled = imgbbApiKeySetting?.enabled && !!imgbbApiKeySetting?.value;

      if (isImgBBEnabled) {
        // ImgBB integration is enabled, using ImgBB as intermediary
        console.log("ImgBB integration is enabled, using ImgBB as intermediary for upload");

        // We can't use redirect here because we need to forward the file
        // So we'll call the ImgBB upload function directly
        const file = {
          path: req.file.path,
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        };

        // Step 1: Upload to ImgBB
        const imgbbResult = await uploadImageToImgBB(file);

        // Always cleanup the uploaded file after processing
        cleanupUploadedFile(file.path);

        if (!imgbbResult) {
          return res.status(500).json({ message: 'Failed to upload image to ImgBB' });
        }

        // Step 2: Upload ImgBB URL to Airtable
        const airtableResult = await uploadImageUrlToAirtable(
          imgbbResult.url,
          article.externalId,
          fieldName,
          file.filename
        );

        if (!airtableResult) {
          return res.status(500).json({
            message: 'Image uploaded to ImgBB but failed to update Airtable',
            imgbbUrl: imgbbResult.url
          });
        }

        // Step 3: Update the article in the database with the new image URL
        const updateData: Partial<InsertArticle> = {};

        if (fieldName === 'MainImage') {
          updateData.imageUrl = imgbbResult.url;
          updateData.imageType = 'url';
        } else if (fieldName === 'instaPhoto') {
          updateData.instagramImageUrl = imgbbResult.url;
        }

        await storage.updateArticle(articleId, updateData);

        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'upload',
          resourceType: 'image',
          resourceId: articleId.toString(),
          details: {
            fieldName,
            imgbbId: imgbbResult.id,
            imgbbUrl: imgbbResult.url,
            filename: file.filename
          }
        });

        return res.json({
          message: `Image uploaded successfully to ImgBB and then to ${fieldName}`,
          imgbb: {
            id: imgbbResult.id,
            url: imgbbResult.url,
            display_url: imgbbResult.display_url
          },
          airtable: airtableResult
        });
      }

      // Log debug information before uploading
      console.log("Airtable Image Upload Debug:", {
        articleId,
        externalId: article.externalId,
        fieldName,
        title: article.title,
        filePath: req.file.path,
        fileSize: req.file.size,
        fileMimetype: req.file.mimetype
      });

      // Upload the image to Airtable
      const result = await uploadImageToAirtable(
        {
          path: req.file.path,
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        },
        article.externalId,
        fieldName
      );

      // Log result or error
      if (result) {
        console.log("Airtable Image Upload Success:", {
          url: result.url,
          id: result.id,
          filename: result.filename
        });
      } else {
        console.error("Airtable Image Upload Failed for article:", {
          articleId,
          externalId: article.externalId
        });
      }

      // Clean up the uploaded file
      cleanupUploadedFile(req.file.path);

      if (!result) {
        return res.status(500).json({ message: "Failed to upload image to Airtable" });
      }

      // Update the article in the database with the new image URL
      const updateData: Partial<InsertArticle> = {};

      if (fieldName === 'MainImage') {
        updateData.imageUrl = result.url;
        updateData.imageType = 'url';
      } else if (fieldName === 'instaPhoto') {
        updateData.instagramImageUrl = result.url;
      }

      await storage.updateArticle(articleId, updateData);

      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "upload",
        resourceType: "image",
        resourceId: articleId.toString(),
        details: {
          fieldName,
          filename: req.file.originalname
        }
      });

      res.json({
        message: `Image uploaded successfully to ${fieldName}`,
        attachment: result
      });
    } catch (error) {
      console.error("Error uploading image to Airtable:", error);
      res.status(500).json({
        message: "Failed to upload image to Airtable",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Upload an image URL to Airtable for a specific article and field
  app.post("/api/airtable/upload-image-url/:articleId/:fieldName", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const articleId = parseInt(req.params.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: "Invalid article ID" });
      }

      const fieldName = req.params.fieldName;
      if (!fieldName || (fieldName !== 'MainImage' && fieldName !== 'instaPhoto' && fieldName !== 'MainImageLink' && fieldName !== 'InstaPhotoLink')) {
        return res.status(400).json({ message: "Invalid field name. Must be 'MainImage', 'MainImageLink', 'instaPhoto', or 'InstaPhotoLink'" });
      }

      const { imageUrl, filename } = req.body;

      if (!imageUrl) {
        return res.status(400).json({ message: "Image URL is required" });
      }

      if (!filename) {
        return res.status(400).json({ message: "Filename is required" });
      }

      // Get the article from the database
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }

      // Check if this is an Airtable article
      if (article.source !== "airtable" || !article.externalId) {
        return res.status(400).json({ message: "This article is not from Airtable" });
      }

      // Check if ImgBB integration is enabled
      const imgbbApiKeySetting = await storage.getIntegrationSettingByKey('imgbb', 'api_key');
      const isImgBBEnabled = imgbbApiKeySetting?.enabled && !!imgbbApiKeySetting?.value;

      if (isImgBBEnabled) {
        // ImgBB integration is enabled, using ImgBB as intermediary
        console.log("ImgBB integration is enabled, using ImgBB as intermediary for URL upload");

        // We'll call the ImgBB upload function directly rather than redirecting
        // Step 1: Upload URL to ImgBB
        const imgbbResult = await uploadImageUrlToImgBB(imageUrl, filename);

        if (!imgbbResult) {
          return res.status(500).json({ message: 'Failed to upload image URL to ImgBB' });
        }

        // Step 2: Upload ImgBB URL to Airtable using the new link field approach
        // Map the field names to their link field equivalents
        const fieldMappings: Record<string, string> = {
          'MainImage': 'MainImageLink',
          'instaPhoto': 'InstaPhotoLink',
          'MainImageLink': 'MainImageLink',
          'InstaPhotoLink': 'InstaPhotoLink'
        };

        // Use the mapped field name or fallback to original
        const targetFieldName = fieldMappings[fieldName] || fieldName;

        // Upload using the new link field function
        const airtableResult = await uploadImageUrlAsLinkField(
          imgbbResult.url,
          article.externalId,
          targetFieldName
        );

        if (!airtableResult) {
          return res.status(500).json({
            message: 'Image uploaded to ImgBB but failed to update Airtable',
            imgbbUrl: imgbbResult.url
          });
        }

        // Step 3: Update the article in the database with the new image URL
        const updateData: Partial<InsertArticle> = {};

        if (fieldName === 'MainImage') {
          updateData.imageUrl = imgbbResult.url;
          updateData.imageType = 'url';
        } else if (fieldName === 'instaPhoto') {
          updateData.instagramImageUrl = imgbbResult.url;
        }

        await storage.updateArticle(articleId, updateData);

        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'upload',
          resourceType: 'image_url',
          resourceId: articleId.toString(),
          details: {
            fieldName,
            originalUrl: imageUrl,
            imgbbId: imgbbResult.id,
            imgbbUrl: imgbbResult.url,
            filename
          }
        });

        return res.json({
          message: `Image URL uploaded successfully to ImgBB and then to ${fieldName}`,
          imgbb: {
            id: imgbbResult.id,
            url: imgbbResult.url,
            display_url: imgbbResult.display_url
          },
          airtable: airtableResult
        });
      }

      // Log debug information before uploading
      console.log("Airtable Image URL Upload Debug:", {
        articleId,
        externalId: article.externalId,
        fieldName,
        title: article.title,
        imageUrl,
        filename
      });

      // Map the field names to their link field equivalents
      const fieldMappings: Record<string, string> = {
        'MainImage': 'MainImageLink',
        'instaPhoto': 'InstaPhotoLink',
        'InstaPhotoLink': 'InstaPhotoLink',
        'MainImageLink': 'MainImageLink'
      };

      // Use the mapped field name or fallback to original
      const targetFieldName = fieldMappings[fieldName] || fieldName;

      console.log(`Using link field approach: ${fieldName} → ${targetFieldName}`);

      // Upload the image URL to Airtable using the new link field approach
      const result = await uploadImageUrlAsLinkField(
        imageUrl,
        article.externalId,
        targetFieldName
      );

      // Log result or error (note: using link fields returns boolean, not attachment object)
      if (result) {
        console.log("Airtable Image URL Upload Success (link field):", {
          url: imageUrl,
          fieldName: targetFieldName,
          originalField: fieldName
        });
      } else {
        console.error("Airtable Image URL Upload Failed for article:", {
          articleId,
          externalId: article.externalId,
          fieldName: targetFieldName
        });
      }

      if (!result) {
        return res.status(500).json({ message: "Failed to upload image URL to Airtable" });
      }

      // Update the article in the database with the image URL
      // For link fields, result is a boolean, so we use the original imageUrl
      const updateData: Partial<InsertArticle> = {};

      if (fieldName === 'MainImage' || fieldName === 'MainImageLink') {
        updateData.imageUrl = imageUrl;
        updateData.imageType = 'url';
      } else if (fieldName === 'instaPhoto' || fieldName === 'InstaPhotoLink') {
        updateData.instagramImageUrl = imageUrl;
      }

      await storage.updateArticle(articleId, updateData);

      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "upload",
        resourceType: "image_url",
        resourceId: articleId.toString(),
        details: {
          fieldName,
          imageUrl,
          filename
        }
      });

      res.json({
        message: `Image URL uploaded successfully to ${targetFieldName}`,
        success: true,
        fieldName: targetFieldName,
        originalField: fieldName,
        imageUrl: imageUrl
      });
    } catch (error) {
      console.error("Error uploading image URL to Airtable:", error);
      res.status(500).json({
        message: "Failed to upload image URL to Airtable",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
