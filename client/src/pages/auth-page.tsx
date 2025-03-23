import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { SiDiscord, SiAirtable, SiInstagram } from "react-icons/si";

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function AuthPage() {
  const [location, navigate] = useLocation();
  const { user, loginMutation } = useAuth();
  
  if (user) {
    // Using setTimeout to defer the navigation to the next event loop tick
    setTimeout(() => navigate("/"), 0);
    return null; // Return empty component when logged in
  }

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onLoginSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="p-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-center">
                Discord-Airtable Integration
              </CardTitle>
              <CardDescription className="text-center">
                Sign in to manage your content across platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your username" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Enter your password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex justify-center">
              <p className="text-xs text-gray-500">
                By signing in, you agree to our terms and conditions
              </p>
            </CardFooter>
          </Card>
        </div>
        
        <div className="hidden md:block">
          <div className="bg-primary rounded-xl p-8 text-white">
            <h1 className="text-3xl font-bold mb-6">
              Unified Content Management
            </h1>
            <p className="text-lg mb-8">
              Seamlessly integrate Discord, Airtable, and Instagram for efficient content distribution and management.
            </p>
            
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="bg-white/10 p-3 rounded-lg">
                  <SiDiscord className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Discord Integration</h3>
                  <p className="text-sm text-white/80">
                    Collect, review, and publish content directly from Discord with slash commands.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-white/10 p-3 rounded-lg">
                  <SiAirtable className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Airtable Synchronization</h3>
                  <p className="text-sm text-white/80">
                    Bidirectional data flow with Airtable for structured content organization.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-white/10 p-3 rounded-lg">
                  <SiInstagram className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Instagram Publishing</h3>
                  <p className="text-sm text-white/80">
                    Distribute content to Instagram directly from your admin dashboard.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
