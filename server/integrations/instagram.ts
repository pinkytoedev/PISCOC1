import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { Article } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as crypto from "crypto";

// Environment variables for Instagram API
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;

// Interface definitions for Graph API responses
interface IGInstagramUser {
  id: string;
  username: string;
}

interface IGContainer {
  id: string;
  status_code: string;
}

interface IGMedia {
  id: string;
  media_type: string;
  media_url: string;
  permalink: string;
  timestamp: string;
  caption?: string;
  username?: string;
}

/**
 * Utility function to make Graph API requests
 */
async function graphAPIRequest(
  endpoint: string, 
  accessToken: string, 
  method: string = 'GET',
  params: Record<string, any> = {}
) {
  const url = new URL(`https://graph.facebook.com/v19.0${endpoint}`);
  
  // Add access token to all requests
  url.searchParams.append('access_token', accessToken);
  
  // Add parameters for GET requests
  if (method === 'GET') {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value.toString());
    }
  }
  
  const options: RequestInit = {
    method,
    headers: {
      'Accept': 'application/json',
    }
  };
  
  // Add body for non-GET requests
  if (method !== 'GET' && Object.keys(params).length > 0) {
    const formData = new URLSearchParams();
    
    for (const [key, value] of Object.entries(params)) {
      formData.append(key, value.toString());
    }
    
    options.body = formData;
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }
  
  const response = await fetch(url.toString(), options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph API error (${response.status}): ${errorText}`);
  }
  
  return await response.json();
}

/**
 * Download an image from a URL and save it locally
 */
async function downloadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Generate a temporary file name
    const fileName = `temp_${crypto.randomBytes(8).toString('hex')}.jpg`;
    const tempDir = path.join(process.cwd(), 'temp');
    const filePath = path.join(tempDir, fileName);
    
    // Ensure the temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Download the file
    const file = fs.createWriteStream(filePath);
    https.get(url, (response) => {
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve(filePath);
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete the file
      reject(err);
    });
  });
}

/**
 * Verify Instagram webhook request
 */
function verifyWebhookSignature(req: Request, appSecret: string): boolean {
  const signature = req.headers['x-hub-signature'];
  
  if (!signature || typeof signature !== 'string') {
    return false;
  }
  
  const elements = signature.split('=');
  const signatureHash = elements[1];
  
  const expectedHash = crypto
    .createHmac('sha1', appSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');
    
  return signatureHash === expectedHash;
}



// Handler functions for Instagram webhooks

/**
 * Handle Instagram mention webhooks
 */
function handleInstagramMention(value: any) {
  try {
    // Instagram mentions typically include:
    // - user_id: ID of the mentioned user
    // - media_id: ID of the media where the mention happened
    // - comment_id: ID of the comment if mention is in a comment
    
    console.log("Processing Instagram mention with data:", value);
    
    // Additional processing can be implemented as needed
    // For example, fetching media details and storing in the database
  } catch (error) {
    console.error("Error handling Instagram mention:", error);
  }
}

/**
 * Handle Instagram comment webhooks
 */
function handleInstagramComment(value: any) {
  try {
    // Instagram comments typically include:
    // - media_id: ID of the media commented on
    // - comment_id: ID of the comment
    // - text: Comment text
    // - user_id: User ID of commenter
    
    console.log("Processing Instagram comment with data:", value);
    
    // Additional processing can be implemented as needed
  } catch (error) {
    console.error("Error handling Instagram comment:", error);
  }
}

/**
 * Handle Instagram media webhooks
 */
function handleInstagramMedia(value: any) {
  try {
    // Instagram media updates typically include:
    // - media_id: ID of the media
    // - media_product_type: Type of media (FEED, STORY, REELS)
    // - status: Status change (CREATED, DELETED, etc.)
    
    console.log("Processing Instagram media with data:", value);
    
    // Additional processing can be implemented as needed
  } catch (error) {
    console.error("Error handling Instagram media:", error);
  }
}

/**
 * Handle Instagram direct message webhooks
 */
function handleInstagramMessage(value: any) {
  try {
    console.log("Processing Instagram message with data:", value);
    
    // Record the message
    // Additional processing can be implemented as needed
  } catch (error) {
    console.error("Error handling Instagram message:", error);
  }
}

/**
 * Handle Instagram story insights webhooks
 */
function handleInstagramStoryInsights(value: any) {
  try {
    console.log("Processing Instagram story insights with data:", value);
    
    // Record the story insights
    // Additional processing can be implemented as needed
  } catch (error) {
    console.error("Error handling Instagram story insights:", error);
  }
}

/**
 * Handle Instagram messaging platform webhooks
 */
function handleInstagramMessagingEvent(field: string, value: any) {
  try {
    console.log(`Processing Instagram ${field} event with data:`, value);
    
    // Record the messaging platform event
    // Additional processing can be implemented as needed
  } catch (error) {
    console.error(`Error handling Instagram ${field}:`, error);
  }
}

export function setupInstagramRoutes(app: Express) {
  // Get Instagram integration settings
  app.get("/api/instagram/settings", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const settings = await storage.getIntegrationSettings("instagram");
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ 
        message: "Failed to fetch Instagram settings",
        error: error.message 
      });
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
    } catch (error: any) {
      res.status(500).json({ 
        message: "Failed to update Instagram settings",
        error: error.message 
      });
    }
  });

  // Facebook OAuth redirect handler for Instagram Business
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
      
      // Exchange code for access token from Facebook
      const tokenResponse = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`, {
        method: "GET"
      });
      
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        return res.status(tokenResponse.status).json({
          message: "Failed to exchange code for token",
          error: errorText
        });
      }
      
      const tokenData = await tokenResponse.json();
      const shortLivedAccessToken = tokenData.access_token;
      
      // Exchange short-lived token for long-lived token
      const longLivedTokenResponse = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedAccessToken}`, {
        method: "GET"
      });
      
      if (!longLivedTokenResponse.ok) {
        const errorText = await longLivedTokenResponse.text();
        return res.status(longLivedTokenResponse.status).json({
          message: "Failed to exchange for long-lived token",
          error: errorText
        });
      }
      
      const longLivedTokenData = await longLivedTokenResponse.json();
      const longLivedAccessToken = longLivedTokenData.access_token;
      
      // Get Facebook Page ID and access token
      const accountsResponse = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedAccessToken}`);
      const accountsData = await accountsResponse.json();
      
      if (!accountsData.data || accountsData.data.length === 0) {
        return res.status(400).json({ message: "No Facebook Pages found for this account" });
      }
      
      const pageId = accountsData.data[0].id;
      const pageAccessToken = accountsData.data[0].access_token;
      
      // Get Instagram business account ID
      const instagramAccountsResponse = await fetch(`https://graph.facebook.com/v19.0/${pageId}/instagram_accounts?access_token=${pageAccessToken}`);
      const instagramAccountsData = await instagramAccountsResponse.json();
      
      if (!instagramAccountsData.data || instagramAccountsData.data.length === 0) {
        return res.status(400).json({ message: "No Instagram Business accounts found for this Facebook Page" });
      }
      
      const instagramAccountId = instagramAccountsData.data[0].id;
      
      // Get Instagram business account
      const instagramBusinessResponse = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`);
      const instagramBusinessData = await instagramBusinessResponse.json();
      
      if (!instagramBusinessData.instagram_business_account) {
        return res.status(400).json({ message: "No Instagram Business account connected to this Facebook Page" });
      }
      
      const instagramBusinessId = instagramBusinessData.instagram_business_account.id;
      
      // Save all the necessary tokens and IDs
      const settingsToSave = [
        { key: "facebook_access_token", value: longLivedAccessToken },
        { key: "page_id", value: pageId },
        { key: "page_access_token", value: pageAccessToken },
        { key: "instagram_account_id", value: instagramAccountId },
        { key: "instagram_business_id", value: instagramBusinessId },
      ];
      
      for (const setting of settingsToSave) {
        const existingSetting = await storage.getIntegrationSettingByKey("instagram", setting.key);
        
        if (existingSetting) {
          await storage.updateIntegrationSetting(existingSetting.id, {
            value: setting.value
          });
        } else {
          await storage.createIntegrationSetting({
            service: "instagram",
            key: setting.key,
            value: setting.value,
            enabled: true
          });
        }
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "connect",
        resourceType: "instagram",
        resourceId: instagramBusinessId,
        details: { 
          service: "instagram",
          instagramBusinessId
        }
      });
      
      // Redirect to the Instagram integration page
      res.redirect("/integrations/instagram?connected=true");
    } catch (error: any) {
      console.error("Instagram auth callback error:", error);
      res.status(500).json({ message: "Failed to process Instagram authorization", error: error.message });
    }
  });

  // Get Instagram/Facebook authorization URL
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
      
      // For business integration, we need permissions for Instagram Graph API via Facebook
      const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,pages_manage_posts&response_type=code`;
      
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
      
      const pageAccessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "page_access_token");
      const instagramBusinessIdSetting = await storage.getIntegrationSettingByKey("instagram", "instagram_business_id");
      
      const connected = !!(pageAccessTokenSetting?.value && instagramBusinessIdSetting?.value);
      
      // If connected, try to get some basic information to verify the connection
      if (connected) {
        try {
          const response = await graphAPIRequest(
            `/${instagramBusinessIdSetting.value}`, 
            pageAccessTokenSetting.value, 
            'GET',
            { fields: 'username,profile_picture_url' }
          );
          
          return res.json({ 
            connected: true,
            accountInfo: {
              id: response.id,
              username: response.username,
              profilePicture: response.profile_picture_url
            }
          });
        } catch (error: any) {
          console.error("Error verifying Instagram connection:", error);
          // If we can't connect, consider it disconnected
          return res.json({ connected: false, error: error.message });
        }
      }
      
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
      
      const articleId = parseInt(req.params.articleId);
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      // Check if we have necessary settings and article has an image
      const pageAccessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "page_access_token");
      const instagramBusinessIdSetting = await storage.getIntegrationSettingByKey("instagram", "instagram_business_id");
      
      if (!pageAccessTokenSetting?.value || !instagramBusinessIdSetting?.value) {
        return res.status(400).json({ message: "Instagram integration not fully configured" });
      }
      
      if (!article.imageUrl) {
        return res.status(400).json({ message: "Article must have an image to publish to Instagram" });
      }
      
      const accessToken = pageAccessTokenSetting.value;
      const instagramAccountId = instagramBusinessIdSetting.value;
      
      // Prepare the caption
      const caption = `${article.title}
      
${article.description || ''}
      
${article.hashtags || ''}`;
      
      // Implement actual Instagram publishing using Graph API
      try {
        // 1. First create a media container with the image URL
        const createContainerResponse = await graphAPIRequest(
          `/${instagramAccountId}/media`,
          accessToken,
          'POST',
          {
            image_url: article.imageUrl,
            caption: caption,
            access_token: accessToken
          }
        );
        
        const containerId = createContainerResponse.id;
        
        // 2. Then publish the container
        const publishResponse = await graphAPIRequest(
          `/${instagramAccountId}/media_publish`,
          accessToken,
          'POST',
          {
            creation_id: containerId,
            access_token: accessToken
          }
        );
        
        // Update the article with Instagram as source if needed
        if (article.source && !article.source.includes("instagram")) {
          await storage.updateArticle(articleId, {
            source: article.source === "manual" ? "instagram" : `${article.source},instagram`
          });
        } else if (!article.source) {
          await storage.updateArticle(articleId, {
            source: "instagram"
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
            article: article.title,
            instagramMediaId: publishResponse.id
          }
        });
        
        res.json({ 
          success: true,
          message: "Article published to Instagram successfully",
          mediaId: publishResponse.id
        });
      } catch (error: any) {
        console.error("Error publishing to Instagram:", error);
        return res.status(500).json({ 
          message: "Failed to publish to Instagram", 
          error: error.message,
          note: "This could be due to rate limits, permission issues, or an invalid image URL"
        });
      }
    } catch (error) {
      console.error("Instagram publish error:", error);
      res.status(500).json({ message: "Failed to publish article to Instagram" });
    }
  });

  // Get Instagram recent posts
  app.get("/api/instagram/recent-posts", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const pageAccessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "page_access_token");
      const instagramBusinessIdSetting = await storage.getIntegrationSettingByKey("instagram", "instagram_business_id");
      
      if (!pageAccessTokenSetting?.value || !instagramBusinessIdSetting?.value) {
        return res.status(400).json({ message: "Instagram integration not fully configured" });
      }
      
      const accessToken = pageAccessTokenSetting.value;
      const instagramAccountId = instagramBusinessIdSetting.value;
      
      try {
        // Get recent media from Instagram
        const mediaResponse = await graphAPIRequest(
          `/${instagramAccountId}/media`,
          accessToken,
          'GET',
          {
            fields: 'id,caption,media_type,media_url,permalink,timestamp,username',
            limit: 25
          }
        );
        
        res.json({ data: mediaResponse.data || [] });
      } catch (error: any) {
        console.error("Error fetching Instagram media:", error);
        
        // If we get an API error, return a fallback of articles published to Instagram
        const allArticles = await storage.getArticles();
        const instagramArticles = allArticles.filter(article => 
          article.source && (article.source === "instagram" || article.source.includes("instagram"))
        );
        
        // Convert to Instagram post format
        const fallbackPosts = instagramArticles.map((article: Article) => ({
          id: `ig_${article.id}`,
          caption: `${article.title}\n\n${article.description || ''}\n\n${article.hashtags || ''}`,
          media_url: article.imageUrl,
          timestamp: article.publishedAt || article.createdAt,
          permalink: `https://instagram.com/p/${article.id}`, // Simulated permalink
          media_type: "IMAGE",
          fallback: true
        }));
        
        res.json({ 
          data: fallbackPosts,
          error: error.message,
          fallback: true
        });
      }
    } catch (error) {
      console.error("Instagram recent posts error:", error);
      res.status(500).json({ message: "Failed to fetch Instagram recent posts" });
    }
  });
  
  // Instagram Webhook Setup
  /**
   * Instagram Webhook Verification Endpoint
   * 
   * Facebook/Instagram will call this endpoint to verify the webhook during registration.
   * 
   * When creating a webhook subscription, Instagram will make a GET request to this endpoint 
   * with the following query parameters:
   * - hub.mode: Should be "subscribe"
   * - hub.verify_token: The token we provided during subscription
   * - hub.challenge: A challenge string that we need to echo back to confirm
   * 
   * For more information see: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
   */
  app.get("/api/instagram/webhook", (req, res) => {
    try {
      // Facebook sends a verification request to confirm the webhook
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      
      console.log("Instagram webhook verification request received", {
        mode, 
        tokenProvided: !!token,
        challengeProvided: !!challenge
      });
      
      // Get the verification token from settings
      const webhookTokenSetting = INSTAGRAM_APP_SECRET;
      
      // Check if mode and token are in the query string
      if (mode && token) {
        // Verify that the mode is 'subscribe' and the token matches
        if (mode === 'subscribe' && token === webhookTokenSetting) {
          // Respond with the challenge token to confirm subscription
          console.log("Instagram webhook verified successfully");
          return res.status(200).send(challenge);
        }
        console.log("Instagram webhook verification failed: Invalid token or mode");
        return res.sendStatus(403);
      }
      
      console.log("Instagram webhook verification failed: Missing parameters");
      return res.sendStatus(400);
    } catch (error: any) {
      console.error("Instagram webhook verification error:", error);
      res.status(500).json({ message: "Failed to verify webhook", error: error.message });
    }
  });
  
  /**
   * Instagram Webhook Event Reception
   * 
   * This endpoint handles incoming webhook events from Instagram.
   * It processes events like mentions, comments, media updates, etc.
   * 
   * The webhook data format from Instagram follows this structure:
   * {
   *   "object": "instagram",
   *   "entry": [
   *     {
   *       "id": "<INSTAGRAM_ID>",
   *       "time": 1234567890,
   *       "changes": [
   *         {
   *           "field": "<FIELD_TYPE>",
   *           "value": {
   *             // Field-specific data
   *           }
   *         }
   *       ]
   *     }
   *   ]
   * }
   * 
   * For more information see: https://developers.facebook.com/docs/instagram-platform/webhooks
   */
  app.post("/api/instagram/webhook", (req, res) => {
    try {
      // Verify the request signature
      if (!verifyWebhookSignature(req, INSTAGRAM_APP_SECRET || '')) {
        console.error("Instagram webhook signature verification failed");
        return res.sendStatus(403);
      }
      
      // Handle the webhook event
      const data = req.body;
      
      // Log the webhook data
      console.log("Instagram webhook received:", JSON.stringify(data, null, 2));
      
      // Process different Instagram webhook events 
      if (data.object === 'instagram') {
        for (const entry of data.entry) {
          // Record the webhook event in the activity log
          storage.createActivityLog({
            userId: null, // System event
            action: "webhook",
            resourceType: "instagram",
            resourceId: entry.id,
            details: {
              service: "instagram",
              webhookData: data
            }
          }).catch(err => console.error("Failed to log webhook event:", err));
          
          // Handle different Instagram webhook events
          if (entry.changes) {
            for (const change of entry.changes) {
              const field = change.field;
              const value = change.value;
              
              try {
                switch (field) {
                  case 'mentions':
                    // Process mentions
                    console.log("Instagram mention received:", value);
                    handleInstagramMention(value);
                    break;
                    
                  case 'comments':
                    // Process comments
                    console.log("Instagram comment received:", value);
                    handleInstagramComment(value);
                    break;
                    
                  case 'media':
                    // Process media updates
                    console.log("Instagram media update received:", value);
                    handleInstagramMedia(value);
                    break;
                    
                  case 'messages':
                    // Process direct messages
                    console.log("Instagram message received:", value);
                    handleInstagramMessage(value);
                    break;
                    
                  case 'story_insights':
                    // Process story insights
                    console.log("Instagram story insights received:", value);
                    handleInstagramStoryInsights(value);
                    break;
                    
                  case 'messaging_account_linking':
                  case 'messaging_feedback':
                  case 'messaging_handovers':
                  case 'messaging_optins':
                  case 'messaging_payments':
                  case 'messaging_policy_enforcement':
                  case 'messaging_postbacks':
                  case 'messaging_pre_checkouts':
                  case 'messaging_referrals':
                    // Process messaging platform events
                    console.log(`Instagram ${field} event received:`, value);
                    handleInstagramMessagingEvent(field, value);
                    break;
                    
                  default:
                    console.log(`Unhandled Instagram webhook field: ${field}`, value);
                }
              } catch (err) {
                console.error(`Error processing Instagram webhook field ${field}:`, err);
                // Continue processing other changes even if one fails
              }
            }
          }
        }
      }
      
      // Always return a 200 OK to acknowledge receipt
      res.sendStatus(200);
    } catch (error: any) {
      console.error("Instagram webhook processing error:", error);
      // Still return 200 to prevent retries
      res.sendStatus(200);
    }
  });

  /**
   * Get Instagram webhook subscriptions
   * 
   * Returns a list of all active webhook subscriptions for the Instagram app
   */
  app.get("/api/instagram/webhooks", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
        return res.status(400).json({ message: "Missing Instagram app credentials" });
      }
      
      const pageAccessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "page_access_token");
      
      if (!pageAccessTokenSetting?.value) {
        return res.status(400).json({ message: "Instagram integration not fully configured" });
      }
      
      const accessToken = pageAccessTokenSetting.value;
      const appId = INSTAGRAM_APP_ID;
      
      try {
        // Get existing webhook subscriptions
        const subscriptionsResponse = await fetch(`https://graph.facebook.com/v19.0/${appId}/subscriptions?access_token=${accessToken}`);
        
        if (!subscriptionsResponse.ok) {
          const errorData = await subscriptionsResponse.json();
          console.error("Failed to fetch Instagram webhook subscriptions:", errorData);
          return res.status(subscriptionsResponse.status).json({
            message: "Failed to fetch webhook subscriptions",
            error: errorData
          });
        }
        
        const subscriptionsData = await subscriptionsResponse.json();
        
        // Get webhook settings from our database
        const webhookUrlSetting = await storage.getIntegrationSettingByKey("instagram", "webhook_url");
        const webhookFieldsSetting = await storage.getIntegrationSettingByKey("instagram", "webhook_fields");
        
        res.json({
          externalSubscriptions: subscriptionsData.data,
          settings: {
            webhookUrl: webhookUrlSetting?.value,
            webhookFields: webhookFieldsSetting?.value
          }
        });
      } catch (error: any) {
        console.error("Error fetching Instagram webhook subscriptions:", error);
        res.status(500).json({ 
          message: "Failed to fetch webhook subscriptions", 
          error: error.message 
        });
      }
    } catch (error: any) {
      console.error("Instagram webhook fetching error:", error);
      res.status(500).json({ 
        message: "Failed to fetch Instagram webhook information", 
        error: error.message 
      });
    }
  });
  
  /**
   * Subscribe to Instagram webhooks
   * 
   * Creates or updates webhook subscriptions for Instagram events
   */
  app.post("/api/instagram/webhooks/subscribe", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
        return res.status(400).json({ message: "Missing Instagram app credentials" });
      }
      
      const pageAccessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "page_access_token");
      
      if (!pageAccessTokenSetting?.value) {
        return res.status(400).json({ message: "Instagram integration not fully configured" });
      }
      
      const accessToken = pageAccessTokenSetting.value;
      const appId = INSTAGRAM_APP_ID;
      
      // Get the callback URL
      const webhookCallbackUrl = req.body.webhookUrl || `${req.protocol}://${req.get('host')}/api/instagram/webhook`;
      
      // Define available Instagram webhook fields
      const availableWebhookFields: Record<string, string[]> = {
        basic: ['mentions', 'comments', 'media', 'messages', 'story_insights'],
        messaging: [
          'messaging_account_linking', 
          'messaging_feedback', 
          'messaging_handovers', 
          'messaging_optins', 
          'messaging_payments', 
          'messaging_policy_enforcement', 
          'messaging_postbacks', 
          'messaging_pre_checkouts', 
          'messaging_referrals'
        ]
      };
      
      // Process requested fields
      let fields;
      
      if (req.body.fields) {
        // If specific fields requested, use them
        fields = req.body.fields;
      } else if (req.body.fieldGroups && Array.isArray(req.body.fieldGroups)) {
        // If field groups requested, build the list
        const fieldSet = new Set<string>();
        
        if (req.body.fieldGroups.includes('all')) {
          // If 'all' requested, use all available fields
          Object.values(availableWebhookFields).forEach(group => 
            group.forEach(field => fieldSet.add(field))
          );
        } else {
          // Otherwise, add requested field groups
          req.body.fieldGroups.forEach((group: string) => {
            if (availableWebhookFields[group]) {
              availableWebhookFields[group].forEach(field => fieldSet.add(field));
            }
          });
        }
        
        // Convert to comma-separated string
        fields = Array.from(fieldSet).join(',');
      } else {
        // Default to all fields if nothing specified
        fields = [...availableWebhookFields.basic, ...availableWebhookFields.messaging].join(',');
      }
      
      // Create or update a webhook subscription for the app
      const subscribeResponse = await fetch(`https://graph.facebook.com/v19.0/${appId}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          object: 'instagram',
          callback_url: webhookCallbackUrl,
          verify_token: INSTAGRAM_APP_SECRET,
          fields: fields,
          access_token: accessToken
        }).toString()
      });
      
      if (!subscribeResponse.ok) {
        const errorData = await subscribeResponse.json();
        console.error("Instagram webhook subscription API error:", JSON.stringify(errorData));
        return res.status(400).json({ 
          message: "Failed to subscribe to Instagram webhooks", 
          error: errorData 
        });
      }
      
      const subscribeData = await subscribeResponse.json();
      
      // Save webhook URL to settings
      const webhookUrlSetting = await storage.getIntegrationSettingByKey("instagram", "webhook_url");
      
      if (webhookUrlSetting) {
        await storage.updateIntegrationSetting(webhookUrlSetting.id, {
          value: webhookCallbackUrl
        });
      } else {
        await storage.createIntegrationSetting({
          service: "instagram",
          key: "webhook_url",
          value: webhookCallbackUrl,
          enabled: true
        });
      }
      
      // Save webhook fields to settings
      const webhookFieldsSetting = await storage.getIntegrationSettingByKey("instagram", "webhook_fields");
      
      if (webhookFieldsSetting) {
        await storage.updateIntegrationSetting(webhookFieldsSetting.id, {
          value: fields
        });
      } else {
        await storage.createIntegrationSetting({
          service: "instagram",
          key: "webhook_fields",
          value: fields,
          enabled: true
        });
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "subscribe",
        resourceType: "instagram_webhook",
        resourceId: appId,
        details: { 
          service: "instagram",
          webhookUrl: webhookCallbackUrl,
          fields: fields
        }
      });
      
      res.json({ 
        success: true, 
        message: "Successfully subscribed to Instagram webhooks",
        data: subscribeData,
        fieldGroups: availableWebhookFields,
        selectedFields: fields.split(',')
      });
    } catch (error: any) {
      console.error("Instagram webhook subscription error:", error);
      res.status(500).json({ 
        message: "Failed to subscribe to Instagram webhooks", 
        error: error.message 
      });
    }
  });
  
  app.get("/api/instagram/insights", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const pageAccessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "page_access_token");
      const instagramBusinessIdSetting = await storage.getIntegrationSettingByKey("instagram", "instagram_business_id");
      
      if (!pageAccessTokenSetting?.value || !instagramBusinessIdSetting?.value) {
        return res.status(400).json({ message: "Instagram integration not fully configured" });
      }
      
      const accessToken = pageAccessTokenSetting.value;
      const instagramAccountId = instagramBusinessIdSetting.value;
      
      try {
        // Get profile insights
        const insightsResponse = await graphAPIRequest(
          `/${instagramAccountId}/insights`,
          accessToken,
          'GET',
          {
            metric: 'impressions,reach,profile_views',
            period: 'day',
            limit: 10
          }
        );
        
        res.json(insightsResponse);
      } catch (error: any) {
        console.error("Error fetching Instagram insights:", error);
        res.status(500).json({ 
          message: "Failed to fetch Instagram insights", 
          error: error.message
        });
      }
    } catch (error) {
      console.error("Instagram insights error:", error);
      res.status(500).json({ message: "Failed to fetch Instagram insights" });
    }
  });
}
