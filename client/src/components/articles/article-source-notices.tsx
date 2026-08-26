import { AlertCircle, Image } from "lucide-react";

/** Explains that saving updates the local copy only, and how the fields map. */
export function AirtableSourceNotice({ externalId }: { externalId: string | null }) {
  return (
    <div className="mb-4 p-4 border border-blue-200 bg-blue-50 rounded-md">
      <div className="flex items-center">
        <AlertCircle className="h-4 w-4 text-blue-500 mr-2" />
        <h5 className="text-sm font-medium text-blue-700">Airtable Source</h5>
      </div>
      <p className="text-sm text-blue-600 mt-1">
        This article was imported from Airtable. Your changes will update the local copy. To push changes
        back to Airtable, use the "Update in Airtable" button in the article list after saving.
      </p>
      <div className="mt-2 text-xs text-blue-600">
        <p>
          <span className="font-semibold">Important:</span> When updating to Airtable:
        </p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>Main Image URL will update the MainImage field in Airtable</li>
          <li>Instagram Image URL will update the instaPhoto field in Airtable</li>
          <li>Both image fields can be set independently for better integration</li>
          <li>All Airtable fields like Date, Featured, and Status will be properly mapped</li>
        </ul>
      </div>
      <span className="text-xs text-blue-600 mt-3 block">
        <span className="font-semibold">Airtable ID:</span>{" "}
        <code className="px-1 py-0.5 bg-white rounded text-xs font-mono">{externalId}</code>
      </span>
    </div>
  );
}

/** Tells the editor where uploaded images will actually land. */
export function ImgbbStatusNotice({ enabled }: { enabled: boolean }) {
  return (
    <div
      className={`mb-4 p-4 border rounded-md ${enabled ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"}`}
    >
      <div className="flex items-center">
        <Image className={`h-4 w-4 mr-2 ${enabled ? "text-green-500" : "text-gray-500"}`} />
        <h5 className={`text-sm font-medium ${enabled ? "text-green-700" : "text-gray-700"}`}>
          ImgBB Integration {enabled ? "Enabled" : "Disabled"}
        </h5>
      </div>
      <p className={`text-sm mt-1 ${enabled ? "text-green-600" : "text-gray-600"}`}>
        {enabled
          ? "Images will be uploaded to ImgBB first, then the URL will be sent to Airtable."
          : "Images will be uploaded directly to Airtable. ImgBB hosting turns on once IMGBB_API_KEY is set on the server."}
      </p>
      {enabled && (
        <div className="mt-2 text-xs text-green-600">
          <p>
            <span className="font-semibold">Benefits:</span>
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>Faster uploads with better reliability</li>
            <li>CDN-optimized image delivery</li>
            <li>No Airtable attachment size limits</li>
          </ul>
        </div>
      )}
    </div>
  );
}
