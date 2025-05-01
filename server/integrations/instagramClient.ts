/**
 * Instagram API Client
 * 
 * Provides rate-limited and cached access to Instagram Graph API endpoints.
 * Handles all communication with the Instagram/Facebook Graph API.
 */

import { log } from '../vite';
import { storage } from '../storage';
import { executeRateLimitedRequest } from '../utils/rateLimiter';
import { getOrFetch, clearCache } from '../utils/apiCache';

// Constants
const APP_ID = process.env.FACEBOOK_APP_ID;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

// Media fields used when retrieving Instagram posts
const INSTAGRAM_MEDIA_FIELDS = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,children{id,media_type,media_url,thumbnail_url}';

// Cache TTL durations (in milliseconds)
const CACHE_TTL = {
  SHORT: 5 * 60 * 1000,     // 5 minutes
  MEDIUM: 30 * 60 * 1000,   // 30 minutes
  LONG: 24 * 60 * 60 * 1000 // 24 hours
};

/**
 * Get app access token (cached)
 * @returns App access token or null if unavailable
 */
export async function getAppAccessToken(): Promise<string | null> {
  try {
    // First check if we have it cached in the database
    const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "app_access_token");
    if (tokenSetting?.value) {
      return tokenSetting.value;
    }
    
    // If not cached, we need to generate it
    if (!APP_ID || !APP_SECRET) {
      log('Cannot generate app access token: APP_ID or APP_SECRET missing', 'instagram');
      return null;
    }
    
    // Rate limit and make the API call to get an app access token
    const endpoint = 'oauth/access_token';
    return await executeRateLimitedRequest(endpoint, async () => {
      const response = await fetch(
        `https://graph.facebook.com/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&grant_type=client_credentials`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to get app access token: ${await response.text()}`);
      }
      
      const data = await response.json();
      const appAccessToken = data.access_token;
      
      if (!appAccessToken) {
        throw new Error('No access_token in response');
      }
      
      // Cache the token for future use
      await storage.createIntegrationSetting({
        service: "facebook",
        key: "app_access_token",
        value: appAccessToken,
        enabled: true
      });
      
      log('Generated and stored new app access token', 'instagram');
      return appAccessToken;
    });
  } catch (error) {
    log(`Error getting app access token: ${error}`, 'instagram');
    return null;
  }
}

/**
 * Get user access token from database
 * @returns User access token or null if unavailable
 */
export async function getUserAccessToken(): Promise<string | null> {
  const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
  return tokenSetting?.value || null;
}

/**
 * Get Facebook Pages owned by the user
 * @returns Array of Facebook Pages or empty array if none found
 */
export async function getUserPages(): Promise<any[]> {
  const accessToken = await getUserAccessToken();
  
  if (!accessToken) {
    log('Cannot get user pages: Access token missing', 'instagram');
    return [];
  }
  
  // Use cache for this call
  return await getOrFetch(
    'facebook_user_pages', 
    async () => {
      const endpoint = 'User/accounts';
      return await executeRateLimitedRequest(endpoint, async () => {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          log(`Failed to get user pages: ${errorText}`, 'instagram');
          throw new Error(`Failed to get user pages: ${errorText}`);
        }
        
        const pagesData = await response.json();
        return pagesData.data || [];
      });
    },
    { ttl: CACHE_TTL.MEDIUM }
  );
}

/**
 * Get Instagram Business Account linked to a Facebook Page
 * @param pageId Facebook Page ID
 * @returns Instagram Business Account ID or null if not found
 */
export async function getInstagramBusinessAccount(pageId: string): Promise<string | null> {
  const accessToken = await getUserAccessToken();
  
  if (!accessToken) {
    return null;
  }
  
  // Use cache for this call
  return await getOrFetch(
    `instagram_business_account_${pageId}`,
    async () => {
      const endpoint = 'Page';
      return await executeRateLimitedRequest(endpoint, async () => {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${accessToken}`
        );
        
        if (!response.ok) {
          return null;
        }
        
        const data = await response.json();
        
        if (data.instagram_business_account && data.instagram_business_account.id) {
          return data.instagram_business_account.id;
        }
        
        return null;
      });
    },
    { ttl: CACHE_TTL.LONG } // Cache for longer since this rarely changes
  );
}

/**
 * Get Instagram account ID for the authenticated user (cached)
 * @returns Instagram account ID or null if not found
 */
export async function getInstagramAccountId(): Promise<string | null> {
  try {
    // First check if we have it cached in the database
    const idSetting = await storage.getIntegrationSettingByKey("instagram", "account_id");
    if (idSetting?.value) {
      return idSetting.value;
    }
    
    // Get user's Facebook pages
    const pages = await getUserPages();
    
    if (!pages.length) {
      log('User has no Facebook Pages associated with their account', 'instagram');
      return null;
    }
    
    // For each page, try to get the Instagram Business Account
    for (const page of pages) {
      try {
        const instagramAccountId = await getInstagramBusinessAccount(page.id);
        
        if (instagramAccountId) {
          // Cache the ID in database for future use
          await storage.createIntegrationSetting({
            service: "instagram",
            key: "account_id",
            value: instagramAccountId,
            enabled: true
          });
          
          log(`Found and stored Instagram account ID: ${instagramAccountId}`, 'instagram');
          return instagramAccountId;
        }
      } catch (pageError) {
        log(`Error checking page ${page.id} for Instagram account: ${pageError}`, 'instagram');
        // Continue to next page
      }
    }
    
    log('No Instagram Business Account found for any of the user\'s pages', 'instagram');
    return null;
  } catch (error) {
    log(`Error getting Instagram account ID: ${error}`, 'instagram');
    return null;
  }
}

/**
 * Get recent media from an Instagram Business Account
 * @param limit Number of posts to retrieve (default: 25)
 * @returns Array of Instagram media objects
 */
export async function getInstagramMedia(limit: number = 25) {
  try {
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
    
    // Use cache for media requests
    return await getOrFetch(
      `instagram_media_${instagramAccountId}_${limit}`,
      async () => {
        const endpoint = 'media';
        return await executeRateLimitedRequest(endpoint, async () => {
          // Fetch media from the Instagram Graph API
          const response = await fetch(
            `https://graph.facebook.com/v18.0/${instagramAccountId}/media?fields=${INSTAGRAM_MEDIA_FIELDS}&limit=${limit}&access_token=${accessToken}`
          );
          
          if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${await response.text()}`);
          }
          
          const data = await response.json();
          return data.data || [];
        });
      },
      { ttl: CACHE_TTL.SHORT } // Short cache as media can be updated frequently
    );
  } catch (error) {
    log(`Error getting Instagram media: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Get a single Instagram media post by ID
 * @param mediaId ID of the Instagram media post
 * @returns Instagram media object or null if not found
 */
export async function getInstagramMediaById(mediaId: string) {
  try {
    // Get Instagram account ID (needed for permissions check)
    const instagramAccountId = await getInstagramAccountId();
    if (!instagramAccountId) {
      throw new Error('Instagram account ID not found');
    }
    
    // Get user access token
    const accessToken = await getUserAccessToken();
    if (!accessToken) {
      throw new Error('User access token missing');
    }
    
    // Cache individual media items for longer
    return await getOrFetch(
      `instagram_media_item_${mediaId}`,
      async () => {
        const endpoint = `media/${mediaId}`;
        return await executeRateLimitedRequest(endpoint, async () => {
          const response = await fetch(
            `https://graph.facebook.com/v18.0/${mediaId}?fields=${INSTAGRAM_MEDIA_FIELDS}&access_token=${accessToken}`
          );
          
          if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${await response.text()}`);
          }
          
          return await response.json();
        });
      },
      { ttl: CACHE_TTL.MEDIUM }
    );
  } catch (error) {
    log(`Error getting Instagram media by ID: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Get webhook subscriptions
 * @returns Array of active subscriptions
 */
export async function getWebhookSubscriptions() {
  try {
    log('Getting Instagram webhook subscriptions', 'instagram');
    
    // Get from cache first
    return await getOrFetch(
      'instagram_webhook_subscriptions',
      async () => {
        // Get app access token - required for webhook operations
        const appAccessToken = await getAppAccessToken();
        
        // If we have an app access token, attempt to call the Graph API
        if (appAccessToken) {
          try {
            const endpoint = 'Application/subscriptions';
            return await executeRateLimitedRequest(endpoint, async () => {
              // Make the API call to Facebook Graph API
              const response = await fetch(
                `https://graph.facebook.com/v17.0/app/subscriptions?access_token=${appAccessToken}`
              );
              
              if (!response.ok) {
                throw new Error(`API returned ${response.status}: ${await response.text()}`);
              }
              
              const data = await response.json();
              
              if (data && data.data) {
                // Transform the response to match our expected format
                return data.data.map((sub: any) => ({
                  object: sub.object,
                  callback_url: sub.callback_url,
                  active: true,
                  fields: sub.fields,
                  subscription_id: `sub_${sub.object}_${sub.fields.join('_')}`
                }));
              }
              
              return [];
            });
          } catch (graphError) {
            log(`Error calling Graph API for subscriptions: ${graphError}`, 'instagram');
            // Fall back to local data if API call fails
          }
        }
        
        // Fall back to getting subscriptions from our database
        try {
          const settings = await storage.getIntegrationSettings("instagram");
          const subscriptionSettings = settings.filter(setting => setting.key.startsWith('webhook_subscription_'));
          
          if (subscriptionSettings.length > 0) {
            return subscriptionSettings.map(sub => JSON.parse(sub.value));
          }
        } catch (dbError) {
          log(`Error getting webhook subscriptions from database: ${dbError}`, 'instagram');
        }
        
        // Return empty array if no subscriptions are found
        return [];
      },
      { ttl: CACHE_TTL.SHORT }
    );
  } catch (error) {
    log(`Error getting webhook subscriptions: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Clear Instagram API caches
 * This should be called when a user logs in or out
 */
export function clearInstagramCaches(): void {
  log('Clearing Instagram API caches', 'instagram');
  clearCache('facebook_user_pages');
  clearCache('instagram_webhook_subscriptions');
  
  // Clear any keys starting with instagram_media or instagram_business_account
  Object.keys(global).forEach(key => {
    if (key.startsWith('instagram_media_') || key.startsWith('instagram_business_account_')) {
      clearCache(key);
    }
  });
}

/**
 * Process and prepare an image URL for Instagram
 * Uses multiple approaches with fallbacks to ensure compatibility
 * 
 * @param imageUrl Original image URL
 * @returns Processed image URL that is compatible with Instagram API
 */
export async function prepareImageForInstagram(imageUrl: string): Promise<string> {
  try {
    log(`Preparing image for Instagram: ${imageUrl}`, 'instagram');
    
    // For direct Instagram posting, we'll try several approaches
    // APPROACH 1: Using direct base64 image processing
    log(`APPROACH 1: Using direct base64 image processing`, 'instagram');
    try {
      // Import the new enhanced image processor
      const { processImageForInstagram } = await import('../utils/instagramImageProcessor');
      
      // Process the image for Instagram - this downloads and hosts on our server
      const processedUrl = await processImageForInstagram(imageUrl);
      log(`Successfully processed image for Instagram: ${processedUrl}`, 'instagram');
      return processedUrl;
    } catch (processingError) {
      log(`Base64 approach failed: ${processingError}. Trying ImgBB approach...`, 'instagram');
    }
    
    // APPROACH 2: Using ImgBB as intermediary host
    log(`APPROACH 2: Using ImgBB as intermediary host`, 'instagram');
    try {
      // Import the image utilities
      const { uploadToImgBB } = await import('../utils/imageDownloader');
      
      // Upload the image to ImgBB
      const imgbbUrl = await uploadToImgBB(imageUrl);
      log(`Successfully uploaded to ImgBB: ${imgbbUrl}`, 'instagram');
      
      // Try to use ImgBB URL directly
      return imgbbUrl;
    } catch (imgbbError) {
      log(`ImgBB approach failed: ${imgbbError}. Trying direct URL approach...`, 'instagram');
    }
    
    // APPROACH 3: Trying direct image URL as last resort
    log(`APPROACH 3: Trying direct image URL as last resort`, 'instagram');
    
    // Clean up URL parameters if present
    const cleanUrl = imageUrl.split('?')[0];
    
    // Ensure the URL has an image extension (Instagram requires this)
    if (!cleanUrl.match(/\.(jpg|jpeg|png|gif)$/i)) {
      // If no extension, append .jpg as fallback
      return `${cleanUrl}.jpg`;
    }
    
    return cleanUrl;
  } catch (error) {
    log(`Error preparing image for Instagram: ${error}`, 'instagram');
    // If all approaches fail, return the original URL as a last resort
    return imageUrl;
  }
}

/**
 * Create an Instagram media container for later publishing
 * Uses multi-approach strategy with fallbacks for reliability
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
    
    log(`Using Instagram account ID: ${instagramAccountId}`, 'instagram');
    
    // We'll try multiple approaches until one succeeds
    
    // APPROACH 1: Using direct base64 image processing
    log(`APPROACH 1: Using direct base64 image processing`, 'instagram');
    try {
      const { processImageForInstagram } = await import('../utils/instagramImageProcessor');
      
      // Process the image for Instagram - this downloads and hosts on our server
      const processedUrl = await processImageForInstagram(imageUrl);
      
      // Create a container with our processed image
      const containerId = await createMediaContainer(processedUrl, caption, instagramAccountId, accessToken);
      log(`Successfully created media container with ID: ${containerId}`, 'instagram');
      return containerId;
    } catch (error) {
      const approach1Error = error as Error;
      log(`Base64 approach failed: ${approach1Error.message}. Trying ImgBB approach...`, 'instagram');
    }
    
    // APPROACH 2: Using ImgBB as intermediary host
    log(`APPROACH 2: Using ImgBB as intermediary host`, 'instagram');
    try {
      const { uploadToImgBB } = await import('../utils/imageDownloader');
      
      // Upload the image to ImgBB
      const imgbbUrl = await uploadToImgBB(imageUrl);
      log(`Successfully uploaded to ImgBB: ${imgbbUrl}`, 'instagram');
      
      // Try to create a container with ImgBB URL
      const containerId = await createMediaContainer(imgbbUrl, caption, instagramAccountId, accessToken);
      log(`Successfully created media container with ID: ${containerId}`, 'instagram');
      return containerId;
    } catch (error) {
      const approach2Error = error as Error;
      log(`ImgBB approach failed: ${approach2Error.message}. Trying direct URL approach...`, 'instagram');
    }
    
    // APPROACH 3: Trying direct image URL as last resort
    log(`APPROACH 3: Trying direct image URL as last resort`, 'instagram');
    try {
      // Clean up URL parameters if present
      const cleanUrl = imageUrl.split('?')[0];
      
      // Try to create a container with direct URL
      const containerId = await createMediaContainer(cleanUrl, caption, instagramAccountId, accessToken);
      log(`Successfully created media container with ID: ${containerId}`, 'instagram');
      return containerId;
    } catch (error) {
      const approach3Error = error as Error;
      log(`Direct URL approach failed: ${approach3Error.message}`, 'instagram');
      throw new Error(`All approaches failed. Instagram API error: ${approach3Error.message}`);
    }
  } catch (error) {
    log(`Error creating Instagram media container: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Helper function to create media container with specific URL
 * Extracted for reuse in multiple approaches
 */
async function createMediaContainer(
  imageUrl: string, 
  caption: string, 
  instagramAccountId: string, 
  accessToken: string
): Promise<string> {
  // Rate limit the API call
  const endpoint = 'media/container';
  return await executeRateLimitedRequest(endpoint, async () => {
    // Set up the request to create a media container
    const formData = new URLSearchParams();
    formData.append('image_url', imageUrl);
    formData.append('caption', caption);
    formData.append('access_token', accessToken);
    
    // Log the actual URL being sent (for debugging)
    log(`Sending image URL to Instagram: ${imageUrl}`, 'instagram');
    
    // Check if image URL is accessible
    try {
      const checkResponse = await fetch(imageUrl, { method: 'HEAD' });
      log(`Image URL check: status=${checkResponse.status}, content-type=${checkResponse.headers.get('content-type')}`, 'instagram');
    } catch (checkError) {
      log(`Warning: Could not verify image URL accessibility: ${checkError}`, 'instagram');
      // Continue anyway, as Instagram will do its own check
    }
    
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
    
    log(`Instagram API response status: ${response.status}`, 'instagram');
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }
    
    const data = await response.json();
    
    if (!data.id) {
      throw new Error('No container ID returned');
    }
    
    return data.id;
  });
}

/**
 * Publish a media container to Instagram
 * Uses rate limiting and error handling
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
    
    // Rate limit the API call
    const endpoint = 'media/publish';
    return await executeRateLimitedRequest(endpoint, async () => {
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
    });
  } catch (error) {
    log(`Error publishing Instagram media: ${error}`, 'instagram');
    throw error;
  }
}