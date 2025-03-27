import React, { useEffect, useState } from 'react';
import { useFacebook } from '../../contexts/FacebookContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
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
  AlertTriangle 
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
    login, 
    logout 
  } = useFacebook();
  
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhookFields, setWebhookFields] = useState<{[key: string]: string[]}>({});
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch webhook subscriptions and field groups on component mount
  useEffect(() => {
    if (isInitialized) {
      fetchWebhookData();
    }
  }, [isInitialized]);

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
    login(
      () => console.log('Login successful'),
      (error) => {
        console.error('Login failed:', error);
        setError('Facebook login failed. Please try again.');
      }
    );
  };

  // Handle Facebook logout
  const handleLogout = () => {
    logout(() => console.log('Logout successful'));
  };

  // Create a new webhook subscription
  const createWebhookSubscription = async (fieldGroup: string) => {
    if (!webhookFields[fieldGroup]) {
      setError(`Invalid field group: ${fieldGroup}`);
      return;
    }
    
    try {
      const baseUrl = window.location.origin;
      const callbackUrl = `${baseUrl}/api/instagram/webhooks/callback`;
      
      const response = await fetch('/api/instagram/webhooks/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: webhookFields[fieldGroup],
          callbackUrl
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to subscribe: ${response.statusText}`);
      }
      
      // Refresh webhook list
      fetchWebhookData();
    } catch (err) {
      console.error('Error creating webhook subscription:', err);
      setError('Failed to create webhook subscription.');
    }
  };

  // Delete a webhook subscription
  const deleteWebhookSubscription = async (subscriptionId: string) => {
    try {
      const response = await fetch(`/api/instagram/webhooks/subscriptions/${subscriptionId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to unsubscribe: ${response.statusText}`);
      }
      
      // Refresh webhook list
      fetchWebhookData();
    } catch (err) {
      console.error('Error deleting webhook subscription:', err);
      setError('Failed to delete webhook subscription.');
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
            <Badge variant={status === 'connected' ? 'success' : 'destructive'}>
              {status === 'connected' ? 'Connected' : 'Not Connected'}
            </Badge>
          </CardTitle>
          <CardDescription>
            Connect to Facebook to access Instagram integration features. This is required for Instagram API access.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                          {webhook.fields.map((field: string) => (
                            <Badge key={field} variant="outline">{field}</Badge>
                          ))}
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
              <div className="text-center py-10 text-muted-foreground">
                Event log will appear here when events are received.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}