import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Home, 
  Instagram, 
  Settings, 
  Menu, 
  X, 
  ChevronLeft,
  MessageSquare, 
  Database,
  UserCircle,
  BarChart,
  Facebook
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: <Home className="h-5 w-5" /> },
    { name: 'Instagram', path: '/integrations/instagram', icon: <Instagram className="h-5 w-5" /> },
    { name: 'Facebook', path: '/integrations/facebook', icon: <Facebook className="h-5 w-5" /> },
    { name: 'Discord', path: '/integrations/discord', icon: <MessageSquare className="h-5 w-5" /> },
    { name: 'Airtable', path: '/integrations/airtable', icon: <Database className="h-5 w-5" /> },
    { name: 'Users', path: '/users', icon: <UserCircle className="h-5 w-5" /> },
    { name: 'Analytics', path: '/analytics', icon: <BarChart className="h-5 w-5" /> },
    { name: 'Settings', path: '/settings', icon: <Settings className="h-5 w-5" /> },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleSidebar}
          className="rounded-full"
        >
          {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out bg-background border-r",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="h-16 flex items-center justify-center border-b px-6">
          <h1 className="text-xl font-bold">Integration Hub</h1>
        </div>

        <ScrollArea className="flex-1 h-[calc(100vh-4rem)]">
          <div className="py-4 px-4">
            <nav className="space-y-1">
              {menuItems.map((item) => (
                <Link key={item.path} href={item.path}>
                  <a className={cn(
                    "flex items-center px-3 py-2 rounded-md text-sm font-medium group transition-colors",
                    location === item.path
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}>
                    {item.icon}
                    <span className="ml-3">{item.name}</span>
                  </a>
                </Link>
              ))}
            </nav>
          </div>
        </ScrollArea>
      </div>

      {/* Main content */}
      <div className={cn(
        "flex-1 transition-all duration-200 ease-in-out",
        sidebarOpen ? "lg:ml-64" : "ml-0"
      )}>
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b bg-background flex items-center px-6">
          <div className="flex items-center gap-2">
            {location !== '/' && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => window.history.back()}
                className="mr-2"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <h2 className="text-lg font-semibold">
              {menuItems.find(item => item.path === location)?.name || 'Page'}
            </h2>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;