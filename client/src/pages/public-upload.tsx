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
      // Send POST request to n8n webhook when upload button is clicked
      try {
        const selectedArticleData = articles?.find(article => article.id.toString() === selectedArticle);
        
        const webhookResponse = await fetch('https://nicolajack.app.n8n.cloud/webhook/public-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            articleId: selectedArticle,
            articleTitle: selectedArticleData?.title || 'Unknown Article',
            uploadTypes: Object.entries(enabledUploadTypes)
              .filter(([_, enabled]) => enabled)
              .map(([type, _]) => type),
            fileCount: filesToUpload.length,
            timestamp: new Date().toISOString(),
            files: filesToUpload.map(file => ({
              name: file.file.name,
              type: file.type,
              size: file.file.size,
              mimeType: file.file.type
            }))
          })
        });
        
        console.log('n8n webhook response:', webhookResponse.status);
      } catch (webhookError) {
        console.error('Failed to send webhook:', webhookError);
        // Continue with upload even if webhook fails
      }

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
        <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-2xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-600 text-white pb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="p-4 bg-white/20 rounded-full">
                <CheckCircle className="h-12 w-12" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center font-bold">
              All Uploads Completed!
            </CardTitle>
            <CardDescription className="text-green-100 text-center text-lg">
              Your files have been uploaded and processed successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-4 mb-8">
              {uploadFiles
                .filter(file => enabledUploadTypes[file.type] && file.status === 'completed')
                .map(file => (
                  <div key={file.id} className="flex items-center gap-4 p-4 bg-green-50 rounded-xl border border-green-200">
                    <div className="p-2 bg-green-500 rounded-full">
                      <CheckCircle className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{getTypeName(file.type)}</div>
                      <div className="text-sm text-gray-600">{file.file.name}</div>
                    </div>
                  </div>
                ))}
            </div>
            <div className="text-center py-6 px-4 bg-gray-50 rounded-2xl">
              <p className="text-gray-700 font-medium mb-2">
                🎉 Thank you for your contribution!
              </p>
              <p className="text-gray-600 text-sm">
                You can now close this page or upload to another article.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-8">
        {/* Article Selection */}
        <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-pink-400 to-pink-600 text-white pb-6">
            <CardTitle className="text-xl font-bold flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Eye className="h-5 w-5" />
              </div>
              Select Article
            </CardTitle>
            <CardDescription className="text-pink-100">
              Choose the article that you want to upload images for!
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {loadingArticles ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-gray-600">Loading articles...</span>
                </div>
              </div>
            ) : articlesError ? (
              <Alert variant="destructive" className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load articles. Please refresh the page.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={selectedArticle} onValueChange={setSelectedArticle}>
                <SelectTrigger className="h-12 text-lg border-2 border-gray-200 hover:border-pink-300 transition-colors">
                  <SelectValue placeholder="Choose an article..." />
                </SelectTrigger>
                <SelectContent>
                  {articles?.filter(article => article.status !== 'published').map(article => (
                    <SelectItem key={article.id} value={article.id.toString()} className="text-lg py-3 border-pink-300 hover:bg-pink-500 cursor-pointer">
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
          <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-pink-400 to-pink-600 text-white pb-6">
              <CardTitle className="text-xl font-bold flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-file-question-mark-icon lucide-file-question-mark"><path d="M12 17h.01"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/></svg>
                </div>
                Upload Types
              </CardTitle>
              <CardDescription className="text-pink-100">
                Select which types of files you want to upload!
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-4">
                {Object.entries(enabledUploadTypes).map(([type, enabled]) => (
                  <div key={type} className="flex items-center space-x-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-pink-200 transition-colors">
                    <Checkbox
                      id={type}
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        setEnabledUploadTypes(prev => ({
                          ...prev,
                          [type]: Boolean(checked)
                        }))
                      }
                      className="w-5 h-5 border-gray-500 hover:border-pink-400 focus:ring-pink-500 focus:ring-2 rounded-lg transition-colors"
                    />
                    <Label htmlFor={type} className="text-base font-medium cursor-pointer flex-1">
                      {getTypeName(type as 'image' | 'instagram-image' | 'html-zip')}
                    </Label>
                    <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      {type === 'html-zip' ? 'ZIP' : 'IMAGE'}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* File Upload Sections */}
        {selectedArticle && Object.entries(enabledUploadTypes).some(([_, enabled]) => enabled) && (
          <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-pink-400 to-pink-600 text-white pb-6">
              <CardTitle className="text-xl font-bold flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Upload className="h-5 w-5" />
                </div>
                Upload Files
              </CardTitle>
              <CardDescription className="text-pink-100">
                Upload your selected file types. Once you have added all files, click "Upload All Files" to start processing.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-8">
                {Object.entries(enabledUploadTypes).map(([type, enabled]) => {
                  if (!enabled) return null;
                  
                  const uploadType = type as 'image' | 'instagram-image' | 'html-zip';
                  const existingFile = uploadFiles.find(f => f.type === uploadType);
                  
                  return (
                    <div key={type} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-pink-300 rounded-xl">
                            {uploadType === 'html-zip' ? <FileIcon className="h-5 w-5 text-white" /> : <ImageIcon className="h-5 w-5 text-white" />}
                          </div>
                          <Label className="text-lg font-semibold text-gray-800">
                            {getTypeName(uploadType)}
                          </Label>
                        </div>
                        {existingFile && (
                          <Badge 
                            variant={
                              existingFile.status === 'completed' ? 'default' :
                              existingFile.status === 'failed' ? 'destructive' :
                              existingFile.status === 'uploading' ? 'secondary' : 'outline'
                            }
                            className="text-sm px-3 py-1"
                          >
                            {existingFile.status}
                          </Badge>
                        )}
                      </div>
                      
                      {existingFile ? (
                        <div className="space-y-4">
                          {/* File preview and info */}
                          <div className="flex items-center gap-4 p-6 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                            {existingFile.preview ? (
                              <img 
                                src={existingFile.preview} 
                                alt="Preview" 
                                className="w-16 h-16 object-cover rounded-xl shadow-sm"
                              />
                            ) : (
                              <div className="w-16 h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center">
                                <FileIcon className="w-8 h-8 text-gray-500" />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="text-base font-semibold text-gray-900">{existingFile.file.name}</div>
                              <div className="text-sm text-gray-600 flex items-center gap-2">
                                <span>{(existingFile.file.size / 1024 / 1024).toFixed(1)} MB</span>
                                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                                <span>{existingFile.file.type || 'Unknown type'}</span>
                              </div>
                            </div>
                            {existingFile.status !== 'uploading' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFile(existingFile.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <X className="h-5 w-5" />
                              </Button>
                            )}
                          </div>
                          
                          {/* Progress bar for uploading files */}
                          {existingFile.status === 'uploading' && (
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm text-gray-600">
                                <span>Uploading...</span>
                                <span>{existingFile.progress}%</span>
                              </div>
                              <Progress value={existingFile.progress} className="w-full h-3 bg-gray-200" />
                            </div>
                          )}
                          
                          {/* Error message */}
                          {existingFile.status === 'failed' && existingFile.error && (
                            <Alert variant="destructive" className="border-red-200 bg-red-50">
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
                            className="w-full h-25 border-2 border-dashed border-pink-300 hover:border-pink-400 hover:bg-pink-50 transition-colors rounded-2xl"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <Upload className="h-6 w-6 text-gray-500" />
                              <span className="text-base font-medium">Choose {getTypeName(uploadType)}</span>
                              <span className="text-xs text-gray-500">
                                {uploadType === 'html-zip' ? 'ZIP files only' : 'Images only'}
                              </span>
                            </div>
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {error && (
                  <Alert variant="destructive" className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                {/* Submit button */}
                <div className="pt-6 border-t border-gray-200">
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      uploading ||
                      !selectedArticle ||
                      uploadFiles.filter(f => enabledUploadTypes[f.type]).length === 0
                    }
                    className="w-full h-14 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all"
                    size="lg"
                  >
                    {uploading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                        Uploading Files...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-3 h-5 w-5" />
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
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-md shadow-lg py-8 px-4 border-b border-pink-200/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-b from-pink-300 to-pink-600 rounded-2xl shadow-lg">
              <Upload className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 text-center mb-2">
            Public Upload Portal
          </h1>
          <p className="text-gray-600 text-center text-lg">
            Upload files directly to articles via our content management system!
          </p>
        </div>
      </header>
      
      <main className="flex-1 py-12 bg-[url('/assets/images/pink-background.png')] bg-repeat" style={{ backgroundSize: '500px' }}>
        <div className="max-w-4xl mx-auto px-4">
          {renderUploadInterface()}
        </div>
      </main>
      
      <footer className="bg-white/80 backdrop-blur-md border-t border-pink-200/50 py-6 text-center text-gray-500">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <p className="text-sm font-medium">Secure Public Upload System</p>
          </div>
          <p className="text-xs">Files are processed safely and securely with end-to-end encryption</p>
        </div>
      </footer>
    </div>
  );
}
