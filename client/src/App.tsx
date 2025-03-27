import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { FacebookProvider } from "@/contexts/FacebookContext";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/lib/protected-route";
import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";

// Pages
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import ArticlesPage from "@/pages/articles-page";
import TeamMembersPage from "@/pages/team-members-page";
import CarouselQuotesPage from "@/pages/carousel-quotes-page";
import UserManagementPage from "@/pages/user-management-page";
import DiscordPage from "@/pages/integrations/discord-page";
import AirtablePage from "@/pages/integrations/airtable-page";
import InstagramPage from "@/pages/integrations/instagram-page";
import ImgurPage from "@/pages/integrations/imgur-page";
import DocsPage from "@/pages/docs-page";
import PrivacyPolicyPage from "@/pages/privacy-policy-page";
import TestPage from "@/pages/test-page";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      
      {/* Protected routes with MainLayout */}
      <Route path="/">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/" component={Dashboard} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/articles">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/articles" component={ArticlesPage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/team-members">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/team-members" component={TeamMembersPage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/carousel-quotes">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/carousel-quotes" component={CarouselQuotesPage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/users">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/users" component={UserManagementPage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/integrations/discord">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/integrations/discord" component={DiscordPage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/integrations/airtable">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/integrations/airtable" component={AirtablePage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/integrations/instagram">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/integrations/instagram" component={InstagramPage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/integrations/imgur">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/integrations/imgur" component={ImgurPage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/docs">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/docs" component={DocsPage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/privacy-policy">
        {(params) => (
          <MainLayout>
            <ProtectedRoute path="/privacy-policy" component={PrivacyPolicyPage} />
          </MainLayout>
        )}
      </Route>
      
      <Route path="/test" component={TestPage} />
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
        if (data.status === 'success' && data.appId) {
          setFacebookAppId(data.appId);
        } else if (data.appId) {
          // Legacy support for old API format
          setFacebookAppId(data.appId);
        } else {
          // Fallback to the environment variable if the API doesn't return a value
          console.warn('Facebook App ID not provided in API response, using environment variable');
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
