import { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useState } from "react";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title = "Content Management System" }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const toggleMobileMenu = () => {
    setMobileMenuOpen(prevState => !prevState);
    console.log("Mobile menu toggled, new state:", !mobileMenuOpen);
  };
  
  return (
    <div className="flex h-screen">
      <Sidebar 
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with mobile menu toggle */}
        <Header 
          title={title} 
          onMobileMenuToggle={toggleMobileMenu} 
        />
        
        {/* Main content area with pink style */}
        <main className="flex-1 overflow-auto">
          <div className="bg-pink-translucent shadow-pink border-pink p-4 min-h-screen">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}