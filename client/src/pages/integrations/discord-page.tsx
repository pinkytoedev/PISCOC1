import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { IntegrationSetting } from "@shared/schema";
import { SiDiscord } from "react-icons/si";
import { CheckCircle, AlertCircle, Loader2, Copy, RefreshCw, Webhook } from "lucide-react";

export default function DiscordPage() {
  const { toast } = useToast();
  
  const { data: settings, isLoading } = useQuery<IntegrationSetting[]>({
    queryKey: ['/api/discord/settings'],
  });
  
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, enabled }: { key: string; value: string; enabled?: boolean }) => {
      const res = await apiRequest("POST", "/api/discord/settings", { key, value, enabled });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/discord/settings'] });
      toast({
        title: "Settings updated",
        description: "The Discord integration settings have been updated successfully.",
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
  
  const testDiscordMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/discord/test");
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Test message sent",
        description: "A test message was successfully sent to Discord.",
      });
    },
    onError: (error) => {
      toast({
        title: "Test failed",
        description: error.message || "Failed to send test message to Discord.",
        variant: "destructive",
      });
    },
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
  
  const handleTestDiscord = () => {
    testDiscordMutation.mutate();
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied to clipboard",
        description: "The webhook URL has been copied to your clipboard.",
      });
    });
  };
  
  const generateRandomSecret = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    handleSettingChange('webhook_secret', result);
  };
  
  // Get our webhook URL for content submission
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${baseUrl}/api/discord/webhook`;
  
  // Check if webhook_url is configured
  const hasWebhook = !!getSettingValue('webhook_url');
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Discord Integration" />
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
                  <span className="text-gray-900">Discord</span>
                </li>
              </ol>
            </nav>

            {/* Page Header */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                <SiDiscord className="h-8 w-8 text-[#5865F2] mr-3" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Discord Integration</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Connect your Discord server for content submission and notifications.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {hasWebhook ? (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-5 w-5 mr-1" />
                    <span className="text-sm font-medium">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center text-amber-600">
                    <AlertCircle className="h-5 w-5 mr-1" />
                    <span className="text-sm font-medium">Not Connected</span>
                  </div>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-5 bg-gray-200 rounded w-1/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-10 bg-gray-200 rounded mb-4"></div>
                      <div className="h-10 bg-gray-200 rounded"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Discord Webhook Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle>Discord Webhook</CardTitle>
                    <CardDescription>
                      Configure the webhook URL where notifications will be sent to your Discord server.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="webhook_url">Webhook URL</Label>
                      <div className="flex gap-2">
                        <Input
                          id="webhook_url"
                          type="text"
                          placeholder="https://discord.com/api/webhooks/..."
                          value={getSettingValue('webhook_url')}
                          onChange={(e) => handleSettingChange('webhook_url', e.target.value)}
                          className="flex-1"
                        />
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={getSettingEnabled('webhook_url')}
                            onCheckedChange={(checked) => handleToggleEnabled('webhook_url', checked)}
                          />
                          <span className="text-sm text-gray-500">
                            {getSettingEnabled('webhook_url') ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Create a webhook in your Discord server settings and paste the URL here.
                      </p>
                    </div>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleTestDiscord}
                      disabled={!getSettingValue('webhook_url') || testDiscordMutation.isPending}
                    >
                      {testDiscordMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Send Test Message
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
                
                {/* Content Submission Webhook */}
                <Card>
                  <CardHeader>
                    <CardTitle>Content Submission</CardTitle>
                    <CardDescription>
                      This webhook URL allows Discord users to submit content to your platform.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label>Submission Webhook URL</Label>
                      <div className="flex gap-2">
                        <Input
                          value={webhookUrl}
                          readOnly
                          className="flex-1 bg-gray-50"
                        />
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => copyToClipboard(webhookUrl)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Use this URL in your Discord bot or third-party integrations to submit content.
                      </p>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="webhook_secret">Webhook Secret (Optional)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="webhook_secret"
                          type="text"
                          placeholder="Secret key for webhook authentication"
                          value={getSettingValue('webhook_secret')}
                          onChange={(e) => handleSettingChange('webhook_secret', e.target.value)}
                          className="flex-1"
                        />
                        <Button 
                          variant="outline" 
                          onClick={generateRandomSecret}
                        >
                          Generate
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Add this secret to your webhook requests as a query parameter or 'x-discord-signature' header for added security.
                      </p>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Integration Guide */}
                <Card>
                  <CardHeader>
                    <CardTitle>Integration Guide</CardTitle>
                    <CardDescription>
                      How to set up and use Discord integration with your platform.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium">Step 1: Create Discord Webhook</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          In your Discord server, go to Server Settings → Integrations → Webhooks → Create Webhook.
                          Copy the webhook URL and paste it in the field above.
                        </p>
                      </div>
                      
                      <Separator />
                      
                      <div>
                        <h3 className="text-sm font-medium">Step 2: Configure Submission Webhook</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Use the submission webhook URL to receive content from Discord. Optionally, set a webhook secret
                          for secure communication.
                        </p>
                      </div>
                      
                      <Separator />
                      
                      <div>
                        <h3 className="text-sm font-medium">Step 3: Test the Integration</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Send a test message to verify that your Discord webhook is properly configured.
                          You should see a message in your Discord channel.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="bg-gray-50 border-t">
                    <a 
                      href="https://discord.com/developers/docs/resources/webhook" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm flex items-center"
                    >
                      <Webhook className="h-4 w-4 mr-1" />
                      Discord Webhook Documentation
                    </a>
                  </CardFooter>
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
