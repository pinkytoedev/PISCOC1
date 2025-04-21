import { useState, useRef, useCallback, useEffect } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Article } from "@shared/schema";
import { Edit, Eye, Trash2, Info, RefreshCw, Loader2, Upload, Image, ImagePlus, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
  highlightedArticleId?: number | null;
}

export function ArticleTable({ filter, sort, onEdit, onView, onDelete, highlightedArticleId }: ArticleTableProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreationDate, setShowCreationDate] = useState(false);
  const mainImageFileInputRef = useRef<HTMLInputElement>(null);
  const instaImageFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingArticleId, setUploadingArticleId] = useState<number | null>(null);
  const [uploadingField, setUploadingField] = useState<'MainImage' | 'instaPhoto' | null>(null);
  const [pushingArticleId, setPushingArticleId] = useState<number | null>(null);
  const [autoPublishingArticleId, setAutoPublishingArticleId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const articlesPerPage = 15; // Show 15 articles per page
  
  const { data: articles, isLoading } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
  });
  
  // Add mutation for updating article status to published
  const updateArticleStatusMutation = useMutation({
    mutationFn: async (article: { id: number, status: string }) => {
      setAutoPublishingArticleId(article.id);
      const response = await apiRequest(
        "PUT", 
        `/api/articles/${article.id}`,
        { status: article.status }
      );
      return await response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      
      // Get the updated article
      const article = articles?.find(a => a.id === variables.id);
      
      // Handle Airtable synchronization when status is set to "published"
      if (article && variables.status === 'published') {
        if (article.source === 'airtable' && article.externalId) {
          // For existing Airtable articles, just update them
          console.log('Updating existing Airtable article:', article.id);
          updateAirtableMutation.mutate(article.id);
        } else if (article.source !== 'airtable') {
          // For non-Airtable articles, push them to Airtable
          console.log('Pushing new article to Airtable:', article.id);
          pushToAirtableMutation.mutate(article.id);
        }
      }
      
      setAutoPublishingArticleId(null);
      toast({
        title: "Article status updated",
        description: `Article status was set to "${variables.status}"`,
      });
    },
    onError: (error) => {
      setAutoPublishingArticleId(null);
      toast({
        title: "Status update failed",
        description: error.message || "Failed to update article status.",
        variant: "destructive",
      });
    },
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
  
  // Add mutation for updating article in Airtable directly
  const updateAirtableMutation = useMutation({
    mutationFn: async (articleId: number) => {
      const response = await apiRequest(
        "POST", 
        `/api/airtable/update/article/${articleId}`
      );
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      toast({
        title: "Airtable updated",
        description: "The article was successfully updated in Airtable.",
      });
    },
    onError: (error) => {
      toast({
        title: "Airtable update failed",
        description: error.message || "Failed to update article in Airtable.",
        variant: "destructive",
      });
    },
  });
  
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
  
  // Add mutation for uploading images to ImgBB (both main and insta images)
  const uploadImageMutation = useMutation({
    mutationFn: async ({ articleId, file, fieldName }: { articleId: number, file: File, fieldName: 'MainImage' | 'instaPhoto' }) => {
      const formData = new FormData();
      formData.append('image', file);
      
      // We're still using MainImage as the param, but internally the server will use MainImageLink
      const response = await fetch(`/api/imgbb/upload-to-airtable/${articleId}/${fieldName}`, {
        method: "POST",
        body: formData,
        credentials: 'include'
      });
      
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      setUploadingArticleId(null);
      setUploadingField(null);
      
      toast({
        title: "Image uploaded",
        description: `Image was successfully uploaded to ImgBB${data.airtable ? ' and Airtable' : ''}.`,
      });
    },
    onError: (error) => {
      setUploadingArticleId(null);
      setUploadingField(null);
      
      toast({
        title: "Image upload failed",
        description: error.message || "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Handle clicking the upload button for main image
  const handleMainImageUpload = (article: Article) => {
    setUploadingArticleId(article.id);
    setUploadingField('MainImage');
    mainImageFileInputRef.current?.click();
  };
  
  // Handle clicking the upload button for Instagram image
  const handleInstaImageUpload = (article: Article) => {
    setUploadingArticleId(article.id);
    setUploadingField('instaPhoto');
    instaImageFileInputRef.current?.click();
  };
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingArticleId && uploadingField) {
      uploadImageMutation.mutate({
        articleId: uploadingArticleId,
        file,
        fieldName: uploadingField
      });
    }
    
    // Reset the file input
    e.target.value = '';
  };
  
  const handleDelete = (article: Article) => {
    if (onDelete) {
      onDelete(article);
    } else {
      if (confirm("Are you sure you want to delete this article?")) {
        deleteArticleMutation.mutate(article.id);
      }
    }
  };
  
  // Track which articles we're already processing to prevent update loops
  const [processedArticleIds, setProcessedArticleIds] = useState<Set<number>>(new Set());
  
  // Function to reset the processed articles list after a time period
  // (useful when testing with the same articles repeatedly)
  const resetProcessedArticles = useCallback(() => {
    console.log("Resetting processed articles list");
    setProcessedArticleIds(new Set());
  }, []);
  
  // Periodically reset the processed articles list (every hour in production)
  useEffect(() => {
    // Reset every 10 minutes
    const resetInterval = setInterval(resetProcessedArticles, 600000);
    
    return () => clearInterval(resetInterval);
  }, [resetProcessedArticles]);

  // Function to check if an article should be published based on its scheduled date
  const checkAndPublishScheduledArticles = useCallback(() => {
    if (!articles || articles.length === 0) return;
    
    const now = new Date();
    console.log("Auto-publishing check at:", now.toISOString());
    
    // Find articles that are scheduled and their publication date has passed
    const articlesToPublish = articles.filter(article => {
      // Skip if no scheduled date is set - check Scheduled field first, then fallback to publishedAt
      const scheduledDateTime = article.Scheduled || article.publishedAt;
      if (!scheduledDateTime) {
        return false;
      }
      
      // Skip if already published or if we're already processing this article
      if (article.status === 'published' || processedArticleIds.has(article.id)) {
        return false;
      }
      
      // Skip if we're currently publishing this article
      if (autoPublishingArticleId === article.id) {
        return false;
      }
      
      const scheduledDate = new Date(scheduledDateTime);
      const shouldPublish = scheduledDate <= now;
      
      // Log potential articles for debugging
      if (shouldPublish) {
        console.log(`Article ${article.id} "${article.title}" is ready for publishing:`, {
          scheduledTime: scheduledDate.toISOString(),
          currentTime: now.toISOString(),
          currentStatus: article.status
        });
      }
      
      // Check if the scheduled date has passed
      return shouldPublish;
    });
    
    console.log(`Found ${articlesToPublish.length} articles to auto-publish`);
    
    // Only process if there are articles to publish
    if (articlesToPublish.length > 0) {
      // Add these articles to our processed set to prevent recursive updates
      const newProcessedIds = new Set(processedArticleIds);
      articlesToPublish.forEach(article => {
        newProcessedIds.add(article.id);
      });
      setProcessedArticleIds(newProcessedIds);
      
      // Process one article at a time to avoid overwhelming the server
      // We'll process the first article in the list
      const article = articlesToPublish[0];
      console.log(`Auto-publishing article ${article.id}: "${article.title}"`);
      
      updateArticleStatusMutation.mutate({
        id: article.id,
        status: 'published'
      });
    }
  }, [articles, processedArticleIds, updateArticleStatusMutation, autoPublishingArticleId]);
  
  // Set up periodic checking for articles that need to be published
  useEffect(() => {
    // Check immediately when component mounts or articles data changes
    if (articles) {
      console.log("Articles data loaded, checking for scheduled articles...");
      checkAndPublishScheduledArticles();
      
      // Set up interval to check every 60 seconds (1 minute)
      const intervalId = setInterval(checkAndPublishScheduledArticles, 60000);
      
      // Clean up interval on unmount
      return () => {
        console.log("Clearing auto-publish interval");
        clearInterval(intervalId);
      };
    }
  }, [articles, checkAndPublishScheduledArticles]);
  
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
  const sortedAllArticles = filteredArticles ? [...filteredArticles].sort((a, b) => {
    // Helper function to get the most relevant date for an article
    const getRelevantDate = (article: Article) => {
      // Prioritize Scheduled field from Airtable, then publishedAt, then createdAt
      if (article.Scheduled) return new Date(article.Scheduled).getTime();
      if (article.publishedAt) return new Date(article.publishedAt).getTime();
      return new Date(article.createdAt || '').getTime();
    };
    
    if (!sort || sort === 'newest') {
      // Sort by newest first, prioritizing Scheduled field
      return getRelevantDate(b) - getRelevantDate(a);
    } else if (sort === 'oldest') {
      // Sort by oldest first, prioritizing Scheduled field
      return getRelevantDate(a) - getRelevantDate(b);
    } else if (sort === 'chronological') {
      // Sort by the Scheduled date field from Airtable, fall back to publishedAt if not available
      const dateA = a.Scheduled ? new Date(a.Scheduled).getTime() : 
                  (a.date ? new Date(a.date).getTime() : 0);
      const dateB = b.Scheduled ? new Date(b.Scheduled).getTime() : 
                  (b.date ? new Date(b.date).getTime() : 0);
      
      // If both have dates, sort by those dates
      if (dateA && dateB) {
        return dateA - dateB; // Chronological order (oldest first)
      }
      
      // If only one has a date, prioritize the one with a date
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      
      // If neither has a date, fall back to createdAt
      return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime();
    }
    
    return 0;
  }) : [];
  
  // Calculate total pages
  const totalPages = Math.ceil((sortedAllArticles?.length || 0) / articlesPerPage);
  
  // Get paginated articles
  const sortedArticles = sortedAllArticles.slice(
    (currentPage - 1) * articlesPerPage,
    currentPage * articlesPerPage
  );
  
  // Handle page changes
  const handlePageChange = (page: number) => {
    // Ensure page is within valid range
    const newPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(newPage);
    
    // If we're changing page, scroll to top of the article table
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
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
                <div className="col-span-1 text-muted-foreground">Created:</div>
                <div className="col-span-2">
                  {article.date 
                    ? new Date(article.date).toLocaleString() 
                    : 'Not recorded'}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 text-muted-foreground">Scheduled:</div>
                <div className="col-span-2">
                  {article.Scheduled 
                    ? new Date(article.Scheduled).toLocaleString() 
                    : article.publishedAt 
                      ? new Date(article.publishedAt).toLocaleString() 
                      : 'Not scheduled'}
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
                    ) : article.contentFormat === 'plaintext' || article.contentFormat === 'txt' ? (
                      <div className="font-mono">
                        {truncateText(article.content, 300)}
                      </div>
                    ) : article.contentFormat === 'rtf' ? (
                      <div>
                        <span className="text-yellow-600 text-xs mb-1 block">RTF format</span>
                        {truncateText(article.content, 300)}
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
      {/* Hidden file inputs for image uploads */}
      <input
        type="file"
        ref={mainImageFileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={instaImageFileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      
      <div className="flex flex-col md:flex-row md:justify-between md:items-center p-4 border-b border-gray-200 gap-4">
        <h2 className="text-lg font-medium text-gray-900">
          {filter ? `${filter.charAt(0).toUpperCase() + filter.slice(1)} Articles` : 'All Articles'}
        </h2>
        <div className="relative w-full md:w-auto">
          <input
            type="text" 
            placeholder="Search articles..." 
            className="border border-gray-300 rounded-md px-4 py-2 text-sm w-full md:w-64 focus:ring-primary focus:border-primary"
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
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
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
                Photo
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center">
                <button 
                  onClick={() => setShowCreationDate(!showCreationDate)} 
                  className="flex items-center group"
                  title={showCreationDate ? "Showing Creation Date (Airtable's Date field)" : "Showing Scheduled Date (Airtable's Scheduled field)"}
                >
                  {showCreationDate ? "Created" : "Scheduled"}
                  <RefreshCw className="h-3 w-3 ml-1 opacity-20 group-hover:opacity-100 transition-opacity" />
                </button>
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
                <tr 
                  key={article.id} 
                  className={`${article.source === 'airtable' ? 'bg-blue-50/30' : ''} ${highlightedArticleId === article.id ? 'discord-highlight' : ''}`}
                >
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
                        <div 
                          className="text-sm font-medium text-gray-900 truncate max-w-[200px]"
                          title={article.title.length > 35 ? article.title : undefined}
                        >
                          {truncateText(article.title, 35)}
                        </div>
                        
                        {article.description && (
                          <div 
                            className="text-xs text-gray-500 truncate max-w-[200px] mt-1"
                            title={article.description.length > 40 ? article.description : undefined}
                          >
                            {truncateText(article.description, 40)}
                          </div>
                        )}
                        
                        {article.hashtags && (
                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap">
                            {formatTags(article.hashtags).slice(0, 3).map((tag, index) => (
                              <Badge key={index} variant="outline" className="mr-1 mb-1 text-xs py-0">
                                {tag}
                              </Badge>
                            ))}
                            {formatTags(article.hashtags).length > 3 && (
                              <div 
                                className="mr-1 mb-1 text-xs py-0 cursor-pointer"
                                title={formatTags(article.hashtags).slice(3).join(", ")}
                              >
                                <Badge variant="outline" className="text-xs py-0">
                                  +{formatTags(article.hashtags).length - 3}
                                </Badge>
                              </div>
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
                    <div className="text-sm text-gray-900 truncate max-w-[120px]" title={article.photo || ''}>
                      {article.photo || '—'}
                    </div>
                    {article.photoCredit && (
                      <div className="text-xs text-gray-500 truncate max-w-[120px]" title={article.photoCredit}>
                        Credit: {article.photoCredit}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-1">
                      <StatusBadge status={article.status || 'draft'} />
                      {autoPublishingArticleId === article.id && (
                        <div className="ml-2 flex items-center text-xs text-amber-600">
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          <span>Publishing...</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {showCreationDate 
                      ? article.date 
                        ? new Date(article.date).toLocaleDateString() 
                        : '--'
                      : article.Scheduled && article.Scheduled.length > 0
                        ? new Date(article.Scheduled).toLocaleDateString()
                        : article.publishedAt 
                          ? new Date(article.publishedAt).toLocaleDateString() 
                          : '--'
                    }
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
                      
                      {/* Main image upload button */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMainImageUpload(article)}
                              className="text-green-600 hover:text-green-800"
                              disabled={uploadImageMutation.isPending && uploadingArticleId === article.id && uploadingField === 'MainImage'}
                            >
                              {uploadImageMutation.isPending && uploadingArticleId === article.id && uploadingField === 'MainImage' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Image className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Upload Main Image</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Instagram image upload button */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleInstaImageUpload(article)}
                              className="text-pink-500 hover:text-pink-700"
                              disabled={uploadImageMutation.isPending && uploadingArticleId === article.id && uploadingField === 'instaPhoto'}
                            >
                              {uploadImageMutation.isPending && uploadingArticleId === article.id && uploadingField === 'instaPhoto' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ImagePlus className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Upload Instagram Image</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      {article.source === 'airtable' && article.externalId ? (
                        // Update button for existing Airtable articles
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updateAirtableMutation.mutate(article.id)}
                          className="text-blue-600 hover:text-blue-800"
                          disabled={updateAirtableMutation.isPending}
                          title="Update in Airtable"
                        >
                          {updateAirtableMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      ) : (
                        // Push to Airtable button for non-Airtable articles
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => pushToAirtableMutation.mutate(article.id)}
                                className="text-purple-600 hover:text-purple-800"
                                disabled={pushToAirtableMutation.isPending && pushingArticleId === article.id}
                              >
                                {pushToAirtableMutation.isPending && pushingArticleId === article.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>Push to Airtable</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
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
        
        {/* Pagination - Desktop */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{(currentPage - 1) * articlesPerPage + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * articlesPerPage, sortedAllArticles.length)}
                  </span>{' '}
                  of <span className="font-medium">{sortedAllArticles.length}</span> articles
                </p>
              </div>
              <div className="ml-4">
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 ${
                      currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 focus:z-20'
                    }`}
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      // Show all pages if total <= 5
                      pageNumber = idx + 1;
                    } else if (currentPage <= 3) {
                      // If current page is near start, show first 5 pages
                      pageNumber = idx + 1;
                    } else if (currentPage >= totalPages - 2) {
                      // If current page is near end, show last 5 pages
                      pageNumber = totalPages - 4 + idx;
                    } else {
                      // Otherwise, show 2 pages before and 2 pages after current page
                      pageNumber = currentPage - 2 + idx;
                    }
                    
                    return (
                      <button
                        key={pageNumber}
                        onClick={() => handlePageChange(pageNumber)}
                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                          currentPage === pageNumber
                            ? 'z-10 bg-primary text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                            : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 ${
                      currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 focus:z-20'
                    }`}
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="space-y-4 p-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow p-4">
                <div className="animate-pulse space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="flex justify-end">
                    <div className="h-8 bg-gray-200 rounded w-20"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : sortedArticles && sortedArticles.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white rounded-lg shadow">
            {searchQuery ? (
              <div>
                <p className="text-lg font-medium">No articles found</p>
                <p className="text-sm">Try adjusting your search query or filters</p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-medium">No articles available</p>
                <p className="text-sm">Create your first article to get started</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {sortedArticles.map((article) => (
              <div 
                key={article.id} 
                className={`bg-white rounded-lg shadow p-4 ${highlightedArticleId === article.id ? 'discord-highlight' : ''}`}
              >
                <div className="flex items-center space-x-3 mb-3">
                  {article.imageUrl ? (
                    <img 
                      src={article.imageUrl} 
                      alt="" 
                      className="h-12 w-12 rounded-md object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {article.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      ID: {article.id} • {article.source || 'Local'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end">
                    <StatusBadge status={article.status || 'draft'} />
                    {autoPublishingArticleId === article.id && (
                      <div className="flex items-center text-xs text-amber-600 mt-1">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        <span>Publishing...</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                  <div>
                    <span className="font-medium">Author:</span> {article.author || 'Unassigned'}
                  </div>
                  <div>
                    <span className="font-medium">Photo:</span> {article.photo || 'N/A'}
                  </div>
                  <div>
                    <span className="font-medium">{showCreationDate ? 'Created:' : 'Scheduled:'}</span> {
                      showCreationDate 
                        ? article.date 
                          ? new Date(article.date).toLocaleDateString() 
                          : 'Not recorded'
                        : article.Scheduled && article.Scheduled.length > 0
                          ? new Date(article.Scheduled).toLocaleDateString()
                          : article.publishedAt 
                            ? new Date(article.publishedAt).toLocaleDateString() 
                            : 'Unscheduled'
                    }
                  </div>
                  <div>
                    {article.hashtags && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formatTags(article.hashtags).slice(0, 2).map((tag, index) => (
                          <Badge key={index} variant="outline" className="text-xs py-0">
                            {tag}
                          </Badge>
                        ))}
                        {formatTags(article.hashtags).length > 2 && (
                          <Badge variant="outline" className="text-xs py-0">
                            +{formatTags(article.hashtags).length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-wrap justify-end gap-2 mt-2 border-t pt-3">
                  {/* Primary actions */}
                  {onEdit && (
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(article)}
                      className="flex-1"
                    >
                      <Edit className="h-4 w-4 mr-2" /> Edit
                    </Button>
                  )}
                  
                  {onView && (
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => onView(article)}
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-2" /> View
                    </Button>
                  )}
                  
                  {/* Secondary actions in dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        More <ChevronDown className="h-4 w-4 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {article.source === 'airtable' ? (
                        <DropdownMenuItem onClick={() => updateAirtableMutation.mutate(article.id)}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          <span>Update from Airtable</span>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => pushToAirtableMutation.mutate(article.id)}>
                          <Upload className="mr-2 h-4 w-4" />
                          <span>Push to Airtable</span>
                        </DropdownMenuItem>
                      )}
                      
                      <DropdownMenuItem onClick={() => handleMainImageUpload(article)}>
                        <Image className="mr-2 h-4 w-4" />
                        <span>Upload main image</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem onClick={() => handleInstaImageUpload(article)}>
                        <ImagePlus className="mr-2 h-4 w-4" />
                        <span>Upload Instagram image</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem 
                        onClick={() => handleDelete(article)}
                        className="text-red-500 focus:text-red-500"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
            
            {/* Pagination - Mobile */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4 rounded-lg shadow">
                <div className="flex flex-1 justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-700">
                      Page <span className="font-medium">{currentPage}</span> of{' '}
                      <span className="font-medium">{totalPages}</span>
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className={`relative inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold ${
                        currentPage === 1 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-white text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className={`relative inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold ${
                        currentPage === totalPages 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-white text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
