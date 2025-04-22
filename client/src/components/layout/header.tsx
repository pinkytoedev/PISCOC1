import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Bell, ChevronDown, Link as LinkIcon, Menu, Check, RefreshCw, Trash2, FileEdit, Upload, Download } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  title?: string;
  onMobileMenuToggle?: () => void;
}

interface ActivityLog {
  id: number;
  userId: number | null;
  action: string;
  resourceType: string;
  resourceId: string;
  details: any;
  timestamp: string;
}

interface Notification {
  id: number;
  title: string;
  description: string;
  time: string;
  icon: JSX.Element;
  timestamp: Date;
}

export function Header({ title = "Discord-Airtable Integration", onMobileMenuToggle }: HeaderProps) {
  const { user, logoutMutation } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Fetch activity logs
  const { data: activityLogs } = useQuery<ActivityLog[]>({
    queryKey: ['/api/activity-logs'],
    enabled: !!user, // Only run the query when user is logged in
    refetchInterval: 30000, // Refetch every 30 seconds
  });
  
  // Convert activity logs to notifications
  useEffect(() => {
    if (activityLogs && activityLogs.length > 0) {
      const newNotifications = activityLogs
        .filter(log => 
          // Filter for specific actionable activity types
          ['create', 'update', 'delete', 'upload', 'sync', 'publish', 'resolve'].includes(log.action)
        )
        .slice(0, 10) // Only take the 10 most recent
        .map(log => {
          const timestamp = new Date(log.timestamp);
          
          // Get appropriate icon based on action type
          let icon;
          switch (log.action) {
            case 'create':
              icon = <FileEdit className="h-4 w-4 text-green-500" />;
              break;
            case 'update':
              icon = <RefreshCw className="h-4 w-4 text-blue-500" />;
              break;
            case 'delete':
              icon = <Trash2 className="h-4 w-4 text-red-500" />;
              break;
            case 'upload':
              icon = <Upload className="h-4 w-4 text-purple-500" />;
              break;
            case 'sync':
              icon = <RefreshCw className="h-4 w-4 text-orange-500" />;
              break;
            case 'publish':
              icon = <Check className="h-4 w-4 text-green-600" />;
              break;
            case 'resolve':
              icon = <Check className="h-4 w-4 text-green-600" />;
              break;
            default:
              icon = <Bell className="h-4 w-4 text-gray-500" />;
          }
          
          // Format title based on resource type and action
          let title = '';
          let description = '';
          
          switch (log.resourceType) {
            case 'article':
              title = `Article ${log.action}d`;
              description = log.details?.title || `ID: ${log.resourceId}`;
              break;
            case 'admin_request':
              title = `Admin Request ${log.action}d`;
              description = log.details?.title || `ID: ${log.resourceId}`;
              break;
            case 'team_member':
              title = `Team Member ${log.action}d`;
              description = log.details?.name || `ID: ${log.resourceId}`;
              break;
            case 'image_asset':
              title = `Image ${log.action}d`;
              description = log.details?.filename || `ID: ${log.resourceId}`;
              break;
            default:
              title = `${log.resourceType.replace('_', ' ')} ${log.action}d`.replace(/\b\w/g, char => char.toUpperCase());
              description = `ID: ${log.resourceId}`;
          }
          
          return {
            id: log.id,
            title,
            description,
            time: formatDistanceToNow(timestamp, { addSuffix: true }),
            icon,
            timestamp
          };
        });
      
      setNotifications(newNotifications);
    }
  }, [activityLogs]);
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  const userInitials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "US";

  return (
    <header className="bg-pink-translucent backdrop-blur-md border-b border-pink shadow-pink">
      <div className="flex justify-between items-center px-4 py-3">
        <div className="flex items-center space-x-3">
          <button 
            onClick={(e) => {
              // Use a native button instead of Button component
              e.preventDefault();
              e.stopPropagation();
              console.log("Menu button clicked");
              // Delay handling to avoid any race conditions
              if (onMobileMenuToggle) {
                setTimeout(() => {
                  onMobileMenuToggle();
                }, 10);
              }
            }} 
            className="md:hidden mr-2 touch-manipulation p-3 bg-primary hover:bg-primary/80 active:bg-primary/90 text-white rounded-md"
            aria-label="Toggle mobile menu"
            type="button"
          >
            <Menu className="h-5 w-5 text-white" />
          </button>
          <div className="font-medium text-xl flex items-center">
            <span className="mr-2 text-[#FF69B4]">
              <LinkIcon className="h-5 w-5" />
            </span>
            <span className="hidden sm:inline text-[#CC3F85]">{title}</span>
            <span className="sm:hidden text-[#CC3F85]">Dashboard</span>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-[#FFCAE3] text-[#CC3F85] rounded-md hidden sm:inline-block shadow-pink">v1.0.0</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-3 text-[#FF69B4] hover:text-[#CC3F85] relative touch-manipulation" type="button" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {notifications.length > 0 && (
                  <span className="absolute top-0 right-0 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex justify-between items-center">
                  <h5 className="font-semibold text-sm">System Activity</h5>
                  <Badge className="bg-pink-500 hover:bg-pink-600">{notifications.length} New</Badge>
                </div>
              </div>
              
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500">No recent system activity</p>
                </div>
              ) : (
                notifications.map((notification, index) => (
                  <DropdownMenuItem key={notification.id} className="px-4 py-3 hover:bg-gray-50 border-b border-gray-100 touch-manipulation cursor-pointer">
                    <div className="w-full flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0 p-1.5 rounded-full bg-gray-50">
                        {notification.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between w-full">
                          <span className="text-sm font-medium">{notification.title}</span>
                          <span className="text-xs text-gray-500 whitespace-nowrap ml-2">{notification.time}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{notification.description}</p>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
              
              <div className="px-4 py-3 text-center text-xs">
                <Link href="/notifications" className="text-[#FF69B4] hover:underline block py-2 touch-manipulation">
                  View all notifications
                </Link>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Separator orientation="vertical" className="h-8 bg-[#FFCAE3]" />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center space-x-2 p-2 rounded-md hover:bg-[#FFCAE3]/50 touch-manipulation" type="button" aria-label="User menu">
                <div className="h-8 w-8 rounded-full bg-[#FF69B4] flex items-center justify-center shadow-pink">
                  <span className="text-sm font-medium text-white">{userInitials}</span>
                </div>
                <span className="text-sm font-medium hidden sm:inline text-gray-800">{user?.username}</span>
                <ChevronDown className="h-4 w-4 text-[#FF69B4]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem className="py-3 cursor-pointer touch-manipulation">
                <Link href="/profile" className="w-full">Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="py-3 cursor-pointer touch-manipulation">
                <Link href="/settings" className="w-full">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="py-3 cursor-pointer touch-manipulation">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
