import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Upload, FileIcon, Image as ImageIcon, CheckCircle, X, Eye } from 'lucide-react';
import type { Article } from '../../../shared/schema';

interface UploadFile {
  id: string;
  file: File;
  type: 'image' | 'instagram-image' | 'html-zip';
  preview?: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

export default function PublicUploadPage() {
  const [selectedArticle, setSelectedArticle] = useState<string>('');
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [enabledUploadTypes, setEnabledUploadTypes] = useState<{
    image: boolean;
    'instagram-image': boolean;
    'html-zip': boolean;
  }>({
    image: false,
    'instagram-image': false,
    'html-zip': false,
  });
  const [uploading, setUploading] = useState<boolean>(false);
  const [allCompleted, setAllCompleted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available articles that can be uploaded to
  const { data: articles, isLoading: loadingArticles, error: articlesError } = useQuery<Article[]>({
    queryKey: ['/api/articles/uploadable'],
    retry: false,
  });

  // Check if all enabled files have been completed
  useEffect(() => {
    const hasEnabledTypes = Object.values(enabledUploadTypes).some(enabled => enabled);
    const enabledFiles = uploadFiles.filter(file => enabledUploadTypes[file.type]);
    const completedFiles = enabledFiles.filter(file => file.status === 'completed');
    
    setAllCompleted(hasEnabledTypes && enabledFiles.length > 0 && completedFiles.length === enabledFiles.length);
  }, [uploadFiles, enabledUploadTypes]);

  // Generate file preview for images
  const generatePreview = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } else {
        resolve(''); // No preview for non-images
      }
    });
  };

  // Handle file selection for a specific upload type
  const handleFileSelect = async (type: 'image' | 'instagram-image' | 'html-zip', file: File) => {
    const fileId = `${type}-${Date.now()}`;
    
    try {
      const preview = await generatePreview(file);
      
      const uploadFile: UploadFile = {
        id: fileId,
        file,
        type,
        preview,
        status: 'pending',
        progress: 0,
      };

      setUploadFiles(prev => {
        // Remove any existing file of the same type
        const filtered = prev.filter(f => f.type !== type);
        return [...filtered, uploadFile];
      });
    } catch (error) {
      console.error('Error generating preview:', error);
    }
  };

  // Remove a file from the upload list
  const removeFile = (fileId: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Upload a single file
  const uploadSingleFile = async (uploadFile: UploadFile): Promise<void> => {
    if (!selectedArticle) {
      throw new Error('No article selected');
    }

    const formData = new FormData();
    formData.append('file', uploadFile.file);
    formData.append('articleId', selectedArticle);

    // Update file status to uploading
    setUploadFiles(prev => prev.map(f => 
      f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0 } : f
    ));

    const response = await fetch(`/api/public-upload/${uploadFile.type}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Upload failed');
    }

    // Update to completed
    setUploadFiles(prev => prev.map(f => 
      f.id === uploadFile.id ? { ...f, status: 'completed', progress: 100 } : f
    ));
  };

  // Handle submission of all uploads
  const handleSubmit = async () => {
    if (!selectedArticle) {
      setError('Please select an article');
      return;
    }

    const filesToUpload = uploadFiles.filter(file => 
      enabledUploadTypes[file.type] && file.status === 'pending'
    );

    if (filesToUpload.length === 0) {
      setError('Please select at least one file to upload');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Upload all files sequentially
      for (const file of filesToUpload) {
        try {
          await uploadSingleFile(file);
        } catch (error: any) {
          // Mark this file as failed
          setUploadFiles(prev => prev.map(f => 
            f.id === file.id ? { 
              ...f, 
              status: 'failed', 
              error: error.message || 'Upload failed' 
            } : f
          ));
        }
      }
    } finally {
      setUploading(false);
    }
  };

  // Get accepted file types for input
  const getAcceptedTypes = (type: 'image' | 'instagram-image' | 'html-zip') => {
    switch (type) {
      case 'image':
      case 'instagram-image':
        return 'image/*';
      case 'html-zip':
        return '.zip,application/zip';
      default:
        return '*/*';
    }
  };

  // Get display name for upload type
  const getTypeName = (type: 'image' | 'instagram-image' | 'html-zip') => {
    switch (type) {
      case 'image':
        return 'Main Article Image';
      case 'instagram-image':
        return 'Instagram Image';
      case 'html-zip':
        return 'HTML ZIP Package';
      default:
        return 'File';
    }
  };

  // Render the main upload interface
  const renderUploadInterface = () => {
    if (allCompleted) {
      return (
        <Card className="bg-pink-translucent border-pink shadow-pink">
          <CardHeader>
            <CardTitle className="text-green-600 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              All Uploads Completed!
            </CardTitle>
            <CardDescription>
              Your files have been uploaded and processed successfully.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadFiles
                .filter(file => enabledUploadTypes[file.type] && file.status === 'completed')
                .map(file => (
                  <div key={file.id} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm">{getTypeName(file.type)}: {file.file.name}</span>
                  </div>
                ))}
            </div>
            <p className="text-center py-4 text-gray-600">
              Thank you for your contribution. You can now close this page.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        {/* Article Selection */}
        <Card className="bg-pink-translucent border-pink shadow-pink">
          <CardHeader>
            <CardTitle>Select Article</CardTitle>
            <CardDescription>
              Choose the article you want to upload files for
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingArticles ? (
              <div className="text-center py-4">Loading articles...</div>
            ) : articlesError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load articles. Please refresh the page.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={selectedArticle} onValueChange={setSelectedArticle}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an article..." />
                </SelectTrigger>
                <SelectContent>
                  {articles?.filter(article => article.status !== 'published').map(article => (
                    <SelectItem key={article.id} value={article.id.toString()}>
                      {article.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Upload Type Selection */}
        {selectedArticle && (
          <Card className="bg-pink-translucent border-pink shadow-pink">
            <CardHeader>
              <CardTitle>Upload Types</CardTitle>
              <CardDescription>
                Select which types of files you want to upload
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(enabledUploadTypes).map(([type, enabled]) => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={type}
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        setEnabledUploadTypes(prev => ({
                          ...prev,
                          [type]: Boolean(checked)
                        }))
                      }
                    />
                    <Label htmlFor={type} className="text-sm font-medium">
                      {getTypeName(type as 'image' | 'instagram-image' | 'html-zip')}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* File Upload Sections */}
        {selectedArticle && Object.entries(enabledUploadTypes).some(([_, enabled]) => enabled) && (
          <Card className="bg-pink-translucent border-pink shadow-pink">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Files
              </CardTitle>
              <CardDescription>
                Upload your selected file types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {Object.entries(enabledUploadTypes).map(([type, enabled]) => {
                  if (!enabled) return null;
                  
                  const uploadType = type as 'image' | 'instagram-image' | 'html-zip';
                  const existingFile = uploadFiles.find(f => f.type === uploadType);
                  
                  return (
                    <div key={type} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">
                          {getTypeName(uploadType)}
                        </Label>
                        {existingFile && (
                          <Badge variant={
                            existingFile.status === 'completed' ? 'default' :
                            existingFile.status === 'failed' ? 'destructive' :
                            existingFile.status === 'uploading' ? 'secondary' : 'outline'
                          }>
                            {existingFile.status}
                          </Badge>
                        )}
                      </div>
                      
                      {existingFile ? (
                        <div className="space-y-2">
                          {/* File preview and info */}
                          <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                            {existingFile.preview ? (
                              <img 
                                src={existingFile.preview} 
                                alt="Preview" 
                                className="w-12 h-12 object-cover rounded"
                              />
                            ) : (
                              <FileIcon className="w-12 h-12 text-gray-400" />
                            )}
                            <div className="flex-1">
                              <div className="text-sm font-medium">{existingFile.file.name}</div>
                              <div className="text-xs text-gray-500">
                                {(existingFile.file.size / 1024 / 1024).toFixed(1)} MB
                              </div>
                            </div>
                            {existingFile.status !== 'uploading' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFile(existingFile.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          
                          {/* Progress bar for uploading files */}
                          {existingFile.status === 'uploading' && (
                            <Progress value={existingFile.progress} className="w-full" />
                          )}
                          
                          {/* Error message */}
                          {existingFile.status === 'failed' && existingFile.error && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>{existingFile.error}</AlertDescription>
                            </Alert>
                          )}
                        </div>
                      ) : (
                        <div>
                          <input
                            id={`file-${type}`}
                            type="file"
                            accept={getAcceptedTypes(uploadType)}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleFileSelect(uploadType, file);
                              }
                            }}
                            className="hidden"
                          />
                          <Button
                            variant="outline"
                            onClick={() => document.getElementById(`file-${type}`)?.click()}
                            className="w-full border-dashed"
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Choose {getTypeName(uploadType)}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                {/* Submit button */}
                <div className="pt-4 border-t">
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      uploading ||
                      !selectedArticle ||
                      uploadFiles.filter(f => enabledUploadTypes[f.type]).length === 0
                    }
                    className="w-full"
                    size="lg"
                  >
                    {uploading ? (
                      <>
                        <Upload className="mr-2 h-4 w-4 animate-pulse" />
                        Uploading Files...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload All Files
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // Main render
  return (
    <div className="min-h-screen bg-pink-pattern flex flex-col">
      <header className="bg-pink-translucent shadow-pink py-6 px-4 border-b border-pink">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Upload className="h-6 w-6 text-pink-600" />
            Public Upload Portal
          </h1>
          <p className="text-gray-600 mt-1">
            Upload files directly to articles in our content management system
          </p>
        </div>
      </header>
      
      <main className="flex-1 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {renderUploadInterface()}
        </div>
      </main>
      
      <footer className="bg-pink-translucent border-t border-pink py-4 text-center text-gray-500 text-sm">
        <div className="max-w-4xl mx-auto">
          <p>Secure Public Upload System • Files are processed safely and securely</p>
        </div>
      </footer>
    </div>
  );
}