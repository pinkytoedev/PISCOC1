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

  // Instagram Login OAuth redirect handler 
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
      
      console.log("Instagram auth: Exchanging authorization code for access token");
      console.log("Instagram auth: Using redirect URI:", redirectUri);
      console.log("Instagram auth: Using client ID:", clientId.substring(0, 4) + '...');
      
      // Define this variable in the outer scope so it's available throughout the function
      let shortLivedAccessToken;
      
      try {
        // Exchange code for access token from Facebook
        const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
        console.log("Instagram auth: Token exchange URL format:", 
          `https://graph.facebook.com/v19.0/oauth/access_token?client_id=XXXX...&client_secret=XXXX...&redirect_uri=${encodeURIComponent(redirectUri)}&code=XXXX...`);
        
        const tokenResponse = await fetch(tokenUrl, {
          method: "GET"
        });
        
        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error("Instagram auth: Failed to exchange code for token:", {
            status: tokenResponse.status,
            statusText: tokenResponse.statusText,
            response: errorText
          });
          return res.status(tokenResponse.status).json({
            message: "Failed to exchange code for token",
            error: errorText
          });
        }
        
        const tokenData = await tokenResponse.json();
        console.log("Instagram auth: Successfully received short-lived token");
        shortLivedAccessToken = tokenData.access_token;
      } catch (error: any) {
        console.error("Instagram auth: Error during token exchange:", error);
        return res.status(500).json({
          message: "Error exchanging authorization code",
          error: error.message || "Unknown error during token exchange"
        });
      }
      
      if (!shortLivedAccessToken) {
        console.error("Instagram auth: No short-lived access token received");
        return res.status(500).json({
          message: "Failed to receive access token from Facebook"
        });
      }
      
      console.log("Instagram auth: Exchanging short-lived token for long-lived token");
      
      // Exchange short-lived token for long-lived token
      const longLivedTokenResponse = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedAccessToken}`, {
        method: "GET"
      });
      
      if (!longLivedTokenResponse.ok) {
        const errorText = await longLivedTokenResponse.text();
        console.error("Failed to exchange for long-lived token:", errorText);
        return res.status(longLivedTokenResponse.status).json({
          message: "Failed to exchange for long-lived token",
          error: errorText
        });
      }
      
      const longLivedTokenData = await longLivedTokenResponse.json();
      const longLivedAccessToken = longLivedTokenData.access_token;
      
      console.log("Getting user's Instagram account information");
      
      // First get the user profile to get the Instagram Professional accounts
      const userProfileResponse = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${longLivedAccessToken}`);
      const userProfile = await userProfileResponse.json();
      
      if (!userProfile.id) {
        console.error("Failed to retrieve user profile:", userProfile);
        return res.status(400).json({ message: "Failed to retrieve Facebook user profile" });
      }
      
      // Get the Instagram professional accounts directly from the user
      const instagramAccountsResponse = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedAccessToken}`);
      const accountsData = await instagramAccountsResponse.json();
      
      if (!accountsData.data || accountsData.data.length === 0) {
        console.error("No Facebook Pages found:", accountsData);
        return res.status(400).json({ message: "No Facebook Pages found for this account. You need a Facebook Page linked to your Instagram Professional account." });
      }
      
      // Get the first page that has an Instagram Business account connected
      let pageWithInstagram = null;
      let instagramBusinessId = null;
      
      // Check each page for an Instagram business account
      for (const page of accountsData.data) {
        const pageId = page.id;
        const pageAccessToken = page.access_token;
        
        // Check if this page has an Instagram business account
        const instagramCheckResponse = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`);
        const instagramCheckData = await instagramCheckResponse.json();
        
        if (instagramCheckData.instagram_business_account) {
          pageWithInstagram = page;
          instagramBusinessId = instagramCheckData.instagram_business_account.id;
          break;
        }
      }
      
      if (!pageWithInstagram || !instagramBusinessId) {
        console.error("No Instagram Professional account found on any pages");
        return res.status(400).json({ 
          message: "No Instagram Professional account connected to any of your Facebook Pages",
          detail: "You need to connect an Instagram Professional account to one of your Facebook Pages in the Instagram app or at business.facebook.com"
        });
      }
      
      const pageId = pageWithInstagram.id;
      const pageAccessToken = pageWithInstagram.access_token;
      
      // Get additional details about the Instagram business account
      const instagramAccountResponse = await fetch(`https://graph.facebook.com/v19.0/${instagramBusinessId}?fields=username,profile_picture_url&access_token=${pageAccessToken}`);
      const instagramAccountData = await instagramAccountResponse.json();
      
      if (!instagramAccountData.id) {
        console.error("Failed to retrieve Instagram account details:", instagramAccountData);
        return res.status(400).json({ message: "Failed to retrieve Instagram account details" });
      }
      
      console.log("Successfully retrieved Instagram account:", instagramAccountData.username);
      
      // Save all the necessary tokens and IDs
      console.log("Instagram authentication successful! Saving critical data:", {
        hasLongLivedToken: !!longLivedAccessToken,
        hasPageId: !!pageId,
        hasPageAccessToken: !!pageAccessToken,
        hasInstagramBusinessId: !!instagramBusinessId,
        instagramUsername: instagramAccountData.username || "",
      });
      
      const settingsToSave = [
        { key: "facebook_access_token", value: longLivedAccessToken },
        { key: "page_id", value: pageId },
        { key: "page_access_token", value: pageAccessToken },
        { key: "instagram_business_id", value: instagramBusinessId },
        { key: "instagram_username", value: instagramAccountData.username || "" },
      ];
      
      // Track settings operations for debugging
      try {
        for (const setting of settingsToSave) {
          const existingSetting = await storage.getIntegrationSettingByKey("instagram", setting.key);
          
          console.log(`Processing Instagram setting '${setting.key}':`, {
            exists: !!existingSetting,
            hasValue: !!setting.value,
            operation: existingSetting ? "update" : "create"
          });
          
          if (existingSetting) {
            const updatedSetting = await storage.updateIntegrationSetting(existingSetting.id, {
              value: setting.value
            });
            console.log(`Updated Instagram setting '${setting.key}':`, {
              id: updatedSetting?.id || 'unknown',
              hasValue: !!updatedSetting?.value
            });
          } else {
            const newSetting = await storage.createIntegrationSetting({
              service: "instagram",
              key: setting.key,
              value: setting.value,
              enabled: true
            });
            console.log(`Created Instagram setting '${setting.key}':`, {
              id: newSetting.id,
              hasValue: !!newSetting.value
            });
          }
        }
      } catch (err) {
        console.error("Error saving Instagram settings:", err);
        throw err;
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
      
      // Using the current scope values for Instagram Graph API
      // Note: We're using the currently supported scopes that will continue to work until January 2025
      const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights,pages_show_list&response_type=code`;
      
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
      
      // Get all Instagram settings to help debug issues
      const allSettings = await storage.getIntegrationSettings("instagram");
      console.log("All Instagram settings:", allSettings.map(s => ({ 
        key: s.key, 
        hasValue: !!s.value, 
        valueLength: s.value?.length || 0,
        enabled: s.enabled
      })));
      
      const pageAccessTokenSetting = await storage.getIntegrationSettingByKey("instagram", "page_access_token");
      const instagramBusinessIdSetting = await storage.getIntegrationSettingByKey("instagram", "instagram_business_id");
      const instagramUsernameSetting = await storage.getIntegrationSettingByKey("instagram", "instagram_username");
      
      // Check if all necessary settings are present
      const connected = !!(pageAccessTokenSetting?.value && instagramBusinessIdSetting?.value);
      
      // Log the detected settings
      console.log("Instagram connection check:", { 
        hasPageToken: !!pageAccessTokenSetting?.value,
        hasBusinessId: !!instagramBusinessIdSetting?.value,
        username: instagramUsernameSetting?.value || 'not_set'
      });
      
      // If connected, try to get some basic information to verify the connection
      if (connected) {
        try {
          const response = await graphAPIRequest(
            `/${instagramBusinessIdSetting.value}`, 
            pageAccessTokenSetting.value, 
            'GET',
            { fields: 'username,profile_picture_url' }
          );
          
          console.log("Instagram account verification successful:", response.username);
          
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
          
          // If the token is invalid, clear the settings
          if (error.message && (error.message.includes('Invalid OAuth access token') || error.message.includes('expired'))) {
            console.log("Clearing invalid Instagram token settings");
            
            // Only clear token-related settings, keep client_id, client_secret, etc.
            if (pageAccessTokenSetting) {
              await storage.updateIntegrationSetting(pageAccessTokenSetting.id, { value: '' });
            }
          }
          
          // If we can't connect, consider it disconnected
          return res.json({ connected: false, error: error.message });
        }
      }
      
      res.json({ connected });
    } catch (error: any) {
      console.error("Failed to check Instagram connection status:", error);
      res.status(500).json({ message: "Failed to check Instagram connection status", error: error.message });
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
  app.get("/api/instagram/webhook", (req, res) => {
    try {
      // Facebook sends a verification request to confirm the webhook
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      
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
  
  // Instagram Webhook Event Reception
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
              
              // Process mentions, comments, media, etc.
              if (field === 'mentions') {
                // Process mentions
                console.log("Instagram mention received:", value);
              } else if (field === 'comments') {
                // Process comments
                console.log("Instagram comment received:", value);
              } else if (field === 'media') {
                // Process media updates
                console.log("Instagram media update received:", value);
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

  // Subscribe to Instagram webhooks
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
          fields: 'mentions,comments,media',
          access_token: accessToken
        }).toString()
      });
      
      if (!subscribeResponse.ok) {
        const errorData = await subscribeResponse.json();
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
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "subscribe",
        resourceType: "instagram_webhook",
        resourceId: appId,
        details: { 
          service: "instagram",
          webhookUrl: webhookCallbackUrl
        }
      });
      
      res.json({ 
        success: true, 
        message: "Successfully subscribed to Instagram webhooks",
        data: subscribeData
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
