import { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  return (
    <div className="flex h-screen bg-background">
      <Sidebar 
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile menu button */}
        <div className="md:hidden p-4 border-b">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
        
        {/* Main content area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}