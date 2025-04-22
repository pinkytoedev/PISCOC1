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
  AlertTriangle,
  Eye
} from "lucide-react";
import { ActivityLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { AdminRequestModal } from "@/components/modals/admin-request-modal";

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
  category: 'Pinkytoe' | 'PISCOC' | 'Misc';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdBy: string;
  userId: number | null;
  createdAt: string;
  updatedAt: string | null;
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
  const [selectedAdminRequest, setSelectedAdminRequest] = useState<AdminRequest | null>(null);
  const [adminRequestModalOpen, setAdminRequestModalOpen] = useState(false);

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
  
  // Fetch admin requests
  const {
    data: adminRequests,
    isLoading: isAdminRequestsLoading,
    error: adminRequestsError,
    refetch: refetchAdminRequests,
    isRefetching: isAdminRequestsRefetching
  } = useQuery<AdminRequest[]>({
    queryKey: ['/api/admin-requests'],
    refetchInterval: 60000, // Refetch every minute
  });
  
  // Handle opening an admin request
  const handleViewAdminRequest = (request: AdminRequest) => {
    setSelectedAdminRequest(request);
    setAdminRequestModalOpen(true);
  };

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
    
    if (adminRequestsError) {
      toast({
        title: "Error fetching admin requests",
        description: adminRequestsError instanceof Error ? adminRequestsError.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  }, [statusError, logsError, adminRequestsError, toast]);

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

  // Urgency badge renderer
  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return <Badge variant="destructive" className="bg-red-600">Critical</Badge>;
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'medium':
        return <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600">Medium</Badge>;
      case 'low':
      default:
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-200">Low</Badge>;
    }
  };

  // Category badge renderer
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'Pinkytoe':
        return <Badge variant="default" className="bg-pink-500 hover:bg-pink-600">Pinkytoe</Badge>;
      case 'PISCOC':
        return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">PISCOC</Badge>;
      case 'Misc':
      default:
        return <Badge variant="outline" className="bg-gray-200 text-gray-800 hover:bg-gray-300">Misc</Badge>;
    }
  };

  // Status badge renderer for admin requests
  const getRequestStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <Badge className="bg-green-600 hover:bg-green-700">Resolved</Badge>;
      case 'closed':
        return <Badge className="bg-gray-600 hover:bg-gray-700">Closed</Badge>;
      case 'in-progress':
        return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">In Progress</Badge>;
      case 'open':
      default:
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Open</Badge>;
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
                refetchAdminRequests();
              }}
              disabled={isStatusLoading || isStatusRefetching || isLogsLoading || isLogsRefetching || isAdminRequestsLoading || isAdminRequestsRefetching}
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
                    <CardTitle>Closed Requests</CardTitle>
                    <CardDescription>
                      Admin requests that have been resolved or closed
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isAdminRequestsLoading ? (
                      <div className="flex items-center justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : adminRequests && adminRequests.filter(r => r.status === 'resolved' || r.status === 'closed').length > 0 ? (
                      <div className="space-y-4">
                        {adminRequests
                          .filter(request => request.status === 'resolved' || request.status === 'closed')
                          .map((request) => (
                            <div 
                              key={request.id} 
                              className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 last:border-0 hover:bg-muted/50 cursor-pointer p-2 rounded-md"
                              onClick={() => handleViewAdminRequest(request)}
                            >
                              <div>
                                <h3 className="font-medium">{request.title}</h3>
                                <p className="text-sm text-gray-500">
                                  {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })} • 
                                  {request.updatedAt && `Updated ${formatDistanceToNow(new Date(request.updatedAt), { addSuffix: true })}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                                {getCategoryBadge(request.category)}
                                {getRequestStatusBadge(request.status)}
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-4">No closed requests found</p>
                    )}
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
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Admin Requests</CardTitle>
                  <CardDescription>
                    Track and manage requests submitted via Discord or Web interface
                  </CardDescription>
                </div>
                <Button 
                  onClick={() => refetchAdminRequests()}
                  disabled={isAdminRequestsLoading || isAdminRequestsRefetching}
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-2"
                >
                  {isAdminRequestsRefetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {isAdminRequestsLoading ? (
                  <div className="flex items-center justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : adminRequests && adminRequests.length > 0 ? (
                  <div className="rounded-md border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="py-3 px-4 text-left font-medium">Title</th>
                            <th className="py-3 px-4 text-left font-medium">Category</th>
                            <th className="py-3 px-4 text-left font-medium">Urgency</th>
                            <th className="py-3 px-4 text-left font-medium">Status</th>
                            <th className="py-3 px-4 text-left font-medium">Created</th>
                            <th className="py-3 px-4 text-left font-medium">Source</th>
                            <th className="py-3 px-4 text-right font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {adminRequests.map((request) => (
                            <tr 
                              key={request.id} 
                              className="hover:bg-muted/50 cursor-pointer" 
                              onClick={() => handleViewAdminRequest(request)}
                            >
                              <td className="py-3 px-4 font-medium">{request.title}</td>
                              <td className="py-3 px-4">{getCategoryBadge(request.category)}</td>
                              <td className="py-3 px-4">{getUrgencyBadge(request.urgency)}</td>
                              <td className="py-3 px-4">{getRequestStatusBadge(request.status)}</td>
                              <td className="py-3 px-4 text-gray-500">{formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}</td>
                              <td className="py-3 px-4 text-gray-500 capitalize">{request.createdBy}</td>
                              <td className="py-3 px-4 text-right">
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewAdminRequest(request);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <div className="p-6 text-center">
                      <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium">No admin requests found</h3>
                      <p className="mt-2 text-sm text-gray-500">
                        Admin requests submitted via Discord or web will appear here.
                      </p>
                    </div>
                  </div>
                )}
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
      
      {/* Admin Request Modal */}
      <AdminRequestModal 
        isOpen={adminRequestModalOpen} 
        onClose={() => setAdminRequestModalOpen(false)} 
        request={selectedAdminRequest}
      />
    </Layout>
  );
}