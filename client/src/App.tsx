import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { FacebookProvider } from "@/contexts/FacebookContext";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/lib/protected-route";
import { useState, useEffect } from "react";

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
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/articles" component={ArticlesPage} />
      <ProtectedRoute path="/team-members" component={TeamMembersPage} />
      <ProtectedRoute path="/carousel-quotes" component={CarouselQuotesPage} />
      <ProtectedRoute path="/users" component={UserManagementPage} />
      <ProtectedRoute path="/integrations/discord" component={DiscordPage} />
      <ProtectedRoute path="/integrations/airtable" component={AirtablePage} />
      <ProtectedRoute path="/integrations/instagram" component={InstagramPage} />
      <ProtectedRoute path="/integrations/imgur" component={ImgurPage} />
      <ProtectedRoute path="/docs" component={DocsPage} />
      <ProtectedRoute path="/privacy-policy" component={PrivacyPolicyPage} />
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
        if (!response.ok) {
          throw new Error(`Failed to fetch Facebook config: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.appId) {
          setFacebookAppId(data.appId);
        } else {
          // Fallback to the environment variable if the API doesn't return a value
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
