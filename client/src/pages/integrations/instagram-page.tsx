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
import { SiInstagram } from "react-icons/si";
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
  RefreshCw
} from "lucide-react";

export default function InstagramPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("settings");
  
  const { data: settings, isLoading } = useQuery<IntegrationSetting[]>({
    queryKey: ['/api/instagram/settings'],
  });
  
  const { data: connectionStatus } = useQuery<{ connected: boolean }>({
    queryKey: ['/api/instagram/status'],
    enabled: !isLoading && hasClientId && hasClientSecret,
  });
  
  const { data: recentPosts, isLoading: isLoadingPosts } = useQuery<{ data: any[] }>({
    queryKey: ['/api/instagram/recent-posts'],
    enabled: connectionStatus?.connected === true,
  });
  
  const { data: articles } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
    enabled: activeTab === "publish",
  });
  
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
    onError: (error) => {
      toast({
        title: "Error updating settings",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const publishArticleMutation = useMutation({
    mutationFn: async (articleId: number) => {
      const res = await apiRequest("POST", `/api/instagram/publish/${articleId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram/recent-posts'] });
      toast({
        title: "Article published",
        description: "The article has been published to Instagram successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error publishing article",
        description: error.message || "Failed to publish article to Instagram.",
        variant: "destructive",
      });
    },
  });
  
  const { data: authUrl } = useQuery<{ authUrl: string }>({
    queryKey: ['/api/instagram/auth-url'],
    enabled: activeTab === "auth" && !isLoading && hasClientId && hasClientSecret && hasRedirectUri,
  });
  
  const getSettingValue = (key: string): string => {
    const setting = settings?.find(s => s.key === key);
    return setting?.value || "";
  };
  
  const getSettingEnabled = (key: string): boolean => {
    const setting = settings?.find(s => s.key === key);
    return setting?.enabled ?? true;
  };
  
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
  
  // Check if required settings are configured
  const hasClientId = !!getSettingValue('client_id');
  const hasClientSecret = !!getSettingValue('client_secret');
  const hasRedirectUri = !!getSettingValue('redirect_uri');
  const isConfigured = hasClientId && hasClientSecret && hasRedirectUri;
  
  // Check if connected to Instagram
  const isConnected = connectionStatus?.connected === true;
  
  // Filter articles that have an image (required for Instagram)
  const publishableArticles = articles?.filter(article => 
    article.imageUrl && article.status === "published"
  ) || [];
  
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
                    Publish content directly to your Instagram account.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-5 w-5 mr-1" />
                    <span className="text-sm font-medium">Connected</span>
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
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                    <TabsTrigger value="auth">Authentication</TabsTrigger>
                    <TabsTrigger value="publish">Publish Content</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="settings" className="space-y-6 mt-6">
                    {/* Instagram API Configuration */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Instagram API Configuration</CardTitle>
                        <CardDescription>
                          Configure your Instagram API credentials to connect to your account.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-2">
                          <Label htmlFor="client_id">Client ID</Label>
                          <div className="flex gap-2">
                            <Input
                              id="client_id"
                              type="text"
                              placeholder="Your Instagram app client ID"
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
                            You can find your client ID in the Facebook Developer Portal.
                          </p>
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="client_secret">Client Secret</Label>
                          <div className="flex gap-2">
                            <Input
                              id="client_secret"
                              type="password"
                              placeholder="Your Instagram app client secret"
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
                            Keep your client secret secure. Never share it publicly.
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
                            Must match the redirect URI configured in your Facebook Developer account.
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
                            and configure Instagram Basic Display.
                          </p>
                        </div>
                      </CardFooter>
                    </Card>
                    
                    {/* Instagram API Features */}
                    <Card>
                      <CardHeader>
                        <CardTitle>API Features</CardTitle>
                        <CardDescription>
                          Available features with the Instagram Basic Display API.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-center p-3 bg-green-50 rounded-md">
                            <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                            <div>
                              <h3 className="font-medium">User Profiles</h3>
                              <p className="text-sm text-gray-600">Access public profile information</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center p-3 bg-green-50 rounded-md">
                            <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                            <div>
                              <h3 className="font-medium">Media Content</h3>
                              <p className="text-sm text-gray-600">Access photos and videos from a user's account</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center p-3 bg-amber-50 rounded-md">
                            <AlertCircle className="h-5 w-5 text-amber-500 mr-3" />
                            <div>
                              <h3 className="font-medium">Publishing Content</h3>
                              <p className="text-sm text-gray-600">
                                Publishing requires a Professional account and Facebook Graph API access
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center p-3 bg-amber-50 rounded-md">
                            <Lock className="h-5 w-5 text-amber-500 mr-3" />
                            <div>
                              <h3 className="font-medium">API Rate Limits</h3>
                              <p className="text-sm text-gray-600">
                                Subject to Instagram's API rate limits per user
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="auth" className="space-y-6 mt-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Instagram Authentication</CardTitle>
                        <CardDescription>
                          Connect your Instagram account to enable content publishing.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {!isConfigured ? (
                          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800">
                            <div className="flex items-center">
                              <AlertCircle className="h-5 w-5 mr-2" />
                              <span className="font-medium">Configuration Required</span>
                            </div>
                            <p className="mt-1 text-sm">
                              Please configure your Instagram Client ID, Client Secret and Redirect URI in the Settings tab before proceeding.
                            </p>
                          </div>
                        ) : isConnected ? (
                          <div className="bg-green-50 border border-green-200 rounded-md p-4 text-green-800">
                            <div className="flex items-center">
                              <CheckCircle className="h-5 w-5 mr-2" />
                              <span className="font-medium">Connected to Instagram</span>
                            </div>
                            <p className="mt-1 text-sm">
                              Your Instagram account is connected and you can now publish content.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <h3 className="text-sm font-medium">Authentication Steps</h3>
                              <div className="space-y-3">
                                <div className="flex">
                                  <div className="flex-shrink-0 flex h-6 w-6 rounded-full bg-blue-100 text-blue-600 items-center justify-center mr-3">
                                    <span className="text-xs font-medium">1</span>
                                  </div>
                                  <p className="text-sm text-gray-600">
                                    Click the "Connect to Instagram" button below to authorize this application.
                                  </p>
                                </div>
                                
                                <div className="flex">
                                  <div className="flex-shrink-0 flex h-6 w-6 rounded-full bg-blue-100 text-blue-600 items-center justify-center mr-3">
                                    <span className="text-xs font-medium">2</span>
                                  </div>
                                  <p className="text-sm text-gray-600">
                                    Log in to your Instagram account if prompted.
                                  </p>
                                </div>
                                
                                <div className="flex">
                                  <div className="flex-shrink-0 flex h-6 w-6 rounded-full bg-blue-100 text-blue-600 items-center justify-center mr-3">
                                    <span className="text-xs font-medium">3</span>
                                  </div>
                                  <p className="text-sm text-gray-600">
                                    Review and grant the requested permissions.
                                  </p>
                                </div>
                                
                                <div className="flex">
                                  <div className="flex-shrink-0 flex h-6 w-6 rounded-full bg-blue-100 text-blue-600 items-center justify-center mr-3">
                                    <span className="text-xs font-medium">4</span>
                                  </div>
                                  <p className="text-sm text-gray-600">
                                    You'll be redirected back to this application after authentication.
                                  </p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex justify-center">
                              {authUrl ? (
                                <a 
                                  href={authUrl.authUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                                >
                                  <Key className="mr-2 h-4 w-4" />
                                  Connect to Instagram
                                  <ArrowUpRight className="ml-1 h-4 w-4" />
                                </a>
                              ) : (
                                <Button disabled>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Loading...
                                </Button>
                              )}
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-md">
                              <h4 className="text-sm font-medium flex items-center">
                                <Info className="h-4 w-4 mr-2 text-gray-500" />
                                Required Permissions
                              </h4>
                              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                                <li className="flex items-center">
                                  <CheckCircle className="h-3 w-3 mr-2 text-green-500" />
                                  user_profile - Access basic profile information
                                </li>
                                <li className="flex items-center">
                                  <CheckCircle className="h-3 w-3 mr-2 text-green-500" />
                                  user_media - Access media data
                                </li>
                              </ul>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    
                    {isConnected && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <Grid className="h-5 w-5 mr-2" />
                            Recent Instagram Posts
                          </CardTitle>
                          <CardDescription>
                            Your recently published content on Instagram
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {isLoadingPosts ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                              {[1, 2, 3].map((i) => (
                                <div key={i} className="bg-gray-100 aspect-square rounded-md animate-pulse"></div>
                              ))}
                            </div>
                          ) : recentPosts && recentPosts.data && recentPosts.data.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                              {recentPosts.data.map((post) => (
                                <div key={post.id} className="overflow-hidden rounded-md border bg-white">
                                  <img 
                                    src={post.media_url} 
                                    alt="Instagram post" 
                                    className="aspect-square object-cover w-full"
                                  />
                                  <div className="p-3">
                                    <p className="text-xs text-gray-500 truncate">
                                      {post.caption || "No caption"}
                                    </p>
                                    <a 
                                      href={post.permalink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:underline mt-1 inline-flex items-center"
                                    >
                                      View on Instagram
                                      <ArrowUpRight className="h-3 w-3 ml-1" />
                                    </a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-12">
                              <p className="text-gray-500">No recent posts found</p>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="mt-4"
                                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/instagram/recent-posts'] })}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="publish" className="space-y-6 mt-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Publish to Instagram</CardTitle>
                        <CardDescription>
                          Publish articles directly to your Instagram account.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {!isConnected ? (
                          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800">
                            <div className="flex items-center">
                              <AlertCircle className="h-5 w-5 mr-2" />
                              <span className="font-medium">Connection Required</span>
                            </div>
                            <p className="mt-1 text-sm">
                              Please connect your Instagram account in the Authentication tab before publishing content.
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800">
                              <div className="flex items-center">
                                <Info className="h-5 w-5 mr-2" />
                                <span className="font-medium">Publishing Limitations</span>
                              </div>
                              <p className="mt-1 text-sm">
                                Instagram Basic Display API doesn't support direct publishing. This feature simulates publishing - in a production environment, you would need to use the Facebook Graph API and a business account.
                              </p>
                            </div>
                            
                            <div>
                              <h3 className="text-sm font-medium mb-4">Published Articles</h3>
                              
                              {publishableArticles.length === 0 ? (
                                <div className="text-center py-8 border rounded-md">
                                  <ImagePlus className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                                  <p className="text-gray-500">No published articles with images found</p>
                                  <p className="text-sm text-gray-400 mt-1">Articles must be published and have an image to be shared on Instagram</p>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {publishableArticles.map((article) => (
                                    <div key={article.id} className="flex border rounded-md overflow-hidden">
                                      <div className="w-24 h-24 flex-shrink-0">
                                        <img 
                                          src={article.imageUrl} 
                                          alt={article.title} 
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                      <div className="flex-1 p-4 flex flex-col">
                                        <h4 className="font-medium text-sm">{article.title}</h4>
                                        <p className="text-xs text-gray-500 line-clamp-2 mt-1 flex-grow">
                                          {article.description}
                                        </p>
                                        <div className="mt-2 flex justify-end">
                                          <Button
                                            size="sm"
                                            onClick={() => handlePublishArticle(article.id)}
                                            disabled={publishArticleMutation.isPending && publishArticleMutation.variables === article.id}
                                          >
                                            {publishArticleMutation.isPending && publishArticleMutation.variables === article.id ? (
                                              <>
                                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                                Publishing...
                                              </>
                                            ) : (
                                              <>
                                                <SiInstagram className="mr-2 h-3 w-3" />
                                                Publish to Instagram
                                              </>
                                            )}
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </CardContent>
                      <CardFooter className="bg-gray-50 border-t">
                        <p className="text-xs text-gray-500">
                          Content published to Instagram must follow their Community Guidelines and Terms of Service.
                        </p>
                      </CardFooter>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
