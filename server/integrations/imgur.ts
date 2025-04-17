import { Express, Request, Response } from 'express';
import { storage } from '../storage';
import { upload } from '../utils/fileUpload';
import { uploadImageToImgur, uploadImageUrlToImgur } from '../utils/imgurUploader';
import { cleanupUploadedFile, uploadImageUrlToAirtable, uploadImageUrlAsLinkField } from '../utils/imageUploader';
import fetch from 'node-fetch';
import crypto from 'crypto';

// Imgur OAuth endpoints
const IMGUR_OAUTH_URL = 'https://api.imgur.com/oauth2/authorize';
const IMGUR_ACCESS_TOKEN_URL = 'https://api.imgur.com/oauth2/token';
const IMGUR_REFRESH_TOKEN_URL = 'https://api.imgur.com/oauth2/token';
const IMGUR_ACCOUNT_URL = 'https://api.imgur.com/3/account/me';

// Interface for Imgur OAuth tokens
interface ImgurTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  account_id?: string | number;
  account_username?: string;
}

// Interface for Imgur account info
interface ImgurAccountInfo {
  id: string;
  url: string;
  bio: string | null;
  avatar: string | null;
  reputation: number;
  reputation_name: string;
  created: number;
  pro_expiration: boolean;
  username: string;
}

// Helper function to get Imgur settings
async function getImgurSettings() {
  const settings = await storage.getIntegrationSettings('imgur');
  return {
    clientId: settings.find(s => s.key === 'client_id')?.value,
    clientSecret: settings.find(s => s.key === 'client_secret')?.value,
    enabled: settings.find(s => s.key === 'client_id')?.enabled !== false,
    useOAuth: settings.find(s => s.key === 'use_oauth')?.value === 'true',
    accessToken: settings.find(s => s.key === 'access_token')?.value,
    refreshToken: settings.find(s => s.key === 'refresh_token')?.value,
    expiresAt: settings.find(s => s.key === 'expires_at')?.value
  };
}

// Helper function to save OAuth tokens
async function saveImgurOAuthTokens(tokens: ImgurTokens, userId?: number) {
  // Calculate expires_at based on current time + expires_in
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  
  // Save each token as a separate setting
  for (const [key, value] of [
    ['access_token', tokens.access_token],
    ['refresh_token', tokens.refresh_token],
    ['expires_at', expiresAt],
    ['account_id', tokens.account_id?.toString() || ''],
    ['account_username', tokens.account_username || '']
  ]) {
    const setting = await storage.getIntegrationSettingByKey('imgur', key as string);
    
    if (setting) {
      await storage.updateIntegrationSetting(setting.id, { value: value as string });
    } else {
      await storage.createIntegrationSetting({
        service: 'imgur',
        key: key as string,
        value: value as string,
        enabled: true
      });
    }
  }
  
  // Log this activity
  if (userId) {
    await storage.createActivityLog({
      userId,
      action: 'oauth',
      resourceType: 'integration_setting',
      resourceId: 'imgur',
      details: { service: 'imgur', action: 'token_refresh' }
    });
  }
}

// Helper function to revoke OAuth tokens
async function revokeImgurOAuthTokens() {
  const settings = ['access_token', 'refresh_token', 'expires_at', 'account_id', 'account_username'];
  
  for (const key of settings) {
    const setting = await storage.getIntegrationSettingByKey('imgur', key);
    if (setting) {
      await storage.updateIntegrationSetting(setting.id, { value: '' });
    }
  }
}

// Helper function to refresh access token if needed
async function refreshAccessTokenIfNeeded() {
  const settings = await getImgurSettings();
  
  if (!settings.refreshToken || !settings.clientId || !settings.clientSecret) {
    return false;
  }
  
  // Check if token is expired or about to expire (within 5 minutes)
  const expiresAt = settings.expiresAt ? new Date(settings.expiresAt).getTime() : 0;
  const now = Date.now();
  const isExpired = !expiresAt || expiresAt - now < 5 * 60 * 1000;
  
  if (isExpired) {
    try {
      const response = await fetch(IMGUR_REFRESH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          refresh_token: settings.refreshToken,
          grant_type: 'refresh_token'
        }).toString()
      });
      
      if (!response.ok) {
        console.error('Failed to refresh Imgur access token:', await response.text());
        return false;
      }
      
      const tokens = await response.json() as ImgurTokens;
      await saveImgurOAuthTokens(tokens);
      return true;
    } catch (error) {
      console.error('Error refreshing Imgur access token:', error);
      return false;
    }
  }
  
  return true; // Token is still valid
}

export function setupImgurRoutes(app: Express) {
  // Get Imgur integration settings
  app.get('/api/imgur/settings', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const settings = await storage.getIntegrationSettings('imgur');
      res.json(settings);
    } catch (error) {
      console.error('Error fetching Imgur settings:', error);
      res.status(500).json({ 
        message: 'Failed to fetch Imgur settings',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Update Imgur integration setting
  app.post('/api/imgur/settings/:key', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { key } = req.params;
      const { value, enabled } = req.body;
      
      if (value === undefined) {
        return res.status(400).json({ message: 'Value is required' });
      }
      
      // Check if setting already exists
      const setting = await storage.getIntegrationSettingByKey('imgur', key);
      
      if (setting) {
        // Update existing setting
        const updated = await storage.updateIntegrationSetting(setting.id, {
          value,
          enabled: enabled !== undefined ? enabled : setting.enabled
        });
        
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'update',
          resourceType: 'integration_setting',
          resourceId: setting.id.toString(),
          details: { service: 'imgur', key }
        });
        
        res.json(updated);
      } else {
        // Create new setting
        const created = await storage.createIntegrationSetting({
          service: 'imgur',
          key,
          value,
          enabled: enabled !== undefined ? enabled : true
        });
        
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'create',
          resourceType: 'integration_setting',
          resourceId: created.id.toString(),
          details: { service: 'imgur', key }
        });
        
        res.json(created);
      }
    } catch (error) {
      console.error('Error updating Imgur setting:', error);
      res.status(500).json({ 
        message: 'Failed to update Imgur setting',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Upload an image to Imgur and then to Airtable
  app.post('/api/imgur/upload-to-airtable/:articleId/:fieldName', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const articleId = parseInt(req.params.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      const fieldName = req.params.fieldName;
      if (!fieldName || (fieldName !== 'MainImage' && fieldName !== 'instaPhoto')) {
        return res.status(400).json({ message: "Invalid field name. Must be 'MainImage' or 'instaPhoto'" });
      }
      
      // Get the article from the database
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ message: 'No image file uploaded' });
      }
      
      const file = {
        path: req.file.path,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      };
      
      // Step 1: Upload to Imgur
      const imgurResult = await uploadImageToImgur(file);
      
      // Always cleanup the uploaded file after processing
      cleanupUploadedFile(file.path);
      
      if (!imgurResult) {
        return res.status(500).json({ message: 'Failed to upload image to Imgur' });
      }
      
      // Step 2: For Airtable articles, upload to Airtable using link fields
      let airtableResult = null;
      if (article.source === 'airtable' && article.externalId) {
        // Map the field names to their link field equivalents
        const fieldMappings = {
          'MainImage': 'MainImageLink',
          'instaPhoto': 'InstaPhotoLink'
        };
        
        // Use the mapped field name for the link field
        const targetFieldName = fieldMappings[fieldName] || fieldName;
        
        console.log(`Using link field approach for Imgur upload: ${fieldName} → ${targetFieldName}`);
        
        // Use the new link field function instead of the attachment field function
        airtableResult = await uploadImageUrlAsLinkField(
          imgurResult.link,
          article.externalId,
          targetFieldName
        );
        
        if (!airtableResult) {
          console.warn(`Failed to update Airtable for article ${articleId}, but continuing with local update`);
        }
      }
      
      // Step 3: Update the article in the database with the new image URL
      const updateData: any = {};
      
      if (fieldName === 'MainImage') {
        updateData.imageUrl = imgurResult.link;
        updateData.imageType = 'url';
      } else if (fieldName === 'instaPhoto') {
        updateData.instagramImageUrl = imgurResult.link;
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
          imgurId: imgurResult.id,
          imgurLink: imgurResult.link,
          filename: file.filename
        }
      });
      
      res.json({
        message: `Image uploaded successfully to Imgur and then to ${fieldName}`,
        imgur: {
          id: imgurResult.id,
          link: imgurResult.link,
          deletehash: imgurResult.deletehash
        },
        airtable: airtableResult
      });
    } catch (error) {
      console.error('Error in Imgur to Airtable upload:', error);
      res.status(500).json({ 
        message: 'Failed to process image upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Upload an image URL to Imgur and then to Airtable
  app.post('/api/imgur/upload-url-to-airtable/:articleId/:fieldName', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const articleId = parseInt(req.params.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      const fieldName = req.params.fieldName;
      if (!fieldName || (fieldName !== 'MainImage' && fieldName !== 'instaPhoto')) {
        return res.status(400).json({ message: "Invalid field name. Must be 'MainImage' or 'instaPhoto'" });
      }
      
      const { imageUrl, filename } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required' });
      }
      
      if (!filename) {
        return res.status(400).json({ message: 'Filename is required' });
      }
      
      // Get the article from the database
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      // Step 1: Upload URL to Imgur
      const imgurResult = await uploadImageUrlToImgur(imageUrl, filename);
      
      if (!imgurResult) {
        return res.status(500).json({ message: 'Failed to upload image URL to Imgur' });
      }
      
      // Step 2: For Airtable articles, upload to Airtable using link fields
      let airtableResult = null;
      if (article.source === 'airtable' && article.externalId) {
        // Map the field names to their link field equivalents
        const fieldMappings = {
          'MainImage': 'MainImageLink',
          'instaPhoto': 'InstaPhotoLink'
        };
        
        // Use the mapped field name for the link field
        const targetFieldName = fieldMappings[fieldName] || fieldName;
        
        console.log(`Using link field approach for Imgur URL upload: ${fieldName} → ${targetFieldName}`);
        
        // Use the new link field function instead of the attachment function
        airtableResult = await uploadImageUrlAsLinkField(
          imgurResult.link,
          article.externalId,
          targetFieldName
        );
        
        if (!airtableResult) {
          console.warn(`Failed to update Airtable for article ${articleId}, but continuing with local update`);
        }
      }
      
      // Step 3: Update the article in the database with the new image URL
      const updateData: any = {};
      
      if (fieldName === 'MainImage') {
        updateData.imageUrl = imgurResult.link;
        updateData.imageType = 'url';
      } else if (fieldName === 'instaPhoto') {
        updateData.instagramImageUrl = imgurResult.link;
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
          imgurId: imgurResult.id,
          imgurLink: imgurResult.link,
          filename
        }
      });
      
      res.json({
        message: `Image URL uploaded successfully to Imgur and then to ${fieldName}`,
        imgur: {
          id: imgurResult.id,
          link: imgurResult.link,
          deletehash: imgurResult.deletehash
        },
        airtable: airtableResult
      });
    } catch (error) {
      console.error('Error in Imgur URL to Airtable upload:', error);
      res.status(500).json({ 
        message: 'Failed to process image URL upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // OAuth Routes
  
  // Generate OAuth URL
  app.post('/api/imgur/auth/url', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { client_id } = req.body;
      if (!client_id) {
        return res.status(400).json({ message: 'Client ID is required' });
      }
      
      // Generate a random state value to prevent CSRF
      const state = crypto.randomBytes(16).toString('hex');
      
      // Store the state in the database to verify on callback
      const stateSetting = await storage.getIntegrationSettingByKey('imgur', 'oauth_state');
      if (stateSetting) {
        await storage.updateIntegrationSetting(stateSetting.id, { value: state });
      } else {
        await storage.createIntegrationSetting({
          service: 'imgur',
          key: 'oauth_state',
          value: state,
          enabled: true
        });
      }
      
      // Generate the authorization URL
      const authUrl = new URL(IMGUR_OAUTH_URL);
      authUrl.searchParams.append('client_id', client_id);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('state', state);
      
      res.json({ url: authUrl.toString() });
    } catch (error) {
      console.error('Error generating Imgur OAuth URL:', error);
      res.status(500).json({ 
        message: 'Failed to generate Imgur OAuth URL',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Handle OAuth callback
  app.get('/api/imgur/auth/callback', async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).send('<html><body><h1>Authentication failed</h1><p>Missing code or state parameter</p></body></html>');
      }
      
      // Verify the state parameter to prevent CSRF
      const stateSetting = await storage.getIntegrationSettingByKey('imgur', 'oauth_state');
      if (!stateSetting || stateSetting.value !== state) {
        return res.status(400).send('<html><body><h1>Authentication failed</h1><p>Invalid state parameter</p></body></html>');
      }
      
      // Get the settings we need for the token exchange
      const settings = await getImgurSettings();
      if (!settings.clientId || !settings.clientSecret) {
        return res.status(400).send('<html><body><h1>Authentication failed</h1><p>Missing client ID or client secret</p></body></html>');
      }
      
      // Exchange the authorization code for an access token
      const response = await fetch(IMGUR_ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          code: code as string,
          grant_type: 'authorization_code'
        }).toString()
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to exchange authorization code for token:', errorText);
        return res.status(400).send(`<html><body><h1>Authentication failed</h1><p>Failed to exchange code for token: ${errorText}</p></body></html>`);
      }
      
      const tokens = await response.json() as ImgurTokens;
      
      // Save the tokens
      await saveImgurOAuthTokens(tokens);
      
      // Log this activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'oauth',
        resourceType: 'integration_setting',
        resourceId: 'imgur',
        details: { service: 'imgur', action: 'authenticated' }
      });
      
      // Return success page that will close the popup
      res.send(`
        <html>
          <head>
            <title>Imgur Authentication Successful</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .card {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 500px;
              }
              h1 {
                color: #4CAF50;
                margin-bottom: 20px;
              }
              p {
                margin-bottom: 20px;
                color: #333;
                line-height: 1.5;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Authentication Successful!</h1>
              <p>Your Imgur account has been connected successfully. You can close this window and return to the application.</p>
              <script>
                window.onload = function() {
                  setTimeout(function() {
                    window.close();
                  }, 3000);
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Error handling Imgur OAuth callback:', error);
      res.status(500).send(`
        <html>
          <body>
            <h1>Authentication Error</h1>
            <p>An error occurred during authentication: ${error instanceof Error ? error.message : String(error)}</p>
          </body>
        </html>
      `);
    }
  });
  
  // Get account info
  app.get('/api/imgur/auth/account', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // First refresh the token if needed
      const tokenValid = await refreshAccessTokenIfNeeded();
      if (!tokenValid) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const settings = await getImgurSettings();
      if (!settings.accessToken) {
        return res.status(401).json({ message: 'Not authenticated with Imgur' });
      }
      
      // Get account information from Imgur API
      const response = await fetch(IMGUR_ACCOUNT_URL, {
        headers: {
          'Authorization': `Bearer ${settings.accessToken}`
        }
      });
      
      if (!response.ok) {
        return res.status(response.status).json({
          message: 'Failed to fetch account information',
          error: await response.text()
        });
      }
      
      const data = await response.json() as { data: ImgurAccountInfo };
      const accountInfo: ImgurAccountInfo = data.data;
      
      res.json({
        id: accountInfo.id,
        url: accountInfo.url,
        username: accountInfo.username,
        avatar: accountInfo.avatar,
        reputation: accountInfo.reputation
      });
    } catch (error) {
      console.error('Error fetching Imgur account information:', error);
      res.status(500).json({ 
        message: 'Failed to fetch account information',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Revoke OAuth tokens
  app.post('/api/imgur/auth/revoke', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      await revokeImgurOAuthTokens();
      
      // Log this activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'oauth',
        resourceType: 'integration_setting',
        resourceId: 'imgur',
        details: { service: 'imgur', action: 'revoked' }
      });
      
      res.json({ message: 'Authentication revoked successfully' });
    } catch (error) {
      console.error('Error revoking Imgur authentication:', error);
      res.status(500).json({ 
        message: 'Failed to revoke authentication',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}