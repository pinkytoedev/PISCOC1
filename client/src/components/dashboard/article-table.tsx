import { useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Article } from "@shared/schema";
import { Edit, Eye, Trash2, Info } from "lucide-react";
import { SiDiscord, SiAirtable, SiInstagram } from "react-icons/si";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";

interface ArticleTableProps {
  filter?: string;
  sort?: string;
  onEdit?: (article: Article) => void;
  onView?: (article: Article) => void;
  onDelete?: (article: Article) => void;
}

export function ArticleTable({ filter, sort, onEdit, onView, onDelete }: ArticleTableProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: articles, isLoading } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
  });
  
  const deleteArticleMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/articles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      toast({
        title: "Article deleted",
        description: "The article has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting article",
        description: error.message || "There was an error deleting the article.",
        variant: "destructive",
      });
    },
  });
  
  const handleDelete = (article: Article) => {
    if (onDelete) {
      onDelete(article);
    } else {
      if (confirm("Are you sure you want to delete this article?")) {
        deleteArticleMutation.mutate(article.id);
      }
    }
  };
  
  // Filter articles first
  const filteredArticles = articles?.filter(article => {
    // Filter by search query
    if (searchQuery && !article.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // Filter by status
    if (filter && article.status !== filter) {
      return false;
    }
    
    return true;
  });
  
  // Then sort articles based on sort parameter
  const sortedArticles = filteredArticles ? [...filteredArticles].sort((a, b) => {
    if (!sort || sort === 'newest') {
      // Sort by newest first (created/updated date)
      return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime();
    } else if (sort === 'oldest') {
      // Sort by oldest first
      return new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime();
    } else if (sort === 'chronological') {
      // Sort by the article publishedAt field (from Airtable's Date field)
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      
      // If both have dates, sort by those dates
      if (dateA && dateB) {
        return dateB - dateA; // Most recent dates first
      }
      
      // If only one has a date, prioritize the one with a date
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      
      // If neither has a date, fall back to createdAt
      return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime();
    }
    
    return 0;
  }) : [];
  
  // Function to truncate text with ellipsis
  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };
  
  // Function to format tags nicely
  const formatTags = (hashtags: string | null) => {
    if (!hashtags) return [];
    return hashtags.split(' ')
      .filter(tag => tag.trim() !== '')
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`);
  };
  
  const getSourceIcon = (source: string | null) => {
    if (!source) return null;
    
    if (source.includes('discord')) {
      return <SiDiscord className="text-[#5865F2] mr-1" />;
    } else if (source.includes('airtable')) {
      return <SiAirtable className="text-[#3074D8] mr-1" />;
    } else if (source.includes('instagram')) {
      return <SiInstagram className="text-pink-600 mr-1" />;
    } else {
      return null;
    }
  };
  
  const getArticleDetails = (article: Article) => {
    if (article.source === 'airtable') {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-1">
              <Info className="h-4 w-4 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-96 max-w-[95vw]">
            <div className="px-2 py-1.5 text-sm font-semibold">Airtable Details</div>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-sm space-y-2 max-h-[60vh] overflow-y-auto">
              {/* Core Details */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 text-muted-foreground">External ID:</div>
                <div className="col-span-2 font-mono text-xs bg-gray-100 p-1 rounded break-all">
                  {article.externalId || 'N/A'}
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 text-muted-foreground">Format:</div>
                <div className="col-span-2">{article.contentFormat || 'N/A'}</div>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 text-muted-foreground">Featured:</div>
                <div className="col-span-2">{article.featured === 'yes' ? 'Yes' : 'No'}</div>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 text-muted-foreground">Status:</div>
                <div className="col-span-2">
                  <StatusBadge status={article.status || 'draft'} />
                </div>
              </div>
              
              {/* Publication Details */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 text-muted-foreground">Published:</div>
                <div className="col-span-2">
                  {article.publishedAt 
                    ? new Date(article.publishedAt).toLocaleString() 
                    : 'Not published'}
                </div>
              </div>
              
              {/* Meta Details */}
              {article.author && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1 text-muted-foreground">Author:</div>
                  <div className="col-span-2 truncate">{article.author}</div>
                </div>
              )}
              
              {article.photo && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1 text-muted-foreground">Photo:</div>
                  <div className="col-span-2 truncate">{article.photo}</div>
                </div>
              )}
              
              {/* Hashtags */}
              {article.hashtags && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1 text-muted-foreground">Tags:</div>
                  <div className="col-span-2 flex flex-wrap gap-1">
                    {formatTags(article.hashtags).map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Content Preview */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 text-muted-foreground">Description:</div>
                <div className="col-span-2 text-xs line-clamp-2">{article.description || 'N/A'}</div>
              </div>
              
              <div className="mt-2 border-t pt-2">
                <div className="text-xs text-gray-500 mb-1">Content Preview:</div>
                <div className="text-xs bg-gray-50 p-2 rounded-md max-h-[100px] overflow-y-auto">
                  {article.content ? (
                    article.contentFormat === 'html' ? (
                      <div className="prose prose-sm max-w-none">
                        {truncateText(article.content.replace(/<[^>]*>/g, ' '), 300)}
                      </div>
                    ) : (
                      truncateText(article.content, 300)
                    )
                  ) : 'No content available'}
                </div>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return null;
  };
  
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">
          {filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Articles` : 'All Articles'}
        </h2>
        <div className="relative">
          <input
            type="text" 
            placeholder="Search articles..." 
            className="border border-gray-300 rounded-md px-4 py-2 text-sm w-64 focus:ring-primary focus:border-primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Author
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Published
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Source
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center">
                  Loading articles...
                </td>
              </tr>
            ) : sortedArticles && sortedArticles.length > 0 ? (
              sortedArticles.map((article) => (
                <tr key={article.id} className={article.source === 'airtable' ? 'bg-blue-50/30' : ''}>
                  <td className="px-6 py-4">
                    <div className="flex items-start">
                      <div className="h-10 w-10 flex-shrink-0">
                        {article.imageUrl ? (
                          <img className="h-10 w-10 rounded object-cover" src={article.imageUrl} alt="" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-gray-200 flex items-center justify-center text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="ml-4 max-w-xs">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                                {truncateText(article.title, 35)}
                              </div>
                            </TooltipTrigger>
                            {article.title.length > 35 && (
                              <TooltipContent>
                                <p className="max-w-xs">{article.title}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                        
                        {article.description && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-xs text-gray-500 truncate max-w-[200px] mt-1">
                                  {truncateText(article.description, 40)}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-sm">{article.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        
                        {article.hashtags && (
                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap">
                            {formatTags(article.hashtags).slice(0, 3).map((tag, index) => (
                              <Badge key={index} variant="outline" className="mr-1 mb-1 text-xs py-0">
                                {tag}
                              </Badge>
                            ))}
                            {formatTags(article.hashtags).length > 3 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="mr-1 mb-1 text-xs py-0">
                                      +{formatTags(article.hashtags).length - 3}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="flex flex-wrap gap-1 max-w-xs">
                                      {formatTags(article.hashtags).slice(3).map((tag, index) => (
                                        <Badge key={index} variant="outline" className="text-xs py-0">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 truncate max-w-[120px]" title={article.author}>
                      {article.author}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={article.status || 'draft'} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : '--'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <span className="flex items-center">
                        {getSourceIcon(article.source)}
                        {article.source ? article.source.charAt(0).toUpperCase() + article.source.slice(1) : 'Unknown'}
                      </span>
                      {getArticleDetails(article)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit && onEdit(article)}
                        className="text-primary hover:text-blue-700"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onView && onView(article)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(article)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center">
                  No articles found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
