import { Express } from "express";
import { storage } from "../storage";
import { Article } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as crypto from "crypto";

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
  
  // Get Instagram business account insights
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
