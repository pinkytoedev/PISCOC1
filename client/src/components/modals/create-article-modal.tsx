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
import { Loader2, AlertCircle, RefreshCw, Upload, Image, Camera } from "lucide-react";
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

  // Refs for file inputs
  const mainImageFileInputRef = useRef<HTMLInputElement>(null);
  const instagramImageFileInputRef = useRef<HTMLInputElement>(null);

  // State for tracking uploads
  const [mainImageUploading, setMainImageUploading] = useState(false);
  const [instagramImageUploading, setInstagramImageUploading] = useState(false);

  // ImgBB integration status
  const [imgbbEnabled, setImgBBEnabled] = useState(false);
  const [imgbbApiKey, setImgBBApiKey] = useState("");

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
    instagramImageUrl: "", // For Airtable instaPhoto field
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
  // Fetch ImgBB settings when modal opens
  useEffect(() => {
    const fetchImgBBSettings = async () => {
      try {
        const response = await fetch('/api/imgbb/settings');
        if (response.ok) {
          const settings = await response.json();
          const apiKeySetting = settings.find((s: any) => s.key === 'api_key');

          if (apiKeySetting) {
            setImgBBApiKey(apiKeySetting.value);
            // Consider ImgBB enabled if we have a valid API key and it's not disabled
            setImgBBEnabled(!!apiKeySetting.value && apiKeySetting.enabled !== false);
            console.log('ImgBB integration status:', {
              enabled: !!apiKeySetting.value && apiKeySetting.enabled !== false,
              apiKey: apiKeySetting.value ? `${apiKeySetting.value.substring(0, 5)}...` : 'none'
            });
          } else {
            setImgBBEnabled(false);
            console.log('ImgBB integration disabled: No API key found');
          }
        }
      } catch (error) {
        console.error('Failed to fetch ImgBB settings:', error);
        setImgBBEnabled(false);
      }
    };

    if (isOpen) {
      fetchImgBBSettings();
    }
  }, [isOpen]);

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

      // Format scheduled date for datetime-local input
      if (formDataToUse.publishedAt instanceof Date) {
        const dateObj = formDataToUse.publishedAt;

        // Format the date as YYYY-MM-DDThh:mm (format required by datetime-local)
        // This will convert to local time zone
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');

        // Use scheduled field instead of date for the publication datetime
        formDataToUse.scheduled = `${year}-${month}-${day}T${hours}:${minutes}`;
      }
      // Use the direct scheduled field if it exists and publishedAt doesn't
      else if (formDataToUse.scheduled && !formDataToUse.publishedAt) {
        // If we have a scheduled value but no publishedAt, keep the scheduled value
        // This is already correctly formatted
      }

      // Set photo to "none" if it's empty for select component
      if (!formDataToUse.photo) {
        formDataToUse.photo = "none";
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

  // Handle image upload for MainImage field
  const uploadMainImageMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // We need to check if the article is being edited and is from Airtable
      if (!isEditing || !isFromAirtable) {
        toast({
          title: "Cannot upload directly to Airtable",
          description: "Direct Airtable uploads are only available for existing Airtable articles",
          variant: "destructive",
        });
        throw new Error("Cannot upload directly to Airtable");
      }

      const response = await fetch(`/api/airtable/upload-image/${editArticle.id}/MainImage`, {
        method: 'POST',
        body: formData,
        credentials: 'include', // Include session cookies for authentication
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to upload image");
      }

      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Image uploaded successfully",
        description: "The image was uploaded to Airtable and attached to the article",
      });

      // Update the form data with the new image URL
      setFormData(prev => ({
        ...prev,
        imageUrl: data.attachment.url
      }));

      setMainImageUploading(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to upload image",
        description: error.message || "There was an error uploading the image to Airtable",
        variant: "destructive",
      });
      setMainImageUploading(false);
    }
  });

  // Handle image upload for instaPhoto field
  const uploadInstagramImageMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // We need to check if the article is being edited and is from Airtable
      if (!isEditing || !isFromAirtable) {
        toast({
          title: "Cannot upload directly to Airtable",
          description: "Direct Airtable uploads are only available for existing Airtable articles",
          variant: "destructive",
        });
        throw new Error("Cannot upload directly to Airtable");
      }

      const response = await fetch(`/api/airtable/upload-image/${editArticle.id}/instaPhoto`, {
        method: 'POST',
        body: formData,
        credentials: 'include', // Include session cookies for authentication
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to upload image");
      }

      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Instagram image uploaded successfully",
        description: "The image was uploaded to Airtable and attached to the article",
      });

      // Update the form data with the new image URL
      setFormData(prev => ({
        ...prev,
        instagramImageUrl: data.attachment.url
      }));

      setInstagramImageUploading(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to upload image",
        description: error.message || "There was an error uploading the image to Airtable",
        variant: "destructive",
      });
      setInstagramImageUploading(false);
    }
  });

  // Handle main image file selection
  const handleMainImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    const formData = new FormData();
    formData.append('image', file);

    setMainImageUploading(true);

    // Use ImgBB integration if enabled, otherwise use direct Airtable upload
    if (imgbbEnabled) {
      // Use the imgbb-to-airtable endpoint which handles the ImgBB upload and Airtable update
      fetch(`/api/imgbb/upload-to-airtable/${editArticle.id}/MainImage`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
        .then(response => {
          if (!response.ok) {
            return response.json().then(errorData => {
              throw new Error(errorData.message || "Failed to upload image via ImgBB");
            });
          }
          return response.json();
        })
        .then(data => {
          toast({
            title: "Main image uploaded via ImgBB successfully",
            description: "The image was uploaded to ImgBB and linked to Airtable",
          });

          // Update the form data with the new image URL from ImgBB
          // The response can have different structures based on the endpoint
          let imageUrl: string | null = null;

          // Handle different response formats from various endpoints
          if (data.imgbb && data.imgbb.url) {
            imageUrl = data.imgbb.url;
          } else if (data.imgbbUrl) {
            imageUrl = data.imgbbUrl;
          } else if (data.imgbbLink) {
            imageUrl = data.imgbbLink;
          } else if (data.airtable && data.airtable.url) {
            imageUrl = data.airtable.url;
          } else if (data.attachment && data.attachment.url) {
            imageUrl = data.attachment.url;
          } else if (data.link) {
            imageUrl = data.link;
          }

          // Fallback to any URL field in the response
          if (!imageUrl) {
            console.log("Trying to find URL in response data:", data);
            if (typeof data === 'object') {
              Object.keys(data).forEach(key => {
                if (!imageUrl && typeof data[key] === 'string' && data[key].startsWith('http')) {
                  imageUrl = data[key] as string;
                } else if (!imageUrl && typeof data[key] === 'object' && data[key] !== null) {
                  if (data[key].url && typeof data[key].url === 'string') {
                    imageUrl = data[key].url as string;
                  } else if (data[key].link && typeof data[key].link === 'string') {
                    imageUrl = data[key].link as string;
                  }
                }
              });
            }
          }

          // If all attempts fail, use a default message
          if (!imageUrl) {
            console.error("Could not extract image URL from response:", data);
            toast({
              title: "Warning: Image URL not found in response",
              description: "The image was uploaded, but we couldn't extract its URL from the response",
              variant: "destructive",
            });
            setMainImageUploading(false);
            return;
          }

          setFormData(prev => ({
            ...prev,
            imageUrl: imageUrl as string
          }));

          console.log("ImgBB upload response for Main image:", data);
          setMainImageUploading(false);
        })
        .catch(error => {
          toast({
            title: "Failed to upload image via ImgBB",
            description: error.message || "There was an error uploading the image",
            variant: "destructive",
          });
          setMainImageUploading(false);
        });
    } else {
      // Use direct Airtable upload
      uploadMainImageMutation.mutate(formData);
    }
  };

  // Handle Instagram image file selection
  const handleInstagramImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    const formData = new FormData();
    formData.append('image', file);

    setInstagramImageUploading(true);

    // Use ImgBB integration if enabled, otherwise use direct Airtable upload
    if (imgbbEnabled) {
      // Use the imgbb-to-airtable endpoint which handles the ImgBB upload and Airtable update
      fetch(`/api/imgbb/upload-to-airtable/${editArticle.id}/instaPhoto`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
        .then(response => {
          if (!response.ok) {
            return response.json().then(errorData => {
              throw new Error(errorData.message || "Failed to upload image via ImgBB");
            });
          }
          return response.json();
        })
        .then(data => {
          toast({
            title: "Instagram image uploaded via ImgBB successfully",
            description: "The image was uploaded to ImgBB and linked to Airtable",
          });

          // Update the form data with the new image URL from ImgBB
          // The response can have different structures based on the endpoint
          let imageUrl: string | null = null;

          // Handle different response formats from various endpoints
          if (data.imgbb && data.imgbb.url) {
            imageUrl = data.imgbb.url;
          } else if (data.imgbbUrl) {
            imageUrl = data.imgbbUrl;
          } else if (data.imgbbLink) {
            imageUrl = data.imgbbLink;
          } else if (data.airtable && data.airtable.url) {
            imageUrl = data.airtable.url;
          } else if (data.attachment && data.attachment.url) {
            imageUrl = data.attachment.url;
          } else if (data.link) {
            imageUrl = data.link;
          }

          // Fallback to any URL field in the response
          if (!imageUrl) {
            console.log("Trying to find URL in response data:", data);
            if (typeof data === 'object') {
              Object.keys(data).forEach(key => {
                if (!imageUrl && typeof data[key] === 'string' && data[key].startsWith('http')) {
                  imageUrl = data[key] as string;
                } else if (!imageUrl && typeof data[key] === 'object' && data[key] !== null) {
                  if (data[key].url && typeof data[key].url === 'string') {
                    imageUrl = data[key].url as string;
                  } else if (data[key].link && typeof data[key].link === 'string') {
                    imageUrl = data[key].link as string;
                  }
                }
              });
            }
          }

          // If all attempts fail, use a default message
          if (!imageUrl) {
            console.error("Could not extract image URL from response:", data);
            toast({
              title: "Warning: Image URL not found in response",
              description: "The image was uploaded, but we couldn't extract its URL from the response",
              variant: "destructive",
            });
            setInstagramImageUploading(false);
            return;
          }

          setFormData(prev => ({
            ...prev,
            instagramImageUrl: imageUrl as string
          }));

          console.log("ImgBB upload response for Instagram image:", data);
          setInstagramImageUploading(false);
        })
        .catch(error => {
          toast({
            title: "Failed to upload image via ImgBB",
            description: error.message || "There was an error uploading the image",
            variant: "destructive",
          });
          setInstagramImageUploading(false);
        });
    } else {
      // Use direct Airtable upload
      uploadInstagramImageMutation.mutate(formData);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Create a copy of the form data to modify
    const submissionData = { ...formData };

    // Always set the creation timestamp in the "date" field
    // This will be sent to Airtable's "Date" field to track when the article was created
    submissionData.date = new Date().toISOString();

    // Handle publication date & time from the datetime-local input (for Scheduled field)
    if (submissionData.Scheduled) {
      // Convert Scheduled string from datetime-local to Date object for publishedAt
      try {
        const dateTime = new Date(submissionData.Scheduled);

        // Check if valid date
        if (!isNaN(dateTime.getTime())) {
          // Use this date for publishedAt
          submissionData.publishedAt = dateTime;

          // Keep the ISO string format for Airtable Scheduled field
          // submissionData.Scheduled is already correctly formatted from the input
        } else {
          console.warn("Invalid date format from datetime-local input");
          // If Scheduled date is invalid and status is published, default to current
          if (submissionData.status === "published") {
            submissionData.publishedAt = new Date();
            submissionData.Scheduled = submissionData.publishedAt.toISOString();
          }
        }
      } catch (error) {
        console.error("Error parsing scheduled date:", error);
        // If parsing fails and status is published, default to current
        if (submissionData.status === "published") {
          submissionData.publishedAt = new Date();
          submissionData.Scheduled = submissionData.publishedAt.toISOString();
        }
      }
    }
    // If no Scheduled date is provided but status is published, set current date
    else if (submissionData.status === "published") {
      submissionData.publishedAt = new Date();
      submissionData.Scheduled = submissionData.publishedAt.toISOString();
    }

    // Set the finished field based on status
    submissionData.finished = submissionData.status === "published";

    console.log("Submitting article with publishedAt:", submissionData.publishedAt);
    console.log("Airtable date field:", submissionData.date);
    console.log("Finished status:", submissionData.finished);
    console.log("Image URL being submitted:", submissionData.imageUrl);
    console.log("Full submission data:", submissionData);

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
            <div className="mt-2 text-xs text-blue-600">
              <p><span className="font-semibold">Important:</span> When updating to Airtable:</p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Main Image URL will update the MainImage field in Airtable</li>
                <li>Instagram Image URL will update the instaPhoto field in Airtable</li>
                <li>Both image fields can be set independently for better integration</li>
                <li>All Airtable fields like Date, Featured, and Status will be properly mapped</li>
              </ul>
            </div>
            <span className="text-xs text-blue-600 mt-3 block">
              <span className="font-semibold">Airtable ID:</span> <code className="px-1 py-0.5 bg-white rounded text-xs font-mono">{editArticle.externalId}</code>
            </span>
          </div>
        )}

        {/* ImgBB Integration Status */}
        {isFromAirtable && (
          <div className={`mb-4 p-4 border rounded-md ${imgbbEnabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center">
              <Image className={`h-4 w-4 mr-2 ${imgbbEnabled ? 'text-green-500' : 'text-gray-500'}`} />
              <h5 className={`text-sm font-medium ${imgbbEnabled ? 'text-green-700' : 'text-gray-700'}`}>
                ImgBB Integration {imgbbEnabled ? 'Enabled' : 'Disabled'}
              </h5>
            </div>
            <p className={`text-sm mt-1 ${imgbbEnabled ? 'text-green-600' : 'text-gray-600'}`}>
              {imgbbEnabled
                ? 'Images will be uploaded to ImgBB first, then the URL will be sent to Airtable.'
                : 'Images will be uploaded directly to Airtable. To enable ImgBB integration, visit the ImgBB settings page.'}
            </p>
            {imgbbEnabled && (
              <div className="mt-2 text-xs text-green-600">
                <p><span className="font-semibold">Benefits:</span></p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Faster uploads with better reliability</li>
                  <li>CDN-optimized image delivery</li>
                  <li>No Airtable attachment size limits</li>
                </ul>
              </div>
            )}
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
                placeholder="Brief description for article listing and previews (optional)"
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
                value={formData.content || ''}
                onChange={handleInputChange}
                placeholder="Article content (optional)"
                rows={5}
                className="font-mono"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <div className="flex gap-2">
                <Input
                  id="imageUrl"
                  name="imageUrl"
                  value={formData.imageUrl}
                  onChange={handleInputChange}
                  placeholder="URL for article cover image"
                  className="flex-grow"
                />
                {isFromAirtable && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex items-center gap-1"
                    onClick={() => mainImageFileInputRef.current?.click()}
                    disabled={mainImageUploading}
                  >
                    {mainImageUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        <span>Upload</span>
                      </>
                    )}
                  </Button>
                )}
                <input
                  type="file"
                  ref={mainImageFileInputRef}
                  onChange={handleMainImageFileChange}
                  className="hidden"
                  accept="image/*"
                />
              </div>
              {isFromAirtable && (
                <p className="text-xs text-blue-600 mt-1">
                  {formData.imageUrl && (
                    <span className="block mb-1">
                      <span className="font-medium">Current image from Airtable:</span> {formData.imageUrl.length > 50 ? `${formData.imageUrl.substring(0, 50)}...` : formData.imageUrl}
                    </span>
                  )}
                  {mainImageUploading ? (
                    <span className="font-medium text-amber-600">
                      Uploading image {imgbbEnabled ? 'via ImgBB to Airtable' : 'to Airtable'}...
                    </span>
                  ) : (
                    <span>
                      You can {imgbbEnabled ? 'upload images via ImgBB to the' : 'directly upload images to the'} MainImage field in Airtable using the Upload button
                    </span>
                  )}
                </p>
              )}
              {formData.imageUrl && (
                <div className="mt-2 p-1 border border-gray-200 rounded-md overflow-hidden w-32 h-32">
                  <img
                    src={formData.imageUrl}
                    alt="Article cover preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "https://placehold.co/600x400?text=Invalid+Image+URL";
                    }}
                  />
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Enter a direct link to an image for the article cover
              </p>
            </div>

            <div className="col-span-2">
              <Label htmlFor="instagramImageUrl">Instagram Image URL</Label>
              <div className="flex gap-2">
                <Input
                  id="instagramImageUrl"
                  name="instagramImageUrl"
                  value={formData.instagramImageUrl || ''}
                  onChange={handleInputChange}
                  placeholder="URL for Instagram image"
                  className="flex-grow"
                />
                {isFromAirtable && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex items-center gap-1"
                    onClick={() => instagramImageFileInputRef.current?.click()}
                    disabled={instagramImageUploading}
                  >
                    {instagramImageUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4" />
                        <span>Upload</span>
                      </>
                    )}
                  </Button>
                )}
                <input
                  type="file"
                  ref={instagramImageFileInputRef}
                  onChange={handleInstagramImageFileChange}
                  className="hidden"
                  accept="image/*"
                />
              </div>
              {isFromAirtable && (
                <p className="text-xs text-blue-600 mt-1">
                  {formData.instagramImageUrl && (
                    <span className="block mb-1">
                      <span className="font-medium">Current Instagram image from Airtable:</span> {formData.instagramImageUrl.length > 50 ? `${formData.instagramImageUrl.substring(0, 50)}...` : formData.instagramImageUrl}
                    </span>
                  )}
                  {instagramImageUploading ? (
                    <span className="font-medium text-amber-600">
                      Uploading image {imgbbEnabled ? 'via ImgBB to Airtable' : 'to Airtable'} instaPhoto field...
                    </span>
                  ) : (
                    <span>
                      You can {imgbbEnabled ? 'upload images via ImgBB to the' : 'directly upload images to the'} instaPhoto field in Airtable using the Upload button
                    </span>
                  )}
                </p>
              )}
              {formData.instagramImageUrl && (
                <div className="mt-2 p-1 border border-gray-200 rounded-md overflow-hidden w-32 h-32">
                  <img
                    src={formData.instagramImageUrl}
                    alt="Instagram image preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "https://placehold.co/600x400?text=Invalid+Image+URL";
                    }}
                  />
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Enter a direct link to an Instagram image (for Airtable instaPhoto field)
              </p>
            </div>

            <div>
              <Label htmlFor="photo">Photo Reference</Label>
              {isLoadingTeamMembers ? (
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Loading team members..." />
                  </SelectTrigger>
                </Select>
              ) : (
                <Select
                  name="photo"
                  value={formData.photo || ''}
                  onValueChange={(value) => handleSelectChange("photo", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a photographer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {teamMembers?.map((member) => (
                      <SelectItem key={`photo-${member.id}`} value={member.name}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-gray-500 mt-1">
                This links to a team member in Airtable's Photo field
              </p>
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
              <Label htmlFor="Scheduled">Publication Date & Time</Label>
              <Input
                id="Scheduled"
                name="Scheduled"
                type="datetime-local"
                value={formData.Scheduled || ''}
                onChange={handleInputChange}
                placeholder="YYYY-MM-DD HH:MM"
              />
              <p className="text-xs text-gray-500 mt-1">
                When this article should be published (Airtable "Scheduled" field)
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
