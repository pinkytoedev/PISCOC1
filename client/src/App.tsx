import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/lib/protected-route";

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
