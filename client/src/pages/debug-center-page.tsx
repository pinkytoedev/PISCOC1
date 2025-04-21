import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  GitBranch, 
  GitCommit, 
  List, 
  MessageSquare, 
  FileText, 
  AlertTriangle
} from "lucide-react";
import { ActivityLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface ApiStatus {
  name: string;
  status: 'online' | 'offline' | 'unknown';
  message?: string;
  lastChecked: string;
}

interface ApiStatusResponse {
  statuses: ApiStatus[];
  timestamp: string;
}

interface AdminRequest {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
}

interface PatchNote {
  version: string;
  date: string;
  title: string;
  description: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement' | 'breaking';
    description: string;
  }[];
}

// Sample patch notes data - this would typically come from an API
const patchNotes: PatchNote[] = [
  {
    version: "1.2.0",
    date: "2025-04-15",
    title: "April Feature Update",
    description: "This update brings major improvements to the Instagram integration and fixes several critical issues.",
    changes: [
      { type: "feature", description: "Added Instagram story analytics dashboard" },
      { type: "feature", description: "Implemented automated content scheduling for Instagram" },
      { type: "improvement", description: "Enhanced user interface for mobile devices" },
      { type: "fix", description: "Fixed issue with Airtable synchronization failing for large datasets" },
      { type: "fix", description: "Resolved Discord notification delay problem" }
    ]
  },
  {
    version: "1.1.5",
    date: "2025-03-30",
    title: "March Maintenance Update",
    description: "Focused on stability improvements and bug fixes",
    changes: [
      { type: "improvement", description: "Optimized database queries for faster performance" },
      { type: "improvement", description: "Reduced API call frequency to prevent rate limiting" },
      { type: "fix", description: "Fixed critical authentication issue affecting some users" },
      { type: "fix", description: "Addressed image upload failures with certain file types" }
    ]
  },
  {
    version: "1.1.0",
    date: "2025-03-10",
    title: "Discord Integration Enhancement",
    description: "Major improvements to the Discord integration capabilities",
    changes: [
      { type: "feature", description: "Added multi-channel support for Discord integration" },
      { type: "feature", description: "Implemented role-based message targeting" },
      { type: "improvement", description: "Enhanced webhook management interface" },
      { type: "breaking", description: "Updated Discord API integration (requires reconfiguration)" }
    ]
  }
];

export default function DebugCenterPage() {
  const { toast } = useToast();

  // Fetch API status
  const { 
    data: statusData, 
    isLoading: isStatusLoading, 
    error: statusError, 
    refetch: refetchStatus,
    isRefetching: isStatusRefetching 
  } = useQuery<ApiStatusResponse>({
    queryKey: ['/api/status'],
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch activity logs
  const {
    data: activityLogs,
    isLoading: isLogsLoading,
    error: logsError,
    refetch: refetchLogs,
    isRefetching: isLogsRefetching
  } = useQuery<ActivityLog[]>({
    queryKey: ['/api/activity-logs'],
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  useEffect(() => {
    if (statusError) {
      toast({
        title: "Error fetching API status",
        description: statusError instanceof Error ? statusError.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
    
    if (logsError) {
      toast({
        title: "Error fetching activity logs",
        description: logsError instanceof Error ? logsError.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  }, [statusError, logsError, toast]);

  // Format date strings
  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Status badge renderer
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-green-600 hover:bg-green-700">
          <CheckCircle className="h-4 w-4 mr-1" /> Online
        </Badge>;
      case 'offline':
        return <Badge variant="destructive">
          <XCircle className="h-4 w-4 mr-1" /> Offline
        </Badge>;
      case 'unknown':
      default:
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
          <AlertCircle className="h-4 w-4 mr-1" /> Unknown
        </Badge>;
    }
  };

  // Priority badge renderer
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'medium':
        return <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600">Medium</Badge>;
      case 'low':
      default:
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-200">Low</Badge>;
    }
  };

  // Status badge renderer for admin requests
  const getRequestStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-600 hover:bg-green-700">Completed</Badge>;
      case 'in-progress':
        return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">In Progress</Badge>;
      case 'pending':
      default:
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Pending</Badge>;
    }
  };

  // Change type badge renderer
  const getChangeTypeBadge = (type: string) => {
    switch (type) {
      case 'feature':
        return <Badge className="bg-green-600 hover:bg-green-700">New Feature</Badge>;
      case 'improvement':
        return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">Improvement</Badge>;
      case 'fix':
        return <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600">Fix</Badge>;
      case 'breaking':
        return <Badge variant="destructive">Breaking Change</Badge>;
      default:
        return <Badge variant="outline">Other</Badge>;
    }
  };

  return (
    <Layout title="Debug Center">
      <div className="container mx-auto py-6 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex mb-5" aria-label="Breadcrumb">
          <ol className="inline-flex items-center space-x-1 md:space-x-3">
            <li className="inline-flex items-center">
              <a href="/" className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-primary">
                Dashboard
              </a>
            </li>
            <li>
              <div className="flex items-center">
                <span className="mx-2 text-gray-400">/</span>
                <span className="text-gray-900">Debug Center</span>
              </div>
            </li>
          </ol>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Debug Center</h1>
            <p className="mt-1 text-sm text-gray-500">
              Monitor system health, track issues, and view patch notes
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => {
                refetchStatus();
                refetchLogs();
              }}
              disabled={isStatusLoading || isStatusRefetching || isLogsLoading || isLogsRefetching}
              variant="outline"
              className="flex items-center gap-2"
            >
              {(isStatusRefetching || isLogsRefetching) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh Data
            </Button>
          </div>
        </div>
        
        <Tabs defaultValue="system-status" className="space-y-4">
          <TabsList className="grid grid-cols-1 md:grid-cols-4 h-auto">
            <TabsTrigger value="system-status" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>System Status</span>
            </TabsTrigger>
            <TabsTrigger value="admin-requests" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span>Admin Requests</span>
            </TabsTrigger>
            <TabsTrigger value="patch-notes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Patch Notes</span>
            </TabsTrigger>
            <TabsTrigger value="github" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>GitHub Repository</span>
            </TabsTrigger>
          </TabsList>
          
          {/* System Status Tab */}
          <TabsContent value="system-status" className="space-y-4">
            {isStatusLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : statusData ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>System Overview</CardTitle>
                    <CardDescription>
                      Last Updated: {formatDate(statusData.timestamp)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {statusData.statuses.map((api, index) => (
                        <Card key={index} className="shadow-sm">
                          <CardHeader className="pb-3">
                            <div className="flex justify-between items-center">
                              <CardTitle className="text-base">{api.name}</CardTitle>
                              {getStatusBadge(api.status)}
                            </div>
                          </CardHeader>
                          <CardContent className="text-sm text-gray-500">
                            <p>Last checked: {formatDate(api.lastChecked)}</p>
                            {api.message && (
                              <p className="mt-2 text-red-600">{api.message}</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity Logs</CardTitle>
                    <CardDescription>
                      System activity and potential error indicators
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLogsLoading ? (
                      <div className="flex items-center justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : activityLogs && activityLogs.length > 0 ? (
                      <div className="space-y-4">
                        {activityLogs.slice(0, 10).map((log, index) => (
                          <div key={index} className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 last:border-0">
                            <div>
                              <h3 className="font-medium">
                                {log.action.charAt(0).toUpperCase() + log.action.slice(1)} {log.resourceType.replace('_', ' ')}
                              </h3>
                              <p className="text-sm text-gray-500">
                                {typeof log.timestamp === 'string' 
                                  ? formatDistanceToNow(new Date(log.timestamp), { addSuffix: true }) 
                                  : "Unknown time"} • 
                                User ID: {log.userId || 'System'}
                              </p>
                            </div>
                            <div className="mt-2 sm:mt-0">
                              <Badge variant="outline">ID: {log.resourceId}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-4">No recent activity logs found</p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center text-gray-500">
                    <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-xl font-medium">Unable to fetch system status</h3>
                    <p className="mt-2">Please try refreshing or contact support.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          {/* Admin Requests Tab */}
          <TabsContent value="admin-requests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Admin Requests</CardTitle>
                <CardDescription>
                  Track and manage pending request from administrators
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <div className="grid grid-cols-1 divide-y">
                    <div className="p-4 text-center">
                      <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium">Admin Request Feature Coming Soon</h3>
                      <p className="mt-2 text-sm text-gray-500">
                        This feature is currently in development. Check back later.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Patch Notes Tab */}
          <TabsContent value="patch-notes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Patch Notes</CardTitle>
                <CardDescription>
                  History of system updates and changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {patchNotes.map((patch, index) => (
                    <div key={index} className={`border-b pb-6 ${index === patchNotes.length - 1 ? 'border-none' : ''}`}>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                        <div>
                          <h3 className="text-lg font-medium">
                            {patch.title} <span className="text-sm font-normal text-gray-500">v{patch.version}</span>
                          </h3>
                          <p className="text-sm text-gray-500">{patch.date}</p>
                        </div>
                        {index === 0 && (
                          <Badge className="mt-2 sm:mt-0 bg-purple-600 hover:bg-purple-700">Latest</Badge>
                        )}
                      </div>
                      <p className="text-gray-700 mb-4">{patch.description}</p>
                      <div className="space-y-2">
                        {patch.changes.map((change, changeIndex) => (
                          <div key={changeIndex} className="flex gap-2 items-start">
                            <div className="pt-0.5">
                              {getChangeTypeBadge(change.type)}
                            </div>
                            <p>{change.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* GitHub Repository Tab */}
          <TabsContent value="github" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>GitHub Repository</CardTitle>
                <CardDescription>
                  Connect to and view project repository
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border p-6">
                  <div className="flex flex-col items-center text-center">
                    <GitBranch className="h-12 w-12 text-gray-500 mb-4" />
                    <h3 className="text-lg font-medium">Repository Information</h3>
                    <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
                      This panel will display information from your GitHub repository, including recent commits, 
                      open issues, and pull requests. To connect your repository, configure GitHub integration 
                      settings.
                    </p>
                    <div className="mt-6">
                      <Button variant="outline" className="flex items-center gap-2">
                        <GitCommit className="h-4 w-4" />
                        Configure GitHub Integration
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}