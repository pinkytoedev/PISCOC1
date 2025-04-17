import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CalendarClock, Image, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { formatDistance } from "date-fns";

interface MigrationProgressProps {
  totalRecords: number;
  processedRecords: number;
  percentage: number;
  recentUploads: number;
  lastUploadTime: string | null;
  errors?: Array<{
    recordId: string;
    title: string;
    error: string;
  }>;
}

export default function MigrationProgressBar() {
  const { data: migrationProgress, isLoading } = useQuery<MigrationProgressProps>({
    queryKey: ['/api/migration-progress'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-md font-medium flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading migration progress...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-full mb-4"></div>
            <div className="h-12 bg-gray-200 rounded w-full"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!migrationProgress || migrationProgress.totalRecords === 0) {
    return (
      <Card className="col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-md font-medium flex items-center gap-2">
            <Image className="h-4 w-4" />
            Airtable Image Migration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-2">
            No migration in progress. Run one of the migration scripts to start.
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    totalRecords,
    processedRecords,
    percentage,
    recentUploads,
    lastUploadTime,
    errors = []
  } = migrationProgress;

  // Format lastUploadTime
  const lastUploadTimeFormatted = lastUploadTime
    ? formatDistance(new Date(lastUploadTime), new Date(), { addSuffix: true })
    : "never";

  // Calculate color for progress bar
  const progressColor = percentage < 30
    ? "bg-red-600"
    : percentage < 70
      ? "bg-yellow-500"
      : "bg-green-600";

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-md font-medium flex items-center gap-2">
          <Image className="h-4 w-4" />
          Airtable Image Migration Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {processedRecords} of {totalRecords} images ({percentage}%)
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-help text-sm text-gray-500">
                    <CalendarClock className="h-3 w-3" />
                    Last upload: {lastUploadTimeFormatted}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Recent uploads (24h): {recentUploads}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="relative">
            <div className="h-4 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${progressColor} transition-all duration-500 ease-in-out`}
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
              {percentage}%
            </span>
          </div>

          {errors.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-red-500 font-medium mb-1">Recent Errors ({errors.length})</p>
              <ul className="text-xs text-gray-600 space-y-1 max-h-24 overflow-y-auto">
                {errors.slice(0, 3).map((error, index) => (
                  <li key={index} className="truncate">
                    <strong>{error.title}</strong>: {error.error}
                  </li>
                ))}
                {errors.length > 3 && (
                  <li className="text-gray-500">
                    ...and {errors.length - 3} more errors
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="text-xs text-gray-500 mt-2">
            <p>
              This migration moves images from Airtable attachment fields to link fields.
              The migration runs in batches to respect Imgur API rate limits (10/hour).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}