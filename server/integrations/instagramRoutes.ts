import { Express, Request, Response } from 'express';
import { log } from '../vite';
import { storage } from '../storage';
import { 
  handleWebhookVerification, 
  handleWebhookEvent, 
  subscribeToWebhook, 
  getWebhookSubscriptions, 
  unsubscribeFromWebhook, 
  WEBHOOK_FIELD_GROUPS, 
  testWebhookConnection,
  getInstagramMedia,
  getInstagramMediaById,
  getInstagramAccountId
} from './instagram';
import { createAndPublishPost } from './instagram-publish';
import { checkInstagramPermissions, resetInstagramConnection } from './instagram-permissions';

/**
 * Setup routes for Instagram webhooks and API integration
 * 
 * @param app Express application instance
 */
export function setupInstagramRoutes(app: Express) {
  // Instagram webhook verification endpoint
  // This endpoint is called by Facebook when you try to subscribe to a webhook
  app.get('/api/instagram/webhooks/callback', async (req: Request, res: Response) => {
    await handleWebhookVerification(req, res);
  });

  // Instagram webhook event endpoint
  // This endpoint receives webhook events from Instagram
  app.post('/api/instagram/webhooks/callback', async (req: Request, res: Response) => {
    await handleWebhookEvent(req, res);
  });

  // API route to subscribe to Instagram webhooks
  app.post('/api/instagram/webhooks/subscribe', async (req: Request, res: Response) => {
    try {
      const { fields, callbackUrl, verifyToken } = req.body;
      
      if (!fields || !Array.isArray(fields) || !callbackUrl) {
        return res.status(400).json({ 
          error: 'Invalid request', 
          message: 'Fields must be an array and callbackUrl is required' 
        });
      }
      
      // Check if we have an access token
      const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
      
      if (!tokenSetting?.value) {
        return res.status(403).json({
          error: 'Authorization required',
          message: 'Facebook access token is required. Please log in with Facebook and try again.',
          code: 'NO_ACCESS_TOKEN'
        });
      }
      
      const result = await subscribeToWebhook(
        fields, 
        callbackUrl, 
        verifyToken
      );
      
      res.status(200).json(result);
    } catch (error) {
      log(`Error subscribing to webhook: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to subscribe', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // API route to get active webhook subscriptions
  app.get('/api/instagram/webhooks/subscriptions', async (req: Request, res: Response) => {
    try {
      const subscriptions = await getWebhookSubscriptions();
      res.status(200).json(subscriptions);
    } catch (error) {
      log(`Error getting webhook subscriptions: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to get subscriptions', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // API route to unsubscribe from a webhook
  app.delete('/api/instagram/webhooks/subscriptions/:id', async (req: Request, res: Response) => {
    try {
      const subscriptionId = req.params.id;
      const result = await unsubscribeFromWebhook(subscriptionId);
      res.status(200).json(result);
    } catch (error) {
      log(`Error unsubscribing from webhook: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to unsubscribe', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // API route to get webhook field groups (for UI)
  app.get('/api/instagram/webhooks/field-groups', (req: Request, res: Response) => {
    res.status(200).json(WEBHOOK_FIELD_GROUPS);
  });
  
  // API route to test webhook connection
  app.get('/api/instagram/webhooks/test', async (req: Request, res: Response) => {
    try {
      const result = await testWebhookConnection();
      res.status(200).json(result);
    } catch (error) {
      log(`Error testing webhook connection: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to test webhook connection', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Log instagram webhook activity
  app.get('/api/instagram/webhooks/logs', async (req: Request, res: Response) => {
    try {
      const logs = await storage.getActivityLogs();
      // Filter logs to only include Instagram webhook logs
      const instagramLogs = logs.filter(log => log.action.startsWith('instagram_webhook_'));
      res.status(200).json(instagramLogs);
    } catch (error) {
      log(`Error getting webhook logs: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to get logs', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Store Facebook access token from the frontend
  app.post('/api/instagram/auth/token', async (req: Request, res: Response) => {
    try {
      const { accessToken, userId } = req.body;
      
      if (!accessToken) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Access token is required'
        });
      }
      
      // Check if we already have a token
      const existingToken = await storage.getIntegrationSettingByKey("facebook", "access_token");
      
      if (existingToken) {
        // Update the existing token
        await storage.updateIntegrationSetting(existingToken.id, {
          value: accessToken,
          enabled: true
        });
        
        log(`Updated Facebook access token`, 'instagram');
      } else {
        // Create a new token entry
        await storage.createIntegrationSetting({
          service: "facebook",
          key: "access_token",
          value: accessToken,
          enabled: true
        });
        
        log(`Stored new Facebook access token`, 'instagram');
      }
      
      // Log the activity - store userId as string in details since it's a Facebook ID, not our app's user ID
      await storage.createActivityLog({
        action: 'facebook_auth_token_updated',
        userId: null, // Don't use Facebook's userId as our user ID
        resourceType: 'integration_setting',
        resourceId: 'facebook_access_token',
        details: { 
          timestamp: new Date().toISOString(),
          facebookUserId: userId ? String(userId) : null 
        }
      });
      
      res.status(200).json({
        success: true,
        message: 'Access token stored successfully'
      });
    } catch (error) {
      log(`Error storing Facebook access token: ${error}`, 'instagram');
      res.status(500).json({
        error: 'Failed to store access token',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // API route to get Instagram account ID
  app.get('/api/instagram/account', async (req: Request, res: Response) => {
    try {
      // Check if we have an access token
      const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
      
      if (!tokenSetting?.value) {
        return res.status(403).json({
          error: 'Authorization required',
          message: 'Facebook access token is required. Please log in with Facebook and try again.',
          code: 'NO_ACCESS_TOKEN'
        });
      }
      
      const accountId = await getInstagramAccountId();
      
      if (!accountId) {
        return res.status(404).json({
          error: 'Instagram account not found',
          message: 'No Instagram Business Account was found connected to your Facebook account. Please ensure you have an Instagram Business Account linked to a Facebook Page you manage.',
          code: 'NO_INSTAGRAM_ACCOUNT'
        });
      }
      
      res.status(200).json({ 
        id: accountId,
        success: true
      });
    } catch (error) {
      log(`Error getting Instagram account ID: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to get Instagram account ID', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // API route to get Instagram media posts
  app.get('/api/instagram/media', async (req: Request, res: Response) => {
    try {
      // Check if we have an access token
      const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
      
      if (!tokenSetting?.value) {
        return res.status(403).json({
          error: 'Authorization required',
          message: 'Facebook access token is required. Please log in with Facebook and try again.',
          code: 'NO_ACCESS_TOKEN'
        });
      }
      
      // Get limit from query string if available
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
      
      const media = await getInstagramMedia(limit);
      res.status(200).json(media);
    } catch (error) {
      log(`Error getting Instagram media: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to get Instagram media', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // API route to get a specific Instagram media post
  app.get('/api/instagram/media/:id', async (req: Request, res: Response) => {
    try {
      const mediaId = req.params.id;
      
      // Check if we have an access token
      const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
      
      if (!tokenSetting?.value) {
        return res.status(403).json({
          error: 'Authorization required',
          message: 'Facebook access token is required. Please log in with Facebook and try again.',
          code: 'NO_ACCESS_TOKEN'
        });
      }
      
      const media = await getInstagramMediaById(mediaId);
      
      if (!media) {
        return res.status(404).json({
          error: 'Media not found',
          message: `No Instagram media found with ID ${mediaId}`,
          code: 'MEDIA_NOT_FOUND'
        });
      }
      
      res.status(200).json(media);
    } catch (error) {
      log(`Error getting Instagram media: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to get Instagram media', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // API route to check Instagram permissions
  app.get('/api/instagram/permissions', async (req: Request, res: Response) => {
    try {
      const permissions = await checkInstagramPermissions();
      res.status(200).json(permissions);
    } catch (error) {
      log(`Error checking Instagram permissions: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to check Instagram permissions', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // API route to reset Instagram connection
  app.post('/api/instagram/reset', async (req: Request, res: Response) => {
    try {
      const result = await resetInstagramConnection();
      if (result) {
        res.status(200).json({ 
          success: true, 
          message: 'Instagram connection reset successfully. Please reconnect with Facebook.' 
        });
      } else {
        res.status(500).json({ 
          error: 'Failed to reset connection', 
          message: 'An error occurred while trying to reset the Instagram connection' 
        });
      }
    } catch (error) {
      log(`Error resetting Instagram connection: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to reset Instagram connection', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // API route to create a new Instagram post
  app.post('/api/instagram/media', async (req: Request, res: Response) => {
    try {
      const { imageUrl, caption } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Image URL is required',
          code: 'MISSING_IMAGE_URL'
        });
      }
      
      // Basic validation to filter out non-image URLs
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'];
      const isLikelyImageUrl = 
        imageExtensions.some(ext => imageUrl.toLowerCase().includes(ext)) || 
        imageUrl.includes('i.ibb.co') || 
        imageUrl.includes('imgur') || 
        imageUrl.includes('cloudinary');
      
      // Detect known non-image URLs
      const isKnownNonImageUrl = 
        imageUrl.includes('airtable.com') ||
        imageUrl.includes('notion.so') ||
        imageUrl.includes('docs.google.com') || 
        imageUrl.includes('trello.com');
      
      if (isKnownNonImageUrl) {
        return res.status(400).json({
          error: 'Invalid image URL',
          message: 'The URL you provided appears to be a link to a document or application, not an image. Please provide a direct link to an image file.',
          code: 'INVALID_IMAGE_URL'
        });
      }
      
      // Check if we have an access token
      const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
      
      if (!tokenSetting?.value) {
        return res.status(403).json({
          error: 'Authorization required',
          message: 'Facebook access token is required. Please log in with Facebook and try again.',
          code: 'NO_ACCESS_TOKEN'
        });
      }
      
      // Create and publish Instagram post using our improved method
      log(`Creating Instagram post with image: ${imageUrl}`, 'instagram');
      
      // Use the combined method that handles the two-step process automatically
      const result = await createAndPublishPost(imageUrl, caption || '');
      
      // Log the activity
      await storage.createActivityLog({
        action: 'instagram_media_created',
        userId: null,
        resourceType: 'instagram_media',
        resourceId: result.mediaId,
        details: {
          timestamp: new Date().toISOString(),
          containerId: result.containerId,
          mediaId: result.mediaId,
          usedFallback: result.usedFallback
        }
      });
      
      // Return the result
      res.status(201).json({
        success: true,
        mediaId: result.mediaId,
        message: result.usedFallback 
          ? 'Instagram post created successfully, but with a placeholder image because the original image could not be processed' 
          : 'Instagram post created successfully',
        usedPlaceholder: result.usedFallback
      });
    } catch (error) {
      log(`Error creating Instagram post: ${error}`, 'instagram');
      res.status(500).json({ 
        error: 'Failed to create Instagram post', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}