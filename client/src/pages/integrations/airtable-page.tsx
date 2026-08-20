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
import { SiAirtable } from "react-icons/si";
import {
  editableValue,
  isConfigured as settingIsConfigured,
  isRedacted,
  type MaybeRedactedSetting,
} from "./redacted-setting";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Database,
  ShieldCheck,
  Server,
  Users,
  Newspaper,
  Quote
} from "lucide-react";

const tableFields = [
  { key: 'articles_table', label: 'Articles Table', placeholder: 'e.g. Articles or tblArticles123' },
  { key: 'team_members_table', label: 'Team Members Table', placeholder: 'e.g. Team Members or tblTeam123' },
  { key: 'quotes_table', label: 'Carousel Quotes Table', placeholder: 'e.g. Quotes or tblQuotes123' },
] as const;

export default function AirtablePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("settings");
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    success?: boolean;
    message?: string;
    base?: { id: string; name: string; permissionLevel: string };
    error?: string;
  } | null>(null);
  // Edits are held here until saved. Binding the inputs straight to the query
  // data used to fire a write on every keystroke, storing partial keys.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: settings, isLoading } = useQuery<MaybeRedactedSetting[]>({
    queryKey: ['/api/airtable/settings'],
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      setTestingConnection(true);
      setConnectionStatus(null);
      const res = await apiRequest("GET", "/api/airtable/test-connection");
      return await res.json();
    },
    onSuccess: (data) => {
      setConnectionStatus(data);
      if (data.success) {
        toast({
          title: "Connection successful",
          description: `Successfully connected to Airtable base: ${data.base?.name}`,
        });
      } else {
        toast({
          title: "Connection failed",
          description: data.message || "Failed to connect to Airtable.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      setConnectionStatus({
        success: false,
        message: error.message || "Failed to test connection to Airtable."
      });
      toast({
        title: "Connection test failed",
        description: error.message || "Failed to test connection to Airtable.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setTestingConnection(false);
    }
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, enabled }: { key: string; value: string; enabled?: boolean }) => {
      const res = await apiRequest("POST", "/api/airtable/settings", { key, value, enabled });
      return await res.json();
    },
    onSuccess: (_data, { key }) => {
      // Drop the draft so the field falls back to what the server now reports.
      setDrafts(prev => {
        const { [key]: _saved, ...rest } = prev;
        return rest;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/airtable/settings'] });
      toast({
        title: "Settings updated",
        description: "The Airtable integration settings have been updated successfully.",
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

  const syncMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await apiRequest("POST", `/api/airtable/sync/${type}`);
      return await res.json();
    },
    onSuccess: (data) => {
      const results = data?.results || { created: 0, updated: 0, errors: 0, details: [] };
      const message = data?.message || "Sync completed";
      toast({
        title: message,
        description: `${results.created} created, ${results.updated} updated, ${results.errors} errors.`,
        variant: results.errors > 0 ? "destructive" : undefined,
      });
    },
    onError: (error) => {
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync data from Airtable.",
        variant: "destructive",
      });
    },
  });

  const updateApiKeyFromEnvMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/airtable/update-api-key");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/airtable/settings'] });
      toast({
        title: "API Key Updated",
        description: "Successfully updated Airtable API key from environment variable",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update API Key",
        description: error.message || "Could not update Airtable API key from environment variable",
        variant: "destructive",
      });
    },
  });

  const getSetting = (key: string): MaybeRedactedSetting | undefined =>
    settings?.find(s => s.key === key);

  /** What the input shows: the pending edit, else the value we may safely echo. */
  const getDraft = (key: string): string =>
    drafts[key] ?? editableValue(getSetting(key));

  const getSettingEnabled = (key: string): boolean => getSetting(key)?.enabled ?? true;

  const handleDraftChange = (key: string, value: string) => {
    setDrafts(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = (key: string) => {
    const value = getDraft(key);
    if (!value) return;
    updateSettingMutation.mutate({ key, value, enabled: getSettingEnabled(key) });
  };

  /**
   * The save endpoint requires a value, so flipping `enabled` means resending
   * one. For a masked secret we do not have the real value — resending what the
   * server gave us would overwrite the credential with bullet characters.
   */
  const canToggleEnabled = (key: string): boolean =>
    !isRedacted(getSetting(key)) || Boolean(drafts[key]);

  const handleToggleEnabled = (key: string, enabled: boolean) => {
    if (!canToggleEnabled(key)) return;
    updateSettingMutation.mutate({ key, value: getDraft(key), enabled });
  };

  const handleSync = (type: string) => {
    syncMutation.mutate(type);
  };

  // Check if core settings are configured
  const hasApiKey = settingIsConfigured(getSetting('api_key'));
  const hasBaseId = settingIsConfigured(getSetting('base_id'));
  const hasBasicConfig = hasApiKey && hasBaseId;

  // Determine connection status based on test results and config
  const isConfigured = connectionStatus?.success === true || hasBasicConfig;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Airtable Integration" />
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
                  <span className="text-gray-900">Airtable</span>
                </li>
              </ol>
            </nav>

            {/* Page Header */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                <SiAirtable className="h-8 w-8 text-[#3074D8] mr-3" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Airtable Integration</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Sync content between your platform and Airtable.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {isConfigured ? (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-5 w-5 mr-1" />
                    <span className="text-sm font-medium">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center text-amber-600">
                    <AlertCircle className="h-5 w-5 mr-1" />
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
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                    <TabsTrigger value="sync">Sync Data</TabsTrigger>
                  </TabsList>

                  <TabsContent value="settings" className="space-y-6 mt-6">
                    {/* Airtable API Configuration */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Airtable API Configuration</CardTitle>
                        <CardDescription>
                          Configure your Airtable API credentials to connect to your base.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-2">
                          <Label htmlFor="api_key">API Key</Label>
                          <div className="flex gap-2">
                            <Input
                              id="api_key"
                              type="password"
                              placeholder={
                                settingIsConfigured(getSetting('api_key'))
                                  ? `Saved (${getSetting('api_key')?.value}) — type to replace`
                                  : "Your Airtable API key"
                              }
                              value={getDraft('api_key')}
                              onChange={(e) => handleDraftChange('api_key', e.target.value)}
                              aria-describedby="api_key_help"
                              className="flex-1"
                            />
                            <Button
                              onClick={() => handleSave('api_key')}
                              disabled={!drafts.api_key || updateSettingMutation.isPending}
                            >
                              Save
                            </Button>
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={getSettingEnabled('api_key')}
                                disabled={!canToggleEnabled('api_key')}
                                aria-label="Enable Airtable API key"
                                onCheckedChange={(checked) => handleToggleEnabled('api_key', checked)}
                              />
                              <span className="text-sm text-gray-500">
                                {getSettingEnabled('api_key') ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <p id="api_key_help" className="text-xs text-gray-500">
                              {settingIsConfigured(getSetting('api_key'))
                                ? "A key is stored. Only its last four characters are shown; enter a new key to replace it."
                                : "You can find your API key in your Airtable account settings."}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => updateApiKeyFromEnvMutation.mutate()}
                              disabled={updateApiKeyFromEnvMutation.isPending}
                            >
                              {updateApiKeyFromEnvMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                  Updating...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-2 h-3 w-3" />
                                  Update from ENV
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="base_id">Base ID</Label>
                          <div className="flex gap-2">
                            <Input
                              id="base_id"
                              type="text"
                              placeholder="Your Airtable base ID"
                              value={getDraft('base_id')}
                              onChange={(e) => handleDraftChange('base_id', e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              onClick={() => handleSave('base_id')}
                              disabled={!drafts.base_id || updateSettingMutation.isPending}
                            >
                              Save
                            </Button>
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={getSettingEnabled('base_id')}
                                disabled={!canToggleEnabled('base_id')}
                                aria-label="Enable Airtable base ID"
                                onCheckedChange={(checked) => handleToggleEnabled('base_id', checked)}
                              />
                              <span className="text-sm text-gray-500">
                                {getSettingEnabled('base_id') ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">
                            The Base ID can be found in the URL of your Airtable base: airtable.com/{hasBaseId ? 'tbl...' : '[base_id]/tbl...'}
                          </p>
                        </div>
                      </CardContent>
                      <CardFooter className="flex flex-col items-start gap-4">
                        <div className="w-full">
                          <Button
                            onClick={() => testConnectionMutation.mutate()}
                            disabled={testingConnection || !hasApiKey || !hasBaseId}
                            variant="outline"
                            className="w-full sm:w-auto"
                          >
                            {testingConnection ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Testing Connection...
                              </>
                            ) : (
                              <>
                                <Server className="mr-2 h-4 w-4" />
                                Test Connection
                              </>
                            )}
                          </Button>
                        </div>

                        {connectionStatus && (
                          <div className={`w-full p-4 rounded-md border ${connectionStatus.success
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                            <div className="flex items-center">
                              {connectionStatus.success ? (
                                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                              ) : (
                                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                              )}
                              <h5 className="text-sm font-medium">
                                {connectionStatus.success
                                  ? 'Connection Successful'
                                  : 'Connection Failed'}
                              </h5>
                            </div>
                            <p className="text-sm mt-1">
                              {connectionStatus.message}
                            </p>
                            {connectionStatus.success && connectionStatus.base && (
                              <div className="mt-2 text-xs">
                                <div><strong>Base Name:</strong> {connectionStatus.base.name}</div>
                                <div><strong>Permission Level:</strong> {connectionStatus.base.permissionLevel}</div>
                              </div>
                            )}
                            {connectionStatus.error && (
                              <div className="mt-2 text-xs bg-red-100 p-2 rounded">
                                <strong>Error Details:</strong> {connectionStatus.error}
                              </div>
                            )}
                          </div>
                        )}
                      </CardFooter>
                    </Card>

                    {/* Table Configuration */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Table Configuration</CardTitle>
                        <CardDescription>
                          Specify the table names in your Airtable base for each content type.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {tableFields.map(({ key, label, placeholder }) => (
                          <div className="grid gap-2" key={key}>
                            <Label htmlFor={key}>{label}</Label>
                            <div className="flex gap-2">
                              <Input
                                id={key}
                                type="text"
                                placeholder={placeholder}
                                value={getDraft(key)}
                                onChange={(e) => handleDraftChange(key, e.target.value)}
                                className="flex-1"
                              />
                              <Button
                                onClick={() => handleSave(key)}
                                disabled={!drafts[key] || updateSettingMutation.isPending}
                              >
                                Save
                              </Button>
                              <div className="flex items-center space-x-2">
                                <Switch
                                  checked={getSettingEnabled(key)}
                                  aria-label={`Enable ${label}`}
                                  onCheckedChange={(checked) => handleToggleEnabled(key, checked)}
                                />
                                <span className="text-sm text-gray-500">
                                  {getSettingEnabled(key) ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="sync" className="space-y-6 mt-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Data Synchronization</CardTitle>
                        <CardDescription>
                          Sync data between your platform and Airtable.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {!hasBasicConfig ? (
                          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800">
                            <div className="flex items-center">
                              <AlertCircle className="h-5 w-5 mr-2" />
                              <span className="font-medium">Configuration Required</span>
                            </div>
                            <p className="mt-1 text-sm">
                              Please configure your Airtable API key and Base ID in the Settings tab before syncing data.
                            </p>
                          </div>
                        ) : connectionStatus?.success === false ? (
                          <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-800">
                            <div className="flex items-center">
                              <AlertCircle className="h-5 w-5 mr-2" />
                              <span className="font-medium">Connection Failed</span>
                            </div>
                            <p className="mt-1 text-sm">
                              Please check your Airtable credentials and test the connection in the Settings tab before syncing data.
                            </p>
                          </div>
                        ) : (
                          <>
                            {/* Articles Sync */}
                            <div className="flex items-center justify-between p-4 border rounded-md">
                              <div className="flex items-center">
                                <div className="bg-blue-100 p-3 rounded-full mr-4">
                                  <Newspaper className="h-6 w-6 text-blue-600" />
                                </div>
                                <div>
                                  <h3 className="font-medium">Articles</h3>
                                  <p className="text-sm text-gray-500">
                                    Sync articles from Airtable to your platform
                                  </p>
                                </div>
                              </div>
                              <Button
                                onClick={() => handleSync('articles')}
                                disabled={
                                  syncMutation.isPending ||
                                  !getSettingEnabled('articles_table') ||
                                  !getSetting('articles_table')?.value
                                }
                              >
                                {syncMutation.isPending && syncMutation.variables === 'articles' ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Syncing...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Sync Now
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Team Members Sync */}
                            <div className="flex items-center justify-between p-4 border rounded-md">
                              <div className="flex items-center">
                                <div className="bg-green-100 p-3 rounded-full mr-4">
                                  <Users className="h-6 w-6 text-green-600" />
                                </div>
                                <div>
                                  <h3 className="font-medium">Team Members</h3>
                                  <p className="text-sm text-gray-500">
                                    Sync team member profiles from Airtable
                                  </p>
                                </div>
                              </div>
                              <Button
                                onClick={() => handleSync('team-members')}
                                disabled={
                                  syncMutation.isPending ||
                                  !getSettingEnabled('team_members_table') ||
                                  !getSetting('team_members_table')?.value
                                }
                              >
                                {syncMutation.isPending && syncMutation.variables === 'team-members' ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Syncing...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Sync Now
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Carousel Quotes Sync */}
                            <div className="flex items-center justify-between p-4 border rounded-md">
                              <div className="flex items-center">
                                <div className="bg-purple-100 p-3 rounded-full mr-4">
                                  <Quote className="h-6 w-6 text-purple-600" />
                                </div>
                                <div>
                                  <h3 className="font-medium">Carousel Quotes</h3>
                                  <p className="text-sm text-gray-500">
                                    Sync carousel quotes from Airtable
                                  </p>
                                </div>
                              </div>
                              <Button
                                onClick={() => handleSync('carousel-quotes')}
                                disabled={
                                  syncMutation.isPending ||
                                  !getSettingEnabled('quotes_table') ||
                                  !getSetting('quotes_table')?.value
                                }
                              >
                                {syncMutation.isPending && syncMutation.variables === 'carousel-quotes' ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Syncing...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Sync Now
                                  </>
                                )}
                              </Button>
                            </div>
                          </>
                        )}
                      </CardContent>
                      <CardFooter className="bg-gray-50 border-t text-sm">
                        <p className="text-gray-500">
                          Note: Syncing will merge data from Airtable with your platform, creating or updating records as needed.
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
