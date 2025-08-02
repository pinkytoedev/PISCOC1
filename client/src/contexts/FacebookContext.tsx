import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import FacebookSDK from '../components/FacebookSDK';

// Types for the Facebook context
type FacebookAuthStatus = 'connected' | 'not_authorized' | 'unknown' | 'initializing';

interface FacebookUser {
  id: string;
  name?: string;
  email?: string;
  picture?: {
    data: {
      url: string;
    }
  };
}

interface FacebookContextType {
  isInitialized: boolean;
  status: FacebookAuthStatus;
  user: FacebookUser | null;
  accessToken: string | null;
  initializationError: string | null;
  login: (onSuccess?: () => void, onError?: (error: any) => void) => void;
  logout: (onSuccess?: () => void) => void;
  // Add more methods as needed for Instagram functionality
}

// Create context with default values
const FacebookContext = createContext<FacebookContextType>({
  isInitialized: false,
  status: 'initializing',
  user: null,
  accessToken: null,
  initializationError: null,
  login: () => { },
  logout: () => { }
});

interface FacebookProviderProps {
  children: ReactNode;
  appId: string;
}

/**
 * FacebookProvider Component
 * 
 * This provider manages Facebook authentication state and provides
 * methods for login, logout, and other Facebook SDK operations.
 */
export const FacebookProvider: React.FC<FacebookProviderProps> = ({ children, appId }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [status, setStatus] = useState<FacebookAuthStatus>('initializing');
  const [user, setUser] = useState<FacebookUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [fbInitComplete, setFbInitComplete] = useState(false);

  // Handle status change from Facebook SDK
  const handleStatusChange = (newStatus: FacebookAuthStatus, response: any) => {
    setStatus(newStatus);

    if (newStatus === 'connected' && response.authResponse) {
      const token = response.authResponse.accessToken;
      setAccessToken(token);

      // Fetch user information
      fetchUserInfo(token);

      // Store the access token in our backend for webhook API calls
      storeAccessToken(token, response.authResponse.userID);
    } else {
      setUser(null);
      setAccessToken(null);
    }
  };

  // Store access token in our backend
  const storeAccessToken = async (token: string, userID?: string) => {
    try {
      const response = await fetch('/api/instagram/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accessToken: token,
          userId: userID
        })
      });

      if (!response.ok) {
        console.error('Failed to store Facebook access token:', await response.text());
      } else {
        console.log('Successfully stored Facebook access token for Instagram API use');
      }
    } catch (error) {
      console.error('Error storing Facebook access token:', error);
    }
  };

  // Fetch user information from Facebook Graph API
  const fetchUserInfo = (token: string) => {
    if (!window.FB) return;

    window.FB.api('/me?fields=id,name,email,picture', (response) => {
      if (response && !response.error) {
        setUser(response);
      }
    });
  };

  // SDK Ready Handler - called when Facebook SDK is fully initialized
  const handleSdkReady = () => {
    console.log('Facebook SDK is ready');
    setSdkReady(true);

    // Add an additional delay to ensure FB.init() is completely finished
    setTimeout(() => {
      if (window.FB) {
        console.log('Marking FB.init as complete');
        setFbInitComplete(true);
        setIsInitialized(true);

        // Check login status after initialization is complete
        try {
          window.FB.getLoginStatus((response) => {
            console.log('Initial login status check:', response);
            if (response && response.status) {
              handleStatusChange(response.status, response);
            }
          });
        } catch (error) {
          console.error('Error checking initial login status:', error);
          setStatus('unknown');
        }
      }
    }, 500); // Give FB.init extra time to complete
  };

  // Login method with proper SDK synchronization
  const login = (onSuccess?: () => void, onError?: (error: any) => void) => {
    // Check for HTTPS requirement first
    if (typeof window !== 'undefined' && window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
      const httpsError = 'Facebook Login requires HTTPS. Please use HTTPS or localhost for development.';
      console.error(httpsError);
      if (onError) {
        onError(httpsError);
      }
      return;
    }

    // Check if SDK exists and is ready
    if (!window.FB) {
      console.error('Facebook SDK not loaded yet');
      setInitializationError('Facebook SDK not loaded. Please refresh the page and try again.');
      onError && onError('Facebook SDK not loaded yet');
      return;
    }

    // Wait for SDK to be properly initialized AND FB.init to be complete
    if (!sdkReady || !isInitialized || !fbInitComplete || !(window as any).fbInitialized) {
      console.warn('Facebook SDK initialization in progress, waiting...');
      console.log('Current state - sdkReady:', sdkReady, 'isInitialized:', isInitialized, 'fbInitComplete:', fbInitComplete, 'window.fbInitialized:', (window as any).fbInitialized);

      // Wait for SDK to be ready with exponential backoff
      let retryCount = 0;
      const maxRetries = 5;

      const retryLogin = () => {
        retryCount++;

        if (retryCount > maxRetries) {
          const error = 'Facebook SDK failed to initialize after multiple attempts. Please refresh the page.';
          setInitializationError(error);
          onError && onError(error);
          return;
        }

        if (window.FB && sdkReady && isInitialized && fbInitComplete && (window as any).fbInitialized) {
          console.log(`SDK now ready after ${retryCount} attempts, proceeding with login...`);
          // Recursively call login now that SDK should be ready
          login(onSuccess, onError);
        } else {
          console.log(`Retry ${retryCount}/${maxRetries}: Waiting for SDK to be ready...`);
          console.log(`FB exists: ${!!window.FB}, SDK ready: ${sdkReady}, Initialized: ${isInitialized}, FB.init complete: ${fbInitComplete}, window.fbInitialized: ${!!(window as any).fbInitialized}`);

          // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          const delay = Math.pow(2, retryCount) * 1000;
          setTimeout(retryLogin, delay);
        }
      };

      // Start the retry process
      setTimeout(retryLogin, 1000);
      return;
    }

    // Final safety check before calling any FB methods
    if (!window.FB || typeof window.FB.login !== 'function' || typeof window.FB.getLoginStatus !== 'function') {
      const error = 'Facebook SDK methods are not available. Please refresh the page.';
      console.error(error);
      setInitializationError(error);
      onError && onError(error);
      return;
    }

    // Check global initialization flag
    if (!(window as any).fbInitialized) {
      console.warn('Facebook SDK loaded but FB.init not yet called, waiting...');

      // Wait a bit and retry
      setTimeout(() => {
        if ((window as any).fbInitialized) {
          console.log('FB.init now complete, proceeding with login');
          login(onSuccess, onError);
        } else {
          const error = 'Facebook SDK failed to initialize properly. Please refresh the page.';
          console.error(error);
          setInitializationError(error);
          onError && onError(error);
        }
      }, 1000);
      return;
    }

    // Enhanced login flow for iframe environments like Replit
    try {
      console.log('Attempting Facebook login with fully initialized SDK');
      console.log('SDK states - FB exists:', !!window.FB, 'fbInitialized:', !!(window as any).fbInitialized, 'isInitialized:', isInitialized, 'fbInitComplete:', fbInitComplete);

      // If we're already connected, just return success
      if (status === 'connected' && accessToken) {
        console.log('User already connected with valid access token');
        onSuccess && onSuccess();
        return;
      }

      // Replit-specific handling for iframe environments
      const isInIframe = window !== window.parent;
      console.log('Is in iframe:', isInIframe);

      // Alert user to authenticate on a separate window for Replit environment
      if (isInIframe) {
        alert('The Facebook login popup may be blocked in the Replit environment. If it does not open, please try using this app outside of Replit or check for popup blockers.');
      }

      try {
        console.log('Calling FB.login directly...');

        // Direct login call - SDK initialization has been confirmed at this point
        window.FB.login((response) => {
          console.log('Facebook login response:', response);

          if (response.status === 'connected') {
            handleStatusChange('connected', response);
            onSuccess && onSuccess();
          } else {
            // Handle auth failure but don't trigger error for user cancellations
            if (response.status === 'not_authorized') {
              console.log('User cancelled login or did not fully authorize.');
              handleStatusChange('not_authorized', response);
            } else {
              console.error('Login failed:', response);
              handleStatusChange('unknown', response);
              onError && onError(response);
            }
          }
        }, {
          scope: 'email,public_profile,instagram_basic,pages_show_list,pages_read_engagement,instagram_content_publish',
          auth_type: 'rerequest',       // Ask for login even if previously denied
          return_scopes: true,          // Return granted scopes in response
          display: 'popup'              // Force popup mode to avoid iframe issues
        });
      } catch (fbLoginError) {
        console.error('Error during FB.login call:', fbLoginError);
        onError && onError(fbLoginError);
      }
    } catch (error) {
      console.error('Login function error:', error);
      onError && onError(error);
    }
  };

  // Logout method
  const logout = (onSuccess?: () => void) => {
    // Double-check SDK initialization
    if (!window.FB) {
      console.error('Facebook SDK not initialized yet');
      setInitializationError('Facebook SDK not initialized. Please refresh the page and try again.');
      return;
    }

    // Make sure we don't proceed if the SDK is still initializing
    if (!isInitialized) {
      console.warn('Facebook SDK initialization in progress, waiting...');

      // Wait a short time and try again if FB is available
      setTimeout(() => {
        if (window.FB) {
          console.log('Retrying logout after delay...');
          try {
            window.FB.logout((response) => {
              setStatus('unknown');
              setUser(null);
              setAccessToken(null);
              onSuccess && onSuccess();
            });
          } catch (error) {
            console.error('Facebook logout retry error:', error);
            setInitializationError('Failed to log out. Please try again.');
          }
        } else {
          setInitializationError('Facebook SDK failed to initialize. Please refresh the page.');
        }
      }, 1000);
      return;
    }

    // Normal logout flow
    try {
      console.log('Attempting Facebook logout with initialized SDK');
      window.FB.logout((response) => {
        setStatus('unknown');
        setUser(null);
        setAccessToken(null);
        onSuccess && onSuccess();
      });
    } catch (error) {
      console.error('Facebook logout error:', error);
      setInitializationError('Failed to log out. Please try again.');
    }
  };

  // Initialize the SDK - this is called when SDK starts initializing
  const handleInit = () => {
    console.log('Facebook SDK initialization started');
  };

  // Context value
  const contextValue: FacebookContextType = {
    isInitialized: sdkReady && isInitialized && fbInitComplete,
    status,
    user,
    accessToken,
    initializationError,
    login,
    logout
  };

  // Handle SDK initialization errors
  const handleSDKError = (error: string) => {
    console.error('Facebook SDK Error:', error);
    setInitializationError(error);
  };

  return (
    <FacebookContext.Provider value={contextValue}>
      <FacebookSDK
        appId={appId}
        onStatusChange={handleStatusChange}
        onInit={handleInit}
        onError={handleSDKError}
        onReady={handleSdkReady}
      />
      {children}
    </FacebookContext.Provider>
  );
};

// Hook to use the Facebook context
export const useFacebook = () => useContext(FacebookContext);

export default FacebookContext;