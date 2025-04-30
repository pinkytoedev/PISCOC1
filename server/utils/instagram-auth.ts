/**
 * Instagram Authentication and Account Validation Utilities
 * 
 * This module provides functions to validate Instagram authentication status
 * and check whether the Instagram business account has the required permissions
 */

import { storage } from '../storage';
import { log } from '../vite';

/**
 * Check if a connected Instagram account is valid and has the required permissions
 * 
 * @returns Object indicating if account is valid and has permissions
 */
export async function validateInstagramAccount(): Promise<{
  valid: boolean;
  accountId?: string;
  errorMessage?: string;
  hasPersist?: boolean;
  hasPublish?: boolean;
}> {
  try {
    // Get Instagram account ID
    const accountSetting = await storage.getIntegrationSettingByKey("instagram", "account_id");
    
    if (!accountSetting?.value) {
      return {
        valid: false,
        errorMessage: "No Instagram business account connected"
      };
    }
    
    // Get Facebook token
    const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
    
    if (!tokenSetting?.value) {
      return {
        valid: false,
        errorMessage: "No Facebook access token found"
      };
    }
    
    const accessToken = tokenSetting.value;
    const instagramAccountId = accountSetting.value;
    
    // Check permissions using the Graph API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/content_publishing_limit?access_token=${accessToken}`
    );
    
    // Check if we're unauthorized
    if (response.status === 400) {
      // Try to check if the account exists at all
      const accountResponse = await fetch(
        `https://graph.facebook.com/v18.0/${instagramAccountId}?fields=username&access_token=${accessToken}`
      );
      
      if (!accountResponse.ok) {
        // The account either doesn't exist or we don't have access
        return {
          valid: false,
          accountId: instagramAccountId,
          errorMessage: "Instagram account not found or insufficient permissions"
        };
      }
      
      return {
        valid: false,
        accountId: instagramAccountId,
        errorMessage: "Missing publishing permissions"
      };
    } else if (!response.ok) {
      return {
        valid: false,
        accountId: instagramAccountId,
        errorMessage: `API error: ${await response.text()}`
      };
    }
    
    // Get the data to check if we have permission to publish content
    const data = await response.json();
    
    // Publishing limit data should be included if we have permissions
    if (data.data && data.data.length > 0) {
      return {
        valid: true,
        accountId: instagramAccountId,
        hasPersist: true,
        hasPublish: true
      };
    } else {
      // Have an account but unclear about permissions
      return {
        valid: false,
        accountId: instagramAccountId,
        errorMessage: "Account found but permissions are unclear"
      };
    }
  } catch (error) {
    log(`Error validating Instagram account: ${error}`, 'instagram');
    return {
      valid: false,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Reset Instagram account connection data
 * Use this when there are permission issues to force a new connection
 */
export async function resetInstagramConnection(): Promise<boolean> {
  try {
    // Remove Instagram account ID
    const accountSetting = await storage.getIntegrationSettingByKey("instagram", "account_id");
    if (accountSetting) {
      await storage.deleteIntegrationSetting(accountSetting.id);
    }
    
    // Remove Facebook access token
    const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
    if (tokenSetting) {
      await storage.deleteIntegrationSetting(tokenSetting.id);
    }
    
    return true;
  } catch (error) {
    log(`Error resetting Instagram connection: ${error}`, 'instagram');
    return false;
  }
}