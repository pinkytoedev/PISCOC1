/**
 * Switch for the token-free public article upload page.
 *
 * The page at /public-upload lists every article still open for submissions and
 * lets anyone who has the link replace its images or content. That is useful
 * during a submission window and a liability outside one, so it ships off and
 * is turned on deliberately.
 *
 * Note the mismatch: the underlying endpoint
 * (POST /api/public/article-upload-status) requires admin, but this component
 * renders on /articles, which is only ProtectedRoute. Any signed-in user sees
 * the switch and gets a failed request on flipping it. The team-upload switch
 * on /team-members has the same problem.
 *
 * Mirrors the team-profile equivalent on the team members page; the two are
 * independent settings so opening one does not open the other.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const STATUS_QUERY_KEY = ["/api/public/article-upload-status"] as const;

export function PublicUploadSettings() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: status, isLoading } = useQuery<{ enabled: boolean }>({
    queryKey: STATUS_QUERY_KEY,
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/public/article-upload-status", { enabled });
      return await res.json();
    },
    onSuccess: (data: { enabled: boolean }) => {
      queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
      toast({
        title: data.enabled ? "Submissions open" : "Submissions closed",
        description: data.enabled
          ? "Anyone with the link can now submit files for unpublished articles."
          : "The public upload page is no longer reachable.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings.",
        variant: "destructive",
      });
    },
  });

  const url = `${window.location.origin}/public-upload`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied", description: "Public upload link copied to clipboard." });
    } catch {
      // Clipboard access needs a secure context and can be denied; the URL is
      // on screen either way.
      toast({
        title: "Couldn't copy",
        description: "Select the link and copy it by hand.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-medium">Public Upload Link</h3>
          <p className="text-sm text-gray-500">
            Let contributors submit images and content for unpublished articles without an
            account. Anyone with the link can pick any article on the list, so turn this off
            when the submission window closes.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          {status?.enabled && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Input readOnly value={url} className="w-full sm:w-64 pr-10 bg-gray-50" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-0 top-0 h-full"
                  onClick={copyToClipboard}
                  aria-label="Copy public upload link"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <a href="/public-upload" target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="outline" aria-label="Open public upload page">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
          )}

          <Switch
            checked={Boolean(status?.enabled)}
            disabled={isLoading || toggle.isPending}
            onCheckedChange={(checked) => toggle.mutate(checked)}
            aria-label="Enable public article uploads"
          />
        </div>
      </CardContent>
    </Card>
  );
}
