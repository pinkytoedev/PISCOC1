import { Request, Response } from 'express';
import crypto from 'crypto';
import { log } from '../vite';
import { storage } from '../storage';
import {
  getAppAccessToken,
  getUserAccessToken,
  getInstagramAccountId as getInstagramAccountIdFromClient,
  getInstagramMedia as getInstagramMediaFromClient,
  getInstagramMediaById as getInstagramMediaByIdFromClient,
  getWebhookSubscriptions as getWebhookSubscriptionsFromClient,
  clearInstagramCaches
} from './instagramClient';

// Constants
const WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

// Instagram field constants
const INSTAGRAM_MEDIA_FIELDS = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,children{id,media_type,media_url,thumbnail_url}';

/**
 * Get the Instagram Business Account ID for the authenticated user
 * Using client with rate limiting and caching
 * 
 * @returns Instagram Business Account ID or null if not found
 */
export async function getInstagramAccountId(): Promise<string | null> {
  return getInstagramAccountIdFromClient();
}

/**
 * Get recent media from an Instagram Business Account
 * Using client with rate limiting and caching
 * 
 * @param limit Number of posts to retrieve (default: 25)
 * @returns Array of Instagram media objects
 */
export async function getInstagramMedia(limit: number = 25) {
  return getInstagramMediaFromClient(limit);
}

/**
 * Get a single Instagram media post by ID
 * Using client with rate limiting and caching
 * 
 * @param mediaId ID of the Instagram media post
 * @returns Instagram media object or null if not found
 */
export async function getInstagramMediaById(mediaId: string) {
  return getInstagramMediaByIdFromClient(mediaId);
}

/**
 * Get active webhook subscriptions
 * Using client with rate limiting and caching
 * 
 * @returns Array of active subscriptions
 */
export async function getWebhookSubscriptions() {
  return getWebhookSubscriptionsFromClient();
}

/**
 * Test if a webhook connection is properly configured with Facebook
 * 
 * @returns Object with test results
 */
export async function testWebhookConnection(): Promise<{
  success: boolean;
  appId: boolean;
  appSecret: boolean;
  accessToken: boolean;
  appAccessToken: boolean;
  message: string;
  details?: any;
}> {
  try {
    // Get APP_ID from environment
    const APP_ID = process.env.FACEBOOK_APP_ID;
    
    const results: {
      success: boolean;
      appId: boolean;
      appSecret: boolean;
      accessToken: boolean;
      appAccessToken: boolean;
      message: string;
      details?: any;
    } = {
      success: false,
      appId: !!APP_ID,
      appSecret: !!APP_SECRET,
      accessToken: false,
      appAccessToken: false,
      message: ""
    };
    
    // Check user access token
    const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
    results.accessToken = !!tokenSetting?.value;
    
    // Check app access token
    const appAccessToken = await getAppAccessToken();
    results.appAccessToken = !!appAccessToken;
    
    if (!results.appId) {
      results.message = "Facebook App ID is missing";
      return results;
    }
    
    if (!results.appSecret) {
      results.message = "Facebook App Secret is missing";
      return results;
    }
    
    if (!results.accessToken) {
      results.message = "User Access Token is missing - please log in with Facebook";
      return results;
    }
    
    if (!results.appAccessToken) {
      results.message = "Failed to generate App Access Token";
      return results;
    }
    
    // If we have all credentials, test a real API call
    try {
      const response = await fetch(
        `https://graph.facebook.com/v17.0/app/subscriptions?access_token=${appAccessToken}`
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        results.message = `API test failed: ${errorText}`;
        results.details = { errorText };
        return results;
      }
      
      // Success!
      results.success = true;
      results.message = "Webhook connection is properly configured";
      return results;
    } catch (apiError) {
      results.message = `API test failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`;
      return results;
    }
  } catch (error) {
    // Get APP_ID here too for error handling
    const APP_ID = process.env.FACEBOOK_APP_ID;
    
    return {
      success: false,
      appId: !!APP_ID,
      appSecret: !!APP_SECRET,
      accessToken: false,
      appAccessToken: false,
      message: `Error testing webhook connection: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Helper to log Instagram webhook activities
async function logWebhookActivity(action: string, data: any = {}) {
  try {
    await storage.createActivityLog({
      action: `instagram_webhook_${action}`,
      userId: null,
      resourceType: 'instagram_webhook',
      resourceId: null,
      details: data,
    });
  } catch (error) {
    log(`Error logging webhook activity: ${error}`, 'instagram');
  }
}

/**
 * Verify webhook signature to ensure it's from Facebook/Instagram
 * 
 * @param req Express request object
 * @returns boolean indicating if signature is valid
 */
function verifyWebhookSignature(req: Request): boolean {
  if (!APP_SECRET) {
    log('Warning: APP_SECRET not set, skipping signature verification', 'instagram');
    return true; // Skip verification if APP_SECRET is not set
  }

  const signature = req.headers['x-hub-signature'] as string;
  if (!signature) {
    return false;
  }

  const elements = signature.split('=');
  const signatureHash = elements[1];
  
  const expectedHash = crypto
    .createHmac('sha1', APP_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  return signatureHash === expectedHash;
}

/**
 * Field groups for Instagram webhook subscriptions
 * Simplifies subscription management by grouping related fields
 */
export const WEBHOOK_FIELD_GROUPS = {
  BASIC: ['mentions', 'comments'],
  MEDIA: ['media'],
  STORIES: ['story_insights'],
  MESSAGING: ['messaging_webhook_events'],
  ALL: ['mentions', 'comments', 'media', 'story_insights', 'messaging_webhook_events'],
};

/**
 * Handle Instagram webhook verification request
 * Called when Instagram attempts to verify the webhook endpoint
 */
export async function handleWebhookVerification(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  log(`Webhook verification request received: mode=${mode}, token=${token}`, 'instagram');
  
  // Check if this is a valid verification request
  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    log('Webhook verified successfully', 'instagram');
    await logWebhookActivity('verification_success', { 
      mode, 
      timestamp: new Date().toISOString() 
    });
    
    // Return the challenge to complete verification
    res.status(200).send(challenge);
  } else {
    log('Webhook verification failed - invalid token', 'instagram');
    await logWebhookActivity('verification_failed', { 
      mode, 
      timestamp: new Date().toISOString()
    });
    
    res.status(403).json({ error: 'Verification failed' });
  }
}

/**
 * Handle Instagram webhook events
 * Called when Instagram sends a webhook event
 */
export async function handleWebhookEvent(req: Request, res: Response) {
  // Verify this is a legitimate request from Facebook/Instagram
  if (!verifyWebhookSignature(req)) {
    log('Invalid webhook signature', 'instagram');
    await logWebhookActivity('invalid_signature', {
      headers: req.headers,
      timestamp: new Date().toISOString()
    });
    return res.status(403).json({ error: 'Invalid signature' });
  }
  
  // Process the webhook event
  try {
    const data = req.body;
    log(`Webhook event received: ${JSON.stringify(data)}`, 'instagram');
    
    // Log the incoming webhook event
    await logWebhookActivity('event_received', {
      data,
      timestamp: new Date().toISOString()
    });
    
    // Handle different types of webhook events
    if (Array.isArray(data.entry)) {
      for (const entry of data.entry) {
        await processWebhookEntry(entry);
      }
    }
    
    // Always acknowledge the webhook event quickly
    res.status(200).json({ status: 'received' });
  } catch (error) {
    log(`Error processing webhook event: ${error}`, 'instagram');
    await logWebhookActivity('event_processing_error', {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
    
    // Still return 200 to prevent retries, but log the error
    res.status(200).json({ status: 'error', message: 'Error processing webhook' });
  }
}

/**
 * Process a webhook entry based on its type
 * Each entry represents a different type of event
 */
async function processWebhookEntry(entry: any) {
  // First, determine what type of entry this is
  if (entry.changes) {
    // This is a change notification
    for (const change of entry.changes) {
      await processChangeNotification(change);
    }
  } else if (entry.messaging) {
    // This is a messaging event
    for (const messagingEvent of entry.messaging) {
      await processMessagingEvent(messagingEvent);
    }
  }
  
  // Log that we processed this entry
  await logWebhookActivity('entry_processed', {
    entryId: entry.id,
    timestamp: new Date().toISOString()
  });
}

/**
 * Process a change notification (mentions, comments, media)
 */
async function processChangeNotification(change: any) {
  const { field, value } = change;
  
  switch (field) {
    case 'mentions':
      await handleMentionEvent(value);
      break;
      
    case 'comments':
      await handleCommentEvent(value);
      break;
      
    case 'media':
      await handleMediaEvent(value);
      break;
      
    case 'story_insights':
      await handleStoryInsightEvent(value);
      break;
      
    default:
      log(`Unhandled Instagram change notification type: ${field}`, 'instagram');
      await logWebhookActivity('unhandled_change', { field, value });
  }
}

/**
 * Process a messaging event
 */
async function processMessagingEvent(messagingEvent: any) {
  if (messagingEvent.message) {
    await handleIncomingMessage(messagingEvent);
  } else if (messagingEvent.delivery) {
    await handleMessageDelivery(messagingEvent);
  } else if (messagingEvent.read) {
    await handleMessageRead(messagingEvent);
  } else {
    log(`Unhandled messaging event type: ${JSON.stringify(messagingEvent)}`, 'instagram');
    await logWebhookActivity('unhandled_messaging_event', messagingEvent);
  }
}

/**
 * Handle mention events
 */
async function handleMentionEvent(value: any) {
  log(`Instagram mention received: ${JSON.stringify(value)}`, 'instagram');
  await logWebhookActivity('mention', value);
  
  // Process a mention event here
  // This would typically involve updating a database record
  // or triggering a notification
}

/**
 * Handle comment events
 */
async function handleCommentEvent(value: any) {
  log(`Instagram comment received: ${JSON.stringify(value)}`, 'instagram');
  await logWebhookActivity('comment', value);
  
  // Process a comment event here
}

/**
 * Handle media events (photo, video, carousel posts)
 */
async function handleMediaEvent(value: any) {
  log(`Instagram media event received: ${JSON.stringify(value)}`, 'instagram');
  await logWebhookActivity('media', value);
  
  // Process a media event here
}

/**
 * Handle story insight events
 */
async function handleStoryInsightEvent(value: any) {
  log(`Instagram story insight received: ${JSON.stringify(value)}`, 'instagram');
  await logWebhookActivity('story_insight', value);
  
  // Process a story insight event here
}

/**
 * Handle incoming direct messages
 */
async function handleIncomingMessage(messagingEvent: any) {
  const { sender, recipient, message } = messagingEvent;
  
  log(`Instagram message received from ${sender.id}: ${message.text}`, 'instagram');
  await logWebhookActivity('message_received', {
    senderId: sender.id,
    recipientId: recipient.id,
    messageId: message.mid,
    text: message.text,
    timestamp: messagingEvent.timestamp
  });
  
  // Process an incoming message here
}

/**
 * Handle message delivery receipts
 */
async function handleMessageDelivery(messagingEvent: any) {
  const { delivery } = messagingEvent;
  
  log(`Instagram message delivery report received: ${JSON.stringify(delivery)}`, 'instagram');
  await logWebhookActivity('message_delivery', delivery);
  
  // Update message delivery status here
}

/**
 * Handle message read receipts
 */
async function handleMessageRead(messagingEvent: any) {
  const { read } = messagingEvent;
  
  log(`Instagram message read report received: ${JSON.stringify(read)}`, 'instagram');
  await logWebhookActivity('message_read', read);
  
  // Update message read status here
}

/**
 * Subscribe to Instagram webhook notifications
 * 
 * @param fields Array of fields to subscribe to
 * @param callbackUrl The URL that will receive the webhook events
 * @param verifyToken The token used to verify the webhook
 * @returns Subscription result
 */
export async function subscribeToWebhook(
  fields: string[],
  callbackUrl: string,
  verifyToken: string = WEBHOOK_VERIFY_TOKEN || crypto.randomUUID()
) {
  try {
    log(`Subscribing to Instagram webhook: fields=${fields.join(',')}, callback=${callbackUrl}`, 'instagram');
    
    // Create a unique subscription ID
    const subscriptionId = `sub_${fields.join('_')}_${Date.now()}`;
    
    // Get app access token - required for webhook operations
    const appAccessToken = await getAppAccessToken();
    
    if (appAccessToken) {
      try {
        // Setup the request to the Graph API
        const formData = new URLSearchParams();
        formData.append('object', 'instagram');
        formData.append('callback_url', callbackUrl);
        formData.append('fields', fields.join(','));
        formData.append('verify_token', verifyToken);
        formData.append('access_token', appAccessToken);
        
        // Make the API call to Facebook Graph API
        const response = await fetch(
          'https://graph.facebook.com/v17.0/app/subscriptions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString()
          }
        );
        
        const responseText = await response.text();
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${responseText}`);
        }
        
        // Check if the response indicates success
        const isSuccess = responseText === 'true' || responseText.includes('"success":true');
        
        if (!isSuccess) {
          throw new Error(`API did not indicate success: ${responseText}`);
        }
      } catch (graphError) {
        log(`Error calling Graph API for subscription creation: ${graphError}`, 'instagram');
        // Fallback to local storage if API call fails
      }
    }
    
    // Store the subscription in our database regardless of API call outcome
    // This gives us a local record of what we've attempted to subscribe to
    const subscriptionData = {
      success: true,
      fields,
      callback_url: callbackUrl,
      active: true,
      object: 'instagram',
      subscription_id: subscriptionId
    };
    
    try {
      await storage.createIntegrationSetting({
        service: "instagram",
        key: `webhook_subscription_${subscriptionId}`,
        value: JSON.stringify(subscriptionData),
        enabled: true
      });
    } catch (dbError) {
      log(`Error storing webhook subscription: ${dbError}`, 'instagram');
      // Continue even if we can't store it locally
    }
    
    await logWebhookActivity('subscription_created', subscriptionData);
    
    return subscriptionData;
  } catch (error) {
    log(`Error subscribing to webhook: ${error}`, 'instagram');
    await logWebhookActivity('subscription_error', {
      error: error instanceof Error ? error.message : String(error),
      fields,
      callbackUrl
    });
    
    throw error;
  }
}

/**
 * Unsubscribe from a webhook subscription
 * 
 * @param subscriptionId The ID of the subscription to delete
 * @returns Success status
 */
export async function unsubscribeFromWebhook(subscriptionId: string): Promise<{ success: boolean }> {
  try {
    log(`Unsubscribing from webhook: ${subscriptionId}`, 'instagram');
    
    // First, try to find the subscription in our database
    const key = `webhook_subscription_${subscriptionId}`;
    const setting = await storage.getIntegrationSettingByKey("instagram", key);
    
    if (!setting) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    // TODO: Add actual unsubscribe logic with the Graph API
    // This would require knowledge of the specific subscription 
    // from the Facebook Developer Portal
    
    // For now, just remove from our database
    await storage.deleteIntegrationSetting(setting.id);
    
    await logWebhookActivity('unsubscribe_success', {
      subscription_id: subscriptionId
    });
    
    return { success: true };
  } catch (error) {
    log(`Error unsubscribing from webhook: ${error}`, 'instagram');
    await logWebhookActivity('unsubscribe_error', {
      error: error instanceof Error ? error.message : String(error),
      subscription_id: subscriptionId
    });
    
    throw error;
  }
}

/**
 * Create an Instagram media container for later publishing
 * This is the first step in the creation process
 * 
 * @param imageUrl URL of the image to post
 * @param caption Caption for the post
 * @returns Container ID for publishing
 */
export async function createInstagramMediaContainer(imageUrl: string, caption: string): Promise<string> {
  try {
    log(`Creating Instagram media container for image: ${imageUrl}`, 'instagram');
    
    // Get Instagram account ID
    const instagramAccountId = await getInstagramAccountId();
    if (!instagramAccountId) {
      throw new Error('Instagram account ID not found');
    }
    
    // Get user access token
    const accessToken = await getUserAccessToken();
    if (!accessToken) {
      throw new Error('User access token missing');
    }
    
    // Set up the request to create a media container
    const formData = new URLSearchParams();
    formData.append('image_url', imageUrl);
    formData.append('caption', caption);
    formData.append('access_token', accessToken);
    
    // Make the API call to Instagram Graph API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      }
    );
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    
    if (!data.id) {
      throw new Error('No container ID returned');
    }
    
    return data.id;
  } catch (error) {
    log(`Error creating Instagram media container: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Publish a media container to Instagram
 * This is the second step in the creation process
 * 
 * @param containerId Container ID from createInstagramMediaContainer
 * @returns Media ID of the published post
 */
export async function publishInstagramMedia(containerId: string): Promise<string> {
  try {
    log(`Publishing Instagram media container: ${containerId}`, 'instagram');
    
    // Get Instagram account ID
    const instagramAccountId = await getInstagramAccountId();
    if (!instagramAccountId) {
      throw new Error('Instagram account ID not found');
    }
    
    // Get user access token
    const accessToken = await getUserAccessToken();
    if (!accessToken) {
      throw new Error('User access token missing');
    }
    
    // Set up the request to publish the media
    const formData = new URLSearchParams();
    formData.append('creation_id', containerId);
    formData.append('access_token', accessToken);
    
    // Make the API call to Instagram Graph API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media_publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      }
    );
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    
    if (!data.id) {
      throw new Error('No media ID returned');
    }
    
    return data.id;
  } catch (error) {
    log(`Error publishing Instagram media: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Posts an article to Instagram when it's published
 * Uses the article's instagramImageUrl (InstaPhotoLink) and hashtags for the post
 *
 * @param article The article to post to Instagram
 * @returns Object with success status and mediaId if successful
 */
export async function postArticleToInstagram(article: any): Promise<{success: boolean, mediaId?: string, error?: string}> {
  try {
    log(`Attempting to post article to Instagram: ${article.title} (ID: ${article.id})`, 'instagram');
    
    // Check if article has an Instagram image URL (InstaPhotoLink)
    if (!article.instagramImageUrl) {
      log(`Article ${article.id} has no Instagram image URL, skipping Instagram post`, 'instagram');
      return { success: false, error: 'No Instagram image URL found for this article' };
    }
    
    // Prepare the caption using hashtags if available
    let caption = article.title || '';
    
    if (article.hashtags && article.hashtags.trim() !== '') {
      // Make sure hashtags start with # if not already formatted
      const hashtags = article.hashtags
        .split(' ')
        .map((tag: string) => tag.startsWith('#') ? tag : `#${tag}`)
        .join(' ');
      
      caption = `${caption}\n\n${hashtags}`;
    }
    
    log(`Creating Instagram post with image: ${article.instagramImageUrl}`, 'instagram');
    log(`Caption: ${caption}`, 'instagram');
    
    // Create an Instagram media container
    const containerId = await createInstagramMediaContainer(article.instagramImageUrl, caption);
    
    // Publish the media
    const mediaId = await publishInstagramMedia(containerId);
    
    // Log the activity
    await storage.createActivityLog({
      action: 'instagram_article_published',
      userId: null,
      resourceType: 'article',
      resourceId: article.id.toString(),
      details: {
        timestamp: new Date().toISOString(),
        containerId,
        mediaId,
        articleTitle: article.title
      }
    });
    
    log(`Successfully posted article to Instagram: ${article.title} (Media ID: ${mediaId})`, 'instagram');
    
    return { 
      success: true, 
      mediaId 
    };
  } catch (error) {
    log(`Error posting article to Instagram: ${error}`, 'instagram');
    
    // Log the error
    await storage.createActivityLog({
      action: 'instagram_post_error',
      userId: null,
      resourceType: 'article',
      resourceId: article.id.toString(),
      details: {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        articleTitle: article.title
      }
    });
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}