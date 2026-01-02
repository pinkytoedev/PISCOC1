import { useState, useEffect, useRef } from "react";
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
  Shield,
  X,
  CalendarDays,
  Upload,
  Bug,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SiAirtable,
  SiInstagram,
  SiCloudinary, // Using Cloudinary's icon for ImgBB since there's no official ImgBB icon
} from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

interface NavSection {
  section: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps = {}) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const lastLocationRef = useRef(location);

  const isControlled = typeof mobileOpen === "boolean" || typeof onMobileClose === "function";
  const resolvedMobileOpen = isControlled ? !!mobileOpen : internalMobileOpen;
  
  const closeMobileMenu = () => {
    if (onMobileClose) {
      onMobileClose();
    } else {
      setInternalMobileOpen(false);
    }
  };

  // Define all navigation items
  const allNavItems: NavSection[] = [
    {
      section: "Content",
      items: [
        {
          name: "Articles",
          path: "/articles",
          icon: <Newspaper className="w-5 h-5" />,
          adminOnly: false,
        },
        {
          name: "Article Planner",
          path: "/articles/planner",
          icon: <CalendarDays className="w-5 h-5" />,
          adminOnly: false,
        },
        {
          name: "Team Members",
          path: "/team-members",
          icon: <Users className="w-5 h-5" />,
          adminOnly: false,
        },
        {
          name: "Carousel Quotes",
          path: "/carousel-quotes",
          icon: <Quote className="w-5 h-5" />,
          adminOnly: false,
        },
      ],
    },
    {
      section: "Integrations",
      adminOnly: true, // This section is admin-only
      items: [
        {
          name: "API Keys",
          path: "/keys",
          icon: <Key className="w-5 h-5" />,
          adminOnly: true,
        },
        {
          name: "Airtable",
          path: "/integrations/airtable",
          icon: <SiAirtable className="w-5 h-5" />,
          adminOnly: true,
        },
        {
          name: "Instagram",
          path: "/integrations/instagram",
          icon: <SiInstagram className="w-5 h-5" />,
          adminOnly: true,
        },
        {
          name: "ImgBB",
          path: "/integrations/imgbb",
          icon: <SiCloudinary className="w-5 h-5" />,
          adminOnly: true,
        },
      ],
    },
    {
      section: "System",
      items: [
        {
          name: "Users & Permissions",
          path: "/users",
          icon: <UserCog className="w-5 h-5" />,
          adminOnly: true, // This item is admin-only
        },
        {
          name: "Debug Center",
          path: "/debug-center",
          icon: <Bug className="w-5 h-5" />,
          adminOnly: false, // Available to all users
        },

        {
          name: "Privacy Policy",
          path: "/privacy-policy",
          icon: <Shield className="w-5 h-5" />,
          adminOnly: false,
        },
      ],
    },
  ];

  // Filter nav items based on user's admin status
  const navItems = allNavItems
    .filter((section) => !section.adminOnly || user?.isAdmin === true)
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.adminOnly || user?.isAdmin === true,
      ),
    }))
    // Filter out sections with no items
    .filter((section) => section.items.length > 0);

  // Listen for global mobile menu events when the sidebar is uncontrolled
  useEffect(() => {
    if (isControlled) return;

    const handleToggle = () => setInternalMobileOpen((prev) => !prev);
    const handleOpen = () => setInternalMobileOpen(true);
    const handleClose = () => setInternalMobileOpen(false);

    window.addEventListener("mobile-menu-toggle", handleToggle);
    window.addEventListener("mobile-menu-open", handleOpen);
    window.addEventListener("mobile-menu-close", handleClose);

    return () => {
      window.removeEventListener("mobile-menu-toggle", handleToggle);
      window.removeEventListener("mobile-menu-open", handleOpen);
      window.removeEventListener("mobile-menu-close", handleClose);
    };
  }, [isControlled]);

  // Close mobile menu when route changes
  useEffect(() => {
    if (!resolvedMobileOpen) {
      lastLocationRef.current = location;
      return;
    }

    // Only close when the route actually changes after opening
    if (location !== lastLocationRef.current) {
      lastLocationRef.current = location;
      closeMobileMenu();
    }
  }, [location, resolvedMobileOpen]);

  return (
    <>
      {/* Desktop Sidebar - Pink Themed */}
      <aside
        className={cn(
          "bg-[#FF69B4] text-white flex-shrink-0 flex-col transition-all duration-300 ease-in-out shadow-pink",
          collapsed ? "w-20" : "w-64",
          "hidden md:flex",
        )}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <h2
              className={cn(
                "text-lg font-semibold transition-opacity",
                collapsed ? "opacity-0 w-0" : "opacity-100",
              )}
            >
              Dashboard
            </h2>
            <button
              className="p-2 text-gray-400 hover:text-white touch-manipulation"
              onClick={() => setCollapsed(!collapsed)}
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-8">
              {navItems.map((section) => (
                <li className="px-2" key={section.section}>
                  <div
                    className={cn(
                      "px-3 py-2 text-xs font-semibold text-white uppercase tracking-wider",
                      collapsed ? "text-center" : "",
                    )}
                  >
                    <span className={collapsed ? "sr-only" : ""}>{section.section}</span>
                    {collapsed && <span aria-hidden="true">{section.section.charAt(0)}</span>}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {section.items.map((item) => {
                      const isActive = location === item.path;
                      return (
                        <li key={item.path}>
                          <Link
                            href={item.path}
                            className={cn(
                              "flex items-center px-3 py-3 text-sm font-medium rounded-md transition-colors touch-manipulation",
                              isActive
                                ? "bg-[#CC3F85] text-white"
                                : "text-white hover:bg-[#CC3F85] hover:text-white",
                              collapsed ? "justify-center" : "",
                            )}
                            aria-label={item.name}
                          >
                            <span className="flex-shrink-0">{item.icon}</span>
                            {!collapsed && (
                              <span className="ml-3">{item.name}</span>
                            )}
                            {collapsed && (
                              <span className="sr-only">{item.name}</span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>

          <div className="p-4 border-t border-pink">
            <div className="bg-[#CC3F85] rounded-md p-3 shadow-pink">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-[#FF69B4] flex items-center justify-center">
                    <Headphones className="text-white h-4 w-4" />
                  </div>
                </div>
                {!collapsed && (
                  <div className="ml-3">
                    <p className="text-sm font-medium text-white">Need help?</p>
                    <p className="text-xs text-white opacity-75">Too Bad</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar - Show based on mobileOpen state */}
      {resolvedMobileOpen && (
        <div 
          className="md:hidden fixed inset-0 z-50 bg-black bg-opacity-50 touch-auto"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            // Close the sidebar when clicking the overlay (outside the sidebar)
            if (e.target === e.currentTarget) {
              e.preventDefault(); // Prevent other events from firing
              e.stopPropagation(); // Stop event from bubbling up
              closeMobileMenu();
              console.log("Mobile sidebar overlay clicked, closing sidebar");
            }
          }}
        >
          <aside 
            className="bg-[#FF69B4] text-white w-64 h-full flex flex-col overflow-hidden shadow-pink"
            onClick={(e) => {
              // Stop clicks inside the sidebar from bubbling to the overlay
              e.stopPropagation();
            }}
          >
            <div className="p-4 flex items-center justify-between border-b border-pink">
              <h2 className="text-lg font-semibold text-white">Dashboard</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeMobileMenu();
                }}
                className="text-white hover:text-white touch-manipulation p-2"
                type="button"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            <nav className="flex-1 overflow-y-auto py-4">
              <ul className="space-y-8">
                {navItems.map((section) => (
                  <li className="px-2" key={section.section}>
                    <div className="px-3 py-2 text-xs font-semibold text-white uppercase tracking-wider">
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
                                "flex items-center px-3 py-4 text-sm font-medium rounded-md transition-colors touch-manipulation",
                                isActive
                                  ? "bg-[#CC3F85] text-white"
                                  : "text-white hover:bg-[#CC3F85] hover:text-white",
                              )}
                              onClick={(e) => {
                                // Stop event bubbling
                                e.stopPropagation();
                                
                                // On mobile, close the sidebar when a link is clicked
                                if (resolvedMobileOpen) {
                                  closeMobileMenu();
                                  console.log("Mobile sidebar link clicked, closing sidebar");
                                }
                              }}
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

            <div className="p-4 border-t border-pink">
              <div className="bg-[#CC3F85] rounded-md p-3 shadow-pink">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-[#FF69B4] flex items-center justify-center">
                      <Headphones className="text-white h-4 w-4" />
                    </div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-white">Need help?</p>
                    <p className="text-xs text-white opacity-75">Too Bad</p>
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
