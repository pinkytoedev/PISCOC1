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
  login: () => {},
  logout: () => {}
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

  // Handle status change from Facebook SDK
  const handleStatusChange = (newStatus: FacebookAuthStatus, response: any) => {
    setStatus(newStatus);
    
    if (newStatus === 'connected' && response.authResponse) {
      setAccessToken(response.authResponse.accessToken);
      // Fetch user information
      fetchUserInfo(response.authResponse.accessToken);
    } else {
      setUser(null);
      setAccessToken(null);
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

  // Login method
  const login = (onSuccess?: () => void, onError?: (error: any) => void) => {
    if (!window.FB) {
      console.error('Facebook SDK not loaded');
      onError && onError('Facebook SDK not loaded');
      return;
    }

    window.FB.login((response) => {
      if (response.status === 'connected') {
        handleStatusChange('connected', response);
        onSuccess && onSuccess();
      } else {
        onError && onError(response);
      }
    }, {
      scope: 'email,public_profile,instagram_basic,pages_show_list'
    });
  };

  // Logout method
  const logout = (onSuccess?: () => void) => {
    if (!window.FB) {
      console.error('Facebook SDK not loaded');
      return;
    }

    window.FB.logout((response) => {
      setStatus('unknown');
      setUser(null);
      setAccessToken(null);
      onSuccess && onSuccess();
    });
  };

  // Initialize the SDK
  const handleInit = () => {
    setIsInitialized(true);
  };

  // Context value
  const contextValue: FacebookContextType = {
    isInitialized,
    status,
    user,
    accessToken,
    login,
    logout
  };

  return (
    <FacebookContext.Provider value={contextValue}>
      <FacebookSDK 
        appId={appId}
        onStatusChange={handleStatusChange}
        onInit={handleInit}
      />
      {children}
    </FacebookContext.Provider>
  );
};

// Hook to use the Facebook context
export const useFacebook = () => useContext(FacebookContext);

export default FacebookContext;