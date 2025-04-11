import React, { useEffect, useState } from 'react';
import { useFacebook } from '../../contexts/FacebookContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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

/**
 * Instagram Integration Page
 * 
 * This page displays Instagram integration settings, webhook configuration,
 * and allows users to connect their Instagram account via Facebook.
 */
export default function InstagramPage() {
  const { 
    isInitialized, 
    status, 
    user, 
    accessToken, 
    initializationError,
    login, 
    logout 
  } = useFacebook();
  
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhookFields, setWebhookFields] = useState<{[key: string]: string[]}>({});
  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);
  const [webhookTestResult, setWebhookTestResult] = useState<any>(null);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch webhook subscriptions and field groups on component mount
  useEffect(() => {
    if (isInitialized) {
      fetchWebhookData();
      fetchWebhookEvents();
    }
  }, [isInitialized]);
  
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

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 flex items-center">
        <Instagram className="mr-2" />
        Instagram Integration
      </h1>
      
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
        </CardContent>
        <CardFooter>
          {status === 'connected' ? (
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          ) : (
            <Button onClick={handleLogin}>
              <LogIn className="mr-2 h-4 w-4" />
              Connect with Facebook
            </Button>
          )}
        </CardFooter>
      </Card>

      <Tabs defaultValue="subscriptions" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="subscriptions">Webhook Subscriptions</TabsTrigger>
          <TabsTrigger value="events">Recent Events</TabsTrigger>
          <TabsTrigger value="test">Diagnostic Tests</TabsTrigger>
        </TabsList>
        
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
                            const fieldName = typeof field === 'string' ? field : field.name;
                            return (
                              <Badge key={`${fieldName}-${index}`} variant="outline">
                                {fieldName}
                                {field.version && <span className="ml-1 text-xs opacity-70">v{field.version.replace('v', '')}</span>}
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
  );
}