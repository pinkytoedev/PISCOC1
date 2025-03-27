import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useFacebook } from '@/contexts/FacebookContext';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { SiInstagram } from 'react-icons/si';

// Define a basic layout component if AppLayout is not found
const AppLayout = ({ children, title }: { children: React.ReactNode, title: string }) => (
  <div className="container mx-auto py-6">
    <title>{title}</title>
    {children}
  </div>
);

// Add the checkLoginState function to the window object
declare global {
  interface Window {
    checkLoginState: () => void;
  }
}

/**
 * InstagramPage - Handles Instagram integration and webhook management
 */
export default function InstagramPage() {
  const { isInitialized, login, getAuthStatus, getFacebookUserData } = useFacebook();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const { toast } = useToast();
  
  // Function to handle the status change after login
  const statusChangeCallback = (response: any) => {
    console.log('Facebook login status:', response);
    if (response.status === 'connected') {
      setIsLoggedIn(true);
      getFacebookUserData().then((userData) => {
        setUserData(userData);
        toast({
          title: "Login Successful",
          description: `Welcome, ${userData.name}!`,
        });
      }).catch(console.error);
    } else if (response.status === 'not_authorized') {
      toast({
        variant: "destructive",
        title: "Not Authorized",
        description: "You're logged into Facebook, but not authorized for this app.",
      });
    } else {
      // User is not logged into Facebook
      setIsLoggedIn(false);
    }
  };
  
  // Set up the global checkLoginState function
  useEffect(() => {
    // Define the global function that Facebook Login Button will call
    window.checkLoginState = () => {
      if (window.FB) {
        window.FB.getLoginStatus(statusChangeCallback);
      }
    };
    
    return () => {
      // Clean up the global function when component unmounts
      delete window.checkLoginState;
    };
  }, []);

  // Check if the user is already logged in to Facebook
  useEffect(() => {
    if (isInitialized) {
      getAuthStatus().then(response => {
        if (response.status === 'connected') {
          setIsLoggedIn(true);
          getFacebookUserData().then(setUserData).catch(console.error);
        }
      }).catch(console.error);
    }
  }, [isInitialized, getAuthStatus, getFacebookUserData]);

  // Handler for Facebook login
  const handleLogin = async () => {
    try {
      const response = await login();
      if (response.authResponse) {
        setIsLoggedIn(true);
        const userData = await getFacebookUserData();
        setUserData(userData);
        toast({
          title: "Login Successful",
          description: `Welcome, ${userData.name}!`,
        });
      }
    } catch (error) {
      console.error("Facebook login error:", error);
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: "Failed to login with Facebook. Please try again.",
      });
    }
  };

  // Define a type for subscription data
  interface InstagramSubscription {
    object: string;
    fields: string | string[];
    callback_url?: string;
    active?: boolean;
  }

  // Fetch webhook subscriptions
  const { data: subscriptions = [], isLoading: isLoadingSubscriptions } = useQuery<InstagramSubscription[]>({
    queryKey: ['/api/instagram/webhooks/subscriptions'],
    enabled: isLoggedIn,
  });

  // Create webhook subscription mutation
  const createSubscription = useMutation({
    mutationFn: (data: {
      fields: string[];
      callback_url: string;
      verify_token: string;
    }) => {
      return apiRequest('/api/instagram/webhooks/subscribe', {
        method: 'POST',
        body: JSON.stringify(data),
      }) as Promise<any>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram/webhooks/subscriptions'] });
      toast({
        title: "Subscription Created",
        description: "Successfully subscribed to Instagram webhook events.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Subscription Failed",
        description: error.message || "Failed to subscribe to Instagram webhook events.",
      });
    }
  });

  // Handle webhook subscription
  const handleSubscribe = (fields: string[]) => {
    createSubscription.mutate({ 
      fields,
      callback_url: `${window.location.origin}/api/instagram/webhooks/callback`,
      verify_token: "YOUR_VERIFY_TOKEN" // This should be retrieved from environment or server
    });
  };

  return (
    <AppLayout title="Instagram Integration">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <SiInstagram className="h-8 w-8 text-pink-500" />
          <h1 className="text-3xl font-bold tracking-tight">Instagram Integration</h1>
        </div>
        
        <Separator />
        
        {!isInitialized ? (
          <Alert>
            <AlertTitle>Facebook SDK Loading</AlertTitle>
            <AlertDescription>
              The Facebook SDK is currently loading. This is required for Instagram integration.
            </AlertDescription>
          </Alert>
        ) : !isLoggedIn ? (
          <Card>
            <CardHeader>
              <CardTitle>Connect to Facebook</CardTitle>
              <CardDescription>
                Instagram integration requires you to connect your Facebook account first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Connecting to Facebook allows you to manage Instagram webhooks, post content,
                and interact with your Instagram Business accounts.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-4">
              {/* Custom Button */}
              <Button onClick={handleLogin} className="w-full sm:w-auto">
                Login with Custom Button
              </Button>
              
              {/* Facebook Login Button */}
              <div className="mt-2">
                <div id="fb-root"></div>
                <div className="fb-login-button" 
                  data-width="280"
                  data-size="large" 
                  data-button-type="login_with" 
                  data-layout="rounded" 
                  data-auto-logout-link="false" 
                  data-use-continue-as="true"
                  data-scope="public_profile,email,instagram_basic,instagram_content_publish,pages_show_list"
                  data-onlogin="checkLoginState">
                </div>
              </div>
            </CardFooter>
          </Card>
        ) : (
          <Tabs defaultValue="webhooks">
            <TabsList className="mb-4">
              <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
              <TabsTrigger value="accounts">Connected Accounts</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="webhooks" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Instagram Webhooks</CardTitle>
                  <CardDescription>
                    Manage webhook subscriptions to receive real-time updates from Instagram.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Active Subscriptions</h3>
                      {isLoadingSubscriptions ? (
                        <p>Loading subscriptions...</p>
                      ) : subscriptions && subscriptions.length > 0 ? (
                        <ul className="list-disc pl-5">
                          {subscriptions.map((sub: any, index: number) => (
                            <li key={index} className="text-sm">
                              {sub.object}: {Array.isArray(sub.fields) ? sub.fields.join(', ') : sub.fields}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">No active subscriptions found.</p>
                      )}
                    </div>
                    
                    <Separator />
                    
                    <div>
                      <h3 className="font-medium mb-2">Create Subscription</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Button
                          variant="outline"
                          onClick={() => handleSubscribe(['mentions', 'comments'])}
                          disabled={createSubscription.isPending}
                        >
                          Subscribe to Mentions & Comments
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleSubscribe(['media'])}
                          disabled={createSubscription.isPending}
                        >
                          Subscribe to Media Updates
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleSubscribe(['story_insights'])}
                          disabled={createSubscription.isPending}
                        >
                          Subscribe to Story Insights
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleSubscribe(['messaging_webhook_events'])}
                          disabled={createSubscription.isPending}
                        >
                          Subscribe to Messaging Events
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Webhook Configuration</CardTitle>
                  <CardDescription>
                    Configure your server to receive Instagram webhook events.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Callback URL</h3>
                      <code className="block p-2 bg-muted rounded-md text-sm">
                        {window.location.origin}/api/instagram/webhooks/callback
                      </code>
                      <p className="text-xs text-muted-foreground mt-1">
                        This is the URL that Instagram will send webhook events to.
                      </p>
                    </div>
                    
                    <div>
                      <h3 className="font-medium mb-2">Verify Token</h3>
                      <code className="block p-2 bg-muted rounded-md text-sm">
                        YOUR_VERIFY_TOKEN
                      </code>
                      <p className="text-xs text-muted-foreground mt-1">
                        This token is used by Instagram to verify your webhook endpoint.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="accounts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Connected Accounts</CardTitle>
                  <CardDescription>
                    Manage the Instagram Business accounts connected to this integration.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {userData ? (
                    <div className="flex items-center gap-4">
                      {userData.picture && (
                        <img
                          src={userData.picture.data?.url}
                          alt={userData.name}
                          className="h-16 w-16 rounded-full"
                        />
                      )}
                      <div>
                        <h3 className="font-medium">{userData.name}</h3>
                        <p className="text-sm text-muted-foreground">{userData.email || "No email available"}</p>
                      </div>
                    </div>
                  ) : (
                    <p>Loading account information...</p>
                  )}
                  
                  <div className="mt-6">
                    <Button variant="outline">
                      Fetch Instagram Business Accounts
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Integration Settings</CardTitle>
                  <CardDescription>
                    Configure settings for the Instagram integration.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Settings will be added in a future update.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}