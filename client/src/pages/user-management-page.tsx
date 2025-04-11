import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Edit, Loader2, Trash2, User, UserCog, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { InsertUser, User as UserType } from "@shared/schema";
import { Header } from "@/components/layout/header";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const userSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  isAdmin: z.boolean().default(false),
});

// Edit user schema without requiring password
const editUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().optional(),
  isAdmin: z.boolean().default(false),
});

type UserFormValues = z.infer<typeof userSchema>;
type EditUserFormValues = z.infer<typeof editUserSchema>;

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  
  // Query to fetch all users
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return await res.json() as UserType[];
    }
  });
  
  const userForm = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      username: "",
      password: "",
      isAdmin: false,
    },
  });
  
  const editUserForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      username: "",
      password: "",
      isAdmin: false,
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", userData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User created successfully",
      });
      userForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<UserType> }) => {
      const res = await apiRequest("PUT", `/api/users/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      setEditModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/users/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      setDeleteModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: UserFormValues) => {
    createUserMutation.mutate(data);
  };
  
  const onEditSubmit = (data: EditUserFormValues) => {
    if (!selectedUser) return;
    
    // Only include password if it was changed
    const updateData: Partial<UserType> = {
      username: data.username,
      isAdmin: data.isAdmin
    };
    
    if (data.password && data.password.trim() !== '') {
      updateData.password = data.password;
    }
    
    updateUserMutation.mutate({ 
      id: selectedUser.id,
      data: updateData
    });
  };
  
  const handleEditClick = (user: UserType) => {
    setSelectedUser(user);
    editUserForm.reset({
      username: user.username,
      password: "", // Don't show the existing password
      isAdmin: user.isAdmin
    });
    setEditModalOpen(true);
  };
  
  const handleDeleteClick = (user: UserType) => {
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };
  
  const handleDeleteConfirm = () => {
    if (selectedUser) {
      deleteUserMutation.mutate(selectedUser.id);
    }
  };

  // Only admin users should see this page
  if (!currentUser?.isAdmin) {
    return (
      <div className="container mx-auto mt-10 text-center">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p>You need administrator privileges to access this page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="User Management" />
      
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="mb-8 flex items-center space-x-4">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-muted-foreground">Create new user accounts for the system</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          <Card>
            <CardHeader>
              <CardTitle>Create New User</CardTitle>
              <CardDescription>
                Add a new user to the system. Only administrators can create user accounts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...userForm}>
                <form onSubmit={userForm.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={userForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter username" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={userForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Enter password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={userForm.control}
                    name="isAdmin"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Administrator</FormLabel>
                          <FormDescription className="text-xs">
                            Grant administrative privileges to this user
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
                    className="w-full" 
                    disabled={createUserMutation.isPending}
                  >
                    {createUserMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating User...
                      </>
                    ) : (
                      "Create User"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter>
              <p className="text-xs text-gray-500">
                Users will need to sign in with these credentials to access the system
              </p>
            </CardFooter>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Account Security Guidelines</CardTitle>
              <CardDescription>
                Best practices for managing user accounts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-primary/10 p-4">
                <h3 className="font-medium mb-2">Strong Passwords</h3>
                <p className="text-sm">
                  Ensure all users have strong passwords with a mix of letters, numbers, and special characters.
                </p>
              </div>
              
              <div className="rounded-lg bg-primary/10 p-4">
                <h3 className="font-medium mb-2">Admin Privileges</h3>
                <p className="text-sm">
                  Only grant administrator access to users who need to manage system settings and create other users.
                </p>
              </div>
              
              <div className="rounded-lg bg-primary/10 p-4">
                <h3 className="font-medium mb-2">Regular Audits</h3>
                <p className="text-sm">
                  Periodically review user accounts and remove access for users who no longer need it.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* User Management Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                <span>Manage Users</span>
              </div>
              <Badge variant="outline" className="ml-2">
                {users.length} {users.length === 1 ? 'user' : 'users'}
              </Badge>
            </CardTitle>
            <CardDescription>
              View, edit, and delete user accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingUsers ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : users.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">ID</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-mono text-sm">{user.id}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {user.username}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.isAdmin ? "default" : "secondary"}>
                            {user.isAdmin ? "Admin" : "User"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.lastLogin 
                            ? new Date(user.lastLogin).toLocaleString()
                            : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleEditClick(user)}
                              title="Edit user"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleDeleteClick(user)}
                              disabled={user.id === currentUser?.id} // Can't delete yourself
                              title="Delete user"
                              className="text-destructive focus:text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Users className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No users found</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Create a new user to get started.
                </p>
              </div>
            )}
            
            {currentUser && currentUser.id === 2 && (
              <Alert className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You are using the default admin account (admin). It is recommended to create a new admin account with a strong password.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Edit User Modal */}
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information and permissions
              </DialogDescription>
            </DialogHeader>
            
            <Form {...editUserForm}>
              <form onSubmit={editUserForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField
                  control={editUserForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editUserForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password (leave blank to keep current)</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter new password" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Only fill this field if you want to change the password
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editUserForm.control}
                  name="isAdmin"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Administrator</FormLabel>
                        <FormDescription className="text-xs">
                          Grant administrative privileges to this user
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
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setEditModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateUserMutation.isPending}
                  >
                    {updateUserMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
        {/* Delete User Confirmation Modal */}
        <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this user? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            
            {selectedUser && (
              <div className="py-3 rounded-md bg-muted px-4 my-2">
                <p className="font-medium">Username: {selectedUser.username}</p>
                <p className="text-sm text-muted-foreground">
                  Role: {selectedUser.isAdmin ? "Administrator" : "Regular User"}
                </p>
              </div>
            )}
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteUserMutation.isPending}
              >
                {deleteUserMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete User"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}