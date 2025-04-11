import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { IntegrationSetting } from "@shared/schema";
import { SiDiscord } from "react-icons/si";
import { 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Copy, 
  RefreshCw, 
  Webhook, 
  Bot, 
  Shield, 
  PowerOff, 
  Terminal,
  Server,
  UserPlus,
  Plus,
  Settings
} from "lucide-react";

interface GuildInfo {
  id: string;
  name: string;
  memberCount: number;
  icon?: string;
  owner?: boolean;
}

interface WebhookInfo {
  id: string;
  name: string;
  channelId: string;
  channelName: string;
  guildId: string;
  guildName: string;
}

interface BotStatus {
  connected: boolean;
  status: string;
  username?: string;
  id?: string;
  guilds?: number;
  guildsList?: GuildInfo[];
  webhooks?: WebhookInfo[];
}

// Define a new interface for server channels
interface ChannelInfo {
  id: string;
  name: string;
  type: string;
}

// CreateWebhookDialog component
function CreateWebhookDialog({ serverId, serverName }: { serverId: string, serverName: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [webhookName, setWebhookName] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  
  // Query for getting available channels in the server
  const { data: channelsData, isLoading: isLoadingChannels } = useQuery<{
    success: boolean;
    serverId: string;
    serverName: string;
    channels: ChannelInfo[];
  }>({
    queryKey: ['/api/discord/bot/server', serverId, 'channels'],
    queryFn: async () => {
      const res = await fetch(`/api/discord/bot/server/${serverId}/channels`);
      if (!res.ok) {
        throw new Error('Failed to fetch channels');
      }
      return res.json();
    },
    enabled: open, // Only fetch when the dialog is open
  });
  
  // Mutation for creating a webhook
  const createWebhookMutation = useMutation({
    mutationFn: async () => {
      if (!webhookName || !selectedChannelId) {
        throw new Error('Webhook name and channel are required');
      }
      
      setIsCreating(true);
      const res = await apiRequest("POST", "/api/discord/bot/webhook", {
        serverId,
        channelId: selectedChannelId,
        name: webhookName
      });
      
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to create webhook');
      }
      return data;
    },
    onSuccess: (data) => {
      setIsCreating(false);
      toast({
        title: "Webhook created",
        description: `Webhook "${data.webhook.name}" was created in channel #${data.webhook.channelName}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/bot/servers'] });
      setOpen(false);
      setWebhookName("");
      setSelectedChannelId("");
    },
    onError: (error) => {
      setIsCreating(false);
      toast({
        title: "Failed to create webhook",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: "destructive",
      });
    }
  });
  
  const handleCreateWebhook = () => {
    createWebhookMutation.mutate();
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="ml-2">
          <Webhook className="h-4 w-4 mr-2" />
          Add Webhook
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Webhook in {serverName}</DialogTitle>
          <DialogDescription>
            Create a new webhook in a channel on this Discord server. The webhook will be used to send content from your platform to Discord.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="webhook-name">Webhook Name</Label>
            <Input
              id="webhook-name"
              placeholder="Content Publisher"
              value={webhookName}
              onChange={(e) => setWebhookName(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              This name will be displayed as the sender of messages in Discord.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="channel">Channel</Label>
            {isLoadingChannels ? (
              <div className="flex items-center justify-center h-10 bg-gray-100 rounded">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading channels...
              </div>
            ) : channelsData?.channels && channelsData.channels.length > 0 ? (
              <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a channel" />
                </SelectTrigger>
                <SelectContent>
                  {channelsData.channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      #{channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-gray-500 p-2 border rounded bg-gray-50">
                No suitable channels found. Make sure the bot has the necessary permissions.
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button 
            type="submit" 
            onClick={handleCreateWebhook}
            disabled={!webhookName || !selectedChannelId || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Webhook
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DiscordPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("webhook");
  const [botToken, setBotToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [discordMessage, setDiscordMessage] = useState("");
  const [webhookUsername, setWebhookUsername] = useState("Website User");
  const [selectedWebhookId, setSelectedWebhookId] = useState<string>("");
  
  const { data: settings, isLoading } = useQuery<IntegrationSetting[]>({
    queryKey: ['/api/discord/settings'],
  });
  
  const { data: botStatus, isLoading: isLoadingBotStatus, refetch: refetchBotStatus } = useQuery<BotStatus>({
    queryKey: ['/api/discord/bot/status'],
    refetchInterval: () => tab === "bot" ? 10000 : 0, // Only refresh status when on bot tab
  });
  
  const { data: serverData, refetch: refetchServers } = useQuery<{guilds: GuildInfo[], webhooks: WebhookInfo[]}>({
    queryKey: ['/api/discord/bot/servers'],
    enabled: tab === "bot" && botStatus?.connected === true,
    refetchInterval: () => tab === "bot" ? 30000 : 0, // Refresh every 30 seconds when on bot tab
  });
  
  // When settings are loaded, set the bot token and client ID fields
  useEffect(() => {
    if (settings) {
      const tokenSetting = settings.find(s => s.key === 'bot_token');
      const clientIdSetting = settings.find(s => s.key === 'bot_client_id');
      
      if (tokenSetting) {
        setBotToken(tokenSetting.value);
      }
      
      if (clientIdSetting) {
        setClientId(clientIdSetting.value);
      }
    }
  }, [settings]);
  
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
  
  const initializeBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/discord/bot/initialize", {
        token: botToken,
        clientId: clientId
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Bot initialized",
        description: "Discord bot has been initialized successfully.",
      });
      refetchBotStatus();
    },
    onError: (error) => {
      toast({
        title: "Bot initialization failed",
        description: error.message || "Failed to initialize Discord bot.",
        variant: "destructive",
      });
    },
  });
  
  const startBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/discord/bot/start");
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Bot started",
        description: "Discord bot has been started successfully.",
      });
      refetchBotStatus();
    },
    onError: (error) => {
      toast({
        title: "Bot start failed",
        description: error.message || "Failed to start Discord bot.",
        variant: "destructive",
      });
    },
  });
  
  const stopBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/discord/bot/stop");
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Bot stopped",
        description: "Discord bot has been stopped successfully.",
      });
      refetchBotStatus();
    },
    onError: (error) => {
      toast({
        title: "Bot stop failed",
        description: error.message || "Failed to stop Discord bot.",
        variant: "destructive",
      });
    },
  });
  
  const sendDiscordMessageMutation = useMutation({
    mutationFn: async ({ message, username, webhookId }: { message: string, username: string, webhookId?: string }) => {
      const res = await apiRequest("POST", "/api/discord/send-message", { message, username, webhookId });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Message sent",
        description: "Your message was successfully sent to Discord.",
      });
      setDiscordMessage(""); // Clear the input after successful send
    },
    onError: (error) => {
      toast({
        title: "Failed to send message",
        description: error.message || "An error occurred while sending the message to Discord.",
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
  
  const handleSendDiscordMessage = () => {
    if (discordMessage.trim()) {
      sendDiscordMessageMutation.mutate({
        message: discordMessage,
        username: webhookUsername,
        webhookId: selectedWebhookId || undefined
      });
    }
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
                <Tabs 
                  defaultValue="webhook" 
                  value={tab} 
                  onValueChange={setTab}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="webhook" className="flex items-center">
                      <Webhook className="h-4 w-4 mr-2" />
                      Webhook Integration
                    </TabsTrigger>
                    <TabsTrigger value="bot" className="flex items-center">
                      <Bot className="h-4 w-4 mr-2" />
                      Discord Bot
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Webhook Tab */}
                  <TabsContent value="webhook" className="space-y-6 mt-6">
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
                    
                    {/* Send Message to Discord */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Send Message to Discord</CardTitle>
                        <CardDescription>
                          Send a custom message directly to your Discord channel.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Webhook Selection */}
                        {(botStatus?.webhooks && botStatus.webhooks.length > 0) && (
                          <div className="grid gap-2">
                            <Label htmlFor="webhook_selection">Select Webhook</Label>
                            <Select 
                              value={selectedWebhookId} 
                              onValueChange={setSelectedWebhookId}
                            >
                              <SelectTrigger id="webhook_selection" className="w-full">
                                <SelectValue placeholder="Select a webhook" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Default webhook</SelectItem>
                                {botStatus.webhooks.map((webhook) => (
                                  <SelectItem key={webhook.id} value={webhook.id}>
                                    {webhook.guildName} / #{webhook.channelName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                              Choose which Discord server and channel to send the message to.
                            </p>
                          </div>
                        )}
                        
                        <div className="grid gap-2">
                          <Label htmlFor="webhook_username">Display Name</Label>
                          <Input
                            id="webhook_username"
                            type="text"
                            placeholder="Display name in Discord"
                            value={webhookUsername}
                            onChange={(e) => setWebhookUsername(e.target.value)}
                            className="flex-1"
                          />
                          <p className="text-xs text-gray-500">
                            The name that will appear as the sender in Discord.
                          </p>
                        </div>
                      
                        <div className="grid gap-2">
                          <Label htmlFor="discord_message">Message</Label>
                          <Input
                            id="discord_message"
                            type="text"
                            placeholder="Enter your message here..."
                            value={discordMessage}
                            onChange={(e) => setDiscordMessage(e.target.value)}
                            className="flex-1"
                          />
                          <p className="text-xs text-gray-500">
                            This message will be sent to the Discord channel associated with your webhook URL.
                          </p>
                        </div>
                        
                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={handleSendDiscordMessage}
                          disabled={!getSettingValue('webhook_url') || !discordMessage || sendDiscordMessageMutation.isPending}
                        >
                          {sendDiscordMessageMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Webhook className="mr-2 h-4 w-4" />
                              Send to Discord
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  {/* Bot Tab */}
                  <TabsContent value="bot" className="space-y-6 mt-6">
                    {/* Discord Bot Configuration */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center">
                          <Bot className="h-5 w-5 mr-2 text-[#5865F2]" />
                          Discord Bot Configuration
                        </CardTitle>
                        <CardDescription>
                          Configure your Discord bot to enable interactive commands in your server.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-2">
                          <Label htmlFor="bot_token">Bot Token</Label>
                          <div className="flex gap-2">
                            <Input
                              id="bot_token"
                              type="password"
                              placeholder="Your Discord bot token"
                              value={botToken}
                              onChange={(e) => setBotToken(e.target.value)}
                              className="flex-1"
                            />
                          </div>
                          <p className="text-xs text-gray-500">
                            Create a bot in the Discord Developer Portal and paste its token here.
                          </p>
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="bot_client_id">Application ID</Label>
                          <div className="flex gap-2">
                            <Input
                              id="bot_client_id"
                              type="text"
                              placeholder="Your Discord application ID"
                              value={clientId}
                              onChange={(e) => setClientId(e.target.value)}
                              className="flex-1"
                            />
                          </div>
                          <p className="text-xs text-gray-500">
                            The application ID from your Discord Developer Portal.
                          </p>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => initializeBotMutation.mutate()}
                            disabled={!botToken || !clientId || initializeBotMutation.isPending}
                          >
                            {initializeBotMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Initializing...
                              </>
                            ) : (
                              <>
                                <Shield className="mr-2 h-4 w-4" />
                                Initialize Bot
                              </>
                            )}
                          </Button>
                          
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => startBotMutation.mutate()}
                            disabled={startBotMutation.isPending}
                          >
                            {startBotMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Starting...
                              </>
                            ) : (
                              <>
                                <SiDiscord className="mr-2 h-4 w-4" />
                                Start Bot
                              </>
                            )}
                          </Button>
                          
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => stopBotMutation.mutate()}
                            disabled={stopBotMutation.isPending || !botStatus?.connected}
                          >
                            {stopBotMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Stopping...
                              </>
                            ) : (
                              <>
                                <PowerOff className="mr-2 h-4 w-4" />
                                Stop Bot
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* Bot Status */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Bot Status</CardTitle>
                        <CardDescription>
                          Current status of your Discord bot connection and available commands.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isLoadingBotStatus ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                              <div className="flex items-center">
                                <div className={`h-3 w-3 rounded-full mr-3 ${botStatus?.connected ? 'bg-green-500' : 'bg-gray-400'}`} />
                                <div>
                                  <p className="font-medium">{botStatus?.connected ? 'Connected' : 'Disconnected'}</p>
                                  <p className="text-sm text-gray-500">{botStatus?.status}</p>
                                </div>
                              </div>
                              {botStatus?.connected && (
                                <div className="text-right">
                                  <p className="font-medium">{botStatus.username}</p>
                                  <p className="text-sm text-gray-500">Servers: {botStatus.guilds || 0}</p>
                                </div>
                              )}
                            </div>
                            
                            <div>
                              <h3 className="text-sm font-medium mb-2">Available Commands</h3>
                              <div className="bg-gray-900 text-gray-100 p-3 rounded-md font-mono text-sm">
                                <div className="flex items-center">
                                  <Terminal className="h-4 w-4 mr-2 text-green-400" />
                                  <span className="text-green-400">/ping</span>
                                  <span className="ml-3 text-gray-400">Check the bot's response time</span>
                                </div>
                              </div>
                            </div>
                            
                            {botStatus?.connected && ((serverData?.guilds && serverData.guilds.length > 0) || (botStatus.guildsList && botStatus.guildsList.length > 0)) && (
                              <div className="mt-6">
                                <div className="flex justify-between items-center mb-2">
                                  <h3 className="text-sm font-medium">Connected Servers</h3>
                                  <AddBotToServerButton />
                                </div>
                                <div className="border rounded-md overflow-hidden">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Members</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {(serverData?.guilds || botStatus.guildsList || []).map((guild) => (
                                        <tr key={guild.id}>
                                          <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex items-center">
                                              {guild.icon && (
                                                <img 
                                                  src={guild.icon} 
                                                  alt={guild.name} 
                                                  className="h-6 w-6 rounded-full mr-3"
                                                />
                                              )}
                                              <span className="text-sm font-medium text-gray-900">{guild.name}</span>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                            {guild.memberCount}
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${guild.owner ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                              {guild.owner ? 'Admin Access' : 'Limited Access'}
                                            </span>
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap text-right">
                                            <CreateWebhookDialog serverId={guild.id} serverName={guild.name} />
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            
                            {botStatus?.connected && ((serverData?.webhooks && serverData.webhooks.length > 0) || (botStatus.webhooks && botStatus.webhooks.length > 0)) && (
                              <div className="mt-6">
                                <h3 className="text-sm font-medium mb-2">Webhook Connections</h3>
                                <div className="border rounded-md overflow-hidden">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {(serverData?.webhooks || botStatus.webhooks || []).map((webhook) => (
                                        <tr key={webhook.id}>
                                          <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex items-center">
                                              <span className="text-sm font-medium text-gray-900">{webhook.name}</span>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                            {webhook.guildName}
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                            #{webhook.channelName}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            
                            <div className="mt-6">
                              <h3 className="text-sm font-medium mb-2">Add Bot to Server</h3>
                              <AddBotToServerButton />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
                
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
                        <h3 className="text-sm font-medium">Step 1: Create Discord Application</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Discord Developer Portal</a>, 
                          create a new application, and add a bot to it. Copy your bot token and application ID.
                        </p>
                      </div>
                      
                      <Separator />
                      
                      <div>
                        <h3 className="text-sm font-medium">Step 2: Set Up Webhook</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          In your Discord server, go to Server Settings → Integrations → Webhooks → Create Webhook.
                          Copy the webhook URL and paste it in the webhook configuration tab.
                        </p>
                      </div>
                      
                      <Separator />
                      
                      <div>
                        <h3 className="text-sm font-medium">Step 3: Add Bot to Your Server</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Use the OAuth2 URL Generator in the Discord Developer Portal to generate an invite link for your bot,
                          then add it to your server. Make sure to give it the necessary permissions.
                        </p>
                      </div>
                      
                      <Separator />
                      
                      <div>
                        <h3 className="text-sm font-medium">Step 4: Initialize and Test</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Enter your bot token and application ID, initialize the bot, and test the commands in your Discord server.
                          Try the <span className="font-mono text-xs bg-gray-100 px-1 rounded">/ping</span> command to verify it's working.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="bg-gray-50 border-t">
                    <div className="flex space-x-4">
                      <a 
                        href="https://discord.com/developers/docs/resources/webhook" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm flex items-center"
                      >
                        <Webhook className="h-4 w-4 mr-1" />
                        Webhook Docs
                      </a>
                      <a 
                        href="https://discord.com/developers/docs/intro" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm flex items-center"
                      >
                        <Bot className="h-4 w-4 mr-1" />
                        Bot Docs
                      </a>
                    </div>
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

// Component for the Add Bot to Server button
function AddBotToServerButton() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  
  const getInviteUrl = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("GET", "/api/discord/bot/invite-url");
      const data = await response.json();
      
      if (data.success && data.invite_url) {
        setInviteUrl(data.invite_url);
        window.open(data.invite_url, '_blank');
      } else {
        toast({
          title: "Error",
          description: "Could not generate bot invite URL. Please check if the bot client ID is configured correctly.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate bot invite URL. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="flex flex-col space-y-2">
      <p className="text-sm text-gray-500">
        Add the bot to your Discord server to enable automatic commands and article management.
      </p>
      <div className="flex items-center space-x-2">
        <Button 
          variant="outline" 
          onClick={getInviteUrl}
          disabled={isLoading}
          className="flex items-center"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating invite...
            </>
          ) : (
            <>
              <UserPlus className="mr-2 h-4 w-4" />
              Add to Discord Server
            </>
          )}
        </Button>
        {inviteUrl && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(inviteUrl);
              toast({
                title: "Copied",
                description: "Invite URL copied to clipboard",
              });
            }}
            className="text-xs"
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy URL
          </Button>
        )}
      </div>
    </div>
  );
}
