import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Pull-from / push-to Airtable for one resource. Team members and carousel
 * quotes each had a byte-for-byte copy of this pair of mutations, differing
 * only in the slug, the cache key and the noun in the toast.
 */

/** Shape both sync and push endpoints answer with; fields are best-effort. */
interface AirtableSyncResponse {
  results?: { created?: number; updated?: number; errors?: number };
  updated?: number;
  message?: string;
}

interface AirtableSyncOptions {
  /** Path segment of the endpoint, e.g. "team-members". */
  resource: string;
  /** Query key to invalidate once the transfer lands. */
  queryKey: string;
  /** Plural noun used in the toasts, e.g. "team members". */
  label: string;
}

export function useAirtableSync({ resource, queryKey, label }: AirtableSyncOptions) {
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [queryKey] });

  const syncMutation = useMutation({
    mutationFn: async (): Promise<AirtableSyncResponse> => {
      const res = await apiRequest("POST", `/api/airtable/sync/${resource}`);
      return await res.json();
    },
    onSuccess: (data) => {
      invalidate();
      const { created = 0, updated = 0 } = data?.results ?? {};
      toast({
        title: `${label} pulled from Airtable`,
        description: `Successfully synced ${label}: ${created} created, ${updated} updated`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error pulling from Airtable",
        description:
          error.message ||
          `Failed to sync ${label} from Airtable. Please check your connection settings.`,
        variant: "destructive",
      });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async (): Promise<AirtableSyncResponse> => {
      const res = await apiRequest("POST", `/api/airtable/push/${resource}`);
      return await res.json();
    },
    onSuccess: (data) => {
      invalidate();
      // The two endpoints disagree on where the count lives, so accept either.
      const updated = data?.results?.updated ?? data?.updated ?? 0;
      toast({
        title: `${label} pushed to Airtable`,
        description: `Successfully pushed ${updated} ${label} to Airtable.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error pushing to Airtable",
        description:
          error.message ||
          `Failed to push ${label} to Airtable. Please check your connection settings.`,
        variant: "destructive",
      });
    },
  });

  return { syncMutation, pushMutation };
}
