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
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
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
    date: "", // Airtable Date field
    finished: false, // Airtable Finished checkbox
  };
  
  const [formData, setFormData] = useState<Partial<InsertArticle>>(
    editArticle || defaultForm
  );
  
  // Reset form when modal opens/closes or article changes
  useEffect(() => {
    if (isOpen) {
      let formDataToUse = editArticle ? { ...editArticle } : defaultForm;
      
      // Convert publishedAt to a Date object if it exists and is a string
      if (formDataToUse.publishedAt && typeof formDataToUse.publishedAt === 'string') {
        formDataToUse = {
          ...formDataToUse,
          publishedAt: new Date(formDataToUse.publishedAt)
        };
      }
      
      setFormData(formDataToUse);
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
    
    // Create a copy of the form data to modify
    const submissionData = { ...formData };
    
    // Handle publishedAt field for validation
    // Always ensure publishedAt is a proper Date object or null
    if (submissionData.publishedAt) {
      // If publishedAt is a string (from JSON or form input), convert it to a Date
      if (typeof submissionData.publishedAt === 'string') {
        try {
          submissionData.publishedAt = new Date(submissionData.publishedAt);
          // Check for invalid date
          if (isNaN(submissionData.publishedAt.getTime())) {
            // If date is invalid, set it to current date
            submissionData.publishedAt = new Date();
          }
        } catch (error) {
          // If date parsing fails completely, set to current date
          submissionData.publishedAt = new Date();
        }
      }
    } 
    // For articles being published without a date, set to current date
    else if (submissionData.status === "published") {
      submissionData.publishedAt = new Date();
    }
    
    // Always set the Airtable date field from publishedAt if it exists
    if (submissionData.publishedAt instanceof Date) {
      submissionData.date = submissionData.publishedAt.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    
    // Set the finished field based on status
    submissionData.finished = submissionData.status === "published";
    
    console.log("Submitting article with publishedAt:", submissionData.publishedAt);
    console.log("Airtable date field:", submissionData.date);
    console.log("Finished status:", submissionData.finished);
    
    createArticleMutation.mutate(submissionData as InsertArticle);
  };

  // We've removed the updateAirtableMutation from here to prevent redundancy
  // Now the Airtable updates are only handled from the article table list view

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Article" : "Create New Article"}</DialogTitle>
          <DialogDescription>
            Fill in the details below to {isEditing ? "update the" : "create a new"} article. You can {isEditing ? "change" : "edit"} content after creation.
          </DialogDescription>
        </DialogHeader>

        {isFromAirtable && (
          <div className="mb-4 p-4 border border-blue-200 bg-blue-50 rounded-md">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-blue-500 mr-2" />
              <h5 className="text-sm font-medium text-blue-700">Airtable Source</h5>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              This article was imported from Airtable. Your changes will update the local copy.
              To push changes back to Airtable, use the "Update in Airtable" button in the article list after saving.
            </p>
            <span className="text-xs text-blue-600 mt-3 block">
              <span className="font-semibold">Airtable ID:</span> <code className="px-1 py-0.5 bg-white rounded text-xs font-mono">{editArticle.externalId}</code>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                value={formData.description || ''}
                onChange={handleInputChange}
                placeholder="Brief description for article listing and previews"
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
                rows={5}
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
              <Label htmlFor="date">Publication Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                value={formData.date || ''}
                onChange={handleInputChange}
                placeholder="YYYY-MM-DD"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used for Airtable chronological ordering
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
