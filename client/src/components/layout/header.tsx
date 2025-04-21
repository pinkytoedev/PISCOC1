import { useState } from "react";
import { Link } from "wouter";
import { Bell, ChevronDown, Link as LinkIcon, Menu } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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

export function Header({ title = "Discord-Airtable Integration", onMobileMenuToggle }: HeaderProps) {
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
          <Button 
            variant="default" 
            size="default"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("Menu button clicked");
              if (onMobileMenuToggle) onMobileMenuToggle();
            }} 
            className="md:hidden mr-2 touch-manipulation p-2 bg-primary hover:bg-primary/80 active:bg-primary/90"
            aria-label="Toggle mobile menu"
            type="button"
          >
            <Menu className="h-5 w-5 text-white" />
          </Button>
          <div className="font-medium text-xl flex items-center">
            <span className="mr-2 text-primary">
              <LinkIcon className="h-5 w-5" />
            </span>
            <span className="hidden sm:inline">{title}</span>
            <span className="sm:hidden">Dashboard</span>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded hidden sm:inline-block">v1.0.0</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-3 text-gray-500 hover:text-gray-700 relative touch-manipulation" type="button" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {notifications.length > 0 && (
                  <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="px-4 py-3 border-b border-gray-100">
                <h5 className="font-semibold text-sm">Notifications</h5>
              </div>
              
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500">No new notifications</p>
                </div>
              ) : (
                notifications.map((notification, index) => (
                  <DropdownMenuItem key={index} className="px-4 py-3 hover:bg-gray-50 border-b border-gray-100 touch-manipulation cursor-pointer">
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
              
              <div className="px-4 py-3 text-center text-xs">
                <Link href="/notifications" className="text-primary hover:underline block py-2 touch-manipulation">
                  View all notifications
                </Link>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Separator orientation="vertical" className="h-8" />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-100 touch-manipulation" type="button" aria-label="User menu">
                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600">{userInitials}</span>
                </div>
                <span className="text-sm font-medium hidden sm:inline">{user?.username}</span>
                <ChevronDown className="h-4 w-4 text-gray-500" />
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
