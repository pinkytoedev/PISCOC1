import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { StatusCard } from "@/components/dashboard/status-card";
import { ArticleTable } from "@/components/dashboard/article-table";
import { Button } from "@/components/ui/button";
import { Newspaper, Clock, CheckCircle, ChevronRight } from "lucide-react";
import { Article } from "@shared/schema";

interface DashboardMetrics {
  totalArticles: number;
  pendingArticles: number;
  publishedToday: number;
  articleGrowth: string;
}

export default function Dashboard() {
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
      // Use only the scheduled date field for sorting
      const dateA = a.scheduled ? new Date(a.scheduled).getTime() : 0;
      const dateB = b.scheduled ? new Date(b.scheduled).getTime() : 0;
      // Sort in chronological order (oldest first)
      return dateA - dateB;
    })
    .slice(0, 5);
  
  // Get pending articles for review
  const pendingArticles = articles
    ?.filter(article => article.status === "pending")
    .slice(0, 5);

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Dashboard" />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
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
                      isPositive: !metrics?.articleGrowth.includes('-')
                    }}
                    note="from last month"
                  />
                  
                  <StatusCard
                    title="Pending Approval"
                    value={metrics?.pendingArticles || 0}
                    icon={<Clock />}
                    iconBgColor="bg-yellow-100"
                    iconColor="text-yellow-600"
                    footer={
                      <Link href="/articles?status=pending" className="text-sm text-primary hover:underline flex items-center">
                        <span>Review pending</span>
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
                      <Link href="/articles/new">
                        <Button variant="outline" size="sm" className="mt-4">
                          Create your first article
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pending Review Section */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Pending Review</h2>
                <Link href="/articles?status=pending">
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
                  {pendingArticles && pendingArticles.length > 0 ? (
                    <div className="divide-y divide-gray-200">
                      {pendingArticles.map((article) => (
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
                              <Link href={`/articles/${article.id}`}>
                                <Button size="sm">Review</Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-gray-500">No articles pending review</p>
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
