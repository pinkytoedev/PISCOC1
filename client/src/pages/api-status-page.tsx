import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export default function ApiStatusPage() {
  const { toast } = useToast();
  
  const { 
    data, 
    isLoading, 
    error, 
    refetch,
    isRefetching 
  } = useQuery<ApiStatusResponse>({
    queryKey: ['/api/status'],
    refetchInterval: 60000, // Refetch every minute
  });

  useEffect(() => {
    if (error) {
      toast({
        title: "Error fetching API status",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  // Status badge colors and icons
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <Layout title="API Status Dashboard">
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
                <span className="text-gray-900">API Status</span>
              </div>
            </li>
          </ol>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">API Status Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              Monitor the health and availability of all connected integrations and services.
            </p>
          </div>
          <Button 
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            variant="outline"
            className="flex items-center gap-2 w-full md:w-auto"
          >
            {isRefetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh Status
          </Button>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : data ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>System Overview</CardTitle>
                <CardDescription>
                  Last Updated: {formatDate(data.timestamp)}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.statuses.map((api, index) => (
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
                <CardTitle>Status Details</CardTitle>
                <CardDescription>
                  Detailed information about each API integration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.statuses.map((api, index) => (
                    <div key={index} className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 last:border-0">
                      <div>
                        <h3 className="font-medium text-lg">{api.name}</h3>
                        <p className="text-sm text-gray-500">
                          Status: {api.status} • Last checked: {formatDate(api.lastChecked)}
                        </p>
                        {api.message && (
                          <p className="mt-1 text-sm text-red-600">{api.message}</p>
                        )}
                      </div>
                      <div className="mt-2 sm:mt-0">
                        {getStatusBadge(api.status)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-gray-500">
                <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-xl font-medium">Unable to fetch API status</h3>
                <p className="mt-2">Please try again later or contact support.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}