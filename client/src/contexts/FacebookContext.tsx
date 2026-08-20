import React, { createContext, useState, useContext, ReactNode } from 'react';
import FacebookSDK from '../components/FacebookSDK';
import { apiRequest } from '@/lib/queryClient';

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

  // Store access token in our backend. Goes through apiRequest so the CSRF
  // header and session cookie are attached; a bare fetch is rejected with 403.
  const storeAccessToken = async (token: string, userID?: string) => {
    try {
      await apiRequest('POST', '/api/instagram/auth/token', {
        accessToken: token,
        userId: userID,
      });
    } catch (error) {
      setInitializationError(
        error instanceof Error
          ? `Connected to Facebook, but the session could not be saved: ${error.message}`
          : 'Connected to Facebook, but the session could not be saved.',
      );
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
    setSdkReady(true);

    // Add an additional delay to ensure FB.init() is completely finished
    setTimeout(() => {
      if (window.FB) {
        setFbInitComplete(true);
        setIsInitialized(true);

        // Check login status after initialization is complete
        try {
          window.FB.getLoginStatus((response) => {
            if (response && response.status) {
              handleStatusChange(response.status, response);
            }
          });
        } catch {
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
      onError?.(httpsError);
      return;
    }

    // Check if SDK exists and is ready
    if (!window.FB) {
      setInitializationError('Facebook SDK not loaded. Please refresh the page and try again.');
      onError?.('Facebook SDK not loaded yet');
      return;
    }

    // Wait for SDK to be properly initialized AND FB.init to be complete
    if (!sdkReady || !isInitialized || !fbInitComplete || !window.fbInitialized) {
      // Wait for SDK to be ready with exponential backoff
      let retryCount = 0;
      const maxRetries = 5;

      const retryLogin = () => {
        retryCount++;

        if (retryCount > maxRetries) {
          const error = 'Facebook SDK failed to initialize after multiple attempts. Please refresh the page.';
          setInitializationError(error);
          onError?.(error);
          return;
        }

        if (window.FB && sdkReady && isInitialized && fbInitComplete && window.fbInitialized) {
          // Recursively call login now that SDK should be ready
          login(onSuccess, onError);
        } else {
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
      setInitializationError(error);
      onError?.(error);
      return;
    }

    // Check global initialization flag
    if (!window.fbInitialized) {
      // Wait a bit and retry
      setTimeout(() => {
        if (window.fbInitialized) {
          login(onSuccess, onError);
        } else {
          const error = 'Facebook SDK failed to initialize properly. Please refresh the page.';
          setInitializationError(error);
          onError?.(error);
        }
      }, 1000);
      return;
    }

    // Enhanced login flow for iframe environments
    try {
      // If we're already connected, just return success
      if (status === 'connected' && accessToken) {
        onSuccess?.();
        return;
      }

      // Alert user to authenticate on a separate window for iframe environments
      if (window !== window.parent) {
        alert('The Facebook login popup may be blocked in iframe environments. If it does not open, please try using this app in a new browser tab or check for popup blockers.');
      }

      try {
        // Direct login call - SDK initialization has been confirmed at this point
        window.FB.login((response) => {
          if (response.status === 'connected') {
            handleStatusChange('connected', response);
            onSuccess?.();
          } else {
            // Handle auth failure but don't trigger error for user cancellations
            if (response.status === 'not_authorized') {
              handleStatusChange('not_authorized', response);
            } else {
              handleStatusChange('unknown', response);
              onError?.(response);
            }
          }
        }, {
          scope: 'email,public_profile,instagram_basic,pages_show_list,pages_read_engagement,instagram_content_publish',
          auth_type: 'rerequest',       // Ask for login even if previously denied
          return_scopes: true,          // Return granted scopes in response
          display: 'popup'              // Force popup mode to avoid iframe issues
        });
      } catch (fbLoginError) {
        onError?.(fbLoginError);
      }
    } catch (error) {
      onError?.(error);
    }
  };

  // Logout method
  const logout = (onSuccess?: () => void) => {
    // Double-check SDK initialization
    if (!window.FB) {
      setInitializationError('Facebook SDK not initialized. Please refresh the page and try again.');
      return;
    }

    const clearSession = () => {
      setStatus('unknown');
      setUser(null);
      setAccessToken(null);
      onSuccess?.();
    };

    // Make sure we don't proceed if the SDK is still initializing
    if (!isInitialized) {
      // Wait a short time and try again if FB is available
      setTimeout(() => {
        if (window.FB) {
          try {
            window.FB.logout(clearSession);
          } catch {
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
      window.FB.logout(clearSession);
    } catch {
      setInitializationError('Failed to log out. Please try again.');
    }
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

  return (
    <FacebookContext.Provider value={contextValue}>
      <FacebookSDK
        appId={appId}
        onStatusChange={handleStatusChange}
        onError={setInitializationError}
        onReady={handleSdkReady}
      />
      {children}
    </FacebookContext.Provider>
  );
};

// Hook to use the Facebook context
export const useFacebook = () => useContext(FacebookContext);

export default FacebookContext;