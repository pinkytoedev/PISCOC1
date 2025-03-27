import { useEffect } from 'react';

// Types for Facebook SDK
declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: {
      init: (options: {
        appId: string;
        cookie: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      AppEvents: {
        logPageView: () => void;
      };
      XFBML: {
        parse: () => void;
      };
      getLoginStatus: (callback: (response: {
        status: 'connected' | 'not_authorized' | 'unknown';
        authResponse?: {
          accessToken: string;
          expiresIn: string;
          signedRequest: string;
          userID: string;
        }
      }) => void) => void;
      login: (callback: (response: any) => void, options?: { scope: string }) => void;
      logout: (callback: (response: any) => void) => void;
      api: (path: string, callback: (response: any) => void) => void;
    };
  }
}

interface FacebookSDKProps {
  appId: string;
  version?: string;
  onStatusChange?: (status: 'connected' | 'not_authorized' | 'unknown', response?: any) => void;
  onInit?: () => void;
}

/**
 * FacebookSDK Component
 * 
 * This component handles loading the Facebook SDK and initializing it with your app ID.
 * It manages the async loading pattern and triggers appropriate callbacks.
 * 
 * @param appId Facebook App ID
 * @param version Facebook API version (default v18.0)
 * @param onStatusChange Callback when login status changes
 * @param onInit Callback when SDK is initialized
 */
export function FacebookSDK({ 
  appId, 
  version = 'v18.0',
  onStatusChange,
  onInit
}: FacebookSDKProps) {
  useEffect(() => {
    // Only load the SDK once
    if (document.getElementById('facebook-jssdk')) {
      return;
    }

    // Initialize Facebook SDK
    window.fbAsyncInit = function() {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: true,
        version,
      });
      
      // Log page view
      window.FB.AppEvents.logPageView();
      
      // Check login status
      window.FB.getLoginStatus(function(response) {
        if (onStatusChange) {
          onStatusChange(response.status, response);
        }
      });
      
      // Trigger init callback
      if (onInit) {
        onInit();
      }
    };

    // Load the SDK asynchronously
    (function(d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s) as HTMLScriptElement;
      js.id = id;
      js.src = `https://connect.facebook.net/en_US/sdk.js`;
      if (fjs && fjs.parentNode) {
        fjs.parentNode.insertBefore(js, fjs);
      }
    }(document, 'script', 'facebook-jssdk'));
    
    // Cleanup
    return () => {
      // FB SDK doesn't have a direct cleanup method, but we could remove the script if needed
      // In practice, this is rarely necessary as the SDK is typically needed throughout the app
    };
  }, [appId, version, onStatusChange, onInit]);

  return null; // This component doesn't render anything
}

export default FacebookSDK;