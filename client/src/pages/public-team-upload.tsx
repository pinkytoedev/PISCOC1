import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Upload, CheckCircle, AlertTriangle, Image as ImageIcon, Users } from "lucide-react";

interface PublicTeamMember {
  id: number;
  name: string;
  role: string;
  bio: string;
  imageUrl: string;
}

export default function PublicTeamUploadPage() {
  const { toast } = useToast();
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    bio: ""
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if feature is enabled
  const { data: status, isLoading: loadingStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ['/api/public/team-upload-status'],
    retry: false
  });

  // Fetch team members
  const { data: teamMembers, isLoading: loadingMembers } = useQuery<PublicTeamMember[]>({
    queryKey: ['/api/public/team-members-list'],
    enabled: !!status?.enabled,
    retry: false
  });

  // Fetch team roles
  const { data: teamRoles, isLoading: loadingRoles } = useQuery<string[]>({
    queryKey: ['/api/public/team-roles'],
    enabled: !!status?.enabled,
    retry: false
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch("/api/public/team-member-update", {
        method: "POST",
        body: data,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update profile");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['/api/public/team-members-list'] });
      toast({
        title: "Profile updated",
        description: "Your team profile has been successfully updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (selectedMemberId && teamMembers) {
      const member = teamMembers.find(m => m.id.toString() === selectedMemberId);
      if (member) {
        setFormData({
          name: member.name,
          role: member.role,
          bio: member.bio
        });
        // Determine if existing image is valid for preview
        if (member.imageUrl && !file) {
           setPreview(member.imageUrl);
        }
      }
    }
  }, [selectedMemberId, teamMembers]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedMemberId) {
      toast({
        title: "Select profile",
        description: "Please select your profile from the list.",
        variant: "destructive"
      });
      return;
    }

    const data = new FormData();
    data.append("memberId", selectedMemberId);
    data.append("name", formData.name);
    data.append("role", formData.role);
    data.append("bio", formData.bio);
    
    if (file) {
      data.append("file", file);
    }

    updateMutation.mutate(data);
  };

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
      </div>
    );
  }

  if (!status?.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-white to-purple-50 p-4">
        <Card className="max-w-md w-full text-center p-8 bg-white/90 backdrop-blur-sm border-0 shadow-xl rounded-3xl">
          <div className="mx-auto h-16 w-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h1>
          <p className="text-gray-600">
            Public team uploads are currently disabled. Please contact the administrator if you believe this is an error.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-md shadow-lg py-8 px-4 border-b border-pink-200/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-b from-pink-300 to-pink-600 rounded-2xl shadow-lg">
              <Users className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 text-center mb-2">
            Team Profile Update
          </h1>
          <p className="text-gray-600 text-center text-lg">
            Select your profile and update your information and photo.
          </p>
        </div>
      </header>

      <main className="flex-1 py-12 bg-[url('/assets/images/pink-background.png')] bg-repeat" style={{ backgroundSize: '500px' }}>
        <div className="max-w-2xl mx-auto px-4">
          {success ? (
            <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-600 text-white pb-8">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-4 bg-white/20 rounded-full">
                    <CheckCircle className="h-12 w-12" />
                  </div>
                </div>
                <CardTitle className="text-2xl text-center font-bold">
                  Profile Updated!
                </CardTitle>
                <CardDescription className="text-green-100 text-center text-lg">
                  Thank you! Your profile information has been successfully updated.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <div className="text-center py-6 px-4 bg-gray-50 rounded-2xl">
                  <p className="text-gray-600 text-sm mb-6">
                    The changes should reflect on the website shortly.
                  </p>
                  <Button 
                    onClick={() => {
                      setSuccess(false);
                      setFile(null);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-12 px-8"
                  >
                    Update Another Profile
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-pink-400 to-pink-600 text-white pb-6">
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Users className="h-5 w-5" />
                  </div>
                  Update Information
                </CardTitle>
                <CardDescription className="text-pink-100">
                  Please fill in the details below. Fields left empty will remain unchanged.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  
                  <div className="space-y-2">
                    <Label htmlFor="member-select" className="text-base font-medium">Select Your Profile</Label>
                    <Select 
                      value={selectedMemberId} 
                      onValueChange={setSelectedMemberId}
                      disabled={loadingMembers}
                    >
                      <SelectTrigger className="h-12 text-lg border-2 border-gray-200 hover:border-pink-300 transition-colors rounded-xl bg-white">
                        <SelectValue placeholder={loadingMembers ? "Loading members..." : "Select your name"} />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers?.map((member) => (
                          <SelectItem key={member.id} value={member.id.toString()} className="text-lg py-3 cursor-pointer">
                            {member.name} - {member.role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedMemberId && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="space-y-6 border-t border-pink-100 pt-6 mt-2">
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="name" className="text-gray-700">Full Name</Label>
                            <Input
                              id="name"
                              value={formData.name}
                              onChange={(e) => setFormData({...formData, name: e.target.value})}
                              placeholder="Your Name"
                              required
                              className="h-11 border-gray-200 focus:border-pink-300 focus:ring-pink-200 rounded-xl"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="role" className="text-gray-700">Role / Position</Label>
                            <Select 
                              value={formData.role} 
                              onValueChange={(value) => setFormData({...formData, role: value})}
                              disabled={loadingRoles}
                            >
                              <SelectTrigger className="h-11 border-gray-200 focus:border-pink-300 focus:ring-pink-200 rounded-xl bg-white">
                                <SelectValue placeholder={loadingRoles ? "Loading roles..." : "Select your role"} />
                              </SelectTrigger>
                              <SelectContent>
                                {teamRoles?.map((role) => (
                                  <SelectItem key={role} value={role} className="cursor-pointer">
                                    {role}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="bio" className="text-gray-700">Bio</Label>
                          <Textarea
                            id="bio"
                            value={formData.bio}
                            onChange={(e) => setFormData({...formData, bio: e.target.value})}
                            placeholder="Tell us about yourself..."
                            rows={4}
                            required
                            className="min-h-[120px] border-gray-200 focus:border-pink-300 focus:ring-pink-200 rounded-xl resize-none"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="text-gray-700">Profile Photo</Label>
                          <div className="flex items-center gap-6 p-4 bg-gray-50/80 rounded-2xl border border-gray-100">
                            <div className="relative h-24 w-24 rounded-full overflow-hidden bg-white border-4 border-white shadow-md flex-shrink-0 group">
                              {preview ? (
                                <img 
                                  src={preview} 
                                  alt="Profile preview" 
                                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-pink-200 bg-pink-50">
                                  <ImageIcon className="h-10 w-10" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="relative">
                                <Input
                                  id="file"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                                  onChange={handleFileChange}
                                  className="hidden"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => document.getElementById('file')?.click()}
                                  className="w-full sm:w-auto border-pink-200 text-pink-700 hover:bg-pink-50 hover:text-pink-800 rounded-xl"
                                >
                                  <Upload className="mr-2 h-4 w-4" />
                                  Choose New Photo
                                </Button>
                              </div>
                              <p className="text-xs text-gray-500 mt-2">
                                Recommended size: 300x300px. Max size: 10MB.
                                <br />Supported formats: JPG, PNG, WebP, HEIC.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 mt-6 border-t border-gray-100">
                        <Button 
                          type="submit" 
                          className="w-full h-14 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all"
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                              Updating Profile...
                            </>
                          ) : (
                            <>
                              <Upload className="mr-3 h-5 w-5" />
                              Update Profile
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="bg-white/80 backdrop-blur-md border-t border-pink-200/50 py-6 text-center text-gray-500">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <p className="text-sm font-medium">Secure Public Team Portal</p>
          </div>
          <p className="text-xs">Updates are logged and monitored. Abuse will result in access revocation.</p>
        </div>
      </footer>
    </div>
  );
}
