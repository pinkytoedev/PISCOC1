import { useState } from "react";
import { Link } from "wouter";
import { Bell, ChevronDown, Link as LinkIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  title?: string;
}

export function Header({ title = "Discord-Airtable Integration" }: HeaderProps) {
  const { user, logoutMutation } = useAuth();
  const [notifications] = useState<any[]>([]);
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  const userInitials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "US";

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="flex justify-between items-center px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="font-medium text-xl flex items-center">
            <span className="mr-2 text-primary">
              <LinkIcon className="h-5 w-5" />
            </span>
            <span>{title}</span>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">v1.0.0</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 text-gray-500 hover:text-gray-700 relative">
                <Bell className="h-5 w-5" />
                {notifications.length > 0 && (
                  <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="px-4 py-2 border-b border-gray-100">
                <h5 className="font-semibold text-sm">Notifications</h5>
              </div>
              
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500">No new notifications</p>
                </div>
              ) : (
                notifications.map((notification, index) => (
                  <DropdownMenuItem key={index} className="px-4 py-2 hover:bg-gray-50 border-b border-gray-100">
                    <div className="w-full">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{notification.title}</span>
                        <span className="text-xs text-gray-500">{notification.time}</span>
                      </div>
                      <p className="text-xs text-gray-600">{notification.description}</p>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
              
              <div className="px-4 py-2 text-center text-xs">
                <Link href="/notifications" className="text-primary hover:underline">
                  View all notifications
                </Link>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Separator orientation="vertical" className="h-8" />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600">{userInitials}</span>
                </div>
                <span className="text-sm font-medium">{user?.username}</span>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Link href="/profile">Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
