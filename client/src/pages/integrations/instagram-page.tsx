import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { IntegrationSetting, Article } from "@shared/schema";
import { SiInstagram, SiFacebook } from "react-icons/si";
import { 
  CheckCircle, 
  AlertCircle, 
  Lock, 
  Key, 
  Globe, 
  ArrowUpRight, 
  ImagePlus,
  Info,
  Loader2,
  Grid,
  RefreshCw,
  BarChart,
  User,
  Newspaper,
  Coffee,
  MessageSquare,
  ImageIcon,
  BarChart3,
  ExternalLink
} from "lucide-react";

// Interface for Instagram account info
interface InstagramAccountInfo {
  id: string;
  username: string;
  profilePicture?: string;
}

// Interface for Instagram connection status
interface InstagramConnectionStatus {
  connected: boolean;
  accountInfo?: InstagramAccountInfo;
  error?: string;
}

// Interface for Instagram post
interface InstagramPost {
  id: string;
  caption?: string;
  media_url?: string;
  permalink?: string;
  timestamp: string;
  media_type: string;
  username?: string;
  fallback?: boolean;
}

// Interface for Instagram insights
interface InstagramInsights {
  data: {
    name: string;
    period: string;
    values: Array<{
      value: number;
      end_time: string;
    }>;
    title: string;
    description: string;
    id: string;
  }[];
}

export default function InstagramPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("settings");
  
  // Get settings
  const { data: settings, isLoading } = useQuery<IntegrationSetting[]>({
    queryKey: ['/api/instagram/settings'],
  });
  
  // Helper functions for settings
  const getSettingValue = (key: string): string => {
    const setting = settings?.find(s => s.key === key);
    return setting?.value || "";
  };
  
  const getSettingEnabled = (key: string): boolean => {
    const setting = settings?.find(s => s.key === key);
    return setting?.enabled ?? true;
  };
  
  // Check if required settings are configured
  const hasClientId = !!getSettingValue('client_id');
  const hasClientSecret = !!getSettingValue('client_secret');
  const hasRedirectUri = !!getSettingValue('redirect_uri');
  const isConfigured = hasClientId && hasClientSecret && hasRedirectUri;
  
  // Get connection status
  const { data: connectionStatus, isLoading: isLoadingStatus } = useQuery<InstagramConnectionStatus>({
    queryKey: ['/api/instagram/status'],
    enabled: !isLoading && hasClientId && hasClientSecret,
    refetchInterval: 300000, // Refresh every 5 minutes
  });
  
  // Check connection status
  const isConnected = connectionStatus?.connected === true;
  
  // Get recent posts
  const { data: recentPostsData, isLoading: isLoadingPosts } = useQuery<{ data: InstagramPost[]; fallback?: boolean; error?: string }>({
    queryKey: ['/api/instagram/recent-posts'],
    enabled: isConnected,
    refetchInterval: 300000, // Refresh every 5 minutes
  });
  
  // Get insights
  const { data: insights, isLoading: isLoadingInsights } = useQuery<InstagramInsights>({
    queryKey: ['/api/instagram/insights'],
    enabled: isConnected && activeTab === "insights",
  });
  
  // Get articles for publishing
  const { data: articles } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
    enabled: activeTab === "publish",
  });
  
  // Settings update mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, enabled }: { key: string; value: string; enabled?: boolean }) => {
      const res = await apiRequest("POST", "/api/instagram/settings", { key, value, enabled });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram/settings'] });
      toast({
        title: "Settings updated",
        description: "The Instagram integration settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating settings",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Publish article mutation
  const publishArticleMutation = useMutation({
    mutationFn: async (articleId: number) => {
      const res = await apiRequest("POST", `/api/instagram/publish/${articleId}`);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram/recent-posts'] });
      toast({
        title: "Article published",
        description: "The article has been published to Instagram successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error publishing article",
        description: error.message || "Failed to publish article to Instagram.",
        variant: "destructive",
      });
    },
  });
  
  // Auth URL query
  const { data: authUrl } = useQuery<{ authUrl: string }>({
    queryKey: ['/api/instagram/auth-url'],
    enabled: activeTab === "auth" && !isLoading && hasClientId && hasClientSecret && hasRedirectUri,
  });
  
  // Event handlers
  const handleSettingChange = (key: string, value: string) => {
    updateSettingMutation.mutate({ key, value });
  };
  
  const handleToggleEnabled = (key: string, enabled: boolean) => {
    const value = getSettingValue(key);
    updateSettingMutation.mutate({ key, value, enabled });
  };
  
  const handlePublishArticle = (articleId: number) => {
    publishArticleMutation.mutate(articleId);
  };
  
  // Filter articles that have an image (required for Instagram)
  const publishableArticles = articles?.filter(article => 
    article.imageUrl && article.status === "published"
  ) || [];
  
  // Get recent posts
  const recentPosts = recentPostsData?.data || [];
  const isUsingFallback = recentPostsData?.fallback === true;
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Instagram Integration" />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-5xl mx-auto">
            {/* Breadcrumbs */}
            <nav className="text-sm font-medium mb-6" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <a href="/" className="text-gray-500 hover:text-gray-700">Dashboard</a>
                </li>
                <li className="flex items-center">
                  <svg className="h-4 w-4 text-gray-400 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <a href="/integrations" className="text-gray-500 hover:text-gray-700">Integrations</a>
                </li>
                <li className="flex items-center">
                  <svg className="h-4 w-4 text-gray-400 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-900">Instagram</span>
                </li>
              </ol>
            </nav>

            {/* Page Header */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                <SiInstagram className="h-8 w-8 text-pink-600 mr-3" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Instagram Integration</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Publish content directly to your Instagram professional account.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-5 w-5 mr-1" />
                    <span className="text-sm font-medium">Connected</span>
                    {connectionStatus?.accountInfo?.username && (
                      <span className="ml-2 text-xs text-gray-600">
                        (@{connectionStatus.accountInfo.username})
                      </span>
                    )}
                  </div>
                ) : isConfigured ? (
                  <div className="flex items-center text-amber-600">
                    <AlertCircle className="h-5 w-5 mr-1" />
                    <span className="text-sm font-medium">Not Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center text-gray-500">
                    <Info className="h-5 w-5 mr-1" />
                    <span className="text-sm font-medium">Not Configured</span>
                  </div>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-6">
                <Card className="animate-pulse">
                  <CardHeader>
                    <div className="h-5 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-10 bg-gray-200 rounded mb-4"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="space-y-6">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                    <TabsTrigger value="auth">Authentication</TabsTrigger>
                    <TabsTrigger value="webhooks" disabled={!isConnected}>Webhooks</TabsTrigger>
                    <TabsTrigger value="publish">Publish Content</TabsTrigger>
                    <TabsTrigger value="insights" disabled={!isConnected}>Insights</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="settings" className="space-y-6 mt-6">
                    {/* Instagram API Configuration */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Facebook/Instagram Graph API Configuration</CardTitle>
                        <CardDescription>
                          Configure your Facebook app credentials to connect to your Instagram professional account.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-2">
                          <Label htmlFor="client_id">App/Client ID</Label>
                          <div className="flex gap-2">
                            <Input
                              id="client_id"
                              type="text"
                              placeholder="Your Facebook app ID"
                              value={getSettingValue('client_id')}
                              onChange={(e) => handleSettingChange('client_id', e.target.value)}
                              className="flex-1"
                            />
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={getSettingEnabled('client_id')}
                                onCheckedChange={(checked) => handleToggleEnabled('client_id', checked)}
                              />
                              <span className="text-sm text-gray-500">
                                {getSettingEnabled('client_id') ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">
                            You can find your app ID in the Facebook Developer Portal.
                          </p>
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="client_secret">App Secret</Label>
                          <div className="flex gap-2">
                            <Input
                              id="client_secret"
                              type="password"
                              placeholder="Your Facebook app secret"
                              value={getSettingValue('client_secret')}
                              onChange={(e) => handleSettingChange('client_secret', e.target.value)}
                              className="flex-1"
                            />
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={getSettingEnabled('client_secret')}
                                onCheckedChange={(checked) => handleToggleEnabled('client_secret', checked)}
                              />
                              <span className="text-sm text-gray-500">
                                {getSettingEnabled('client_secret') ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">
                            Keep your app secret secure. Never share it publicly.
                          </p>
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="redirect_uri">Redirect URI</Label>
                          <div className="flex gap-2">
                            <Input
                              id="redirect_uri"
                              type="text"
                              placeholder="https://your-domain.com/api/instagram/auth/callback"
                              value={getSettingValue('redirect_uri')}
                              onChange={(e) => handleSettingChange('redirect_uri', e.target.value)}
                              className="flex-1"
                            />
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={getSettingEnabled('redirect_uri')}
                                onCheckedChange={(checked) => handleToggleEnabled('redirect_uri', checked)}
                              />
                              <span className="text-sm text-gray-500">
                                {getSettingEnabled('redirect_uri') ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">
                            Must match the redirect URI configured in your Facebook app's settings.
                          </p>
                        </div>
                      </CardContent>
                      <CardFooter className="bg-gray-50 border-t">
                        <div className="w-full text-sm text-gray-500">
                          <p>
                            To use Instagram integration, you need to create an app in the{" "}
                            <a 
                              href="https://developers.facebook.com" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Facebook Developer Portal
                            </a>{" "}
                            and configure Instagram Graph API with proper permissions.
                          </p>
                        </div>
                      </CardFooter>
                    </Card>
                    
                    {/* Instagram API Features */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Instagram Graph API Features</CardTitle>
                        <CardDescription>
                          Available features with the Instagram Graph API for professional accounts.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-center p-3 bg-green-50 rounded-md">
                            <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                            <div>
                              <h3 className="font-medium">User Profiles</h3>
                              <p className="text-sm text-gray-600">Access professional account information</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center p-3 bg-green-50 rounded-md">
                            <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                            <div>
                              <h3 className="font-medium">Media Content</h3>
                              <p className="text-sm text-gray-600">Access photos and videos from a professional account</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center p-3 bg-green-50 rounded-md">
                            <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                            <div>
                              <h3 className="font-medium">Publishing Content</h3>
                              <p className="text-sm text-gray-600">
                                Post photos and videos to your connected professional account
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center p-3 bg-green-50 rounded-md">
                            <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                            <div>
                              <h3 className="font-medium">Insights & Analytics</h3>
                              <p className="text-sm text-gray-600">
                                View performance metrics for your content and account
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* Requirements Section */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Requirements</CardTitle>
                        <CardDescription>
                          What you'll need to use Instagram publishing.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-start p-3 bg-blue-50 rounded-md">
                            <SiFacebook className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Facebook Business Page</h3>
                              <p className="text-sm text-gray-600">
                                A Facebook Page is required to connect to Instagram's Graph API for publishing.
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-pink-50 rounded-md">
                            <SiInstagram className="h-5 w-5 text-pink-600 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Instagram Professional Account</h3>
                              <p className="text-sm text-gray-600">
                                You need a Professional account (Business or Creator) connected to your Facebook Page.
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-indigo-50 rounded-md">
                            <Key className="h-5 w-5 text-indigo-600 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Facebook Developer Account</h3>
                              <p className="text-sm text-gray-600">
                                Register as a developer to create apps with the necessary permissions.
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="auth" className="space-y-6 mt-6">
                    {/* Instagram Authentication */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Instagram Authentication</CardTitle>
                        <CardDescription>
                          Connect your Instagram professional account to enable integration features.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {!isConfigured ? (
                          <div className="bg-amber-50 border border-amber-100 p-4 rounded-md">
                            <div className="flex items-start">
                              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 mr-3" />
                              <div>
                                <h3 className="font-medium text-amber-800">Missing Configuration</h3>
                                <p className="text-sm text-amber-700 mt-1">
                                  Before you can connect your Instagram account, you need to configure your Facebook app credentials in the Settings tab.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : isLoadingStatus ? (
                          <div className="flex items-center justify-center p-6">
                            <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                          </div>
                        ) : isConnected ? (
                          <div className="flex flex-col items-center p-6 bg-green-50 border border-green-100 rounded-md">
                            <div className="h-16 w-16 flex items-center justify-center bg-green-100 rounded-full mb-4">
                              <CheckCircle className="h-8 w-8 text-green-500" />
                            </div>
                            <h3 className="text-lg font-medium text-center">Connected to Instagram</h3>
                            {connectionStatus?.accountInfo && (
                              <div className="flex flex-col items-center mt-2 mb-4">
                                {connectionStatus.accountInfo.profilePicture && (
                                  <img 
                                    src={connectionStatus.accountInfo.profilePicture} 
                                    alt={connectionStatus.accountInfo.username}
                                    className="h-16 w-16 rounded-full mb-2 border-2 border-white shadow"
                                  />
                                )}
                                <p className="text-sm font-medium text-gray-800">
                                  @{connectionStatus.accountInfo.username}
                                </p>
                                <p className="text-xs text-gray-600">
                                  Instagram Business Account
                                </p>
                              </div>
                            )}
                            <Button 
                              variant="outline" 
                              onClick={() => {
                                // Re-authenticate
                                if (authUrl?.authUrl) {
                                  window.location.href = authUrl.authUrl;
                                }
                              }}
                            >
                              Reconnect Account
                            </Button>
                          </div>
                        ) : authUrl ? (
                          <div className="flex flex-col items-center p-6 bg-blue-50 border border-blue-100 rounded-md">
                            <div className="h-16 w-16 flex items-center justify-center bg-blue-100 rounded-full mb-4">
                              <SiInstagram className="h-8 w-8 text-pink-600" />
                            </div>
                            <h3 className="text-lg font-medium text-center">Connect to Instagram</h3>
                            <p className="text-sm text-gray-600 text-center mt-2 mb-4">
                              You'll be redirected to Facebook to authorize this application and connect your Instagram Professional account.
                            </p>
                            <div className="space-y-4">
                              <div className="rounded-md bg-blue-50 p-4 border border-blue-100">
                                <div className="flex">
                                  <div className="flex-shrink-0">
                                    <Info className="h-5 w-5 text-blue-400" />
                                  </div>
                                  <div className="ml-3">
                                    <h3 className="text-sm font-medium text-blue-800">Instagram API with Instagram Login</h3>
                                    <div className="mt-2 text-sm text-blue-700">
                                      <p>
                                        This integration uses the Instagram API with Instagram Login to connect to your Instagram Professional account. 
                                        You need an Instagram Professional account (Business or Creator) to use this integration.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <Button 
                                onClick={() => {
                                  window.location.href = authUrl.authUrl;
                                }}
                              >
                                <SiFacebook className="h-4 w-4 mr-2" />
                                Connect via Facebook
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center p-6">
                            <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                          </div>
                        )}
                        
                        {connectionStatus?.error && (
                          <div className="bg-red-50 border border-red-100 p-4 rounded-md mt-4">
                            <div className="flex items-start">
                              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3" />
                              <div>
                                <h3 className="font-medium text-red-800">Connection Error</h3>
                                <p className="text-sm text-red-700 mt-1">
                                  {connectionStatus.error}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="bg-gray-50 border-t">
                        <div className="w-full text-sm text-gray-500">
                          <p>
                            Connecting your Instagram professional account allows this application to access your content and publish on your behalf. This requires connecting through Facebook first.
                          </p>
                        </div>
                      </CardFooter>
                    </Card>
                    
                    {/* Account Permissions */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Account Permissions</CardTitle>
                        <CardDescription>
                          Understand what permissions are granted when connecting your account.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-start p-3 border border-blue-100 bg-blue-50 rounded-md">
                            <Info className="h-5 w-5 text-blue-500 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Instagram API Permissions</h3>
                              <p className="text-sm text-blue-700">
                                These permissions are required to access the Instagram Graph API for professional accounts.
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-gray-50 rounded-md">
                            <User className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">instagram_basic</h3>
                              <p className="text-sm text-gray-600">
                                Access to your Instagram professional account information, profile data, and media
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-gray-50 rounded-md">
                            <ImagePlus className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">instagram_content_publish</h3>
                              <p className="text-sm text-gray-600">
                                Ability to publish photos, videos, and carousels to your Instagram professional account
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-gray-50 rounded-md">
                            <MessageSquare className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">instagram_manage_comments</h3>
                              <p className="text-sm text-gray-600">
                                Permission to read, respond to, hide, and delete comments on media
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-gray-50 rounded-md">
                            <BarChart className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">instagram_manage_insights</h3>
                              <p className="text-sm text-gray-600">
                                Access to engagement and performance metrics of your Instagram content
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-gray-50 rounded-md">
                            <Grid className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">pages_show_list</h3>
                              <p className="text-sm text-gray-600">
                                Access to the list of Facebook Pages that you manage (required for Instagram API)
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="webhooks" className="space-y-6 mt-6">
                    {/* Instagram Webhooks */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Instagram Webhooks</CardTitle>
                        <CardDescription>
                          Configure webhooks to receive real-time updates from Instagram.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="bg-blue-50 p-4 rounded-md">
                          <h3 className="text-sm font-medium text-blue-800">About Instagram Webhooks</h3>
                          <p className="mt-1 text-sm text-blue-700">
                            Webhooks allow your application to receive real-time updates when events occur on your Instagram account, such as new comments, mentions, or media uploads.
                          </p>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="grid gap-2">
                            <Label htmlFor="webhook_url">Webhook URL</Label>
                            <Input
                              id="webhook_url"
                              type="text"
                              placeholder={`${window.location.protocol}//${window.location.host}/api/instagram/webhook`}
                              value={getSettingValue('webhook_url')}
                              onChange={(e) => handleSettingChange('webhook_url', e.target.value)}
                            />
                            <p className="text-xs text-gray-500">
                              This URL will receive webhook notifications from Instagram. It must be publicly accessible.
                            </p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="border rounded-md p-4">
                              <h3 className="text-sm font-semibold mb-2 flex items-center">
                                <User className="h-4 w-4 mr-1" />
                                Mentions
                              </h3>
                              <p className="text-xs text-gray-600">
                                Receive notifications when your account is mentioned in comments or captions.
                              </p>
                            </div>
                            
                            <div className="border rounded-md p-4">
                              <h3 className="text-sm font-semibold mb-2 flex items-center">
                                <MessageSquare className="h-4 w-4 mr-1" />
                                Comments
                              </h3>
                              <p className="text-xs text-gray-600">
                                Receive notifications about new comments on your posts.
                              </p>
                            </div>
                            
                            <div className="border rounded-md p-4">
                              <h3 className="text-sm font-semibold mb-2 flex items-center">
                                <ImageIcon className="h-4 w-4 mr-1" />
                                Media
                              </h3>
                              <p className="text-xs text-gray-600">
                                Get updates when media is published, updated, or deleted.
                              </p>
                            </div>
                            
                            <div className="border rounded-md p-4">
                              <h3 className="text-sm font-semibold mb-2 flex items-center">
                                <BarChart3 className="h-4 w-4 mr-1" />
                                Stories
                              </h3>
                              <p className="text-xs text-gray-600">
                                Get notifications about story updates (requires additional permissions).
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <Button 
                          className="w-full"
                          onClick={() => {
                            const webhookUrl = getSettingValue('webhook_url') || 
                              `${window.location.protocol}//${window.location.host}/api/instagram/webhook`;
                            
                            fetch('/api/instagram/webhooks/subscribe', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ webhookUrl })
                            })
                            .then(response => response.json())
                            .then(data => {
                              if (data.success) {
                                toast({
                                  title: "Webhooks Configured",
                                  description: "Successfully subscribed to Instagram webhooks.",
                                });
                              } else {
                                toast({
                                  title: "Webhook Configuration Failed",
                                  description: data.message || "Failed to subscribe to Instagram webhooks.",
                                  variant: "destructive",
                                });
                              }
                            })
                            .catch(error => {
                              toast({
                                title: "Webhook Configuration Failed",
                                description: error.message || "An error occurred while configuring webhooks.",
                                variant: "destructive",
                              });
                            });
                          }}
                        >
                          Subscribe to Webhooks
                        </Button>
                      </CardContent>
                      <CardFooter className="bg-gray-50 border-t">
                        <div className="w-full text-sm text-gray-500">
                          <p>
                            Note: Your server must be publicly accessible to receive webhook events from Instagram.
                            For local development, you may need to use a tool like ngrok to expose your local server.
                          </p>
                        </div>
                      </CardFooter>
                    </Card>
                    
                    {/* Webhook Events */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Recent Webhook Events</CardTitle>
                        <CardDescription>
                          View recent events received from Instagram webhooks.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="bg-gray-100 p-4 rounded-md text-center">
                            <p className="text-sm text-gray-600">
                              Webhook events will appear here when received.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="publish" className="space-y-6 mt-6">
                    {/* Content Publishing */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Publish to Instagram</CardTitle>
                        <CardDescription>
                          {isConnected 
                            ? "Select an article to publish to your Instagram professional account." 
                            : "Connect your Instagram account to enable publishing."}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {!isConnected ? (
                          <div className="bg-amber-50 border border-amber-100 p-4 rounded-md">
                            <div className="flex items-start">
                              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 mr-3" />
                              <div>
                                <h3 className="font-medium text-amber-800">Not Connected</h3>
                                <p className="text-sm text-amber-700 mt-1">
                                  You need to connect your Instagram professional account before you can publish content. Go to the Authentication tab to connect.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : publishableArticles.length === 0 ? (
                          <div className="bg-gray-50 border border-gray-100 p-4 rounded-md">
                            <div className="flex items-start">
                              <Info className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                              <div>
                                <h3 className="font-medium text-gray-800">No Publishable Articles</h3>
                                <p className="text-sm text-gray-700 mt-1">
                                  There are no published articles with images available to share on Instagram. Instagram requires images for posts.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <p className="text-sm text-gray-500 mb-4">
                              Select an article to publish to Instagram. Only published articles with images are shown.
                            </p>
                            <div className="border rounded-md divide-y">
                              {publishableArticles.map(article => (
                                <div key={article.id} className="flex items-center justify-between p-4">
                                  <div className="flex items-center space-x-4">
                                    {article.imageUrl && (
                                      <div className="flex-shrink-0 h-12 w-12 rounded-md overflow-hidden">
                                        <img src={article.imageUrl} alt={article.title} className="h-full w-full object-cover" />
                                      </div>
                                    )}
                                    <div>
                                      <h4 className="font-medium text-gray-900">{article.title}</h4>
                                      <p className="text-sm text-gray-500 truncate max-w-md">
                                        {article.description || "No description"}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handlePublishArticle(article.id)}
                                    disabled={publishArticleMutation.isPending}
                                  >
                                    {publishArticleMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                      <ArrowUpRight className="h-4 w-4 mr-2" />
                                    )}
                                    Publish
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    
                    {/* Publishing Guidelines */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Instagram Publishing Guidelines</CardTitle>
                        <CardDescription>
                          Best practices for publishing content to Instagram.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-start p-3 bg-blue-50 rounded-md">
                            <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Image Requirements</h3>
                              <p className="text-sm text-gray-600">
                                Images should be high-quality with a minimum resolution of 1080x1080 pixels. Instagram supports various aspect ratios between 4:5 and 1.91:1.
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-blue-50 rounded-md">
                            <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Caption Best Practices</h3>
                              <p className="text-sm text-gray-600">
                                Keep captions concise and engaging. Include relevant hashtags to increase visibility, but don't overdo it (5-10 is ideal).
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-blue-50 rounded-md">
                            <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Content Policy</h3>
                              <p className="text-sm text-gray-600">
                                Ensure your content complies with Instagram's community guidelines and terms of service.
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* Recent Posts */}
                    {isConnected && (
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                          <div>
                            <CardTitle>Recent Instagram Posts</CardTitle>
                            <CardDescription>
                              View your recent posts on Instagram.
                            </CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/instagram/recent-posts'] })}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                          </Button>
                        </CardHeader>
                        <CardContent>
                          {isLoadingPosts ? (
                            <div className="flex items-center justify-center p-8">
                              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                            </div>
                          ) : recentPosts.length === 0 ? (
                            <div className="bg-gray-50 border border-gray-100 p-4 rounded-md">
                              <div className="flex items-start">
                                <Info className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                                <div>
                                  <h3 className="font-medium text-gray-800">No Recent Posts</h3>
                                  <p className="text-sm text-gray-700 mt-1">
                                    You don't have any recent posts on Instagram, or we couldn't access your posts.
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div>
                              {isUsingFallback && (
                                <div className="bg-amber-50 border border-amber-100 p-3 rounded-md mb-4">
                                  <div className="flex items-start">
                                    <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 mr-2" />
                                    <div>
                                      <p className="text-sm text-amber-700">
                                        {recentPostsData?.error 
                                          ? `API Error: ${recentPostsData.error}` 
                                          : "Unable to fetch real posts from Instagram. Showing local data instead."}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {recentPosts.map(post => (
                                  <div key={post.id} className="border rounded-md overflow-hidden">
                                    {post.media_url && (
                                      <div className="h-48 overflow-hidden">
                                        <img 
                                          src={post.media_url} 
                                          alt={post.caption || "Instagram post"} 
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    )}
                                    <div className="p-3">
                                      <p className="text-sm text-gray-700 line-clamp-2">
                                        {post.caption || "No caption"}
                                      </p>
                                      <div className="flex justify-between items-center mt-2">
                                        <span className="text-xs text-gray-500">
                                          {new Date(post.timestamp).toLocaleDateString()}
                                        </span>
                                        {post.permalink && (
                                          <a
                                            href={post.permalink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-blue-600 hover:underline flex items-center"
                                          >
                                            View <ArrowUpRight className="h-3 w-3 ml-1" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="insights" className="space-y-6 mt-6">
                    {/* Insights & Analytics */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Instagram Insights</CardTitle>
                        <CardDescription>
                          View performance metrics for your Instagram professional account.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {!isConnected ? (
                          <div className="bg-amber-50 border border-amber-100 p-4 rounded-md">
                            <div className="flex items-start">
                              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 mr-3" />
                              <div>
                                <h3 className="font-medium text-amber-800">Not Connected</h3>
                                <p className="text-sm text-amber-700 mt-1">
                                  You need to connect your Instagram professional account to view insights. Go to the Authentication tab to connect.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : isLoadingInsights ? (
                          <div className="flex items-center justify-center p-8">
                            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                          </div>
                        ) : !insights?.data || insights.data.length === 0 ? (
                          <div className="bg-gray-50 border border-gray-100 p-4 rounded-md">
                            <div className="flex items-start">
                              <Info className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                              <div>
                                <h3 className="font-medium text-gray-800">No Insights Available</h3>
                                <p className="text-sm text-gray-700 mt-1">
                                  We couldn't retrieve insights for your Instagram account. This could be due to limited account activity or permissions.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <p className="text-sm text-gray-500">
                              These insights show how your Instagram content is performing.
                            </p>
                            
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                              {/* Impressions Card */}
                              <div className="bg-white p-4 rounded-lg border shadow-sm">
                                <div className="flex items-center mb-2">
                                  <BarChart className="h-5 w-5 text-indigo-500 mr-2" />
                                  <h3 className="font-medium">Impressions</h3>
                                </div>
                                <div className="text-2xl font-bold mt-2 mb-1">
                                  {insights.data.find(d => d.name === 'impressions')?.values[0]?.value || 0}
                                </div>
                                <p className="text-xs text-gray-500">
                                  Total number of times your content was viewed
                                </p>
                              </div>
                              
                              {/* Reach Card */}
                              <div className="bg-white p-4 rounded-lg border shadow-sm">
                                <div className="flex items-center mb-2">
                                  <User className="h-5 w-5 text-green-500 mr-2" />
                                  <h3 className="font-medium">Reach</h3>
                                </div>
                                <div className="text-2xl font-bold mt-2 mb-1">
                                  {insights.data.find(d => d.name === 'reach')?.values[0]?.value || 0}
                                </div>
                                <p className="text-xs text-gray-500">
                                  Unique users who have seen your content
                                </p>
                              </div>
                              
                              {/* Profile Views Card */}
                              <div className="bg-white p-4 rounded-lg border shadow-sm">
                                <div className="flex items-center mb-2">
                                  <Newspaper className="h-5 w-5 text-blue-500 mr-2" />
                                  <h3 className="font-medium">Profile Views</h3>
                                </div>
                                <div className="text-2xl font-bold mt-2 mb-1">
                                  {insights.data.find(d => d.name === 'profile_views')?.values[0]?.value || 0}
                                </div>
                                <p className="text-xs text-gray-500">
                                  Number of times your profile was viewed
                                </p>
                              </div>
                            </div>
                            
                            {/* Period Note */}
                            <div className="text-sm text-gray-500 mt-2">
                              <Info className="h-4 w-4 inline mr-1" />
                              Data shown is for the last 24 hours
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    
                    {/* Content Strategy */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Content Strategy Tips</CardTitle>
                        <CardDescription>
                          Optimize your Instagram content strategy based on insights.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-start p-3 bg-purple-50 rounded-md">
                            <Coffee className="h-5 w-5 text-purple-500 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Best Time to Post</h3>
                              <p className="text-sm text-gray-600">
                                Analyze when your audience is most active and schedule posts accordingly. Peak times are often early mornings, lunch breaks, and evenings.
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-purple-50 rounded-md">
                            <Coffee className="h-5 w-5 text-purple-500 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Content Mix</h3>
                              <p className="text-sm text-gray-600">
                                Balance promotional content with educational and entertaining posts. Following the 80/20 rule (80% value-adding, 20% promotional) can maintain audience engagement.
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-start p-3 bg-purple-50 rounded-md">
                            <Coffee className="h-5 w-5 text-purple-500 mt-0.5 mr-3" />
                            <div>
                              <h3 className="font-medium">Engagement Tactics</h3>
                              <p className="text-sm text-gray-600">
                                Ask questions, create polls, and respond to comments to boost engagement. The Instagram algorithm favors posts with higher engagement rates.
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
                
                {/* Documentation and Resources Section */}
                <div className="mt-12 space-y-4">
                  <h3 className="text-xl font-semibold">Documentation & Resources</h3>
                  <p className="text-gray-600">Learn more about the Instagram API with Instagram Login from these official resources:</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Instagram API Documentation</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-600">
                          Access Instagram's developer resources and documentation for technical details about the Instagram API with Instagram Login.
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild variant="outline" className="w-full">
                          <a href="https://developers.facebook.com/docs/instagram-api" target="_blank" rel="noopener noreferrer">
                            <ArrowUpRight className="h-4 w-4 mr-2" />
                            View Documentation
                          </a>
                        </Button>
                      </CardFooter>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Permission Changes (Jan 2025)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-600">
                          Current permissions (instagram_basic, instagram_content_publish, etc.) will be replaced with new ones (instagram_business_basic, instagram_business_content_publish, etc.) by January 2025.
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild variant="outline" className="w-full">
                          <a href="https://developers.facebook.com/blog/post/2023/01/19/updated-instagram-permissions/" target="_blank" rel="noopener noreferrer">
                            <ArrowUpRight className="h-4 w-4 mr-2" />
                            View Update
                          </a>
                        </Button>
                      </CardFooter>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Content Publishing Guide</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-600">
                          Learn about best practices for publishing content to Instagram professional accounts using the Graph API.
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild variant="outline" className="w-full">
                          <a href="https://developers.facebook.com/docs/instagram-api/guides/content-publishing" target="_blank" rel="noopener noreferrer">
                            <ArrowUpRight className="h-4 w-4 mr-2" />
                            View Guide
                          </a>
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}