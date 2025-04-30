/**
 * Instagram API Permissions Validation
 * This module checks and validates Instagram API permissions
 */
import { log } from '../vite';
import { storage } from '../storage';

/**
 * Check if the Instagram account has the required permissions
 * 
 * @returns Object with permission information
 */
export async function checkInstagramPermissions(): Promise<{
  hasValidToken: boolean;
  hasValidAccount: boolean;
  hasPublishPermission: boolean;
  errorMessage?: string;
}> {
  try {
    // Get Facebook access token
    const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
    if (!tokenSetting?.value) {
      return {
        hasValidToken: false,
        hasValidAccount: false,
        hasPublishPermission: false,
        errorMessage: 'No Facebook access token found. Please reconnect with Facebook.'
      };
    }
    
    const accessToken = tokenSetting.value;
    log('Facebook access token found, checking permissions...', 'instagram');
    
    // First, check if we have the necessary permissions
    // We can use the /me/permissions endpoint
    const permissionsResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/permissions?access_token=${accessToken}`
    );
    
    if (!permissionsResponse.ok) {
      return {
        hasValidToken: false,
        hasValidAccount: false,
        hasPublishPermission: false,
        errorMessage: `Error checking permissions: ${await permissionsResponse.text()}`
      };
    }
    
    const permissionsData = await permissionsResponse.json();
    const permissions = permissionsData.data || [];
    
    // Check if we have the instagram_basic and instagram_content_publish permissions
    const hasBasicPermission = permissions.some((p: {permission: string, status: string}) => 
      p.permission === 'instagram_basic' && p.status === 'granted');
    const hasPublishPermission = permissions.some((p: {permission: string, status: string}) => 
      p.permission === 'instagram_content_publish' && p.status === 'granted');
    
    if (!hasBasicPermission) {
      return {
        hasValidToken: true,
        hasValidAccount: false,
        hasPublishPermission: false,
        errorMessage: 'Missing instagram_basic permission. Please reconnect with Facebook and grant all requested permissions.'
      };
    }
    
    if (!hasPublishPermission) {
      return {
        hasValidToken: true,
        hasValidAccount: true,
        hasPublishPermission: false,
        errorMessage: 'Missing instagram_content_publish permission. Please reconnect with Facebook and grant all requested permissions.'
      };
    }
    
    // Now, let's check if we can get the Instagram account ID
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    );
    
    if (!pagesResponse.ok) {
      return {
        hasValidToken: true,
        hasValidAccount: false,
        hasPublishPermission: hasPublishPermission,
        errorMessage: `Error getting Facebook Pages: ${await pagesResponse.text()}`
      };
    }
    
    const pagesData = await pagesResponse.json();
    if (!pagesData.data || pagesData.data.length === 0) {
      return {
        hasValidToken: true,
        hasValidAccount: false,
        hasPublishPermission: hasPublishPermission,
        errorMessage: 'No Facebook Pages found. You need a Facebook Page linked to an Instagram Business Account.'
      };
    }
    
    // Check each page for an Instagram Business Account
    let foundInstagramAccount = false;
    let instagramAccountId = null;
    
    for (const page of pagesData.data) {
      const pageId = page.id;
      const pageToken = page.access_token;
      
      // Try to get Instagram Business Account for this page
      const instagramResponse = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`
      );
      
      if (!instagramResponse.ok) continue;
      
      const instagramData = await instagramResponse.json();
      
      if (instagramData.instagram_business_account && instagramData.instagram_business_account.id) {
        foundInstagramAccount = true;
        instagramAccountId = instagramData.instagram_business_account.id;
        
        // Store this valid Instagram account ID
        try {
          const existingId = await storage.getIntegrationSettingByKey("instagram", "account_id");
          if (existingId) {
            await storage.updateIntegrationSetting(existingId.id, {
              value: instagramAccountId
            });
          } else {
            await storage.createIntegrationSetting({
              service: "instagram",
              key: "account_id",
              value: instagramAccountId,
              enabled: true
            });
          }
          
          // Also store the page token for this account
          const existingPageToken = await storage.getIntegrationSettingByKey("facebook", "page_token");
          if (existingPageToken) {
            await storage.updateIntegrationSetting(existingPageToken.id, {
              value: pageToken
            });
          } else {
            await storage.createIntegrationSetting({
              service: "facebook",
              key: "page_token",
              value: pageToken,
              enabled: true
            });
          }
          
          log(`Found and stored Instagram account ID: ${instagramAccountId}`, 'instagram');
          break;
        } catch (storageError) {
          log(`Error storing Instagram account ID: ${storageError}`, 'instagram');
          // Continue even if storage fails
        }
      }
    }
    
    if (!foundInstagramAccount) {
      return {
        hasValidToken: true,
        hasValidAccount: false,
        hasPublishPermission: hasPublishPermission,
        errorMessage: 'No Instagram Business Account found. Please make sure you have an Instagram Business Account linked to your Facebook Page.'
      };
    }
    
    // All checks passed!
    return {
      hasValidToken: true,
      hasValidAccount: true,
      hasPublishPermission: true
    };
    
  } catch (error) {
    log(`Error checking Instagram permissions: ${error}`, 'instagram');
    return {
      hasValidToken: false,
      hasValidAccount: false,
      hasPublishPermission: false,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Reset all Instagram-related tokens and settings
 * Use this to force a fresh reconnection with Instagram
 */
export async function resetInstagramConnection(): Promise<boolean> {
  try {
    // Remove Instagram account ID
    const accountIdSetting = await storage.getIntegrationSettingByKey("instagram", "account_id");
    if (accountIdSetting) {
      await storage.deleteIntegrationSetting(accountIdSetting.id);
    }
    
    // Remove Facebook access token
    const accessTokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
    if (accessTokenSetting) {
      await storage.deleteIntegrationSetting(accessTokenSetting.id);
    }
    
    // Remove Facebook page token
    const pageTokenSetting = await storage.getIntegrationSettingByKey("facebook", "page_token");
    if (pageTokenSetting) {
      await storage.deleteIntegrationSetting(pageTokenSetting.id);
    }
    
    log('Instagram connection has been reset', 'instagram');
    return true;
  } catch (error) {
    log(`Error resetting Instagram connection: ${error}`, 'instagram');
    return false;
  }
}