import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/lib/protected-route";
import { AdminProtectedRoute } from "@/lib/admin-protected-route";

// Pages
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import ArticlesPage from "@/pages/articles-page";
import ArticlesPlannerPage from "@/pages/articles-planner-page";
import TeamMembersPage from "@/pages/team-members-page";
import CarouselQuotesPage from "@/pages/carousel-quotes-page";
import UserManagementPage from "@/pages/user-management-page";
import AirtablePage from "@/pages/integrations/airtable-page";
import ImgBBPage from "@/pages/integrations/imgbb-page";
import ContributorUploadPage from "@/pages/contributor-upload";
import PublicTeamUploadPage from "@/pages/public-team-upload";
import KeysPage from "@/pages/keys-page";
import DocsPage from "@/pages/docs-page";
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
      <AdminProtectedRoute path="/integrations/airtable" component={AirtablePage} />
      <AdminProtectedRoute path="/integrations/imgbb" component={ImgBBPage} />
      <AdminProtectedRoute path="/keys" component={KeysPage} />

      {/* Public: readable signed out, and makes no authenticated request. */}
      <Route path="/docs" component={DocsPage} />

      {/* Contributor routes - authorized by the link, not by a session */}
      <Route path="/upload/:token" component={ContributorUploadPage} />
      <Route path="/team-upload" component={PublicTeamUploadPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
