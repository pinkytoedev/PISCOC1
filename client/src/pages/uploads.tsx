import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Layout } from '@/components/layout/layout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Upload, FileIcon, Image as ImageIcon } from 'lucide-react';
import type { Article } from '../../../shared/schema';

export default function UploadsPage() {
  const { toast } = useToast();
  const [selectedArticle, setSelectedArticle] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'main' | 'instagram'>('main');
  const [isUploading, setIsUploading] = useState(false);

  // Fetch articles
  const { data: articles, isLoading: articlesLoading } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
  });

  // Reset selected files when article changes
  useEffect(() => {
    setImageFile(null);
    setZipFile(null);
  }, [selectedArticle]);

  // Image upload mutation
  const uploadImageMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      let endpoint = `/api/direct-upload/image`;
      if (uploadType === 'instagram') {
        endpoint = `/api/direct-upload/instagram-image`;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload image');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Image uploaded successfully',
        description: 'The image has been uploaded and associated with the article.',
      });
      setImageFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message || 'There was an error uploading the image',
        variant: 'destructive',
      });
    },
  });

  // ZIP upload mutation
  const uploadZipMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`/api/direct-upload/html-zip`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload ZIP file');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'ZIP file processed successfully',
        description: 'The HTML content has been extracted and set as the article content.',
      });
      setZipFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message || 'There was an error processing the ZIP file',
        variant: 'destructive',
      });
    },
  });

  // Handle image file selection
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  // Handle zip file selection
  const handleZipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setZipFile(e.target.files[0]);
    }
  };

  // Handle image upload submit
  const handleImageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedArticle || !imageFile) {
      toast({
        title: 'Validation error',
        description: 'Please select an article and an image file',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploading(true);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', imageFile);
    formData.append('articleId', selectedArticle);
    
    try {
      await uploadImageMutation.mutateAsync(formData);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle zip upload submit
  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedArticle || !zipFile) {
      toast({
        title: 'Validation error',
        description: 'Please select an article and a ZIP file',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploading(true);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', zipFile);
    formData.append('articleId', selectedArticle);
    
    try {
      await uploadZipMutation.mutateAsync(formData);
    } finally {
      setIsUploading(false);
    }
  };

  // Filter out published articles
  const unpublishedArticles = articles?.filter(article => article.status !== 'published') || [];

  return (
    <Layout title="Direct Upload Interface">
      <div className="container mx-auto py-6 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex mb-5" aria-label="Breadcrumb">
          <ol className="inline-flex items-center space-x-1 md:space-x-3">
            <li className="inline-flex items-center">
              <a href="/" className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-primary">
                Dashboard
              </a>
            </li>
            <li>
              <div className="flex items-center">
                <span className="mx-2 text-gray-400">/</span>
                <span className="text-gray-900">Direct Upload</span>
              </div>
            </li>
          </ol>
        </nav>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Direct File Upload</CardTitle>
                <CardDescription>
                  Upload large files directly to the server without Discord limitations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Important</AlertTitle>
                  <AlertDescription>
                    This interface allows you to upload large files (over 10MB) that Discord doesn't support.
                  </AlertDescription>
                </Alert>
                
                <div className="mb-6">
                  <Label htmlFor="article-select">Select Article</Label>
                  <Select 
                    value={selectedArticle} 
                    onValueChange={setSelectedArticle}
                  >
                    <SelectTrigger id="article-select" className="w-full mt-1">
                      <SelectValue placeholder="Select an article" />
                    </SelectTrigger>
                    <SelectContent>
                      {articlesLoading ? (
                        <SelectItem value="loading" disabled>Loading articles...</SelectItem>
                      ) : unpublishedArticles.length === 0 ? (
                        <SelectItem value="none" disabled>No unpublished articles available</SelectItem>
                      ) : (
                        unpublishedArticles.map(article => (
                          <SelectItem key={article.id} value={article.id.toString()}>
                            {article.title}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            {selectedArticle ? (
              <Tabs defaultValue="images">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="images" className="w-1/2">Images</TabsTrigger>
                  <TabsTrigger value="html" className="w-1/2">HTML Content</TabsTrigger>
                </TabsList>
                
                <TabsContent value="images">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" />
                        Image Upload
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="upload-type">Image Type</Label>
                          <Select 
                            value={uploadType} 
                            onValueChange={(value: 'main' | 'instagram') => setUploadType(value)}
                          >
                            <SelectTrigger id="upload-type" className="w-full mt-1">
                              <SelectValue placeholder="Select image type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="main">Main Article Image</SelectItem>
                              <SelectItem value="instagram">Instagram Image</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label htmlFor="image-upload">Select Image</Label>
                          <div className="mt-1">
                            <input
                              id="image-upload"
                              type="file"
                              accept="image/*"
                              onChange={handleImageFileChange}
                              className="hidden"
                            />
                            <Button 
                              variant="outline" 
                              onClick={() => document.getElementById('image-upload')?.click()}
                              className="w-full"
                            >
                              {imageFile ? imageFile.name : 'Choose Image File'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button 
                        onClick={handleImageSubmit}
                        disabled={!imageFile || !selectedArticle || isUploading}
                        className="w-full"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {isUploading ? 'Uploading...' : 'Upload Image'}
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>
                
                <TabsContent value="html">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileIcon className="h-5 w-5" />
                        HTML ZIP Upload
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Alert className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Upload a ZIP file containing an index.html file and its assets.
                        </AlertDescription>
                      </Alert>
                      
                      <div>
                        <Label htmlFor="zip-upload">Select ZIP File</Label>
                        <div className="mt-1">
                          <input
                            id="zip-upload"
                            type="file"
                            accept=".zip"
                            onChange={handleZipFileChange}
                            className="hidden"
                          />
                          <Button 
                            variant="outline" 
                            onClick={() => document.getElementById('zip-upload')?.click()}
                            className="w-full"
                          >
                            {zipFile ? zipFile.name : 'Choose ZIP File'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button 
                        onClick={handleZipSubmit}
                        disabled={!zipFile || !selectedArticle || isUploading}
                        className="w-full"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {isUploading ? 'Processing...' : 'Upload & Process ZIP'}
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Select an Article</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Please select an article from the dropdown to enable upload options.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}