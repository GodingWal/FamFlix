import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ApiError } from "@/lib/queryClient";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;
const emailOnlySchema = z.object({
  email: z.string().email("Invalid email address"),
});
type EmailFormData = z.infer<typeof emailOnlySchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      firstName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
    },
  });

  const forgotPasswordForm = useForm<EmailFormData>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: "" },
  });

  const resendVerificationForm = useForm<EmailFormData>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      const token = data?.accessToken ?? data?.token;
      if (token && data?.user) {
        login(token, data.user);
      }
      toast({
        title: "Welcome back!",
        description: data?.message || "You have been successfully logged in.",
      });
      setLocation("/");
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 403 && error.details?.needsVerification) {
        toast({
          title: "Verify your email",
          description: error.message,
          variant: "destructive",
        });
        const currentEmail = loginForm.getValues("email");
        if (currentEmail) {
          resendVerificationForm.setValue("email", currentEmail);
        }
        setShowResendVerification(true);
        return;
      }

      const description = error instanceof ApiError
        ? error.message
        : "Invalid email or password";

      toast({
        title: "Login failed",
        description,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      const { email } = registerForm.getValues();
      if (email) {
        resendVerificationForm.setValue("email", email);
      }
      registerForm.reset();
      setActiveTab("login");
      const description = data?.message
        ?? (data?.requiresEmailVerification === false
          ? "Your account is ready to use. Sign in to get started."
          : "Welcome to FamFlix! Check your email to verify your account.");

      toast({
        title: "Account created!",
        description,
      });
    },
    onError: (error: unknown) => {
      const description = error instanceof ApiError
        ? error.message
        : "Failed to create account";

      toast({
        title: "Registration failed",
        description,
        variant: "destructive",
      });
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async (data: EmailFormData) => {
      const response = await apiRequest("POST", "/api/auth/resend-verification", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Verification email sent",
        description: data?.message || "Check your inbox for the verification link.",
      });
      setShowResendVerification(false);
      resendVerificationForm.reset();
    },
    onError: (error: unknown) => {
      const description = error instanceof ApiError
        ? error.message
        : "We couldn't resend the verification email. Please try again.";

      toast({
        title: "Unable to resend verification",
        description,
        variant: "destructive",
      });
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: EmailFormData) => {
      const response = await apiRequest("POST", "/api/auth/request-password-reset", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Reset link sent",
        description: data?.message || "Check your inbox for password reset instructions.",
      });
      setShowForgotPassword(false);
      forgotPasswordForm.reset();
    },
    onError: (error: unknown) => {
      const description = error instanceof ApiError
        ? error.message
        : "We couldn't process that request. Please try again.";

      toast({
        title: "Password reset failed",
        description,
        variant: "destructive",
      });
    },
  });

  const onLoginSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const onRegisterSubmit = (data: RegisterFormData) => {
    registerMutation.mutate(data);
  };

  const onForgotPasswordSubmit = (data: EmailFormData) => {
    forgotPasswordMutation.mutate(data);
  };

  const onResendVerificationSubmit = (data: EmailFormData) => {
    resendVerificationMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="absolute top-20 right-10 w-32 h-32 bg-primary/20 rounded-full blur-xl animate-float"></div>
      <div className="absolute bottom-20 left-10 w-24 h-24 bg-accent/20 rounded-full blur-xl animate-float" style={{animationDelay: '1s'}}></div>
      
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">FamFlix</h1>
          <p className="text-muted-foreground">Create magical family memories</p>
        </div>

        <Card className="glass-effect">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Welcome</CardTitle>
            <CardDescription className="text-center">
              {activeTab === "login" ? "Sign in to your account" : "Create your FamFlix account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      {...loginForm.register("email")}
                      data-testid="input-email"
                    />
                    {loginForm.formState.errors.email && (
                      <p className="text-sm text-destructive mt-1">
                        {loginForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      {...loginForm.register("password")}
                      data-testid="input-password"
                    />
                    {loginForm.formState.errors.password && (
                      <p className="text-sm text-destructive mt-1">
                        {loginForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        const currentEmail = loginForm.getValues("email");
                        if (currentEmail) {
                          forgotPasswordForm.setValue("email", currentEmail);
                        }
                        setShowForgotPassword(true);
                      }}
                    >
                      Forgot password?
                    </button>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        const currentEmail = loginForm.getValues("email");
                        if (currentEmail) {
                          resendVerificationForm.setValue("email", currentEmail);
                        }
                        setShowResendVerification(true);
                      }}
                    >
                      Resend verification email
                    </button>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loginMutation.isPending}
                    data-testid="button-login"
                  >
                    {loginMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Signing In...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register">
                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        {...registerForm.register("firstName")}
                        data-testid="input-firstName"
                      />
                      {registerForm.formState.errors.firstName && (
                        <p className="text-sm text-destructive mt-1">
                          {registerForm.formState.errors.firstName.message}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        {...registerForm.register("lastName")}
                        data-testid="input-lastName"
                      />
                      {registerForm.formState.errors.lastName && (
                        <p className="text-sm text-destructive mt-1">
                          {registerForm.formState.errors.lastName.message}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      {...registerForm.register("username")}
                      data-testid="input-username"
                    />
                    {registerForm.formState.errors.username && (
                      <p className="text-sm text-destructive mt-1">
                        {registerForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="registerEmail">Email</Label>
                    <Input
                      id="registerEmail"
                      type="email"
                      {...registerForm.register("email")}
                      data-testid="input-register-email"
                    />
                    {registerForm.formState.errors.email && (
                      <p className="text-sm text-destructive mt-1">
                        {registerForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="registerPassword">Password</Label>
                    <Input
                      id="registerPassword"
                      type="password"
                      {...registerForm.register("password")}
                      data-testid="input-register-password"
                    />
                    {registerForm.formState.errors.password && (
                      <p className="text-sm text-destructive mt-1">
                        {registerForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      {...registerForm.register("confirmPassword")}
                      data-testid="input-confirm-password"
                    />
                    {registerForm.formState.errors.confirmPassword && (
                      <p className="text-sm text-destructive mt-1">
                        {registerForm.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>
                  
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={registerMutation.isPending}
                    data-testid="button-register"
                  >
                    {registerMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Creating Account...
                      </>
                    ) : (
                      "Create Account"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={showForgotPassword}
        onOpenChange={(open) => {
          setShowForgotPassword(open);
          if (!open) {
            forgotPasswordForm.reset();
          } else {
            const currentEmail = loginForm.getValues("email");
            if (currentEmail) {
              forgotPasswordForm.setValue("email", currentEmail);
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter the email address associated with your account and we'll send you instructions to set a new password.
            </DialogDescription>
          </DialogHeader>
          <Form {...forgotPasswordForm}>
            <form onSubmit={forgotPasswordForm.handleSubmit(onForgotPasswordSubmit)} className="space-y-4">
              <FormField
                control={forgotPasswordForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForgotPassword(false)}
                  disabled={forgotPasswordMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={forgotPasswordMutation.isPending}>
                  {forgotPasswordMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showResendVerification}
        onOpenChange={(open) => {
          setShowResendVerification(open);
          if (!open) {
            resendVerificationForm.reset();
          } else {
            const currentEmail = loginForm.getValues("email");
            if (currentEmail) {
              resendVerificationForm.setValue("email", currentEmail);
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resend verification email</DialogTitle>
            <DialogDescription>
              We'll send a fresh verification link to confirm your account.
            </DialogDescription>
          </DialogHeader>
          <Form {...resendVerificationForm}>
            <form onSubmit={resendVerificationForm.handleSubmit(onResendVerificationSubmit)} className="space-y-4">
              <FormField
                control={resendVerificationForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowResendVerification(false)}
                  disabled={resendVerificationMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={resendVerificationMutation.isPending}>
                  {resendVerificationMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Sending...
                    </>
                  ) : (
                    "Send verification"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
