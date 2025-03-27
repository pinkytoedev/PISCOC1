import React, { createContext, useContext, useState, useEffect } from 'react';
import { FacebookSDK } from '@/components/FacebookSDK';

interface FacebookContextType {
  isInitialized: boolean;
  login: () => Promise<any>;
  logout: () => Promise<void>;
  getAuthStatus: () => Promise<any>;
  getFacebookUserData: () => Promise<any>;
}

const FacebookContext = createContext<FacebookContextType | null>(null);

export const useFacebook = () => {
  const context = useContext(FacebookContext);
  if (!context) {
    throw new Error('useFacebook must be used within a FacebookProvider');
  }
  return context;
};

interface FacebookProviderProps {
  appId: string;
  children: React.ReactNode;
}

export const FacebookProvider: React.FC<FacebookProviderProps> = ({ appId, children }) => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Check if FB is initialized
    const checkFBInit = setInterval(() => {
      if (window.FB) {
        setIsInitialized(true);
        clearInterval(checkFBInit);
      }
    }, 100);

    return () => {
      clearInterval(checkFBInit);
    };
  }, []);

  const login = () => {
    return new Promise((resolve, reject) => {
      if (!window.FB) {
        reject(new Error('Facebook SDK not initialized'));
        return;
      }

      window.FB.login((response: any) => {
        if (response.authResponse) {
          resolve(response);
        } else {
          reject(new Error('User cancelled login or did not fully authorize'));
        }
      }, { scope: 'public_profile,email,instagram_basic,instagram_content_publish,pages_show_list' });
    });
  };

  const logout = () => {
    return new Promise<void>((resolve, reject) => {
      if (!window.FB) {
        reject(new Error('Facebook SDK not initialized'));
        return;
      }

      window.FB.logout(() => {
        resolve();
      });
    });
  };

  const getAuthStatus = () => {
    return new Promise((resolve, reject) => {
      if (!window.FB) {
        reject(new Error('Facebook SDK not initialized'));
        return;
      }

      window.FB.getLoginStatus((response: any) => {
        resolve(response);
      });
    });
  };

  const getFacebookUserData = () => {
    return new Promise((resolve, reject) => {
      if (!window.FB) {
        reject(new Error('Facebook SDK not initialized'));
        return;
      }

      window.FB.api('/me', { fields: 'id,name,email,picture' }, (response: any) => {
        if (!response || response.error) {
          reject(response?.error || new Error('Failed to fetch user data'));
          return;
        }
        resolve(response);
      });
    });
  };

  return (
    <FacebookContext.Provider
      value={{
        isInitialized,
        login,
        logout,
        getAuthStatus,
        getFacebookUserData
      }}
    >
      <FacebookSDK appId={appId} />
      {children}
    </FacebookContext.Provider>
  );
};