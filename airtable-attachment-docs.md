# Airtable API Documentation for Attachments

## Key Points About Airtable Attachments

1. Attachments in Airtable API are represented as arrays of attachment objects.
2. Each attachment object must include at minimum a `url` property.
3. Optionally, you can include a `filename` property to specify the name of the file.

## Example Format for Creating/Updating Attachments

```json
{
  "fields": {
    "Attachments": [
      {
        "url": "https://example.com/image.jpg",
        "filename": "image.jpg"
      }
    ]
  }
}
```

## Important Notes

- Airtable will download the file from the URL you provide and host it on Airtable's servers.
- The URL must be publicly accessible.
- Some URLs may be blocked by Airtable for security reasons.
- Airtable may process the attachment asynchronously, so it may not be immediately visible.
- The Airtable UI might cache previous states, requiring a refresh to see changes.
- Airtable processes different types of attachments differently based on file extension and MIME type.

## Airtable Response Format for Attachments

When an attachment is successfully uploaded, Airtable adds additional metadata:

```json
{
  "id": "att12345",
  "url": "https://airtable-uploaded-url.com/attachment.jpg",
  "filename": "attachment.jpg",
  "size": 12345,
  "type": "image/jpeg",
  "thumbnails": {
    "small": { "url": "...", "width": 36, "height": 36 },
    "large": { "url": "...", "width": 512, "height": 512 }
  }
}
```

## Troubleshooting

1. If attachments don't appear in the Airtable UI:
   - Refresh the page completely (hard refresh)
   - Check if the URL is accessible from Airtable's servers
   - Verify the attachment field is properly configured in Airtable
   - Wait a few minutes for processing to complete

2. Common issues:
   - URL timeouts or redirects
   - Image format not supported
   - File too large
   - URL contains authentication tokens that Airtable can't use