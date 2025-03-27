import React, { useEffect } from 'react';

// Add FacebookSDK to the global Window interface
declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

interface FacebookSDKProps {
  appId: string;
  version?: string;
}

/**
 * FacebookSDK Component
 * 
 * This component loads the Facebook SDK asynchronously.
 * It sets up Facebook SDK initialization when the component mounts.
 * 
 * @param {string} appId - Your Facebook application ID
 * @param {string} version - The Facebook Graph API version to use (default: v19.0)
 */
export function FacebookSDK({ appId, version = 'v19.0' }: FacebookSDKProps) {
  useEffect(() => {
    // Only load the SDK if we have an app ID
    if (!appId) {
      console.warn('Facebook App ID is missing. Facebook SDK initialization skipped.');
      return;
    }

    // Load the Facebook SDK asynchronously
    (function (d, s, id) {
      const fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      
      const js = d.createElement(s) as HTMLScriptElement;
      js.id = id;
      js.src = `https://connect.facebook.net/en_US/sdk.js`;
      
      if (fjs && fjs.parentNode) {
        fjs.parentNode.insertBefore(js, fjs);
      }
    }(document, 'script', 'facebook-jssdk'));

    // Initialize the SDK
    window.fbAsyncInit = function() {
      window.FB?.init({
        appId: appId,
        cookie: true,
        xfbml: true,
        version: version
      });
    };

    // Cleanup function
    return () => {
      // Cleanup any SDK-related resources if needed
      if (window.FB) {
        window.FB = undefined;
      }
      
      if (window.fbAsyncInit) {
        window.fbAsyncInit = () => {};
      }
      
      // Remove the SDK script tag if it exists
      const facebookScript = document.getElementById('facebook-jssdk');
      if (facebookScript && facebookScript.parentNode) {
        facebookScript.parentNode.removeChild(facebookScript);
      }
    };
  }, [appId, version]);

  // This component doesn't render anything visible
  return null;
}