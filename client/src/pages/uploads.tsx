import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Layout } from '@/components/layout/layout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Upload, FileIcon, Image as ImageIcon, Link, Copy, Trash2, Clock, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format } from 'date-fns';
import type { Article } from '../../../shared/schema';

// Define types for upload tokens
interface UploadToken {
  id: number;
  token: string;
  uploadType: string;
  uploadUrl: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  active: boolean;
  name: string;
  notes: string;
}

interface TokensResponse {
  articleId: number;
  articleTitle: string;
  tokens: UploadToken[];
}

export default function UploadsPage() {
  const { toast } = useToast();
  const [selectedArticle, setSelectedArticle] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'main' | 'instagram'>('main');
  const [isUploading, setIsUploading] = useState(false);
  const [tokenUploadType, setTokenUploadType] = useState<string>('image');
  const [tokenName, setTokenName] = useState<string>('');
  const [tokenNotes, setTokenNotes] = useState<string>('');
  const [tokenMaxUses, setTokenMaxUses] = useState<number>(1);
  const [tokenExpirationDays, setTokenExpirationDays] = useState<number>(7);
  const [selectedToken, setSelectedToken] = useState<UploadToken | null>(null);
  const [showTokenDialog, setShowTokenDialog] = useState<boolean>(false);

  // Fetch articles
  const { data: articles, isLoading: articlesLoading } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
  });

  // Reset selected files when article changes
  useEffect(() => {
    setImageFile(null);
    setZipFile(null);
    setTokenName('');
    setTokenNotes('');
  }, [selectedArticle]);
  
  // Fetch tokens for the selected article
  const { data: tokensData, isLoading: tokensLoading, refetch: refetchTokens } = useQuery<TokensResponse>({
    queryKey: ['/api/public-upload/tokens', selectedArticle],
    enabled: !!selectedArticle,
    queryFn: async () => {
      const response = await fetch(`/api/public-upload/tokens/${selectedArticle}`);
      if (!response.ok) {
        throw new Error('Failed to fetch upload tokens');
      }
      return response.json();
    }
  });
  
  // Generate token mutation
  const generateTokenMutation = useMutation({
    mutationFn: async (data: {
      articleId: string;
      uploadType: string;
      expirationDays: number;
      maxUses: number;
      name?: string;
      notes?: string;
    }) => {
      const response = await fetch('/api/public-upload/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate token');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Token generated successfully',
        description: 'A new public upload token has been created.',
      });
      refetchTokens();
      setShowTokenDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to generate token',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete token mutation
  const deleteTokenMutation = useMutation({
    mutationFn: async (tokenId: number) => {
      const response = await fetch(`/api/public-upload/tokens/${tokenId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete token');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Token deleted',
        description: 'The upload token has been deleted successfully.',
      });
      refetchTokens();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete token',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Handle token generation
  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedArticle) {
      toast({
        title: 'Validation error',
        description: 'Please select an article',
        variant: 'destructive',
      });
      return;
    }
    
    await generateTokenMutation.mutateAsync({
      articleId: selectedArticle,
      uploadType: tokenUploadType,
      expirationDays: tokenExpirationDays,
      maxUses: tokenMaxUses,
      name: tokenName || undefined,
      notes: tokenNotes || undefined,
    });
  };
  
  // Handle token delete
  const handleDeleteToken = async (tokenId: number) => {
    if (confirm('Are you sure you want to delete this token?')) {
      await deleteTokenMutation.mutateAsync(tokenId);
    }
  };
  
  // Copy token URL to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        toast({
          title: 'Copied!',
          description: 'Link copied to clipboard',
        });
      },
      (err) => {
        toast({
          title: 'Failed to copy',
          description: 'Could not copy text: ' + err,
          variant: 'destructive',
        });
      }
    );
  };

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
                  <TabsTrigger value="images" className="w-1/3">Images</TabsTrigger>
                  <TabsTrigger value="html" className="w-1/3">HTML Content</TabsTrigger>
                  <TabsTrigger value="public" className="w-1/3">Public Access</TabsTrigger>
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
                
                <TabsContent value="public">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Link className="h-5 w-5" />
                          Public Upload Tokens
                        </CardTitle>
                        <CardDescription>
                          Generate links for external users to upload files
                        </CardDescription>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => setShowTokenDialog(true)}
                      >
                        Create Token
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <Alert className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Public upload tokens allow anyone with the link to upload files without logging in.
                        </AlertDescription>
                      </Alert>
                      
                      {tokensLoading ? (
                        <div className="py-4 text-center text-muted-foreground">Loading tokens...</div>
                      ) : tokensData?.tokens && tokensData.tokens.length > 0 ? (
                        <div className="space-y-3">
                          {tokensData.tokens.map(token => (
                            <div key={token.id} className="border rounded-md p-3">
                              <div className="flex items-center justify-between">
                                <div className="font-semibold flex items-center gap-2">
                                  {token.name}
                                  <Badge variant={token.active ? 'default' : 'secondary'}>
                                    {token.active ? 'Active' : 'Inactive'}
                                  </Badge>
                                </div>
                                <div className="flex gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => copyToClipboard(window.location.origin + token.uploadUrl)}
                                    title="Copy link"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeleteToken(token.id)}
                                    title="Delete token"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-2 text-sm text-gray-500 flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>Expires: {format(new Date(token.expiresAt), 'PPpp')}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  <span>Used {token.uses} of {token.maxUses || '∞'} times</span>
                                </div>
                                <div className="mt-1 flex items-center gap-1">
                                  <span className="text-xs font-medium">Type:</span>
                                  <Badge variant="outline" className="text-xs">
                                    {token.uploadType.replace('-', ' ')}
                                  </Badge>
                                </div>
                              </div>
                              {token.notes && (
                                <div className="mt-2 text-sm border-t pt-2">
                                  <span className="text-xs font-medium">Notes:</span>{' '}
                                  {token.notes}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-6 text-center text-muted-foreground">
                          No tokens found for this article. Create one to get started.
                        </div>
                      )}
                    </CardContent>
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
      
      {/* Token Creation Dialog */}
      <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Public Upload Token</DialogTitle>
            <DialogDescription>
              Generate a token that allows anyone with the link to upload files without logging in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGenerateToken} className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="token-upload-type">Upload Type</Label>
                <Select 
                  value={tokenUploadType} 
                  onValueChange={setTokenUploadType}
                >
                  <SelectTrigger id="token-upload-type">
                    <SelectValue placeholder="Select upload type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Main Image</SelectItem>
                    <SelectItem value="instagram-image">Instagram Image</SelectItem>
                    <SelectItem value="html-zip">HTML ZIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="token-name">Token Name (Optional)</Label>
                <Input 
                  id="token-name" 
                  value={tokenName} 
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g., Photographer Upload"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="token-max-uses">Max Uses</Label>
                  <Input 
                    id="token-max-uses" 
                    type="number" 
                    min="1"
                    value={tokenMaxUses.toString()} 
                    onChange={(e) => setTokenMaxUses(parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground">Set to 0 for unlimited uses</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="token-expiration">Expires After (days)</Label>
                  <Input 
                    id="token-expiration" 
                    type="number" 
                    min="1"
                    value={tokenExpirationDays.toString()} 
                    onChange={(e) => setTokenExpirationDays(parseInt(e.target.value) || 7)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="token-notes">Notes (Optional)</Label>
                <Input 
                  id="token-notes" 
                  value={tokenNotes} 
                  onChange={(e) => setTokenNotes(e.target.value)}
                  placeholder="Additional information about this token"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowTokenDialog(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={generateTokenMutation.isPending}
              >
                {generateTokenMutation.isPending ? 'Creating...' : 'Create Token'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}