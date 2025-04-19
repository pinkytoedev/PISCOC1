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

// Types for form values
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
  
  // Watch form values for changes
  React.useEffect(() => {
    if (settings && !form.formState.isDirty) {
      form.reset({
        api_key: apiKeySetting?.value || '',
        enabled: apiKeySetting?.enabled === false ? false : true
      });
    }
  }, [settings, form, apiKeySetting]);
  
  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, enabled }: { key: string; value: string; enabled?: boolean }) => {
      return apiRequest(`/api/imgbb/settings/${key}`, 'POST', {
        value, 
        enabled
      });
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
        title: "Settings saved",
        description: "ImgBB integration settings have been updated successfully.",
      });
      
      setIsSubmitting(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">ImgBB Integration</h1>
              <p className="text-muted-foreground">
                Configure your ImgBB API settings for image uploads
              </p>
            </div>
            
            <Separator />
            
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-5 w-5" /> 
                    ImgBB Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure your ImgBB API key for image uploads
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center p-6">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Important!</AlertTitle>
                          <AlertDescription>
                            You'll need an ImgBB API key to enable image uploads. You can get one for free at{" "}
                            <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                              ImgBB API
                            </a>
                          </AlertDescription>
                        </Alert>
                        
                        <FormField
                          control={form.control}
                          name="api_key"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ImgBB API Key</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Enter your ImgBB API key" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                You can get an API key from the{" "}
                                <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                  ImgBB API page
                                </a>
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="enabled"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Enable ImgBB Integration</FormLabel>
                                <FormDescription>
                                  When enabled, images will be uploaded to ImgBB before being linked to Airtable.
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
                        
                        <div className="flex justify-end">
                          <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Settings
                              </>
                            )}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between bg-muted/50 text-xs text-muted-foreground">
                  <div>Last updated: {apiKeySetting?.updatedAt ? new Date(apiKeySetting.updatedAt).toLocaleString() : 'Never'}</div>
                  <div>{apiKeySetting?.enabled === false ? 'Disabled' : 'Enabled'}</div>
                </CardFooter>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}