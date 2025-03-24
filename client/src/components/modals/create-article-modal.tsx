import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { InsertArticle, TeamMember } from "@shared/schema";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

interface CreateArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  editArticle?: any;
}

export function CreateArticleModal({ isOpen, onClose, editArticle }: CreateArticleModalProps) {
  const { toast } = useToast();
  const isEditing = !!editArticle;
  const isFromAirtable = editArticle?.source === 'airtable';
  
  // Default values for new article
  const defaultForm: Partial<InsertArticle> = {
    title: "",
    description: "",
    excerpt: null, // Changed to null as it's not used in Airtable
    content: "",
    contentFormat: "html", // Default to HTML as that's what Airtable uses
    imageUrl: "",
    imageType: "url",
    imagePath: null,
    featured: "no",
    author: "",
    photo: "",
    photoCredit: null, // Changed to null as it's not used in Airtable schema
    status: "draft",
    hashtags: "",
  };
  
  const [formData, setFormData] = useState<Partial<InsertArticle>>(
    editArticle || defaultForm
  );
  
  // Reset form when modal opens/closes or article changes
  useEffect(() => {
    if (isOpen) {
      setFormData(editArticle || defaultForm);
    }
  }, [isOpen, editArticle]);

  const { data: teamMembers, isLoading: isLoadingTeamMembers } = useQuery<TeamMember[]>({
    queryKey: ['/api/team-members'],
  });

  const createArticleMutation = useMutation({
    mutationFn: async (article: InsertArticle) => {
      const res = await apiRequest(
        isEditing ? "PUT" : "POST", 
        isEditing ? `/api/articles/${editArticle.id}` : "/api/articles", 
        article
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      toast({
        title: isEditing ? "Article updated" : "Article created",
        description: isEditing 
          ? "The article has been updated successfully." 
          : "The article has been created successfully.",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: isEditing ? "Error updating article" : "Error creating article",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  
  const handleCheckboxChange = (name: string, checked: boolean) => {
    if (name === "featured") {
      setFormData((prev) => ({ ...prev, [name]: checked ? "yes" : "no" }));
    } else if (name === "status") {
      setFormData((prev) => ({ ...prev, [name]: checked ? "published" : "draft" }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Set publication date if publishing
    if (formData.status === "published" && !formData.publishedAt) {
      formData.publishedAt = new Date();
    }
    
    createArticleMutation.mutate(formData as InsertArticle);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Article" : "Create New Article"}</DialogTitle>
          <DialogDescription>
            Fill in the details below to {isEditing ? "update the" : "create a new"} article. You can {isEditing ? "change" : "edit"} content after creation.
          </DialogDescription>
        </DialogHeader>

        {isFromAirtable && (
          <Alert variant="info" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Airtable Source</AlertTitle>
            <AlertDescription>
              This article was imported from Airtable. Updates may be synchronized with Airtable during the next sync operation.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Article title"
                required
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description for article listing and previews"
                rows={3}
                required
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                name="excerpt"
                value={formData.excerpt || ''}
                onChange={handleInputChange}
                placeholder="Short excerpt or summary"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="author">Author</Label>
              {isLoadingTeamMembers ? (
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Loading authors..." />
                  </SelectTrigger>
                </Select>
              ) : (
                <Select 
                  name="author" 
                  value={formData.author} 
                  onValueChange={(value) => handleSelectChange("author", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an author" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers?.map((member) => (
                      <SelectItem key={member.id} value={member.name}>
                        {member.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="Anonymous">Anonymous</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label htmlFor="contentFormat">Content Format</Label>
              <Select 
                name="contentFormat" 
                value={formData.contentFormat} 
                onValueChange={(value) => handleSelectChange("contentFormat", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown</SelectItem>
                  <SelectItem value="rtf">Rich Text</SelectItem>
                  <SelectItem value="plaintext">Plain Text</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                name="content"
                value={formData.content}
                onChange={handleInputChange}
                placeholder="Article content"
                rows={8}
                className="font-mono"
                required
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                name="imageUrl"
                value={formData.imageUrl}
                onChange={handleInputChange}
                placeholder="URL for article cover image"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter a direct link to an image for the article cover
              </p>
            </div>

            <div>
              <Label htmlFor="photoCredit">Photo Credit</Label>
              <Input
                id="photoCredit"
                name="photoCredit"
                value={formData.photoCredit || ''}
                onChange={handleInputChange}
                placeholder="Credit for the photo"
              />
            </div>

            <div>
              <Label htmlFor="hashtags">Hashtags</Label>
              <Input
                id="hashtags"
                name="hashtags"
                value={formData.hashtags || ''}
                onChange={handleInputChange}
                placeholder="#development #tutorial"
              />
              <p className="text-xs text-gray-500 mt-1">
                Separate hashtags with spaces
              </p>
            </div>

            <div>
              <Label htmlFor="featured">Featured</Label>
              <Select 
                name="featured" 
                value={formData.featured} 
                onValueChange={(value) => handleSelectChange("featured", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Featured status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select 
                name="status" 
                value={formData.status} 
                onValueChange={(value) => handleSelectChange("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Article status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending Review</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createArticleMutation.isPending}>
              {createArticleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? "Updating..." : "Creating..."}
                </>
              ) : (
                isEditing ? "Update Article" : "Create Article"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
