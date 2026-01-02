import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { StatusCard } from "@/components/dashboard/status-card";
import { ArticleTable } from "@/components/dashboard/article-table";
import { Button } from "@/components/ui/button";
import { Newspaper, Clock, CheckCircle, ChevronRight, Upload, Loader2 } from "lucide-react";
import { SiAirtable } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Article } from "@shared/schema";

interface DashboardMetrics {
  totalArticles: number;
  draftArticles: number;
  publishedToday: number;
  articleGrowth: string;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pushingArticleId, setPushingArticleId] = useState<number | null>(null);
  
  // Add a useEffect to log when mobileMenuOpen changes
  useEffect(() => {
    console.log(`MobileMenuOpen state changed to: ${mobileMenuOpen}`);
  }, [mobileMenuOpen]);
  
  // Function to toggle the mobile menu state - simplified to always open
  const toggleMobileMenu = () => {
    // Instead of toggling, explicitly set to true (to open)
    // This avoids potential race conditions with state updates
    console.log(`Opening mobile menu: ${mobileMenuOpen} -> true`);
    
    // Force it to be true (open the menu) - this simplifies debugging
    setMobileMenuOpen(true);
  };

  // Function to close the mobile menu
  const closeMobileMenu = () => {
    console.log(`Closing mobile menu`);
    // Using setTimeout to avoid race conditions
    setTimeout(() => {
      setMobileMenuOpen(false);
    }, 50); // Slight delay for better reliability
  };
  
  // Add mutation for pushing non-Airtable articles to Airtable
  const pushToAirtableMutation = useMutation({
    mutationFn: async (articleId: number) => {
      setPushingArticleId(articleId);
      const response = await apiRequest(
        "POST", 
        `/api/airtable/push/article/${articleId}`
      );
      return await response.json();
    },
    onSuccess: (data) => {
      setPushingArticleId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      toast({
        title: "Pushed to Airtable",
        description: "The article was successfully pushed to Airtable.",
      });
    },
    onError: (error) => {
      setPushingArticleId(null);
      toast({
        title: "Airtable push failed",
        description: error.message || "Failed to push article to Airtable.",
        variant: "destructive",
      });
    },
  });
  
  // Fetch metrics for the dashboard
  const { data: metrics, isLoading: isLoadingMetrics } = useQuery<DashboardMetrics>({
    queryKey: ['/api/metrics'],
  });
  
  // Fetch recent articles
  const { data: articles, isLoading: isLoadingArticles } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
  });
  
  // Get recently published articles, limited to 5
  // Filter only published articles and sort by Scheduled date in chronological order (oldest first)
  const recentArticles = articles
    ?.filter(article => article.status === "published")
    .sort((a, b) => {
      // Use the scheduled date field (from Airtable's "Scheduled" field) for sorting
      // If not available, fall back to publishedAt or createdAt
      const getDateValue = (article: Article) => {
        if (article.Scheduled) return new Date(article.Scheduled).getTime();
        if (article.publishedAt) return new Date(article.publishedAt).getTime();
        if (article.createdAt) return new Date(article.createdAt).getTime();
        return 0;
      };
      
      const dateA = getDateValue(a);
      const dateB = getDateValue(b);
      
      // Sort in chronological order (newest first for recently published)
      return dateB - dateA;
    })
    .slice(0, 5);
  
  // Get draft articles
  const draftArticles = articles
    ?.filter(article => article.status === "draft")
    .slice(0, 5);

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Dashboard" 
        onMobileMenuToggle={toggleMobileMenu}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          mobileOpen={mobileMenuOpen}
          onMobileClose={closeMobileMenu}
        />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Breadcrumbs */}
            <nav className="text-sm font-medium mb-6" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <span className="text-gray-900">Dashboard</span>
                </li>
              </ol>
            </nav>

            {/* Page Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Overview of your content and integration status
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={() => {
                    // Find published articles not already in Airtable
                    const publishedArticles = articles?.filter(article => 
                      article.status === "published" && 
                      article.source !== "airtable"
                    );
                    
                    if (publishedArticles && publishedArticles.length > 0) {
                      // Push the first one that's not already in Airtable
                      pushToAirtableMutation.mutate(publishedArticles[0].id);
                    } else {
                      toast({
                        title: "No articles to push",
                        description: "All published articles are already in Airtable.",
                      });
                    }
                  }}
                  disabled={pushToAirtableMutation.isPending || !articles?.some(article => 
                    article.status === "published" && article.source !== "airtable"
                  )}
                >
                  {pushToAirtableMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SiAirtable className="h-4 w-4" />
                  )}
                  Push to Airtable
                </Button>
                
                <Link href="/articles?action=create">
                  <Button>
                    Create Article
                  </Button>
                </Link>
              </div>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {isLoadingMetrics ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="bg-white rounded-lg shadow p-5 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
                    <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                  </div>
                ))
              ) : (
                <>
                  <StatusCard
                    title="Total Articles"
                    value={metrics?.totalArticles || 0}
                    icon={<Newspaper />}
                    iconBgColor="bg-blue-100"
                    iconColor="text-primary"
                    trend={{
                      value: metrics?.articleGrowth || "0%",
                      isPositive: !(metrics?.articleGrowth || "0%").includes('-')
                    }}
                    note="from last month"
                  />
                  
                  <StatusCard
                    title="Drafts"
                    value={metrics?.draftArticles || 0}
                    icon={<Clock />}
                    iconBgColor="bg-yellow-100"
                    iconColor="text-yellow-600"
                    footer={
                      <Link href="/articles?status=draft" className="text-sm text-primary hover:underline flex items-center">
                        <span>View drafts</span>
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Link>
                    }
                  />
                  
                  <StatusCard
                    title="Published Today"
                    value={metrics?.publishedToday || 0}
                    icon={<CheckCircle />}
                    iconBgColor="bg-green-100"
                    iconColor="text-green-600"
                  />
                </>
              )}
            </div>
            
  

            {/* Recent Articles Section */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Recent Publications</h2>
                <Link href="/articles">
                  <Button variant="outline" size="sm">
                    View all
                  </Button>
                </Link>
              </div>
              {isLoadingArticles ? (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                    <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  {recentArticles && recentArticles.length > 0 ? (
                    <div className="divide-y divide-gray-200">
                      {recentArticles.map((article) => (
                        <div key={article.id} className="p-4 hover:bg-gray-50">
                          <div className="flex items-center">
                            {article.imageUrl ? (
                              <div className="flex-shrink-0 mr-4">
                                <img 
                                  src={article.imageUrl} 
                                  alt={article.title} 
                                  className="h-16 w-16 object-cover rounded"
                                />
                              </div>
                            ) : (
                              <div className="flex-shrink-0 mr-4">
                                <div className="h-16 w-16 rounded bg-gray-200 flex items-center justify-center text-gray-500">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              </div>
                            )}
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">{article.title}</h3>
                              <p className="text-xs text-gray-500 mt-1">
                                By {article.author} - Published {article.publishedAt 
                                  ? new Date(article.publishedAt).toLocaleDateString() 
                                  : article.createdAt 
                                    ? new Date(article.createdAt).toLocaleDateString() 
                                    : new Date().toLocaleDateString()}
                              </p>
                              <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                {article.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-gray-500">No recently published articles</p>
                      <Link href="/articles?action=create">
                        <Button variant="outline" size="sm" className="mt-4">
                          Create your first article
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drafts Section */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Drafts</h2>
                <Link href="/articles?status=draft">
                  <Button variant="outline" size="sm">
                    View all
                  </Button>
                </Link>
              </div>
              {isLoadingArticles ? (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                    <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  {draftArticles && draftArticles.length > 0 ? (
                    <div className="divide-y divide-gray-200">
                      {draftArticles.map((article) => (
                        <div key={article.id} className="p-4 hover:bg-gray-50">
                          <div className="flex items-center">
                            {article.imageUrl ? (
                              <div className="flex-shrink-0 mr-4">
                                <img 
                                  src={article.imageUrl} 
                                  alt={article.title} 
                                  className="h-16 w-16 object-cover rounded"
                                />
                              </div>
                            ) : (
                              <div className="flex-shrink-0 mr-4">
                                <div className="h-16 w-16 rounded bg-gray-200 flex items-center justify-center text-gray-500">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              </div>
                            )}
                            <div className="flex-1">
                              <h3 className="text-sm font-medium text-gray-900">{article.title}</h3>
                              <p className="text-xs text-gray-500 mt-1">
                                By {article.author} - Submitted {article.createdAt 
                                  ? new Date(article.createdAt).toLocaleDateString() 
                                  : new Date().toLocaleDateString()}
                              </p>
                              <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                {article.description}
                              </p>
                            </div>
                            <div className="ml-4">
                              <Link href={`/articles?id=${article.id}`}>
                                <Button size="sm">Review</Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-gray-500">No draft articles</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
