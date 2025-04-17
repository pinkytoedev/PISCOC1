import { useState } from "react";
import { Article } from "@shared/schema";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Calendar, User, Tag, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ViewArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: Article | null;
}

export function ViewArticleModal({ isOpen, onClose, article }: ViewArticleModalProps) {
  if (!article) {
    return null;
  }

  // Function to format dates
  const formatDate = (date: string | Date | null) => {
    if (!date) return "Not available";
    
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      
      // Check if date is valid
      if (isNaN(dateObj.getTime())) return "Invalid date";
      
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric', 
        month: 'long', 
        day: 'numeric'
      });
    } catch (error) {
      return "Invalid date format";
    }
  };

  // Function to format tags nicely
  const formatTags = (hashtags: string | null) => {
    if (!hashtags) return [];
    return hashtags.split(' ')
      .filter(tag => tag.trim() !== '')
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`);
  };

  // Function to render content based on format
  const renderContent = (content: string | null, format: string | null) => {
    if (!content) return <p className="text-gray-500 italic">No content available</p>;
    
    if (format === 'html') {
      return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: content }} />;
    } else if (format === 'plaintext' || format === 'txt') {
      // For plain text, preserve line breaks and spacing
      return (
        <div className="font-mono text-sm bg-gray-50 p-4 rounded-md shadow-inner whitespace-pre-wrap">
          {content}
        </div>
      );
    } else if (format === 'rtf') {
      // For RTF, we can't render it directly, so we show it as plain text with a note
      return (
        <>
          <div className="bg-yellow-50 text-yellow-800 p-2 mb-2 rounded-md text-sm">
            RTF content preview (formatting may differ from original)
          </div>
          <div className="whitespace-pre-wrap">{content}</div>
        </>
      );
    } else {
      // Default fallback for any other format
      return <div className="whitespace-pre-wrap">{content}</div>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">{article.title || "Untitled Article"}</DialogTitle>
            <StatusBadge status={article.status || "draft"} />
          </div>
          <DialogDescription>
            {article.description || "No description available"}
          </DialogDescription>
        </DialogHeader>

        {/* Article Header Section */}
        <div className="flex flex-col gap-4 my-4">
          {/* Article Details */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            {article.author && (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span>{article.author}</span>
              </div>
            )}
            
            {article.publishedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(article.publishedAt)}</span>
              </div>
            )}
            
            {!article.publishedAt && article.createdAt && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>Created: {formatDate(article.createdAt)}</span>
              </div>
            )}
            
            {article.featured === 'yes' && (
              <Badge variant="default" className="bg-amber-500">Featured</Badge>
            )}
          </div>

          {/* Main Image */}
          {article.imageUrl && (
            <div className="my-4 rounded-lg overflow-hidden shadow-sm">
              <img 
                src={article.imageUrl} 
                alt={article.title || "Article preview"} 
                className="w-full h-auto object-cover"
              />
              {article.photo && (
                <div className="bg-gray-100 px-3 py-1 text-xs text-gray-500">
                  Photo: {article.photo}
                </div>
              )}
            </div>
          )}
          
          {/* Tags */}
          {article.hashtags && (
            <div className="flex flex-wrap gap-2 my-2">
              <Tag className="h-4 w-4 text-gray-500" />
              {formatTags(article.hashtags).map((tag, index) => (
                <Badge key={index} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <Separator />
          
          {/* Content */}
          <div className="prose prose-sm max-w-none">
            {renderContent(article.content, article.contentFormat)}
          </div>
          
          {/* Source Info */}
          <div className="text-xs text-gray-500 mt-4 pt-4 border-t">
            Source: {article.source || "Local"} 
            {article.externalId && (
              <span className="ml-2">• ID: {article.externalId}</span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}