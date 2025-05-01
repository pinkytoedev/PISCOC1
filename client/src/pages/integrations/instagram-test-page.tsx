import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { queryClient } from '@/lib/queryClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface InstagramMediaResponse {
  id?: string;
  error?: boolean;
  message?: string;
  success?: boolean;
}

interface InstagramAccountResponse {
  id: string;
  name?: string;
  username?: string;
  success: boolean;
}

export default function InstagramTestPage() {
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState('post');

  const handleTestPost = async () => {
    if (!imageUrl) {
      toast({
        title: "Missing Image URL",
        description: "Please enter an image URL to test",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/instagram/media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageUrl,
          caption: caption || 'Test post from our content management system'
        }),
        credentials: 'include'
      });
      
      const data: InstagramMediaResponse = await response.json();
      setResult(data);
      
      if (!response.ok || data.error) {
        toast({
          title: "Error",
          description: `Failed to post to Instagram: ${data.message || response.statusText}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: `Successfully posted to Instagram! Post ID: ${data.id || 'Unknown'}`,
          variant: "default"
        });
      }
    } catch (error: any) {
      setResult({ error: true, message: error.message });
      toast({
        title: "Error",
        description: `Error: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetMedia = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/instagram/media', {
        method: 'GET',
        credentials: 'include'
      });
      
      const data = await response.json();
      setResult(data);
      
      if (!response.ok) {
        toast({
          title: "Error",
          description: `Failed to fetch Instagram media: ${response.statusText}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Media Retrieved",
          description: `Successfully fetched ${Array.isArray(data) ? data.length : 0} Instagram posts`,
          variant: "default"
        });
      }
    } catch (error: any) {
      setResult({ error: true, message: error.message });
      toast({
        title: "Error",
        description: `Error: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetAccount = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/instagram/account', {
        method: 'GET',
        credentials: 'include'
      });
      
      const data: InstagramAccountResponse = await response.json();
      setResult(data);
      
      if (!response.ok) {
        toast({
          title: "Error",
          description: `Failed to fetch Instagram account: ${response.statusText}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Account Info Retrieved",
          description: `Successfully fetched Instagram account info`,
          variant: "default"
        });
      }
    } catch (error: any) {
      setResult({ error: true, message: error.message });
      toast({
        title: "Error",
        description: `Error: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-6">Instagram API Tester</h1>
      <p className="text-gray-500 mb-6">
        Use this page to test your Instagram API integration. You can post images, view recent posts, 
        and check your account information.
      </p>

      <Tabs defaultValue="post" onValueChange={setSelectedTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="post">Post Image</TabsTrigger>
          <TabsTrigger value="media">View Media</TabsTrigger>
          <TabsTrigger value="account">Account Info</TabsTrigger>
        </TabsList>

        <TabsContent value="post">
          <Card>
            <CardHeader>
              <CardTitle>Post to Instagram</CardTitle>
              <CardDescription>Test posting an image to Instagram</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid w-full gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="imageUrl">Image URL</Label>
                  <Input
                    id="imageUrl"
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                  <p className="text-sm text-gray-500">
                    This should be a valid image URL. Instagram supports JPG, PNG, and GIF files.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="caption">Caption</Label>
                  <Textarea
                    id="caption"
                    placeholder="Write a caption for your post..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleTestPost} disabled={isLoading}>
                {isLoading ? 'Posting...' : 'Post to Instagram'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="media">
          <Card>
            <CardHeader>
              <CardTitle>View Recent Instagram Posts</CardTitle>
              <CardDescription>Fetch and display your recent Instagram posts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4">Click the button below to fetch your recent Instagram posts.</p>
            </CardContent>
            <CardFooter>
              <Button onClick={handleGetMedia} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Fetch Instagram Posts'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Instagram Account Info</CardTitle>
              <CardDescription>View details about your connected Instagram account</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4">Click the button below to fetch your Instagram account information.</p>
            </CardContent>
            <CardFooter>
              <Button onClick={handleGetAccount} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Fetch Account Info'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {result && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">API Response:</h2>
          <pre className="p-4 bg-gray-100 rounded-md overflow-auto max-h-[400px]">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}