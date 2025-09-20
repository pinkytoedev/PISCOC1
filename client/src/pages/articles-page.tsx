import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { ArticleTable } from "@/components/dashboard/article-table";
import { CreateArticleModal } from "@/components/modals/create-article-modal";
import { ViewArticleModal } from "@/components/modals/view-article-modal";
import { Button } from "@/components/ui/button";
import { Article } from "@shared/schema";
import { Plus, Filter, ArrowUpDown, CalendarClock, CalendarDays } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ArticlesPage() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const statusFilter = searchParams.get('status');
  const sortParam = searchParams.get('sort');
  const articleIdParam = searchParams.get('id');
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [viewArticle, setViewArticle] = useState<Article | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<string>(sortParam || "newest");
  const [highlightedArticleId, setHighlightedArticleId] = useState<number | null>(null);
  
  const { data: articles, isLoading } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
  });
  
  // Parse article ID from URL if present
  useEffect(() => {
    if (articleIdParam && articles) {
      const parsedId = parseInt(articleIdParam, 10);
      if (!isNaN(parsedId)) {
        setHighlightedArticleId(parsedId);
        
        // Clear the highlight after 10 seconds
        const timer = setTimeout(() => {
          setHighlightedArticleId(null);
        }, 10000);
        
        // Auto-open the view modal if article ID is specified in the URL
        const article = articles.find(a => a.id === parsedId);
        if (article) {
          setViewArticle(article);
          setIsViewModalOpen(true);
        }
        
        return () => clearTimeout(timer);
      }
    }
  }, [articleIdParam, articles]);
  
  // Check for action=create in URL and open create modal
  useEffect(() => {
    const actionParam = searchParams.get('action');
    if (actionParam === 'create') {
      setIsCreateModalOpen(true);
      
      // Remove the action parameter after opening the modal
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      const newSearch = newParams.toString();
      const newPath = newSearch ? `${location.split('?')[0]}?${newSearch}` : location.split('?')[0];
      
      // Use history API to replace the URL without causing a navigation
      window.history.replaceState(null, '', newPath);
    }
  }, [search, location]);
  
  const handleCreateClick = () => {
    setEditArticle(null);
    setIsCreateModalOpen(true);
  };
  
  const handleEditClick = (article: Article) => {
    setEditArticle(article);
    setIsCreateModalOpen(true);
  };
  
  const handleViewClick = (article: Article) => {
    setViewArticle(article);
    setIsViewModalOpen(true);
  };
  
  const handleFilterClick = (status: string | null) => {
    const newSearchParams = new URLSearchParams(search);
    
    if (status) {
      newSearchParams.set('status', status);
    } else {
      newSearchParams.delete('status');
    }
    
    // Preserve sort parameter if it exists
    if (sortBy && sortBy !== 'newest') {
      newSearchParams.set('sort', sortBy);
    }
    
    const queryString = newSearchParams.toString();
    setLocation(queryString ? `/articles?${queryString}` : '/articles');
  };
  
  const handleSortClick = (sort: string) => {
    setSortBy(sort);
    
    const newSearchParams = new URLSearchParams(search);
    if (sort !== 'newest') {
      newSearchParams.set('sort', sort);
    } else {
      newSearchParams.delete('sort');
    }
    
    // Preserve status filter if it exists
    if (statusFilter) {
      newSearchParams.set('status', statusFilter);
    }
    
    const queryString = newSearchParams.toString();
    setLocation(queryString ? `/articles?${queryString}` : '/articles');
  };
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Articles" />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Breadcrumbs */}
            <nav className="text-sm font-medium mb-6" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <a href="/" className="text-gray-500 hover:text-gray-700">Dashboard</a>
                </li>
                <li className="flex items-center">
                  <svg className="h-4 w-4 text-gray-400 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-900">Articles</span>
                </li>
              </ol>
            </nav>

            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Manage and publish article content from Airtable.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 w-full md:w-auto">
                {/* Sort dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full md:w-auto justify-between">
                      <ArrowUpDown className="mr-2 h-4 w-4" />
                      {sortBy === "newest" 
                        ? "Sort: Newest" 
                        : sortBy === "oldest" 
                          ? "Sort: Oldest" 
                          : sortBy === "chronological" 
                            ? "Sort: Chronological" 
                            : "Sort"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleSortClick("newest")}>
                      <CalendarClock className="mr-2 h-4 w-4" /> Newest First
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSortClick("oldest")}>
                      <CalendarClock className="mr-2 h-4 w-4 rotate-180" /> Oldest First
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                {/* Filter dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full md:w-auto justify-between">
                      <Filter className="mr-2 h-4 w-4" />
                      {statusFilter ? `Filter: ${statusFilter}` : "Filters"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleFilterClick(null)}>
                      All Articles
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterClick("published")}>
                      Published
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterClick("pending")}>
                      Pending
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterClick("draft")}>
                      Draft
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                <Button
                  variant="outline"
                  onClick={() => setLocation('/articles/planner')} 
                  className="w-full md:w-auto"
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Calendar View
                </Button>
                
                <Button onClick={handleCreateClick} className="w-full md:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  New Article
                </Button>
              </div>
            </div>

            {/* Articles Table */}
            <ArticleTable 
              filter={statusFilter || undefined}
              sort={sortBy}
              onEdit={handleEditClick}
              onView={handleViewClick}
              highlightedArticleId={highlightedArticleId}
            />
            
            {/* Create/Edit Article Modal */}
            <CreateArticleModal
              isOpen={isCreateModalOpen}
              onClose={() => setIsCreateModalOpen(false)}
              editArticle={editArticle}
            />
            
            {/* View Article Modal */}
            <ViewArticleModal 
              isOpen={isViewModalOpen}
              onClose={() => setIsViewModalOpen(false)}
              article={viewArticle}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
