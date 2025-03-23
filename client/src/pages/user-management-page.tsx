import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { InsertUser } from "@shared/schema";
import { Header } from "@/components/layout/header";
import { useToast } from "@/hooks/use-toast";

const userSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  isAdmin: z.boolean().default(false),
});

type UserFormValues = z.infer<typeof userSchema>;

export default function UserManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const userForm = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      username: "",
      password: "",
      isAdmin: false,
    },
  });

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

  const onSubmit = (data: UserFormValues) => {
    createUserMutation.mutate(data);
  };

  // Only admin users should see this page
  if (!user?.isAdmin) {
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
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
      </main>
    </div>
  );
}