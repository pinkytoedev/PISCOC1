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
import { Loader2, Save } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Schema for validation
const imgurSettingSchema = z.object({
  client_id: z.string().min(1, "Client ID is required"),
  enabled: z.boolean().default(true)
});

type ImgurSettingFormValues = z.infer<typeof imgurSettingSchema>;

export default function ImgurPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  
  // Fetch current Imgur settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/imgur/settings'],
    queryFn: async () => {
      const response = await fetch('/api/imgur/settings', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch Imgur settings');
      }
      
      return response.json() as Promise<IntegrationSetting[]>;
    }
  });
  
  // Find the client ID setting if it exists
  const clientIdSetting = settings?.find(s => s.key === 'client_id');
  
  // Form setup
  const form = useForm<ImgurSettingFormValues>({
    resolver: zodResolver(imgurSettingSchema),
    defaultValues: {
      client_id: clientIdSetting?.value || '',
      enabled: clientIdSetting?.enabled === false ? false : true
    }
  });
  
  // Update values when settings load
  React.useEffect(() => {
    if (clientIdSetting) {
      form.setValue('client_id', clientIdSetting.value);
      form.setValue('enabled', clientIdSetting.enabled === false ? false : true);
    }
  }, [clientIdSetting, form]);
  
  // Mutation for updating settings
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, enabled }: { key: string; value: string; enabled: boolean }) => {
      return apiRequest(
        'POST',
        '/api/imgur/settings/' + key,
        { value, enabled }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/imgur/settings'] });
      toast({
        title: "Settings updated",
        description: "Imgur integration settings have been updated successfully.",
      });
      setIsSubmitting(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update settings",
        description: error.message || "There was an error updating the settings",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  });
  
  // Form submission handler
  const onSubmit = async (data: ImgurSettingFormValues) => {
    setIsSubmitting(true);
    
    try {
      // Update client ID setting
      await updateSettingMutation.mutateAsync({
        key: 'client_id',
        value: data.client_id,
        enabled: data.enabled
      });
    } catch (error) {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Imgur Integration</h1>
        <p className="text-muted-foreground mt-1">
          Configure Imgur integration settings to enable image hosting before uploading to Airtable
        </p>
      </div>
      
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Imgur API Configuration</CardTitle>
          <CardDescription>
            Enter your Imgur API client ID to enable integration with the Imgur service for image hosting
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Imgur Client ID</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter your Imgur client ID" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        You can get a client ID from the <a href="https://api.imgur.com/oauth2/addclient" target="_blank" rel="noopener noreferrer" className="text-primary underline">Imgur API registration page</a>
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
                        <FormLabel className="text-base">
                          Enable Imgur Integration
                        </FormLabel>
                        <FormDescription>
                          When enabled, all uploads will go through Imgur first before being sent to Airtable
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
                  disabled={isSubmitting}
                  className="flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Settings</span>
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
        <CardFooter className="bg-secondary/20 text-sm text-muted-foreground">
          <p>
            Note: Using Imgur as an intermediary ensures your images have permanent URLs that won't expire.
          </p>
        </CardFooter>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            The Imgur integration provides a permanent hosting solution for your images:
          </p>
          <ol className="list-decimal ml-6 space-y-2">
            <li>Images are first uploaded to Imgur using their API</li>
            <li>The permanent URL from Imgur is then stored in Airtable</li>
            <li>This prevents link expiration issues that can occur with temporary URLs</li>
            <li>All uploads are tracked in the activity logs for reference</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}