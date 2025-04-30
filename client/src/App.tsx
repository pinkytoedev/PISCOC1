import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { FacebookProvider } from "@/contexts/FacebookContext";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/lib/protected-route";
import { AdminProtectedRoute } from "@/lib/admin-protected-route";
import { useState, useEffect } from "react";

// Pages
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import ArticlesPage from "@/pages/articles-page";
import ArticlesPlannerPage from "@/pages/articles-planner-page";
import TeamMembersPage from "@/pages/team-members-page";
import CarouselQuotesPage from "@/pages/carousel-quotes-page";
import UserManagementPage from "@/pages/user-management-page";
// ApiStatusPage removed - now part of Debug Center
import DebugCenterPage from "@/pages/debug-center-page";
import DiscordPage from "@/pages/integrations/discord-page";
import AirtablePage from "@/pages/integrations/airtable-page";
import InstagramPage from "@/pages/integrations/instagram-page";
import UploadsPage from "@/pages/uploads";

import ImgBBPage from "@/pages/integrations/imgbb-page";
import PrivacyPolicyPage from "@/pages/privacy-policy-page";
import TestPage from "@/pages/test-page";
import PublicUploadPage from "@/pages/public-upload";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/articles" component={ArticlesPage} />
      <ProtectedRoute path="/articles/planner" component={ArticlesPlannerPage} />
      <ProtectedRoute path="/team-members" component={TeamMembersPage} />
      <ProtectedRoute path="/carousel-quotes" component={CarouselQuotesPage} />
      <AdminProtectedRoute path="/users" component={UserManagementPage} />
      {/* Redirect API Status to Debug Center */}
      <Route path="/api-status">
        {() => {
          window.location.href = '/debug-center';
          return null;
        }}
      </Route>
      <ProtectedRoute path="/debug-center" component={DebugCenterPage} />
      <ProtectedRoute path="/uploads" component={UploadsPage} />
      <AdminProtectedRoute path="/integrations/discord" component={DiscordPage} />
      <AdminProtectedRoute path="/integrations/airtable" component={AirtablePage} />
      <AdminProtectedRoute path="/integrations/instagram" component={InstagramPage} />
      <AdminProtectedRoute path="/integrations/imgbb" component={ImgBBPage} />
      {/* Redirect Documentation to Debug Center */}
      <Route path="/docs">
        {() => {
          window.location.href = '/debug-center';
          return null;
        }}
      </Route>
      <ProtectedRoute path="/privacy-policy" component={PrivacyPolicyPage} />
      <Route path="/test" component={TestPage} />
      
      {/* Public upload routes - these don't require auth */}
      <Route path="/public-upload/:uploadType/:token" component={PublicUploadPage} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [facebookAppId, setFacebookAppId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Fetch Facebook App ID from our backend API
    fetch('/api/config/facebook')
      .then(response => {
        // We'll still try to get the JSON even if the status is not OK, 
        // as the error response should contain a structured error message
        return response.json().then(data => {
          if (!response.ok) {
            // Check if we have a proper error response with message
            if (data && data.status === 'error' && data.message) {
              throw new Error(data.message);
            } else {
              // Otherwise just throw a generic error with the status
              throw new Error(`Failed to fetch Facebook config: ${response.status}`);
            }
          }
          return data;
        });
      })
      .then(data => {
        if (data.configured && data.status === 'success') {
          // If the server indicates Facebook is configured, use the environment variable
          // This prevents exposing the actual App ID in API responses
          const appId = import.meta.env.VITE_FACEBOOK_APP_ID || '';
          setFacebookAppId(appId);
        } else if (data.appId === 'CONFIGURED') {
          // For backward compatibility with our new secure response format
          const appId = import.meta.env.VITE_FACEBOOK_APP_ID || '';
          setFacebookAppId(appId);
        } else if (data.appId) {
          // Legacy support for old API format - should no longer be used
          console.warn('Using legacy API response format, should update implementation');
          setFacebookAppId(data.appId);
        } else {
          // Fallback to the environment variable if the API doesn't return a value
          console.warn('Facebook configuration status not provided in API response');
          setFacebookAppId(import.meta.env.VITE_FACEBOOK_APP_ID || '');
        }
      })
      .catch(err => {
        console.error('Error fetching Facebook App ID:', err);
        // Fallback to the environment variable if the API fails
        setFacebookAppId(import.meta.env.VITE_FACEBOOK_APP_ID || '');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Show a loading message while we're fetching the Facebook App ID
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading application configuration...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FacebookProvider appId={facebookAppId}>
          <Router />
          <Toaster />
        </FacebookProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
