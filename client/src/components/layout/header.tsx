import { ChevronDown, Link as LinkIcon, Menu } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  title?: string;
  onMobileMenuToggle?: () => void;
}

export function Header({ title = "Airtable Integration", onMobileMenuToggle }: HeaderProps) {
  const { user, logoutMutation } = useAuth();

  const handleMobileMenuToggle = () => {
    if (onMobileMenuToggle) {
      setTimeout(() => {
        onMobileMenuToggle();
      }, 10);
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mobile-menu-toggle"));
    }
  };
  
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
              e.preventDefault();
              e.stopPropagation();
              handleMobileMenuToggle();
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
              <button className="flex items-center space-x-2 p-2 rounded-md hover:bg-[#FFCAE3]/50 touch-manipulation" type="button" aria-label="User menu">
                <div className="h-8 w-8 rounded-full bg-[#FF69B4] flex items-center justify-center shadow-pink">
                  <span className="text-sm font-medium text-white">{userInitials}</span>
                </div>
                <span className="text-sm font-medium hidden sm:inline text-gray-800">{user?.username}</span>
                <ChevronDown className="h-4 w-4 text-[#FF69B4]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <div className="px-2 py-2 text-sm">
                <p className="font-medium text-gray-800">{user?.username}</p>
                <p className="text-xs text-gray-500">
                  {user?.isAdmin ? "Administrator" : "Member"}
                </p>
              </div>
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
