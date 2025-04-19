import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { IntegrationSetting } from "@shared/schema";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Lock, Image, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

// Schema for validation
const imgbbSettingSchema = z.object({
  api_key: z.string().min(1, "API Key is required"),
  enabled: z.boolean().default(true)
});

// Type for form values
type ImgBBSettingFormValues = z.infer<typeof imgbbSettingSchema>;

export default function ImgBBPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  
  // Fetch current ImgBB settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/imgbb/settings'],
    queryFn: async () => {
      const response = await fetch('/api/imgbb/settings', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch ImgBB settings');
      }
      
      return response.json() as Promise<IntegrationSetting[]>;
    }
  });
  
  // Find settings if they exist
  const apiKeySetting = settings?.find(s => s.key === 'api_key');
  
  // Form setup
  const form = useForm<ImgBBSettingFormValues>({
    resolver: zodResolver(imgbbSettingSchema),
    defaultValues: {
      api_key: apiKeySetting?.value || '',
      enabled: apiKeySetting?.enabled === false ? false : true
    }
  });
  
  // Reset form when settings change
  React.useEffect(() => {
    if (settings) {
      form.reset({
        api_key: apiKeySetting?.value || '',
        enabled: apiKeySetting?.enabled === false ? false : true
      });
    }
  }, [settings]);
  
  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async (data: {key: string; value: string; enabled?: boolean}) => {
      const response = await apiRequest("POST", `/api/imgbb/settings/${data.key}`, data);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update setting');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/imgbb/settings'] });
    }
  });
  
  // Handle form submission
  const onSubmit = async (data: ImgBBSettingFormValues) => {
    try {
      setIsSubmitting(true);
      
      // Update API key setting
      await updateSettingMutation.mutateAsync({
        key: 'api_key',
        value: data.api_key,
        enabled: data.enabled
      });
      
      toast({
        title: 'ImgBB settings updated',
        description: 'Your ImgBB integration settings have been saved successfully'
      });
      
      setIsSubmitting(false);
      
    } catch (error) {
      setIsSubmitting(false);
      
      toast({
        title: 'Error updating ImgBB settings',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive'
      });
    }
  };
  
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="ImgBB Integration" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="container py-4">
            <div className="mb-8">
              <h1 className="text-3xl font-bold">ImgBB Integration</h1>
              <p className="text-muted-foreground mt-1">
                Configure ImgBB integration settings to enable image hosting before uploading to Airtable
              </p>
            </div>
            
            {/* Status Banner */}
            <div className={`mb-8 p-4 rounded-lg ${apiKeySetting?.value ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex items-center gap-3">
                {apiKeySetting?.value ? (
                  <>
                    <div className="bg-green-100 p-2 rounded-full">
                      <Image className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-medium text-green-800">ImgBB Integration Status: {apiKeySetting.enabled ? 'Enabled' : 'Configured but Disabled'}</h2>
                      <p className="text-green-700 text-sm mt-1">
                        {apiKeySetting.enabled 
                          ? 'Images will be uploaded through ImgBB before being sent to Airtable.' 
                          : 'Integration is configured but currently disabled. Enable it below to use ImgBB for image uploads.'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-amber-100 p-2 rounded-full">
                      <AlertCircle className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-medium text-amber-800">ImgBB Integration Status: Not Configured</h2>
                      <p className="text-amber-700 text-sm mt-1">
                        Enter your ImgBB API key below to enable seamless image hosting for Airtable.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* API Key Configuration */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>ImgBB API Configuration</CardTitle>
                <CardDescription>
                  Configure your ImgBB API key to enable image hosting
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="api_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ImgBB API Key</FormLabel>
                          <FormControl>
                            <div className="flex items-center gap-2">
                              <Input placeholder="Enter your ImgBB API key" {...field} />
                            </div>
                          </FormControl>
                          <FormDescription>
                            You can get your API key from the ImgBB website after signing up
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="enabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-gray-50">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Enable ImgBB Integration
                            </FormLabel>
                            <FormDescription>
                              When enabled, all uploads will go through ImgBB first before being sent to Airtable
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      size="lg" 
                      className="w-full md:w-auto"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save ImgBB Settings
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
              <CardFooter className="bg-secondary/20 text-sm text-muted-foreground">
                <p>
                  Note: Your ImgBB API key is securely stored and never shared with third parties.
                </p>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  The ImgBB integration provides a permanent hosting solution for your images:
                </p>
                <ol className="list-decimal ml-6 space-y-2">
                  <li>Images are first uploaded to ImgBB using their API</li>
                  <li>ImgBB provides a permanent, reliable URL for your image</li>
                  <li>This URL is then stored in your Airtable records</li>
                  <li>Images are accessible and fully optimized for performance</li>
                </ol>
                
                <Separator className="my-4" />
                
                <p className="text-muted-foreground">
                  <strong>Benefits:</strong> Using ImgBB as an intermediary for image storage provides faster loading times, better reliability, 
                  and protection against image link breakage from direct Airtable attachments.
                </p>
                
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-800">Get Your ImgBB API Key</AlertTitle>
                  <AlertDescription className="text-blue-700">
                    Visit <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer" className="font-medium underline">api.imgbb.com</a> to 
                    create an account and get your API key. You'll need this to enable the integration.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}