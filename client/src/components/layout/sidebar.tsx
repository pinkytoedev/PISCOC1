import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Newspaper,
  Users,
  Quote,
  UserCog,
  Headphones,
  ChevronLeft,
  ChevronRight,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  SiDiscord, 
  SiAirtable, 
  SiInstagram,
  SiImgur
} from "react-icons/si";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps = {}) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  
  const navItems = [
    {
      section: "Content",
      items: [
        {
          name: "Articles",
          path: "/articles",
          icon: <Newspaper className="w-5 h-5" />
        },
        {
          name: "Team Members",
          path: "/team-members",
          icon: <Users className="w-5 h-5" />
        },
        {
          name: "Carousel Quotes",
          path: "/carousel-quotes",
          icon: <Quote className="w-5 h-5" />
        }
      ]
    },
    {
      section: "Integrations",
      items: [
        {
          name: "Discord",
          path: "/integrations/discord",
          icon: <SiDiscord className="w-5 h-5" />
        },
        {
          name: "Airtable",
          path: "/integrations/airtable",
          icon: <SiAirtable className="w-5 h-5" />
        },
        {
          name: "Instagram",
          path: "/integrations/instagram",
          icon: <SiInstagram className="w-5 h-5" />
        },
        {
          name: "Imgur",
          path: "/integrations/imgur",
          icon: <SiImgur className="w-5 h-5" />
        }
      ]
    },
    {
      section: "System",
      items: [
        {
          name: "Users & Permissions",
          path: "/users",
          icon: <UserCog className="w-5 h-5" />
        }
      ]
    }
  ];

  // Close mobile menu when route changes
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
  }, [location, mobileOpen, onMobileClose]);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside 
        className={cn(
          "bg-[#2F3136] text-white flex-shrink-0 flex-col transition-all duration-300 ease-in-out",
          collapsed ? "w-20" : "w-64",
          "hidden md:flex"
        )}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <h2 className={cn("text-lg font-semibold transition-opacity", 
                          collapsed ? "opacity-0 w-0" : "opacity-100")}
            >
              Dashboard
            </h2>
            <button
              className="p-1 text-gray-400 hover:text-white"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronRight /> : <ChevronLeft />}
            </button>
          </div>
          
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-8">
              {navItems.map((section) => (
                <li className="px-2" key={section.section}>
                  <div className={cn(
                    "px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider",
                    collapsed ? "text-center" : ""
                  )}>
                    {!collapsed && section.section}
                    {collapsed && section.section.charAt(0)}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {section.items.map((item) => {
                      const isActive = location === item.path;
                      return (
                        <li key={item.path}>
                          <Link 
                            href={item.path}
                            className={cn(
                              "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                              isActive 
                                ? "bg-[#202225] text-white" 
                                : "text-gray-300 hover:bg-[#202225] hover:text-white",
                              collapsed ? "justify-center" : ""
                            )}
                          >
                            <span className="flex-shrink-0">{item.icon}</span>
                            {!collapsed && <span className="ml-3">{item.name}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>
          
          <div className="p-4 border-t border-gray-700">
            <div className="bg-[#202225] rounded-md p-3">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
                    <Headphones className="text-white h-4 w-4" />
                  </div>
                </div>
                {!collapsed && (
                  <div className="ml-3">
                    <p className="text-sm font-medium text-white">Need help?</p>
                    <p className="text-xs text-gray-400">Contact support</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black bg-opacity-50">
          <aside 
            className="bg-[#2F3136] text-white w-64 h-full flex flex-col overflow-hidden"
          >
            <div className="p-4 flex items-center justify-between border-b border-gray-700">
              <h2 className="text-lg font-semibold">Dashboard</h2>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onMobileClose}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <nav className="flex-1 overflow-y-auto py-4">
              <ul className="space-y-8">
                {navItems.map((section) => (
                  <li className="px-2" key={section.section}>
                    <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {section.section}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {section.items.map((item) => {
                        const isActive = location === item.path;
                        return (
                          <li key={item.path}>
                            <Link 
                              href={item.path}
                              className={cn(
                                "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                                isActive 
                                  ? "bg-[#202225] text-white" 
                                  : "text-gray-300 hover:bg-[#202225] hover:text-white"
                              )}
                            >
                              <span className="flex-shrink-0">{item.icon}</span>
                              <span className="ml-3">{item.name}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </nav>
            
            <div className="p-4 border-t border-gray-700">
              <div className="bg-[#202225] rounded-md p-3">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
                      <Headphones className="text-white h-4 w-4" />
                    </div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-white">Need help?</p>
                    <p className="text-xs text-gray-400">Contact support</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}