import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Upload, FileIcon, Image as ImageIcon } from 'lucide-react';

interface UploadInfo {
  success: boolean;
  token: {
    id: number;
    uploadType: string;
    expiresAt: string;
    maxUses: number;
    uses: number;
    active: boolean;
    name: string;
    notes: string;
    uploadUrl: string;
  };
  article: {
    id: number;
    title: string;
    status: string;
  };
}

export default function PublicUploadPage() {
  const [location] = useLocation();
  const [token, setToken] = useState<string>('');
  const [uploadType, setUploadType] = useState<string>('');
  const [tokenInfo, setTokenInfo] = useState<UploadInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Extract token from URL
  useEffect(() => {
    const pathParts = location.split('/');
    if (pathParts.length >= 3) {
      const foundUploadType = pathParts[pathParts.length - 2];
      const foundToken = pathParts[pathParts.length - 1];
      
      setToken(foundToken);
      setUploadType(foundUploadType);
    }
  }, [location]);

  // Fetch token info
  useEffect(() => {
    if (!token) return;

    const fetchTokenInfo = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/public-upload/info/${token}`);
        
        if (!response.ok) {
          if (response.status === 401) {
            setError('This upload link has expired or is no longer valid.');
          } else {
            const errorData = await response.json();
            setError(errorData.message || 'Failed to validate token');
          }
          return;
        }
        
        const data = await response.json();
        setTokenInfo(data);
      } catch (err) {
        setError('Failed to connect to server. Please try again later.');
        console.error('Error fetching token info:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTokenInfo();
  }, [token]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file || !token || !uploadType) return;
    
    setUploading(true);
    setUploadError(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`/api/public-upload/${uploadType}/${token}`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }
      
      setUploadSuccess(true);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload file');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  // Determine accepted file types based on upload type
  const getAcceptedFileTypes = () => {
    switch (uploadType) {
      case 'image':
      case 'instagram-image':
        return 'image/*';
      case 'html-zip':
        return '.zip';
      default:
        return '*/*';
    }
  };

  // Get friendly type name
  const getUploadTypeName = () => {
    switch (uploadType) {
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

  // Render upload interface based on token type
  const renderUploadInterface = () => {
    if (uploadSuccess) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">Upload Successful!</CardTitle>
            <CardDescription>
              Your file has been uploaded and processed successfully.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center py-4">
              Thank you for your contribution. You can now close this page.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {uploadType === 'image' || uploadType === 'instagram-image' ? (
              <ImageIcon className="h-5 w-5" />
            ) : (
              <FileIcon className="h-5 w-5" />
            )}
            Upload {getUploadTypeName()}
          </CardTitle>
          <CardDescription>
            {tokenInfo?.token.name && `Purpose: ${tokenInfo.token.name}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>For Article: {tokenInfo?.article.title}</AlertTitle>
              <AlertDescription>
                {tokenInfo?.token.notes && (
                  <p className="mt-2">{tokenInfo.token.notes}</p>
                )}
              </AlertDescription>
            </Alert>

            <div>
              <input
                id="file-upload"
                type="file"
                accept={getAcceptedFileTypes()}
                onChange={handleFileChange}
                className="hidden"
              />
              <Button 
                variant="outline" 
                onClick={() => document.getElementById('file-upload')?.click()}
                className="w-full"
              >
                {file ? file.name : `Choose ${getUploadTypeName()}`}
              </Button>
              
              {uploadError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? 'Uploading...' : `Upload ${getUploadTypeName()}`}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  // Main render
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm py-4 px-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold text-primary">Direct Upload Portal</h1>
        </div>
      </header>
      
      <main className="flex-1 py-8">
        <div className="max-w-md mx-auto px-4">
          {loading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center py-8">Loading upload details...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">Upload Link Error</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <p className="mt-4 text-center">
                  This upload link may be expired or invalid. Please contact the person who shared this link with you.
                </p>
              </CardContent>
            </Card>
          ) : (
            renderUploadInterface()
          )}
        </div>
      </main>
      
      <footer className="bg-white py-4 text-center text-gray-500 text-sm">
        <div className="max-w-5xl mx-auto">
          <p>Secure Direct Upload System</p>
        </div>
      </footer>
    </div>
  );
}