import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InsertArticle, TeamMember } from "@shared/schema";
import type { AirtableImageField } from "@/hooks/use-article-uploads";
import { ArticleImageField } from "./article-image-field";

interface ArticleFormFieldsProps {
  formData: Partial<InsertArticle>;
  onInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  onSelectChange: (name: string, value: string) => void;
  teamMembers?: TeamMember[];
  isLoadingTeamMembers: boolean;
  /** Attachment uploads only exist for Airtable-backed articles. */
  isFromAirtable: boolean;
  imgbbEnabled: boolean;
  uploadingField: AirtableImageField | null;
  onImageFile: (field: AirtableImageField, file: File) => void;
}

export function ArticleFormFields({
  formData,
  onInputChange,
  onSelectChange,
  teamMembers,
  isLoadingTeamMembers,
  isFromAirtable,
  imgbbEnabled,
  uploadingField,
  onImageFile,
}: ArticleFormFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="col-span-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          value={formData.title}
          onChange={onInputChange}
          placeholder="Article title"
          required
        />
      </div>

      <div className="col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description || ""}
          onChange={onInputChange}
          placeholder="Brief description for article listing and previews (optional)"
          rows={2}
        />
      </div>

      <div>
        <Label htmlFor="author">Author</Label>
        {isLoadingTeamMembers ? (
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder="Loading authors..." />
            </SelectTrigger>
          </Select>
        ) : (
          <Select
            name="author"
            value={formData.author}
            onValueChange={(value) => onSelectChange("author", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an author" />
            </SelectTrigger>
            <SelectContent>
              {teamMembers?.map((member) => (
                <SelectItem key={member.id} value={member.name}>
                  {member.name}
                </SelectItem>
              ))}
              <SelectItem value="Anonymous">Anonymous</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div>
        <Label htmlFor="contentFormat">Content Format</Label>
        <Select
          name="contentFormat"
          value={formData.contentFormat}
          onValueChange={(value) => onSelectChange("contentFormat", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="rtf">Rich Text</SelectItem>
            <SelectItem value="plaintext">Plain Text</SelectItem>
            <SelectItem value="html">HTML</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-2">
        <Label htmlFor="content">Content</Label>
        <Textarea
          id="content"
          name="content"
          value={formData.content || ""}
          onChange={onInputChange}
          placeholder="Article content (optional)"
          rows={5}
          className="font-mono"
        />
      </div>

      <ArticleImageField
        field="MainImage"
        value={formData.imageUrl ?? ""}
        onChange={onInputChange}
        showUpload={isFromAirtable}
        imgbbEnabled={imgbbEnabled}
        uploading={uploadingField === "MainImage"}
        onFileSelected={(file) => onImageFile("MainImage", file)}
      />

      <ArticleImageField
        field="instaPhoto"
        value={formData.instagramImageUrl ?? ""}
        onChange={onInputChange}
        showUpload={isFromAirtable}
        imgbbEnabled={imgbbEnabled}
        uploading={uploadingField === "instaPhoto"}
        onFileSelected={(file) => onImageFile("instaPhoto", file)}
      />

      <div>
        <Label htmlFor="photo">Photo Reference</Label>
        {isLoadingTeamMembers ? (
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder="Loading team members..." />
            </SelectTrigger>
          </Select>
        ) : (
          <Select
            name="photo"
            value={formData.photo || ""}
            onValueChange={(value) => onSelectChange("photo", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a photographer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {teamMembers?.map((member) => (
                <SelectItem key={`photo-${member.id}`} value={member.name}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-gray-500 mt-1">This links to a team member in Airtable's Photo field</p>
      </div>

      <div>
        <Label htmlFor="hashtags">Hashtags</Label>
        <Input
          id="hashtags"
          name="hashtags"
          value={formData.hashtags || ""}
          onChange={onInputChange}
          placeholder="#development #tutorial"
        />
        <p className="text-xs text-gray-500 mt-1">Separate hashtags with spaces</p>
      </div>

      <div>
        <Label htmlFor="Scheduled">Publication Date &amp; Time</Label>
        <Input
          id="Scheduled"
          name="Scheduled"
          type="datetime-local"
          value={formData.Scheduled || ""}
          onChange={onInputChange}
          placeholder="YYYY-MM-DD HH:MM"
        />
        <p className="text-xs text-gray-500 mt-1">
          When this article should be published (Airtable "Scheduled" field)
        </p>
      </div>

      <div>
        <Label htmlFor="featured">Featured</Label>
        <Select
          name="featured"
          value={formData.featured}
          onValueChange={(value) => onSelectChange("featured", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Featured status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no">No</SelectItem>
            <SelectItem value="yes">Yes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="status">Status</Label>
        <Select
          name="status"
          value={formData.status}
          onValueChange={(value) => onSelectChange("status", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Article status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
