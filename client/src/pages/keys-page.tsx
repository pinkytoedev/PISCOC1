import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { 
  Key, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle, 
  Copy, 
  Settings,
  Database,
  Bot,
  Table,
  Instagram,
  Image,
  Shield,
  Code2,
  HelpCircle
} from "lucide-react";
import { SiDiscord, SiAirtable, SiFacebook, SiPostgresql } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

interface IntegrationStatus {
  name: string;
  configured: boolean;
  lastChecked?: string;
  error?: string;
}

interface ApiKeyInfo {
  name: string;
  envVar: string;
  description: string;
  required: boolean;
  configured: boolean;
  setupUrl: string;
  icon: React.ReactNode;
  category: 'database' | 'social' | 'storage' | 'security';
  instructions: string[];
}

export default function KeysPage() {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string>("");

  // Fetch integration statuses
  const { data: integrations, isLoading } = useQuery({
    queryKey: ["integration-status"],
    queryFn: async () => {
      const response = await apiRequest("/api/integration-status");
      return response as IntegrationStatus[];
    },
  });

  const apiKeys: ApiKeyInfo[] = [
    {
      name: "PostgreSQL Database",
      envVar: "DATABASE_URL",
      description: "Primary database connection for storing all application data",
      required: true,
      configured: integrations?.find(i => i.name === "database")?.configured ?? false,
      setupUrl: "https://www.postgresql.org/download/",
      icon: <SiPostgresql className="h-5 w-5" />,
      category: "database",
      instructions: [
        "Install PostgreSQL 16+ on your system",
        "Create a database named 'multi_platform_integration'",
        "Set DATABASE_URL in format: postgresql://username:password@localhost:5432/multi_platform_integration",
        "Run 'npm run db:push' to create tables"
      ]
    },
    {
      name: "Discord Bot",
      envVar: "DISCORD_BOT_TOKEN",
      description: "Bot token for Discord integration and webhook management",
      required: true,
      configured: integrations?.find(i => i.name === "discord")?.configured ?? false,
      setupUrl: "https://discord.com/developers/applications",
      icon: <SiDiscord className="h-5 w-5" />,
      category: "social",
      instructions: [
        "Go to Discord Developer Portal",
        "Create a new application",
        "Navigate to 'Bot' section and create a bot",
        "Copy the Bot Token for DISCORD_BOT_TOKEN",
        "Copy the Application ID for DISCORD_CLIENT_ID",
        "Enable necessary bot permissions for your server"
      ]
    },
    {
      name: "Airtable API",
      envVar: "AIRTABLE_API_KEY",
      description: "API key for Airtable database integration and content management",
      required: false,
      configured: integrations?.find(i => i.name === "airtable")?.configured ?? false,
      setupUrl: "https://airtable.com/create/tokens",
      icon: <SiAirtable className="h-5 w-5" />,
      category: "storage",
      instructions: [
        "Go to Airtable API tokens page",
        "Create a personal access token",
        "Grant necessary scopes for your bases",
        "Copy the token for AIRTABLE_API_KEY"
      ]
    },
    {
      name: "Facebook/Instagram",
      envVar: "FACEBOOK_APP_ID",
      description: "Facebook app credentials for Instagram integration",
      required: false,
      configured: integrations?.find(i => i.name === "instagram")?.configured ?? false,
      setupUrl: "https://developers.facebook.com/",
      icon: <SiFacebook className="h-5 w-5" />,
      category: "social",
      instructions: [
        "Create a Facebook Developer account",
        "Create a new app",
        "Add Instagram Basic Display product",
        "Copy App ID for FACEBOOK_APP_ID",
        "Copy App Secret for FACEBOOK_APP_SECRET",
        "Configure redirect URIs and permissions"
      ]
    },
    {
      name: "Imgur API",
      envVar: "IMGUR_CLIENT_ID",
      description: "Imgur API credentials for image hosting and management",
      required: false,
      configured: integrations?.find(i => i.name === "imgur")?.configured ?? false,
      setupUrl: "https://api.imgur.com/oauth2/addclient",
      icon: <Image className="h-5 w-5" />,
      category: "storage",
      instructions: [
        "Register an application with Imgur API",
        "Copy Client ID for IMGUR_CLIENT_ID",
        "Copy Client Secret for IMGUR_CLIENT_SECRET",
        "Set appropriate authorization callback URL"
      ]
    },
    {
      name: "Session Secret",
      envVar: "SESSION_SECRET",
      description: "Secret key for secure session management and authentication",
      required: true,
      configured: true, // Always assume configured since it's generated
      setupUrl: "#",
      icon: <Shield className="h-5 w-5" />,
      category: "security",
      instructions: [
        "Generate a strong random string (32+ characters)",
        "Use a secure random generator",
        "Set SESSION_SECRET in your environment",
        "Keep this secret secure and never share it"
      ]
    }
  ];

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(text);
      toast({
        title: "Copied!",
        description: "Environment variable name copied to clipboard",
      });
      setTimeout(() => setCopiedKey(""), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (configured: boolean) => (
    <Badge variant={configured ? "default" : "destructive"} className="ml-2">
      {configured ? (
        <>
          <CheckCircle className="h-3 w-3 mr-1" />
          Configured
        </>
      ) : (
        <>
          <AlertCircle className="h-3 w-3 mr-1" />
          Not Configured
        </>
      )}
    </Badge>
  );

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'database': return <Database className="h-4 w-4" />;
      case 'social': return <Bot className="h-4 w-4" />;
      case 'storage': return <Table className="h-4 w-4" />;
      case 'security': return <Shield className="h-4 w-4" />;
      default: return <Key className="h-4 w-4" />;
    }
  };

  const categorizedKeys = {
    database: apiKeys.filter(key => key.category === 'database'),
    social: apiKeys.filter(key => key.category === 'social'),
    storage: apiKeys.filter(key => key.category === 'storage'),
    security: apiKeys.filter(key => key.category === 'security'),
  };

  const requiredKeysCount = apiKeys.filter(key => key.required).length;
  const configuredKeysCount = apiKeys.filter(key => key.configured).length;

  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      <Sidebar />
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14 w-full">
        <Header />
        <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 lg:grid-cols-3 xl:grid-cols-3">
          <div className="mx-auto grid max-w-[59rem] flex-1 auto-rows-max gap-4 lg:col-span-3">
            
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="grid gap-1">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                  <Key className="h-8 w-8" />
                  API Keys & Integration Setup
                </h1>
                <p className="text-muted-foreground">
                  Manage and configure all external service integrations
                </p>
              </div>
            </div>

            {/* Status Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuration Status
                </CardTitle>
                <CardDescription>
                  Overview of your integration configuration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{configuredKeysCount}</div>
                    <div className="text-sm text-muted-foreground">Configured</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{apiKeys.length - configuredKeysCount}</div>
                    <div className="text-sm text-muted-foreground">Missing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{requiredKeysCount}</div>
                    <div className="text-sm text-muted-foreground">Required</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600">{apiKeys.length - requiredKeysCount}</div>
                    <div className="text-sm text-muted-foreground">Optional</div>
                  </div>
                </div>
                
                {configuredKeysCount < requiredKeysCount && (
                  <Alert className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Some required integrations are not configured. The application may not function properly.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* API Keys by Category */}
            <Tabs defaultValue="database" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="database" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Database
                </TabsTrigger>
                <TabsTrigger value="social" className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Social
                </TabsTrigger>
                <TabsTrigger value="storage" className="flex items-center gap-2">
                  <Table className="h-4 w-4" />
                  Storage
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Security
                </TabsTrigger>
              </TabsList>

              {Object.entries(categorizedKeys).map(([category, keys]) => (
                <TabsContent key={category} value={category} className="space-y-4">
                  {keys.map((key) => (
                    <Card key={key.envVar}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {key.icon}
                            <div>
                              <CardTitle className="text-xl flex items-center">
                                {key.name}
                                {getStatusBadge(key.configured)}
                                {key.required && (
                                  <Badge variant="outline" className="ml-2">Required</Badge>
                                )}
                              </CardTitle>
                              <CardDescription>{key.description}</CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(key.envVar)}
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              {copiedKey === key.envVar ? "Copied!" : "Copy Var"}
                            </Button>
                            {key.setupUrl !== "#" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(key.setupUrl, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Setup
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div>
                            <strong>Environment Variable:</strong> <code className="bg-muted px-2 py-1 rounded text-sm">{key.envVar}</code>
                          </div>
                          
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                                <HelpCircle className="h-4 w-4" />
                                Setup Instructions
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  {key.icon}
                                  {key.name} Setup
                                </DialogTitle>
                                <DialogDescription>
                                  Follow these steps to configure {key.name}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <ol className="list-decimal list-inside space-y-2">
                                  {key.instructions.map((instruction, index) => (
                                    <li key={index} className="text-sm">{instruction}</li>
                                  ))}
                                </ol>
                                {key.setupUrl !== "#" && (
                                  <Button
                                    onClick={() => window.open(key.setupUrl, '_blank')}
                                    className="w-full"
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Open Setup Page
                                  </Button>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              ))}
            </Tabs>

            {/* Quick Setup Guide */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  Quick Setup Guide
                </CardTitle>
                <CardDescription>
                  Get started with local development
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">1. Copy Environment Template</h4>
                    <code className="block bg-muted p-2 rounded text-sm">cp .env.example .env</code>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">2. Configure Required Keys</h4>
                    <p className="text-sm text-muted-foreground">
                      At minimum, configure DATABASE_URL, DISCORD_BOT_TOKEN, and SESSION_SECRET to get started.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">3. Initialize Database</h4>
                    <code className="block bg-muted p-2 rounded text-sm">npm run db:push</code>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">4. Start Development</h4>
                    <code className="block bg-muted p-2 rounded text-sm">npm run dev</code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}