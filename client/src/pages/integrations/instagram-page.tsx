import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useFacebook } from '../../contexts/FacebookContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import DebugEnv from '@/components/DebugEnv';
import {
  CheckCircle2,
  XCircle,
  LogIn,
  LogOut,
  RefreshCcw,
  Instagram,
  Bell,
  MessageCircle,
  Image,
  BookOpen,
  AlertTriangle,
  Clock,
  Calendar,
  TestTube,
  Info
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';

/**
 * Instagram Integration Page
 * 
 * This page displays Instagram integration settings, webhook configuration,
 * and allows users to connect their Instagram account via Facebook.
 */
export default function InstagramPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const {
    isInitialized,
    status,
    user,
    accessToken,
    initializationError,
    login,
    logout
  } = useFacebook();

  // States for Instagram data
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhookFields, setWebhookFields] = useState<{ [key: string]: string[] }>({});
  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);
  const [webhookTestResult, setWebhookTestResult] = useState<any>(null);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instagramAccount, setInstagramAccount] = useState<any>(null);
  const [instagramPosts, setInstagramPosts] = useState<any[]>([]);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [postImageUrl, setPostImageUrl] = useState<string>('');
  const [postCaption, setPostCaption] = useState<string>('');
  const [isCreatingPost, setIsCreatingPost] = useState(false);

  // Fetch webhook subscriptions and field groups on component mount
  useEffect(() => {
    if (isInitialized) {
      fetchWebhookData();
      fetchWebhookEvents();

      // Only fetch Instagram account and posts if user is logged in
      if (status === 'connected' && accessToken) {
        // Store the token when the user connects
        storeAccessToken(accessToken);

        // Then fetch Instagram data
        fetchInstagramAccount();
        fetchInstagramPosts();
      }
    }
  }, [isInitialized, status, accessToken]);

  // Function to fetch webhook events
  const fetchWebhookEvents = async () => {
    setIsLoadingEvents(true);

    try {
      const response = await fetch('/api/instagram/webhooks/logs');
      const data = await response.json();

      setWebhookEvents(data);
    } catch (err) {
      console.error('Error fetching webhook events:', err);
      // Don't set error here, as it would display on the main page
    } finally {
      setIsLoadingEvents(false);
    }
  };

  // Fetch webhook subscriptions and field groups
  const fetchWebhookData = async () => {
    setIsLoadingWebhooks(true);
    setError(null);

    try {
      // Fetch webhook subscriptions
      const subscriptionsRes = await fetch('/api/instagram/webhooks/subscriptions');
      const subscriptions = await subscriptionsRes.json();

      // Fetch webhook field groups
      const fieldsRes = await fetch('/api/instagram/webhooks/field-groups');
      const fields = await fieldsRes.json();

      setWebhooks(subscriptions);
      setWebhookFields(fields);
    } catch (err) {
      console.error('Error fetching webhook data:', err);
      setError('Failed to load webhook data. Please try again later.');
    } finally {
      setIsLoadingWebhooks(false);
    }
  };

  // Handle Facebook login
  const handleLogin = () => {
    console.log('Login requested, SDK initialized:', isInitialized);

    // Clear any previous errors
    setError(null);

    // Additional safety check for SDK initialization
    if (!isInitialized) {
      const errorMsg = 'Facebook SDK is still initializing. Please wait a moment and try again.';
      console.warn(errorMsg);
      setError(errorMsg);
      return;
    }

    // Additional check for window.FB availability
    if (typeof window !== 'undefined' && (!window.FB || typeof window.FB.login !== 'function')) {
      const errorMsg = 'Facebook SDK is not properly loaded. Please refresh the page and try again.';
      console.error(errorMsg);
      setError(errorMsg);
      return;
    }

    login(
      () => {
        console.log('Login successful');
        setError(null);
      },
      (error) => {
        console.error('Login failed:', error);
        setError(typeof error === 'string' ? error : 'Facebook login failed. Please try again.');
      }
    );
  };

  // Handle Facebook logout
  const handleLogout = () => {
    console.log('Logout requested, SDK initialized:', isInitialized);

    // Clear any previous errors
    setError(null);

    logout(() => {
      console.log('Logout successful');
      setError(null);
    });
  };

  // Create a new webhook subscription
  const createWebhookSubscription = async (fieldGroup: string) => {
    if (!webhookFields[fieldGroup]) {
      setError(`Invalid field group: ${fieldGroup}`);
      return;
    }

    try {
      // Log domain information for debugging
      console.log('Current hostname:', window.location.hostname);
      console.log('Current origin:', window.location.origin);

      // For testing on Replit, we need a publicly accessible URL
      // This domain needs to be registered in your Facebook App settings
      const baseUrl = window.location.origin;
      console.log('Using base URL for callback:', baseUrl);
      const callbackUrl = `${baseUrl}/api/instagram/webhooks/callback`;

      const response = await fetch('/api/instagram/webhooks/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: webhookFields[fieldGroup],
          callbackUrl
        })
      });

      // Try to get JSON response even for error cases
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        // If we can't parse JSON, use text
        const text = await response.text();
        responseData = { message: text || response.statusText };
      }

      if (!response.ok) {
        // Format specific error codes from backend
        if (responseData.code === 'NO_ACCESS_TOKEN') {
          throw new Error('Facebook access token is missing. Please connect with Facebook first.');
        } else if (responseData.message) {
          throw new Error(responseData.message);
        } else {
          throw new Error(`Failed to subscribe: ${response.statusText}`);
        }
      }

      // Success!
      setError(null);
      fetchWebhookData();
    } catch (err) {
      console.error('Error creating webhook subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to create webhook subscription.');
    }
  };

  // Delete a webhook subscription
  const deleteWebhookSubscription = async (subscriptionId: string) => {
    try {
      const response = await fetch(`/api/instagram/webhooks/subscriptions/${subscriptionId}`, {
        method: 'DELETE'
      });

      // Try to get JSON response even for error cases
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        // If we can't parse JSON, use text
        const text = await response.text();
        responseData = { message: text || response.statusText };
      }

      if (!response.ok) {
        if (responseData.message) {
          throw new Error(responseData.message);
        } else {
          throw new Error(`Failed to unsubscribe: ${response.statusText}`);
        }
      }

      // Success!
      setError(null);
      fetchWebhookData();
    } catch (err) {
      console.error('Error deleting webhook subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete webhook subscription.');
    }
  };

  // Store Facebook access token in our backend for Instagram API calls
  const storeAccessToken = async (token: string) => {
    try {
      const response = await fetch('/api/instagram/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: token,
          userId: user?.id,
        }),
      });

      if (!response.ok) {
        console.error('Failed to store access token:', await response.text());
      }
    } catch (err) {
      console.error('Error storing access token:', err);
    }
  };

  // Fetch Instagram account information
  const fetchInstagramAccount = async () => {
    setIsLoadingAccount(true);
    setError(null);

    try {
      const response = await fetch('/api/instagram/account');

      // Try to get JSON response even for error cases
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        // If we can't parse JSON, use text
        const text = await response.text();
        responseData = { message: text || response.statusText };
      }

      if (!response.ok) {
        // Do not show error for "NO_ACCESS_TOKEN" since we handle auth separately
        if (responseData.code !== 'NO_ACCESS_TOKEN') {
          if (responseData.code === 'NO_INSTAGRAM_ACCOUNT') {
            throw new Error('No Instagram Business Account found linked to your Facebook Page. Please ensure you have connected an Instagram Business Account to your Facebook Page.');
          } else if (responseData.message) {
            throw new Error(responseData.message);
          } else {
            throw new Error(`Failed to get Instagram account: ${response.statusText}`);
          }
        }
        return;
      }

      setInstagramAccount(responseData);
    } catch (err) {
      console.error('Error fetching Instagram account:', err);
      setError(err instanceof Error ? err.message : 'Failed to get Instagram account information.');
    } finally {
      setIsLoadingAccount(false);
    }
  };

  // Fetch Instagram media posts
  const fetchInstagramPosts = async () => {
    setIsLoadingPosts(true);
    setError(null);

    try {
      const response = await fetch('/api/instagram/media');

      // Try to get JSON response even for error cases
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        // If we can't parse JSON, use text
        const text = await response.text();
        responseData = { message: text || response.statusText };
        throw new Error(responseData.message);
      }

      if (!response.ok) {
        // Do not show error for "NO_ACCESS_TOKEN" since we handle auth separately
        if (responseData.code !== 'NO_ACCESS_TOKEN') {
          if (responseData.message) {
            throw new Error(responseData.message);
          } else {
            throw new Error(`Failed to get Instagram posts: ${response.statusText}`);
          }
        }
        return;
      }

      setInstagramPosts(responseData);
    } catch (err) {
      console.error('Error fetching Instagram posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to get Instagram posts.');
    } finally {
      setIsLoadingPosts(false);
    }
  };

  // Create a new Instagram post
  const createInstagramPost = async () => {
    if (!postImageUrl) {
      setError('Image URL is required to create an Instagram post.');
      return;
    }

    setIsCreatingPost(true);
    setError(null);

    try {
      const response = await fetch('/api/instagram/media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: postImageUrl,
          caption: postCaption,
        }),
      });

      // Try to get JSON response even for error cases
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        // If we can't parse JSON, use text
        const text = await response.text();
        responseData = { message: text || response.statusText };
      }

      if (!response.ok) {
        if (responseData.code === 'NO_ACCESS_TOKEN') {
          throw new Error('Facebook access token is missing. Please connect with Facebook first.');
        } else if (responseData.code === 'MISSING_IMAGE_URL') {
          throw new Error('Image URL is required to create an Instagram post.');
        } else if (responseData.message) {
          throw new Error(responseData.message);
        } else {
          throw new Error(`Failed to create Instagram post: ${response.statusText}`);
        }
      }

      // Success!
      setPostImageUrl('');
      setPostCaption('');
      fetchInstagramPosts(); // Refresh the posts list

    } catch (err) {
      console.error('Error creating Instagram post:', err);
      setError(err instanceof Error ? err.message : 'Failed to create Instagram post.');
    } finally {
      setIsCreatingPost(false);
    }
  };

  // Test webhook configuration
  const testWebhookConnection = async () => {
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    setError(null);

    try {
      const response = await fetch('/api/instagram/webhooks/test');

      // Try to get JSON response even for error cases
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        // If we can't parse JSON, use text
        const text = await response.text();
        responseData = { message: text || response.statusText, success: false };
      }

      if (!response.ok) {
        if (responseData.message) {
          throw new Error(responseData.message);
        } else {
          throw new Error(`Failed to test webhook connection: ${response.statusText}`);
        }
      }

      // Success!
      setWebhookTestResult(responseData);
    } catch (err) {
      console.error('Error testing webhook connection:', err);
      setError(err instanceof Error ? err.message : 'Failed to test webhook connection.');
    } finally {
      setIsTestingWebhook(false);
    }
  };

  // Main component render
  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Instagram Integration"
        onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="container mx-auto">
            {/* Breadcrumbs */}
            <nav className="text-sm font-medium mb-6" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <Link href="/integrations">Integrations</Link>
                </li>
                <li>
                  <span className="text-gray-500 mx-2">/</span>
                </li>
                <li>
                  <span className="text-gray-900">Instagram</span>
                </li>
              </ol>
            </nav>

            <h1 className="text-3xl font-bold mb-6 flex items-center">
              <Instagram className="mr-2" />
              Instagram Integration
            </h1>

            {/* Facebook Authentication Card */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Facebook Authentication
                  <Badge variant={status === 'connected' ? 'default' : 'destructive'}>
                    {status === 'connected' ? 'Connected' : 'Not Connected'}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Connect to Facebook to access Instagram integration features. This is required for Instagram API access.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* SDK initialization status */}
                {!isInitialized && (
                  <div className="flex items-center justify-center space-x-2 mb-4 p-2 border rounded bg-muted">
                    <RefreshCcw className="animate-spin h-4 w-4" />
                    <p>Facebook SDK is initializing...</p>
                  </div>
                )}

                {status === 'connected' && user && (
                  <div className="rounded-lg bg-muted p-4 mb-4">
                    <div className="flex items-center">
                      {user.picture && (
                        <img
                          src={user.picture.data.url}
                          alt={user.name || 'User'}
                          className="w-12 h-12 rounded-full mr-4"
                        />
                      )}
                      <div>
                        <h3 className="font-medium">{user.name}</h3>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Display SDK initialization errors */}
                {initializationError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Facebook SDK Error</AlertTitle>
                    <AlertDescription>{initializationError}</AlertDescription>
                  </Alert>
                )}

                {/* Display other errors */}
                {error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Facebook in Replit notice */}
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Facebook in Replit</AlertTitle>
                  <AlertDescription>
                    <p>Facebook login may not work correctly in the Replit environment due to security restrictions, especially with popup blockers and iframe limitations.</p>
                    <p className="mt-2">To get around this:</p>
                    <ul className="list-disc pl-5 mt-1">
                      <li>Try using this app outside the Replit environment</li>
                      <li>Disable popup blockers in your browser</li>
                      <li>Use the application in a full browser window</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </CardContent>
              <CardFooter>
                {status === 'connected' ? (
                  <Button variant="outline" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    onClick={handleLogin}
                    disabled={!isInitialized}
                    title={!isInitialized ? 'Facebook SDK is initializing...' : ''}
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    {!isInitialized ? 'Initializing...' : 'Connect with Facebook'}
                  </Button>
                )}
              </CardFooter>
            </Card>

            {/* Main Tabs */}
            <Tabs defaultValue="media" className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="media">Instagram Media</TabsTrigger>
                <TabsTrigger value="create">Create Post</TabsTrigger>
                <TabsTrigger value="subscriptions">Webhook Subscriptions</TabsTrigger>
                <TabsTrigger value="events">Recent Events</TabsTrigger>
                <TabsTrigger value="test">Diagnostic Tests</TabsTrigger>
              </TabsList>

              {/* Media Tab */}
              <TabsContent value="media">
                <Card>
                  <CardHeader>
                    <CardTitle>Instagram Media</CardTitle>
                    <CardDescription>
                      View your recent Instagram posts
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!status || status !== 'connected' ? (
                      <div className="text-center py-10 border rounded-md">
                        <LogIn className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">
                          Please connect with Facebook to view your Instagram posts.
                        </p>
                      </div>
                    ) : isLoadingPosts ? (
                      <div className="flex justify-center py-10">
                        <RefreshCcw className="animate-spin h-6 w-6" />
                      </div>
                    ) : instagramPosts && instagramPosts.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {instagramPosts.map((post) => (
                          <div key={post.id} className="border rounded-md overflow-hidden">
                            {post.media_url && (
                              <div className="aspect-square relative overflow-hidden">
                                <img
                                  src={post.media_url}
                                  alt={post.caption || 'Instagram post'}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute top-2 right-2">
                                  <Badge>
                                    {post.media_type === 'IMAGE' ? 'Photo' :
                                      post.media_type === 'VIDEO' ? 'Video' :
                                        post.media_type === 'CAROUSEL_ALBUM' ? 'Album' :
                                          post.media_type}
                                  </Badge>
                                </div>
                              </div>
                            )}
                            <div className="p-4">
                              <p className="text-sm line-clamp-3 mb-2">
                                {post.caption || 'No caption'}
                              </p>
                              <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <span className="flex items-center">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  {new Date(post.timestamp).toLocaleDateString()}
                                </span>
                                {post.permalink && (
                                  <a
                                    href={post.permalink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-500 hover:underline"
                                  >
                                    View on Instagram
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 border rounded-md">
                        <Image className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">
                          No Instagram posts found. Create a post or check your Instagram account.
                        </p>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      onClick={fetchInstagramPosts}
                      disabled={isLoadingPosts || !status || status !== 'connected'}
                    >
                      <RefreshCcw className={`mr-2 h-4 w-4 ${isLoadingPosts ? 'animate-spin' : ''}`} />
                      Refresh Posts
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>

              {/* Create Post Tab */}
              <TabsContent value="create">
                <Card>
                  <CardHeader>
                    <CardTitle>Create Instagram Post</CardTitle>
                    <CardDescription>
                      Create and publish a new post to your Instagram account
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!status || status !== 'connected' ? (
                      <div className="text-center py-10 border rounded-md">
                        <LogIn className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">
                          Please connect with Facebook to create Instagram posts.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Image URL</label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={postImageUrl}
                              onChange={(e) => setPostImageUrl(e.target.value)}
                              placeholder="https://example.com/image.jpg"
                              className="flex-1 p-2 border rounded-md"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Enter the URL of an image to post. The image must be publicly accessible.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">Caption</label>
                          <textarea
                            value={postCaption}
                            onChange={(e) => setPostCaption(e.target.value)}
                            placeholder="Write a caption for your post..."
                            className="w-full h-32 p-2 border rounded-md"
                          />
                        </div>

                        <Button
                          onClick={createInstagramPost}
                          disabled={isCreatingPost || !postImageUrl}
                          className="w-full"
                        >
                          {isCreatingPost ? (
                            <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Image className="mr-2 h-4 w-4" />
                          )}
                          {isCreatingPost ? 'Creating Post...' : 'Create Post'}
                        </Button>

                        <div className="rounded-lg border p-4">
                          <h3 className="font-medium flex items-center">
                            <Info className="mr-2 h-4 w-4" />
                            Important Information
                          </h3>
                          <div className="text-sm text-muted-foreground mt-2 space-y-1">
                            <p>To create Instagram posts, please note:</p>
                            <ul className="list-disc pl-6 mt-2 space-y-1">
                              <li>You need an Instagram Business Account connected to a Facebook Page</li>
                              <li>The image URL must be publicly accessible on the internet</li>
                              <li>Images must follow Instagram's content guidelines</li>
                              <li>There may be rate limits on the number of posts you can create</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Webhooks Tab */}
              <TabsContent value="subscriptions">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Active Webhooks Section */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Active Webhooks</CardTitle>
                      <CardDescription>
                        Currently active Instagram webhook subscriptions
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isLoadingWebhooks ? (
                        <div className="flex justify-center py-4">
                          <RefreshCcw className="animate-spin h-6 w-6" />
                        </div>
                      ) : webhooks.length > 0 ? (
                        <div className="space-y-4">
                          {webhooks.map((webhook) => (
                            <div
                              key={webhook.subscription_id}
                              className="rounded-lg border p-4 relative"
                            >
                              <div className="absolute top-2 right-2">
                                <Badge variant={webhook.active ? 'default' : 'secondary'}>
                                  {webhook.active ? 'Active' : 'Inactive'}
                                </Badge>
                              </div>
                              <h3 className="font-medium">{webhook.object}</h3>
                              <p className="text-sm text-muted-foreground truncate mb-2">
                                {webhook.callback_url}
                              </p>
                              <div className="flex flex-wrap gap-2 mb-4">
                                {webhook.fields.map((field: any, index: number) => {
                                  // Handle both string fields and object fields with name/version
                                  const isObjectField = typeof field === 'object' && field !== null;
                                  const fieldName = isObjectField && field.name ? field.name : field;
                                  const fieldVersion = isObjectField && field.version ? field.version : null;

                                  return (
                                    <Badge key={`field-${index}-${fieldName}`} variant="outline">
                                      {fieldName}
                                      {fieldVersion && (
                                        <span className="ml-1 text-xs opacity-70">
                                          v{fieldVersion.toString().replace('v', '')}
                                        </span>
                                      )}
                                    </Badge>
                                  );
                                })}
                              </div>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteWebhookSubscription(webhook.subscription_id)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Unsubscribe
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          No active webhook subscriptions. Create a subscription below.
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button
                        variant="outline"
                        onClick={fetchWebhookData}
                        disabled={isLoadingWebhooks}
                      >
                        <RefreshCcw className={`mr-2 h-4 w-4 ${isLoadingWebhooks ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Create Webhook Section */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Create Webhook</CardTitle>
                      <CardDescription>
                        Subscribe to Instagram webhook events
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="rounded-lg border p-4">
                          <h3 className="font-medium flex items-center">
                            <Bell className="mr-2 h-4 w-4" />
                            Basic Notifications
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Receive notifications for mentions and comments
                          </p>
                          <Button
                            onClick={() => createWebhookSubscription('BASIC')}
                            disabled={!status || status !== 'connected'}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Subscribe
                          </Button>
                        </div>

                        <div className="rounded-lg border p-4">
                          <h3 className="font-medium flex items-center">
                            <Image className="mr-2 h-4 w-4" />
                            Media Updates
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Receive notifications for new media posts
                          </p>
                          <Button
                            onClick={() => createWebhookSubscription('MEDIA')}
                            disabled={!status || status !== 'connected'}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Subscribe
                          </Button>
                        </div>

                        <div className="rounded-lg border p-4">
                          <h3 className="font-medium flex items-center">
                            <BookOpen className="mr-2 h-4 w-4" />
                            Story Insights
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Receive insights about story views and interactions
                          </p>
                          <Button
                            onClick={() => createWebhookSubscription('STORIES')}
                            disabled={!status || status !== 'connected'}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Subscribe
                          </Button>
                        </div>

                        <div className="rounded-lg border p-4">
                          <h3 className="font-medium flex items-center">
                            <MessageCircle className="mr-2 h-4 w-4" />
                            Messaging Events
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Receive notifications for direct messages
                          </p>
                          <Button
                            onClick={() => createWebhookSubscription('MESSAGING')}
                            disabled={!status || status !== 'connected'}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Subscribe
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Events Tab */}
              <TabsContent value="events">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Instagram Events</CardTitle>
                    <CardDescription>
                      Recent events received from Instagram webhooks
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingEvents ? (
                      <div className="flex justify-center py-10">
                        <RefreshCcw className="animate-spin h-6 w-6" />
                      </div>
                    ) : webhookEvents.length > 0 ? (
                      <ScrollArea className="h-[500px] rounded-md border">
                        <div className="p-4 space-y-4">
                          {webhookEvents.map((event, index) => (
                            <div key={index} className="rounded-lg border p-4">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center">
                                  <Badge className="mr-2">{event.object || 'instagram'}</Badge>
                                  <Badge variant="outline">{event.field || 'webhook'}</Badge>
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {new Date(event.timestamp || Date.now()).toLocaleString()}
                                </div>
                              </div>

                              <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs">
                                {JSON.stringify(event.payload || event, null, 2)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        No webhook events received yet. Events will appear here when received.
                      </div>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      onClick={fetchWebhookEvents}
                      disabled={isLoadingEvents}
                    >
                      <RefreshCcw className={`mr-2 h-4 w-4 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                      Refresh Events
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>

              {/* Test Tab */}
              <TabsContent value="test">
                <Card>
                  <CardHeader>
                    <CardTitle>Webhook Connection Test</CardTitle>
                    <CardDescription>
                      Test your webhook configuration to diagnose any issues
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Debug Environment Variables */}
                      <DebugEnv />
                      {webhookTestResult && (
                        <div className={`rounded-lg border p-4 ${webhookTestResult.success ? 'border-green-500' : 'border-red-500'}`}>
                          <h3 className="font-medium flex items-center mb-4">
                            {webhookTestResult.success ? (
                              <CheckCircle2 className="mr-2 h-5 w-5 text-green-500" />
                            ) : (
                              <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" />
                            )}
                            {webhookTestResult.message}
                          </h3>

                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="space-y-2">
                              <div className="flex items-center">
                                {webhookTestResult.appId ? (
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="mr-2 h-4 w-4 text-red-500" />
                                )}
                                <span>Facebook App ID</span>
                              </div>

                              <div className="flex items-center">
                                {webhookTestResult.appSecret ? (
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="mr-2 h-4 w-4 text-red-500" />
                                )}
                                <span>Facebook App Secret</span>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center">
                                {webhookTestResult.accessToken ? (
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="mr-2 h-4 w-4 text-red-500" />
                                )}
                                <span>User Access Token</span>
                              </div>

                              <div className="flex items-center">
                                {webhookTestResult.appAccessToken ? (
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                ) : (
                                  <XCircle className="mr-2 h-4 w-4 text-red-500" />
                                )}
                                <span>App Access Token</span>
                              </div>
                            </div>
                          </div>

                          {webhookTestResult.details && (
                            <div className="mt-4">
                              <h4 className="text-sm font-medium mb-2">Additional Details</h4>
                              <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs">
                                {JSON.stringify(webhookTestResult.details, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="rounded-lg border p-4">
                        <h3 className="font-medium flex items-center">
                          <TestTube className="mr-2 h-4 w-4" />
                          Configuration Test
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Check if your Facebook App is correctly configured for Instagram webhooks
                        </p>
                        <Button
                          onClick={testWebhookConnection}
                          disabled={isTestingWebhook}
                        >
                          {isTestingWebhook ? (
                            <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <TestTube className="mr-2 h-4 w-4" />
                          )}
                          Run Test
                        </Button>
                      </div>

                      <div className="rounded-lg border p-4">
                        <h3 className="font-medium flex items-center">
                          <Info className="mr-2 h-4 w-4" />
                          Webhook Requirements
                        </h3>
                        <div className="text-sm text-muted-foreground mt-2 space-y-1">
                          <p>To use Instagram webhooks, you need:</p>
                          <ul className="list-disc pl-6 mt-2 space-y-1">
                            <li>A Facebook App with Instagram permissions</li>
                            <li>Facebook App ID and App Secret environment variables</li>
                            <li>User authentication via Facebook login</li>
                            <li>A public URL for your webhook endpoint</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      onClick={() => setWebhookTestResult(null)}
                      disabled={!webhookTestResult || isTestingWebhook}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Clear Results
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}