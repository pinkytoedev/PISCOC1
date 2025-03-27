import { Request, Response } from 'express';
import crypto from 'crypto';
import { log } from '../vite';
import { storage } from '../storage';

// Constants
const WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || 'your_verify_token';
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';

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
  verifyToken: string = WEBHOOK_VERIFY_TOKEN
) {
  try {
    // In a real implementation, you would make an API call to the Instagram Graph API
    // to create the webhook subscription. For demonstration purposes, we'll simulate this.
    
    log(`Subscribing to Instagram webhook: fields=${fields.join(',')}, callback=${callbackUrl}`, 'instagram');
    
    // Simulated response for demonstration
    const subscriptionResult = {
      success: true,
      fields,
      callback_url: callbackUrl,
      active: true,
      object: 'instagram',
      subscription_id: `sub_${Date.now()}`
    };
    
    await logWebhookActivity('subscription_created', subscriptionResult);
    
    return subscriptionResult;
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
 * Get active webhook subscriptions
 * 
 * @returns Array of active subscriptions
 */
export async function getWebhookSubscriptions() {
  try {
    // In a real implementation, you would make an API call to the Instagram Graph API
    // to fetch the active subscriptions. For demonstration purposes, we'll return dummy data.
    
    log('Getting Instagram webhook subscriptions', 'instagram');
    
    // Simulated subscriptions for demonstration
    const subscriptions = [
      {
        object: 'instagram',
        callback_url: `${process.env.BASE_URL || 'https://your-app.com'}/api/instagram/webhooks/callback`,
        active: true,
        fields: ['mentions', 'comments'],
        subscription_id: 'sub_mentions_comments'
      }
    ];
    
    return subscriptions;
  } catch (error) {
    log(`Error getting webhook subscriptions: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Unsubscribe from a webhook subscription
 * 
 * @param subscriptionId The ID of the subscription to delete
 * @returns Success status
 */
export async function unsubscribeFromWebhook(subscriptionId: string) {
  try {
    // In a real implementation, you would make an API call to the Instagram Graph API
    // to delete the subscription. For demonstration purposes, we'll simulate this.
    
    log(`Unsubscribing from Instagram webhook: ${subscriptionId}`, 'instagram');
    
    await logWebhookActivity('subscription_deleted', {
      subscription_id: subscriptionId,
      timestamp: new Date().toISOString()
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