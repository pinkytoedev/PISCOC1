import { Express, Request, Response } from 'express';
import { log } from '../vite';
import { storage } from '../storage';
import { handleWebhookVerification, handleWebhookEvent, subscribeToWebhook, getWebhookSubscriptions, unsubscribeFromWebhook, WEBHOOK_FIELD_GROUPS } from './instagram';

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
      
      // Log the activity
      await storage.createActivityLog({
        action: 'facebook_auth_token_updated',
        userId: userId || null,
        resourceType: 'integration_setting',
        resourceId: 'facebook_access_token',
        details: { timestamp: new Date().toISOString() }
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
}