import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Article, InsertArticle, TeamMember } from "@shared/schema";
import { Loader2, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Checkbox } from "@/components/ui/checkbox";

interface EditArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: Article | null;
}

export function EditArticleModal({ isOpen, onClose, article }: EditArticleModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<InsertArticle>>({});
  
  // Load team members for author selection
  const { data: teamMembers, isLoading: isLoadingTeamMembers } = useQuery<TeamMember[]>({
    queryKey: ['/api/team-members'],
  });

  // Initialize form with article data when modal opens
  useEffect(() => {
    if (isOpen && article) {
      const formDataToUse = { ...article };
      
      // Format date for datetime-local input - use Scheduled or fallback to publishedAt
      const dateToFormat = formDataToUse.Scheduled || formDataToUse.publishedAt;
      if (dateToFormat) {
        // Make sure it's in the right format for datetime-local input
        const scheduledDate = new Date(dateToFormat);
        if (!isNaN(scheduledDate.getTime())) {
          // Format as YYYY-MM-DDThh:mm
          const year = scheduledDate.getFullYear();
          const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
          const day = String(scheduledDate.getDate()).padStart(2, '0');
          const hours = String(scheduledDate.getHours()).padStart(2, '0');
          const minutes = String(scheduledDate.getMinutes()).padStart(2, '0');
          
          formDataToUse.Scheduled = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
      }
      
      // Handle empty author field
      if (!formDataToUse.author) {
        formDataToUse.author = "none";
      }
      
      setFormData(formDataToUse);
    }
  }, [isOpen, article]);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle select changes
  const handleSelectChange = (name: string, value: string) => {
    // Handle "none" value as empty string for author
    if (name === "author" && value === "none") {
      setFormData((prev) => ({ ...prev, [name]: "" }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };
  
  // Handle checkbox changes
  const handleCheckboxChange = (name: string, checked: boolean) => {
    if (name === "featured") {
      setFormData((prev) => ({ ...prev, [name]: checked ? "yes" : "no" }));
    } else if (name === "status") {
      setFormData((prev) => ({ ...prev, [name]: checked ? "published" : "draft" }));
    }
  };

  // Update article mutation
  const updateArticleMutation = useMutation({
    mutationFn: async (articleData: InsertArticle) => {
      if (!article?.id) throw new Error("No article ID provided");
      
      const res = await apiRequest("PUT", `/api/articles/${article.id}`, articleData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      toast({
        title: "Article updated",
        description: "The article has been updated successfully.",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error updating article",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) {
      toast({
        title: "Missing required fields",
        description: "Please provide a title for the article.",
        variant: "destructive",
      });
      return;
    }

    updateArticleMutation.mutate(formData as InsertArticle);
  };

  if (!article) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl mr-2">Edit Article</DialogTitle>
            <StatusBadge status={article.status || "draft"} />
          </div>
          <DialogDescription>
            Edit article details and scheduling
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                name="title"
                value={formData.title || ""}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status || "draft"}
                onValueChange={(value) => handleSelectChange("status", value)}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="author">Author</Label>
              <Select
                value={formData.author || "none"}
                onValueChange={(value) => handleSelectChange("author", value)}
              >
                <SelectTrigger id="author">
                  <SelectValue placeholder="Select an author" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers?.map((member) => (
                    <SelectItem key={member.id} value={member.name}>
                      {member.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="Scheduled">Scheduled Publish Date</Label>
              <Input
                id="Scheduled"
                name="Scheduled"
                type="datetime-local"
                value={formData.Scheduled || ""}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description || ""}
              onChange={handleInputChange}
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="featured"
              checked={formData.featured === "yes"}
              onCheckedChange={(checked) => 
                handleCheckboxChange("featured", checked === true)
              }
            />
            <Label htmlFor="featured" className="cursor-pointer">Feature this article</Label>
          </div>

          <DialogFooter className="flex justify-between gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={updateArticleMutation.isPending}>
              {updateArticleMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}