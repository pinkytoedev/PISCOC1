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
import { TeamMember, InsertTeamMember, Article } from "@shared/schema";
import { Plus, Edit, Trash2, Loader2, AlertCircle, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TeamMembersPage() {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [activeTab, setActiveTab] = useState("team-members");
  const [formData, setFormData] = useState<Partial<InsertTeamMember>>({
    name: "",
    role: "",
    bio: "",
    imageUrl: "",
    imageType: "url",
    imagePath: null,
  });
  
  // Get team members
  const { data: teamMembers, isLoading } = useQuery<TeamMember[]>({
    queryKey: ['/api/team-members'],
  });
  
  // Get all articles
  const { data: articles, isLoading: isLoadingArticles } = useQuery<Article[]>({
    queryKey: ['/api/articles'],
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
  
  // Filter articles by team member (author)
  const getArticlesByTeamMember = (teamMemberName: string) => {
    if (!articles) return [];
    return articles.filter(article => article.author === teamMemberName);
  };
  
  // Get all articles with photo credits
  const getArticlesWithPhotoCredits = () => {
    if (!articles) return [];
    return articles.filter(article => article.photoCredit && article.photoCredit.trim() !== '');
  };
  
  // Sort articles by scheduled date (most recent first)
  const getSortedArticlesByScheduled = (articlesList: Article[]) => {
    return [...articlesList].sort((a, b) => {
      // Use Scheduled field first (from Airtable)
      const dateA = a.Scheduled ? new Date(a.Scheduled).getTime() : 0;
      const dateB = b.Scheduled ? new Date(b.Scheduled).getTime() : 0;
      return dateB - dateA;
    });
  };
  
  // Get badge color based on status
  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'published':
        return 'default';
      case 'draft':
        return 'secondary';
      case 'scheduled':
        return 'outline';
      default:
        return 'secondary';
    }
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
                  Manage your team profiles and articles information.
                </p>
              </div>
              <Button onClick={handleCreateClick}>
                <Plus className="mr-2 h-4 w-4" />
                Add Team Member
              </Button>
            </div>
            
            {/* Tabs for different views */}
            <Tabs defaultValue="team-articles" className="mb-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="team-articles">Recent Articles</TabsTrigger>
                <TabsTrigger value="photo-articles">Articles with Photos</TabsTrigger>
                <TabsTrigger value="team-members">Team Members</TabsTrigger>
              </TabsList>
              
              {/* Tab 1: Recent Articles by Team Members */}
              <TabsContent value="team-articles" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Articles by Team Members</CardTitle>
                    <CardDescription>
                      The most recent articles published by team members, sorted by scheduled date.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingArticles || isLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2 mb-1"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {teamMembers && teamMembers.length > 0 ? (
                          teamMembers.map((member) => {
                            const memberArticles = getArticlesByTeamMember(member.name);
                            if (memberArticles.length === 0) return null;
                            
                            const sortedArticles = getSortedArticlesByScheduled(memberArticles).slice(0, 3);
                            
                            return (
                              <div key={member.id} className="space-y-2">
                                <h3 className="text-lg font-semibold flex items-center">
                                  {member.name}
                                  <span className="text-xs text-gray-500 ml-2">({memberArticles.length} articles)</span>
                                </h3>
                                <div className="grid grid-cols-1 gap-4">
                                  {sortedArticles.map((article) => (
                                    <div key={article.id} className="p-4 border rounded-md bg-white">
                                      <div className="flex justify-between">
                                        <h4 className="text-md font-medium">{article.title}</h4>
                                        <Badge variant={getStatusBadgeVariant(article.status)}>
                                          {article.status}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center mt-1 text-sm text-gray-500">
                                        <Calendar className="h-3 w-3 mr-1" />
                                        <span>
                                          {article.Scheduled 
                                            ? new Date(article.Scheduled).toLocaleDateString() 
                                            : 'No schedule date'}
                                        </span>
                                      </div>
                                      {article.excerpt && (
                                        <p className="mt-2 text-sm text-gray-700 line-clamp-2">
                                          {article.excerpt}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }).filter(Boolean)
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-gray-500">No team members found.</p>
                          </div>
                        )}
                        
                        {teamMembers && teamMembers.length > 0 && 
                         teamMembers.every(member => getArticlesByTeamMember(member.name).length === 0) && (
                          <div className="text-center py-8">
                            <p className="text-gray-500">No articles assigned to team members yet.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Tab 2: Articles with Photos and Photo Credits */}
              <TabsContent value="photo-articles" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Articles with Photo Credits</CardTitle>
                    <CardDescription>
                      Articles with images and photo credits, sorted by scheduled date.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingArticles ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="animate-pulse">
                            <div className="w-full h-48 bg-gray-200 rounded-md mb-2"></div>
                            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {articles && articles.length > 0 ? (
                          getSortedArticlesByScheduled(getArticlesWithPhotoCredits()).map((article) => (
                            <Card key={article.id} className="overflow-hidden">
                              <CardContent className="p-0">
                                <div className="relative">
                                  {article.imageUrl && (
                                    <img 
                                      src={article.imageUrl} 
                                      alt={article.title} 
                                      className="w-full h-48 object-cover"
                                    />
                                  )}
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-1 text-xs">
                                    Photo: {article.photoCredit}
                                  </div>
                                </div>
                                <div className="p-4">
                                  <div className="flex justify-between items-start">
                                    <h3 className="text-md font-semibold">{article.title}</h3>
                                    <Badge variant={getStatusBadgeVariant(article.status)}>
                                      {article.status}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center mt-1 text-xs text-gray-500">
                                    <Calendar className="h-3 w-3 mr-1" />
                                    <span>
                                      {article.Scheduled 
                                        ? new Date(article.Scheduled).toLocaleDateString() 
                                        : 'No schedule date'}
                                    </span>
                                  </div>
                                  {article.excerpt && (
                                    <p className="mt-2 text-xs text-gray-700 line-clamp-2">
                                      {article.excerpt}
                                    </p>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))
                        ) : (
                          <div className="col-span-3 text-center py-8">
                            <p className="text-gray-500">No articles with photo credits found.</p>
                          </div>
                        )}
                        
                        {articles && articles.length > 0 && getArticlesWithPhotoCredits().length === 0 && (
                          <div className="col-span-3 text-center py-8">
                            <p className="text-gray-500">No articles with photo credits found.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Tab 3: Team Members List */}
              <TabsContent value="team-members" className="mt-6">
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
              </TabsContent>
            </Tabs>
            
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
