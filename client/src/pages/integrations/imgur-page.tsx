import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { IntegrationSetting } from "@shared/schema";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Lock, LogIn, LogOut, Image, ExternalLink, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Schema for validation
const imgurSettingSchema = z.object({
  client_id: z.string().min(1, "Client ID is required"),
  client_secret: z.string().optional(),
  enabled: z.boolean().default(true),
  use_oauth: z.boolean().default(false)
});

type ImgurSettingFormValues = z.infer<typeof imgurSettingSchema>;

export default function ImgurPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  
  // Fetch current Imgur settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/imgur/settings'],
    queryFn: async () => {
      const response = await fetch('/api/imgur/settings', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch Imgur settings');
      }
      
      return response.json() as Promise<IntegrationSetting[]>;
    }
  });
  
  // Find settings if they exist
  const clientIdSetting = settings?.find(s => s.key === 'client_id');
  const clientSecretSetting = settings?.find(s => s.key === 'client_secret');
  const useOAuthSetting = settings?.find(s => s.key === 'use_oauth');
  const accessTokenSetting = settings?.find(s => s.key === 'access_token');
  const refreshTokenSetting = settings?.find(s => s.key === 'refresh_token');
  
  // Track OAuth status
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticationUrl, setAuthenticationUrl] = useState("");
  const [accountInfo, setAccountInfo] = useState<{username?: string; url?: string}>({});
  
  // Form setup
  const form = useForm<ImgurSettingFormValues>({
    resolver: zodResolver(imgurSettingSchema),
    defaultValues: {
      client_id: clientIdSetting?.value || '',
      client_secret: clientSecretSetting?.value || '',
      enabled: clientIdSetting?.enabled === false ? false : true,
      use_oauth: useOAuthSetting?.value === 'true'
    }
  });
  
  // Update values when settings load
  React.useEffect(() => {
    if (settings) {
      if (clientIdSetting) {
        form.setValue('client_id', clientIdSetting.value);
        form.setValue('enabled', clientIdSetting.enabled === false ? false : true);
      }
      
      if (clientSecretSetting) {
        form.setValue('client_secret', clientSecretSetting.value);
      }
      
      if (useOAuthSetting) {
        form.setValue('use_oauth', useOAuthSetting.value === 'true');
      }
      
      // Check if we're authenticated with OAuth
      setIsAuthenticated(!!(accessTokenSetting?.value && refreshTokenSetting?.value));
    }
  }, [settings, form]);
  
  // Get authentication URL once client ID and secret are set
  React.useEffect(() => {
    const getAuthUrl = async () => {
      if (form.getValues('client_id') && form.getValues('use_oauth')) {
        try {
          const response = await fetch('/api/imgur/auth/url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              client_id: form.getValues('client_id')
            }),
            credentials: 'include'
          });
          
          if (response.ok) {
            const data = await response.json();
            setAuthenticationUrl(data.url);
          }
        } catch (error) {
          console.error('Failed to get auth URL:', error);
        }
      }
    };
    
    getAuthUrl();
  }, [form.watch('client_id'), form.watch('use_oauth')]);
  
  // Fetch account info if authenticated
  React.useEffect(() => {
    const getAccountInfo = async () => {
      if (isAuthenticated) {
        try {
          const response = await fetch('/api/imgur/auth/account', {
            credentials: 'include'
          });
          
          if (response.ok) {
            const data = await response.json();
            setAccountInfo({
              username: data.username,
              url: data.url
            });
          }
        } catch (error) {
          console.error('Failed to get account info:', error);
        }
      }
    };
    
    getAccountInfo();
  }, [isAuthenticated]);
  
  // Mutation for updating settings
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, enabled }: { key: string; value: string; enabled: boolean }) => {
      return apiRequest(
        'POST',
        '/api/imgur/settings/' + key,
        { value, enabled }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/imgur/settings'] });
      toast({
        title: "Settings updated",
        description: "Imgur integration settings have been updated successfully.",
      });
      setIsSubmitting(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update settings",
        description: error.message || "There was an error updating the settings",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  });
  
  // Function to initiate OAuth authentication
  const initiateOAuth = () => {
    if (authenticationUrl) {
      window.open(authenticationUrl, '_blank', 'width=800,height=600');
    } else {
      toast({
        title: "Authentication URL not available",
        description: "Please save your client ID and client secret first",
        variant: "destructive",
      });
    }
  };
  
  // Function to revoke OAuth access
  const revokeOAuth = async () => {
    try {
      const response = await fetch('/api/imgur/auth/revoke', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        setIsAuthenticated(false);
        setAccountInfo({});
        toast({
          title: "Authentication revoked",
          description: "Your Imgur account has been disconnected",
        });
        queryClient.invalidateQueries({ queryKey: ['/api/imgur/settings'] });
      } else {
        toast({
          title: "Failed to revoke authentication",
          description: "An error occurred while disconnecting your Imgur account",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Failed to revoke authentication",
        description: "An error occurred while disconnecting your Imgur account",
        variant: "destructive",
      });
    }
  };
  
  // Form submission handler
  const onSubmit = async (data: ImgurSettingFormValues) => {
    setIsSubmitting(true);
    
    try {
      // Update client ID setting
      await updateSettingMutation.mutateAsync({
        key: 'client_id',
        value: data.client_id,
        enabled: data.enabled
      });
      
      // Update client secret if provided
      if (data.client_secret) {
        await updateSettingMutation.mutateAsync({
          key: 'client_secret',
          value: data.client_secret,
          enabled: data.enabled
        });
      }
      
      // Update OAuth toggle
      await updateSettingMutation.mutateAsync({
        key: 'use_oauth',
        value: data.use_oauth ? 'true' : 'false',
        enabled: data.enabled
      });
      
    } catch (error) {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Imgur Integration</h1>
        <p className="text-muted-foreground mt-1">
          Configure Imgur integration settings to enable image hosting before uploading to Airtable
        </p>
      </div>
      
      {/* Status Banner */}
      <div className={`mb-8 p-4 rounded-lg ${clientIdSetting?.value ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
        <div className="flex items-center gap-3">
          {clientIdSetting?.value ? (
            <>
              <div className="bg-green-100 p-2 rounded-full">
                <Image className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-green-800">Imgur Integration Status: {clientIdSetting.enabled ? 'Enabled' : 'Configured but Disabled'}</h2>
                <p className="text-green-700 text-sm mt-1">
                  {clientIdSetting.enabled 
                    ? 'Images will be uploaded through Imgur before being sent to Airtable.' 
                    : 'Integration is configured but currently disabled. Enable it below to use Imgur for image uploads.'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-amber-100 p-2 rounded-full">
                <AlertCircle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-amber-800">Imgur Integration Status: Not Configured</h2>
                <p className="text-amber-700 text-sm mt-1">
                  Enter your Imgur API credentials below to enable seamless image hosting for Airtable.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Imgur API Configuration</CardTitle>
              <CardDescription>
                Enter your Imgur API client ID to enable integration with the Imgur service for image hosting
              </CardDescription>
            </div>
            {clientIdSetting?.value && (
              <Badge className={clientIdSetting.enabled ? 'bg-green-600' : 'bg-gray-400'}>
                {clientIdSetting.enabled ? 'Active' : 'Disabled'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Imgur Client ID</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter your Imgur client ID" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        You can get a client ID from the <a href="https://api.imgur.com/oauth2/addclient" target="_blank" rel="noopener noreferrer" className="text-primary underline">Imgur API registration page</a>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="client_secret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Imgur Client Secret</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input 
                            placeholder="Enter your Imgur client secret" 
                            type="password"
                            {...field} 
                          />
                          <div className="flex-shrink-0">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </FormControl>
                      <FormDescription>
                        The client secret is needed for OAuth authentication and is kept secure
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-gray-50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Enable Imgur Integration
                        </FormLabel>
                        <FormDescription>
                          When enabled, all uploads will go through Imgur first before being sent to Airtable
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="use_oauth"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-gray-50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Use OAuth Authentication
                        </FormLabel>
                        <FormDescription>
                          When enabled, uploads will be associated with your Imgur account for better tracking and higher rate limits
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground max-w-[400px]">
                    <p>Using Imgur as an intermediary ensures your images have permanent URLs that won't expire and bypass Airtable's attachment size limits.</p>
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Save Settings</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      
      {form.getValues('use_oauth') && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Account Connection</CardTitle>
            <CardDescription>
              Connect your Imgur account to enable authenticated uploads
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAuthenticated ? (
              <div className="space-y-4">
                <Alert className="bg-green-50 border-green-200">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-green-500">Connected</Badge>
                    <AlertTitle className="text-green-700">Account connected successfully</AlertTitle>
                  </div>
                  {accountInfo.username && (
                    <AlertDescription className="mt-2">
                      <div className="flex items-center gap-3 mt-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={`https://imgur.com/user/${accountInfo.username}/avatar`} alt={accountInfo.username} />
                          <AvatarFallback>{accountInfo.username?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{accountInfo.username}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Image className="h-3 w-3" />
                            <span>Imgur Account</span>
                            {accountInfo.url && (
                              <a 
                                href={accountInfo.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary inline-flex items-center gap-1 ml-1"
                              >
                                View profile <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </AlertDescription>
                  )}
                </Alert>
                
                <div className="flex justify-end">
                  <Button 
                    variant="destructive" 
                    onClick={revokeOAuth}
                    className="flex items-center gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Disconnect Account</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertTitle className="text-amber-700">Account authentication required</AlertTitle>
                  <AlertDescription className="text-amber-600">
                    To use authenticated uploads, you need to connect your Imgur account
                  </AlertDescription>
                </Alert>
                
                <div className="flex justify-end">
                  <Button 
                    variant="default" 
                    onClick={initiateOAuth}
                    className="flex items-center gap-2"
                    disabled={!form.getValues('client_id') || !form.getValues('client_secret')}
                  >
                    <LogIn className="h-4 w-4" />
                    <span>Connect Imgur Account</span>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-secondary/20 text-sm text-muted-foreground">
            <p>
              Note: Authenticated uploads have higher rate limits and allow you to manage uploads through your Imgur account.
            </p>
          </CardFooter>
        </Card>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            The Imgur integration provides a permanent hosting solution for your images:
          </p>
          <ol className="list-decimal ml-6 space-y-2">
            <li>Images are first uploaded to Imgur using their API</li>
            <li>The permanent URL from Imgur is then stored in Airtable</li>
            <li>This prevents link expiration issues that can occur with temporary URLs</li>
            <li>All uploads are tracked in the activity logs for reference</li>
          </ol>
          
          <Separator className="my-4" />
          
          <div>
            <h3 className="text-lg font-medium mb-2">OAuth Authentication Benefits</h3>
            <ul className="list-disc ml-6 space-y-1">
              <li>Higher API rate limits (up to 1,250 uploads per day vs 50 for anonymous)</li>
              <li>Uploads are associated with your account and visible in your Imgur gallery</li>
              <li>Access to more Imgur features like albums and collections</li>
              <li>Better tracking and management of your uploaded images</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}