import { useState, useRef, useCallback, useEffect } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Article } from "@shared/schema";
import { Edit, Eye, Trash2, Info, RefreshCw, Loader2, Upload, Image, ImagePlus, ChevronDown } from "lucide-react";
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
  const [showCreationDate, setShowCreationDate] = useState(false);
  const mainImageFileInputRef = useRef<HTMLInputElement>(null);
  const instaImageFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingArticleId, setUploadingArticleId] = useState<number | null>(null);
  const [uploadingField, setUploadingField] = useState<'MainImage' | 'instaPhoto' | null>(null);
  const [pushingArticleId, setPushingArticleId] = useState<number | null>(null);
  const [autoPublishingArticleId, setAutoPublishingArticleId] = useState<number | null>(null);
  
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
      
      // After updating to published, update in Airtable if it's an Airtable article
      const article = articles?.find(a => a.id === variables.id);
      if (article && article.source === 'airtable' && article.externalId) {
        updateAirtableMutation.mutate(article.id);
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
  
  // Function to check if an article should be published based on its scheduled date
  const checkAndPublishScheduledArticles = () => {
    if (!articles || articles.length === 0) return;
    
    const now = new Date();
    
    // Find articles that are scheduled and their published date has passed
    const articlesToPublish = articles.filter(article => {
      // Only check articles that have a publish date, are not already published, and are in the "scheduled" status
      if (!article.publishedAt || article.status === 'published') {
        return false;
      }
      
      const scheduledDate = new Date(article.publishedAt);
      return scheduledDate <= now && article.status === 'scheduled';
    });
    
    // Publish each article that needs to be published
    articlesToPublish.forEach(article => {
      updateArticleStatusMutation.mutate({
        id: article.id,
        status: 'published'
      });
    });
  };
  
  // Set up periodic checking for articles that need to be published
  useEffect(() => {
    // Check immediately when component mounts or articles data changes
    checkAndPublishScheduledArticles();
    
    // Set up interval to check every minute
    const intervalId = setInterval(checkAndPublishScheduledArticles, 60000);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [articles]);
  
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
      // Sort by the article Date field from Airtable (stored in publishedAt)
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
                  {article.publishedAt 
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
              <div key={article.id} className="bg-white rounded-lg shadow p-4">
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
          </div>
        )}
      </div>
    </div>
  );
}
