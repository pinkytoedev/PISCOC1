import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TeamMember, InsertTeamMember } from "@shared/schema";
import { Plus, Edit, Trash2, Loader2, AlertCircle, Download, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TeamMembersPage() {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState<Partial<InsertTeamMember>>({
    name: "",
    role: "",
    bio: "",
    imageUrl: "",
    imageType: "url",
    imagePath: null,
  });
  
  const { data: teamMembers, isLoading } = useQuery<TeamMember[]>({
    queryKey: ['/api/team-members'],
  });
  
  const createMemberMutation = useMutation({
    mutationFn: async (member: InsertTeamMember) => {
      const res = await apiRequest(
        editMember ? "PUT" : "POST", 
        editMember ? `/api/team-members/${editMember.id}` : "/api/team-members", 
        member
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team-members'] });
      toast({
        title: editMember ? "Team member updated" : "Team member created",
        description: editMember 
          ? "The team member has been updated successfully." 
          : "The team member has been created successfully.",
      });
      handleCloseModal();
    },
    onError: (error) => {
      toast({
        title: editMember ? "Error updating team member" : "Error creating team member",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const deleteMemberMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/team-members/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team-members'] });
      toast({
        title: "Team member deleted",
        description: "The team member has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting team member",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Pull from Airtable (sync team members from Airtable to our application)
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/airtable/sync/team-members");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/team-members'] });
      const results = data?.results || { created: 0, updated: 0 };
      toast({
        title: "Team members pulled from Airtable",
        description: `Successfully synced team members: ${results.created} created, ${results.updated} updated`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error pulling from Airtable",
        description: error.message || "Failed to sync team members from Airtable. Please check your connection settings.",
        variant: "destructive",
      });
    },
  });

  // Push all team members to Airtable (batch update)
  const pushMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/airtable/push/team-members");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/team-members'] });
      toast({
        title: "Team members pushed to Airtable",
        description: `Successfully pushed ${data.results?.updated || 0} team members to Airtable.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error pushing to Airtable",
        description: error.message || "Failed to push team members to Airtable. Please check your connection settings.",
        variant: "destructive",
      });
    },
  });
  
  const handleCreateClick = () => {
    setEditMember(null);
    setFormData({
      name: "",
      role: "",
      bio: "",
      imageUrl: "",
      imageType: "url",
      imagePath: null,
    });
    setIsModalOpen(true);
  };
  
  const handleEditClick = (member: TeamMember) => {
    setEditMember(member);
    setFormData({
      name: member.name,
      role: member.role,
      bio: member.bio,
      imageUrl: member.imageUrl,
      imageType: member.imageType,
      imagePath: member.imagePath,
    });
    setIsModalOpen(true);
  };
  
  const handleDeleteClick = (member: TeamMember) => {
    if (confirm(`Are you sure you want to delete ${member.name}?`)) {
      deleteMemberMutation.mutate(member.id);
    }
  };

  // Function to pull team members from Airtable
  const handlePullFromAirtable = () => {
    if (confirm("This will pull all team members from Airtable. Existing members with matching IDs will be updated. Continue?")) {
      syncMutation.mutate();
    }
  };

  // Function to push all team members to Airtable
  const handlePushToAirtable = () => {
    if (confirm("This will push all team members to Airtable. Continue?")) {
      pushMutation.mutate();
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMemberMutation.mutate(formData as InsertTeamMember);
  };
  
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditMember(null);
    setFormData({
      name: "",
      role: "",
      bio: "",
      imageUrl: "",
      imageType: "url",
      imagePath: null,
    });
  };
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Team Members" />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Breadcrumbs */}
            <nav className="text-sm font-medium mb-6" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <a href="/" className="text-gray-500 hover:text-gray-700">Dashboard</a>
                </li>
                <li className="flex items-center">
                  <svg className="h-4 w-4 text-gray-400 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-900">Team Members</span>
                </li>
              </ol>
            </nav>

            {/* Page Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Manage your team profiles and information.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handlePullFromAirtable} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Pull from Airtable
                </Button>
                <Button variant="outline" onClick={handlePushToAirtable} disabled={pushMutation.isPending}>
                  {pushMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Push to Airtable
                </Button>
                <Button onClick={handleCreateClick}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Team Member
                </Button>
              </div>
            </div>

            {/* Team Members Grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-4">
                        <div className="rounded-full bg-gray-200 h-16 w-16"></div>
                        <div className="space-y-2 flex-1">
                          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <div className="h-3 bg-gray-200 rounded w-full"></div>
                        <div className="h-3 bg-gray-200 rounded w-full"></div>
                        <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {teamMembers && teamMembers.length > 0 ? (
                  teamMembers.map((member) => (
                    <Card key={member.id} className="overflow-hidden">
                      <CardContent className="p-0">
                        <div className="relative">
                          {member.imageUrl && (
                            <img 
                              src={member.imageUrl} 
                              alt={member.name} 
                              className="w-full h-48 object-cover"
                            />
                          )}
                          <div className="absolute top-2 right-2 flex space-x-1">
                            <Button 
                              size="icon" 
                              variant="secondary" 
                              onClick={() => handleEditClick(member)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="destructive" 
                              onClick={() => handleDeleteClick(member)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="p-4">
                          <h3 className="text-lg font-semibold">{member.name}</h3>
                          <p className="text-sm text-gray-500">{member.role}</p>
                          <p className="mt-2 text-sm text-gray-700 line-clamp-3">{member.bio}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-3 text-center py-12 bg-white rounded-lg shadow">
                    <h3 className="text-lg font-medium text-gray-900">No team members found</h3>
                    <p className="mt-2 text-sm text-gray-500">Get started by adding your first team member.</p>
                    <Button onClick={handleCreateClick} className="mt-4">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Team Member
                    </Button>
                  </div>
                )}
              </div>
            )}
            
            {/* Create/Edit Team Member Modal */}
            <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editMember ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
                  <DialogDescription>
                    {editMember 
                      ? "Update the details for this team member." 
                      : "Fill in the information to add a new team member."}
                  </DialogDescription>
                </DialogHeader>
                
                {editMember?.externalId && (
                  <div className="mb-4 p-4 border border-blue-200 bg-blue-50 rounded-md">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 text-blue-500 mr-2" />
                      <h5 className="text-sm font-medium text-blue-700">Airtable Source</h5>
                    </div>
                    <p className="text-sm text-blue-600 mt-1">
                      This team member was imported from Airtable. Updates may be synchronized with Airtable during the next sync operation.
                    </p>
                  </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="Enter full name"
                        required
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="role">Role/Position</Label>
                      <Input
                        id="role"
                        name="role"
                        value={formData.role}
                        onChange={handleInputChange}
                        placeholder="e.g. Software Engineer, Designer, etc."
                        required
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea
                        id="bio"
                        name="bio"
                        value={formData.bio}
                        onChange={handleInputChange}
                        placeholder="Brief description about this team member"
                        rows={4}
                        required
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="imageUrl">Profile Image URL</Label>
                      <Input
                        id="imageUrl"
                        name="imageUrl"
                        value={formData.imageUrl}
                        onChange={handleInputChange}
                        placeholder="https://example.com/profile-image.jpg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Provide a direct link to the profile image. Recommended size: 300x300 pixels.
                      </p>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={handleCloseModal}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMemberMutation.isPending}>
                      {createMemberMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {editMember ? "Updating..." : "Creating..."}
                        </>
                      ) : (
                        editMember ? "Update Team Member" : "Add Team Member"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
    </div>
  );
}
