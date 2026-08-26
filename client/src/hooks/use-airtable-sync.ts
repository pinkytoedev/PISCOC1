import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Pull-from / push-to Airtable for one resource. Team members and carousel
 * quotes each had a byte-for-byte copy of this pair of mutations, differing
 * only in the slug, the cache key and the noun in the toast.
 */

/** Shape both sync and push endpoints answer with; fields are best-effort. */
interface AirtableCounts {
  created?: number;
  updated?: number;
  /** Only a mirroring push reports this. */
  deleted?: number;
  errors?: number;
}

interface AirtableSyncResponse extends AirtableCounts {
  results?: AirtableCounts;
  message?: string;
}

interface AirtableSyncOptions {
  /** Path segment of the endpoint, e.g. "team-members". */
  resource: string;
  /** Query key to invalidate once the transfer lands. */
  queryKey: string;
  /** Plural noun used in the toasts, e.g. "team members". */
  label: string;
  /**
   * Whether this resource's push makes Airtable match the CMS exactly,
   * deletions included. Only quotes do; team members are push-only, and
   * claiming otherwise would tell an editor a removal had propagated when it
   * had not.
   */
  mirrors?: boolean;
}

export function useAirtableSync({ resource, queryKey, label, mirrors = false }: AirtableSyncOptions) {
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
      // The two endpoints disagree on where the counts live, so accept either.
      const counts = data?.results ?? data ?? {};
      const { created = 0, updated = 0, deleted = 0, errors = 0 } = counts;

      // A mirroring push removes what the CMS no longer has; say so, because
      // "pushed 3" reads as if nothing was taken away.
      const parts = [`${updated} updated`, `${created} created`];
      if (mirrors) parts.push(`${deleted} removed`);
      if (errors) parts.push(`${errors} failed`);

      const summary = parts.join(", ");
      // Only claim the two are in step when nothing failed — a partial push
      // leaves them out of step, which is exactly when the editor needs to know.
      const description = errors
        ? `Pushed ${label} to Airtable, but not everything landed: ${summary}. Try again.`
        : mirrors
          ? `Airtable now matches the CMS: ${summary}.`
          : `Pushed ${label} to Airtable: ${summary}.`;

      toast({
        title: `${label} pushed to Airtable`,
        description,
        variant: errors ? "destructive" : undefined,
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
