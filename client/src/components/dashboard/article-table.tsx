import { useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Article } from "@shared/schema";
import { Edit, Eye, Trash2 } from "lucide-react";
import { SiDiscord, SiAirtable, SiInstagram } from "react-icons/si";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ArticleTableProps {
  filter?: string;
  onEdit?: (article: Article) => void;
  onView?: (article: Article) => void;
  onDelete?: (article: Article) => void;
}

export function ArticleTable({ filter, onEdit, onView, onDelete }: ArticleTableProps) {
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
  
  const getSourceIcon = (source: string) => {
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
            ) : filteredArticles && filteredArticles.length > 0 ? (
              filteredArticles.map((article) => (
                <tr key={article.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
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
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{article.title}</div>
                        {article.hashtags && (
                          <div className="text-sm text-gray-500">
                            {article.hashtags.split(' ').map((tag, index) => (
                              <span key={index} className="mr-2">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{article.author}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={article.status || 'draft'} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : '--'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="flex items-center">
                      {getSourceIcon(article.source)}
                      {article.source.charAt(0).toUpperCase() + article.source.slice(1)}
                    </span>
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
