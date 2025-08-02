import { useEffect } from 'react';

// Types for Facebook SDK
declare global {
  interface Window {
    fbAsyncInit: () => void;
    fbInitialized?: boolean; // Track if FB.init has been called
    FB: {
      init: (options: {
        appId: string;
        cookie: boolean;
        xfbml: boolean;
        version: string;
        status?: boolean;
        frictionlessRequests?: boolean;
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
      login: (callback: (response: any) => void, options?: {
        scope: string,
        auth_type?: string,
        return_scopes?: boolean,
        display?: 'popup' | 'page' | 'iframe' | 'async'
      }) => void;
      logout: (callback: (response: any) => void) => void;
      api: (path: string, callback: (response: any) => void) => void;
      Event?: {
        subscribe: (event: string, callback: (response: any) => void) => void;
        unsubscribe: (event: string, callback: (response: any) => void) => void;
      };
    };
  }
}

interface FacebookSDKProps {
  appId: string;
  version?: string;
  onStatusChange?: (status: 'connected' | 'not_authorized' | 'unknown', response?: any) => void;
  onInit?: () => void;
  onError?: (error: string) => void;
  onReady?: () => void;
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
 * @param onInit Callback when SDK is initialized successfully
 * @param onError Callback when SDK fails to load or initialize, with error message
 */
export function FacebookSDK({
  appId,
  version = 'v18.0',
  onStatusChange,
  onInit,
  onError,
  onReady
}: FacebookSDKProps) {
  useEffect(() => {
    // Track if initialization has been called to prevent duplicates
    let initializationCalled = false;

    // Check if we already have the FB SDK script
    const existingScript = document.getElementById('facebook-jssdk');

    // Check for HTTPS requirement
    if (typeof window !== 'undefined' && window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
      console.error('Facebook Login requires HTTPS. Please use HTTPS or localhost for development.');
      if (onError) {
        onError('Facebook Login requires HTTPS. Please use HTTPS or localhost for development.');
      }
      return;
    }

    // Set up a timeout to detect if SDK fails to load
    const loadTimeout = setTimeout(() => {
      if (!window.FB && onError) {
        onError('Facebook SDK failed to load after 10 seconds. Please check your internet connection and try again.');
      }
    }, 10000);

    if (existingScript) {
      // If the script is already loaded and FB is available, initialize
      if (window.FB) {
        console.log('Facebook SDK already loaded, checking initialization status...');
        // Check if already initialized
        if (window.fbInitialized) {
          console.log('Facebook SDK already initialized, triggering ready callback');
          clearTimeout(loadTimeout);
          if (onReady) {
            setTimeout(() => onReady(), 100);
          }
        } else {
          console.log('Facebook SDK loaded but not initialized, initializing now...');
          initializeFacebookSDK();
          clearTimeout(loadTimeout);
        }
      } else if (onError) {
        onError('Facebook SDK script was found but FB object is not available.');
      }
      return () => clearTimeout(loadTimeout);
    }

    // Initialize Facebook SDK when it loads
    window.fbAsyncInit = function () {
      console.log('fbAsyncInit triggered');
      // Additional check to ensure FB object exists
      if (typeof window.FB !== 'undefined') {
        initializeFacebookSDK();
      } else {
        console.error('FB object not available in fbAsyncInit');
        // Retry after a short delay
        setTimeout(() => {
          if (typeof window.FB !== 'undefined') {
            initializeFacebookSDK();
          } else if (onError) {
            onError('Facebook SDK failed to load properly');
          }
        }, 500);
      }
      clearTimeout(loadTimeout);
    };

    // Function to initialize the SDK
    function initializeFacebookSDK() {
      // Prevent duplicate initialization
      if (initializationCalled) {
        console.log('Facebook SDK initialization already called, skipping duplicate');
        return;
      }
      initializationCalled = true;

      console.log('Initializing Facebook SDK...', { appId, value: appId, length: appId.length });

      // Make sure we have a valid App ID before initializing
      if (!appId || appId.length < 5) {
        console.error('Invalid Facebook App ID:', appId);
        if (onError) {
          onError('Invalid Facebook App ID. Please check your configuration.');
        }
        return;
      }

      try {
        // Add debugging for domain issue
        console.log('Current domain:', window.location.hostname);
        console.log('Current origin:', window.location.origin);

        // Initialize with adjusted settings for iframe/embedded environments like Replit
        window.FB.init({
          appId: appId,
          cookie: true, // Enable cookies for session persistence
          xfbml: true,
          version,
          status: true,  // Enable status checking
          frictionlessRequests: true // Make requests smoother
        });

        console.log('FB.init called with App ID:', appId);

        // Use FB.Event.subscribe to know when SDK is truly ready
        if (window.FB.Event && window.FB.Event.subscribe) {
          window.FB.Event.subscribe('auth.statusChange', function (response) {
            console.log('FB auth.statusChange event:', response);
            if (!window.fbInitialized) {
              window.fbInitialized = true;
              console.log('FB SDK initialization confirmed via auth.statusChange');
            }
          });
        }

        // Also check login status to ensure SDK is ready
        window.FB.getLoginStatus(function (response) {
          console.log('Initial FB.getLoginStatus response:', response);

          // Mark FB as initialized globally after successful status check
          window.fbInitialized = true;
          console.log('window.fbInitialized set to:', window.fbInitialized);

          // Log page view
          try {
            window.FB.AppEvents.logPageView();
          } catch (e) {
            console.warn('Failed to log page view:', e);
          }

          // Trigger init callback
          if (onInit) {
            onInit();
          }

          // Trigger ready callback - SDK is now truly ready
          if (onReady) {
            console.log('Facebook SDK fully ready, triggering onReady callback');
            onReady();
          }
        }, true); // Force fresh status check
      } catch (error) {
        console.error('Error initializing Facebook SDK:', error);
        if (onError) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error initializing Facebook SDK';
          onError(errorMessage);
        }
      }
    }

    // Handle script load error
    const handleScriptError = () => {
      console.error('Failed to load Facebook SDK script');
      if (onError) {
        onError('Failed to load Facebook SDK script. Please check your internet connection and try again.');
      }
      clearTimeout(loadTimeout);
    };

    // Load the SDK asynchronously
    console.log('Loading Facebook SDK...');
    (function (d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s) as HTMLScriptElement;
      js.id = id;
      js.src = `https://connect.facebook.net/en_US/sdk.js`;
      js.onerror = handleScriptError;
      if (fjs && fjs.parentNode) {
        fjs.parentNode.insertBefore(js, fjs);
      } else {
        // If we can't find a reference node, append to head
        d.getElementsByTagName('head')[0].appendChild(js);
      }
    }(document, 'script', 'facebook-jssdk'));

    // Cleanup
    return () => {
      clearTimeout(loadTimeout);
      // FB SDK doesn't have a direct cleanup method, but we could remove the script if needed
      // In practice, this is rarely necessary as the SDK is typically needed throughout the app
    };
  }, [appId, version, onStatusChange, onInit, onError, onReady]);

  return null; // This component doesn't render anything
}

export default FacebookSDK;