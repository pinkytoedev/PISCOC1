import { useState, useEffect, useRef } from "react";
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
import { Loader2, AlertCircle, RefreshCw, Upload, Image as ImageIcon, Check } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

interface CreateArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  editArticle?: any;
}

export function CreateArticleModal({ isOpen, onClose, editArticle }: CreateArticleModalProps) {
  const { toast } = useToast();
  const isEditing = !!editArticle;
  const isFromAirtable = editArticle?.source === 'airtable';
  
  // File input reference and upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
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

  // Initialize the upload image mutation
  const uploadImageMutation = useMutation({
    mutationFn: async ({ articleId, file }: { articleId: number, file: File }) => {
      // Create form data for file upload
      const formData = new FormData();
      formData.append('image', file);
      
      // Track upload progress
      const xhr = new XMLHttpRequest();
      
      // Return a promise that resolves when the upload is complete
      return new Promise<any>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              
              // Log the response for debugging
              console.log('Upload response:', response);
              
              // Check if the image URL is in the expected location from Airtable
              if (response?.airtableResponse?.fields?.MainImage?.[0]?.url) {
                console.log('Image URL found in Airtable response:', response.airtableResponse.fields.MainImage[0].url);
              }
              
              resolve(response);
            } catch (error) {
              console.error('Failed to parse response:', error);
              reject(new Error('Failed to parse response'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              console.error('Upload error details:', errorData);
              reject(new Error(errorData.message || `Upload failed with status ${xhr.status}`));
            } catch (e) {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed - network error'));
        });
        
        xhr.addEventListener('abort', () => {
          reject(new Error('Upload aborted'));
        });
        
        // Open and send the request
        xhr.open('POST', `/api/upload/article-image/${articleId}`);
        xhr.send(formData);
      });
    },
    onSuccess: (data) => {
      console.log('Upload success response:', data);
      
      // Try to get the image URL from different potential locations in the response
      let imageUrl = '';
      
      // First try the direct imageUrl property (set by our backend)
      if (data.imageUrl) {
        imageUrl = data.imageUrl;
      } 
      // Then try to extract from the Airtable response if available
      else if (data.airtableResponse?.fields?.MainImage?.[0]?.url) {
        imageUrl = data.airtableResponse.fields.MainImage[0].url;
      }
      // Then try to extract from the Airtable response if in a different format
      else if (data.airtableResponse?.fields?.MainImage?.[0]?.thumbnails?.full?.url) {
        imageUrl = data.airtableResponse.fields.MainImage[0].thumbnails.full.url;
      }
      
      if (imageUrl) {
        console.log('Using image URL:', imageUrl);
        
        // Update the form with the new image URL
        setFormData(prev => ({
          ...prev,
          imageUrl: imageUrl,
          imageType: 'url',
          imagePath: null
        }));
        
        toast({
          title: "Image uploaded",
          description: "Image was successfully uploaded and linked to the article in Airtable.",
        });
      } else {
        console.warn('No image URL found in response');
        toast({
          title: "Image upload completed",
          description: "The image was uploaded, but the URL couldn't be retrieved. The article will be updated with the image in Airtable.",
        });
      }
      
      // Reset upload state
      setIsUploading(false);
      setUploadProgress(0);
    },
    onError: (error) => {
      setIsUploading(false);
      setUploadProgress(0);
      
      toast({
        title: "Image upload failed",
        description: error.message || "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const selectedFile = files[0];
      setImageFile(selectedFile);
      
      // Create preview for the selected image
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  // Handle upload button click
  const handleUploadClick = () => {
    if (!imageFile || !isEditing || !editArticle?.id) {
      toast({
        title: "Cannot upload image",
        description: isEditing 
          ? "Please select an image file first." 
          : "Save the article before uploading an image.",
        variant: "destructive",
      });
      return;
    }
    
    if (editArticle.source !== 'airtable' || !editArticle.externalId) {
      toast({
        title: "Upload not supported",
        description: "Image upload to Airtable is only supported for articles imported from Airtable.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    uploadImageMutation.mutate({ 
      articleId: editArticle.id, 
      file: imageFile 
    });
  };

  // Clear the selected image
  const handleClearImage = () => {
    setImageFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
    // Use full ISO format with timezone for Airtable
    if (submissionData.publishedAt instanceof Date) {
      // Set the complete ISO string for Airtable which expects timestamps
      submissionData.date = submissionData.publishedAt.toISOString();
      console.log("Preserving Airtable date format for article from Airtable source");
    }
    
    // Set the finished field based on status
    submissionData.finished = submissionData.status === "published";
    
    // If an image file is selected and we're creating/editing an article for Airtable
    if (imageFile && isFromAirtable) {
      // Store the file temporarily in localStorage for use when updating to Airtable
      // We only save the filename and file size as a reference - the actual file object
      // cannot be stored in localStorage but is kept in memory until page refresh
      const articleId = isEditing ? editArticle.id : null;
      
      // Store a reference to the selected file in sessionStorage
      // This will be used when clicking "Update in Airtable" button later
      if (articleId) {
        try {
          window.sessionStorage.setItem(`article_image_${articleId}`, JSON.stringify({
            name: imageFile.name,
            size: imageFile.size,
            type: imageFile.type,
            lastModified: imageFile.lastModified,
            selected: true,
            timestamp: new Date().getTime()
          }));
          console.log(`Saved image reference for article ID ${articleId} in session storage`);
        } catch (error) {
          console.error("Failed to save image reference to session storage:", error);
        }
      }
    }
    
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

            {/* Image selection section - only shown when editing an Airtable article */}
            {isEditing && isFromAirtable && (
              <div className="col-span-2 mt-2 p-4 border border-gray-200 rounded-md">
                <div className="flex items-center mb-2">
                  <ImageIcon className="h-4 w-4 mr-2 text-gray-600" />
                  <Label className="font-medium">Select Image for Airtable</Label>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                  {/* Image preview */}
                  {previewUrl && (
                    <div className="sm:col-span-4 relative">
                      <div className="rounded-md overflow-hidden border border-gray-200 aspect-video bg-gray-50 flex items-center justify-center">
                        <img 
                          src={previewUrl} 
                          alt="Preview" 
                          className="object-cover w-full h-full" 
                        />
                      </div>
                      <button 
                        type="button"
                        onClick={handleClearImage}
                        className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-sm border border-gray-200"
                        aria-label="Clear image"
                      >
                        <AlertCircle className="h-4 w-4 text-gray-600" />
                      </button>
                    </div>
                  )}
                  
                  {/* Image selection controls */}
                  <div className={`${previewUrl ? 'sm:col-span-8' : 'sm:col-span-12'}`}>
                    <div className="mb-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                        id="image-upload"
                      />
                      
                      <div className="flex space-x-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {imageFile ? 'Change Image' : 'Select Image'}
                        </Button>
                      </div>
                    </div>
                    
                    {imageFile && (
                      <div className="text-sm text-gray-600">
                        <p>Selected: {imageFile.name} ({Math.round(imageFile.size / 1024)} KB)</p>
                      </div>
                    )}
                    
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
                      <p className="text-xs text-blue-700">
                        <AlertCircle className="h-3 w-3 inline-block mr-1" />
                        <strong>Important:</strong> After saving this article, use the "Update in Airtable" button in the article list to upload this image to Airtable.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
