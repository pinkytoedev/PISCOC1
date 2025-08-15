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
import KeysPage from "@/pages/keys-page";
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
      <AdminProtectedRoute path="/keys" component={KeysPage} />
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
      <Route path="/public-upload" component={PublicUploadPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [facebookAppId, setFacebookAppId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Fetch Facebook App ID from environment or server
    const envAppId = import.meta.env.VITE_FACEBOOK_APP_ID;

    if (envAppId) {
      setFacebookAppId(envAppId);
      setIsLoading(false);
      console.log('Facebook App ID loaded from environment:', envAppId);
    } else {
      // Fallback to server API
      fetch('/api/config/facebook')
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success' && data.appId) {
            setFacebookAppId(data.appId);
          } else {
            console.warn('Facebook integration not configured');
            // Use hardcoded fallback for development
            setFacebookAppId('1776254399859599');
          }
        })
        .catch(error => {
          console.error('Failed to fetch Facebook config:', error);
          // Use hardcoded fallback for development
          setFacebookAppId('1776254399859599');
        })
        .finally(() => setIsLoading(false));
    }
  }, []);

  if (isLoading) {
    return <div>Loading Facebook configuration...</div>;
  }

  if (!facebookAppId) {
    return <div>Facebook integration not configured. Please set FACEBOOK_APP_ID environment variable.</div>;
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
