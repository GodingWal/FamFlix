import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Profile form state
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Fetch user stats
  const { data: userStats, isLoading } = useQuery({
    queryKey: ["/api/user/stats"],
    enabled: !!user,
  });

  const handleSaveProfile = () => {
    // In a real app, this would update the user profile
    toast({
      title: "Profile updated",
      description: "Your profile has been saved successfully.",
    });
    setIsEditing(false);
  };

  const handleAvatarUpload = () => {
    // In a real app, this would handle avatar upload
    toast({
      title: "Avatar upload",
      description: "Avatar upload feature coming soon!",
    });
  };

  const getUserInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      
      <main className="pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold gradient-text mb-2">My Profile</h1>
            <p className="text-muted-foreground">Manage your personal information and preferences</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Profile Overview */}
            <div className="lg:col-span-1">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="relative">
                      <Avatar className="w-24 h-24">
                        <AvatarImage src={user?.avatar} alt={user?.firstName} />
                        <AvatarFallback className="text-lg">
                          {getUserInitials(user?.firstName, user?.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <Button
                        size="sm"
                        variant="outline"
                        className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
                        onClick={handleAvatarUpload}
                        data-testid="button-upload-avatar"
                      >
                        <i className="fas fa-camera text-xs"></i>
                      </Button>
                    </div>
                    
                    <div>
                      <h3 className="text-xl font-semibold">{user?.firstName} {user?.lastName}</h3>
                      <p className="text-muted-foreground">@{user?.username}</p>
                      <Badge variant="secondary" className="mt-2">
                        {user?.role === 'admin' ? 'Administrator' : 'Member'}
                      </Badge>
                    </div>
                    
                    {bio && (
                      <p className="text-sm text-center text-muted-foreground">{bio}</p>
                    )}
                    
                    <div className="w-full space-y-2 text-sm">
                      {location && (
                        <div className="flex items-center justify-center">
                          <i className="fas fa-map-marker-alt mr-2 text-muted-foreground"></i>
                          <span>{location}</span>
                        </div>
                      )}
                      {website && (
                        <div className="flex items-center justify-center">
                          <i className="fas fa-link mr-2 text-muted-foreground"></i>
                          <a href={website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            Website
                          </a>
                        </div>
                      )}
                      <div className="flex items-center justify-center">
                        <i className="fas fa-calendar mr-2 text-muted-foreground"></i>
                        <span>Member since 2024</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* User Stats */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg">Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      <div className="h-4 bg-secondary rounded animate-pulse"></div>
                      <div className="h-4 bg-secondary rounded animate-pulse"></div>
                      <div className="h-4 bg-secondary rounded animate-pulse"></div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Videos Created</span>
                        <span className="font-medium">0</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Voice Profiles</span>
                        <span className="font-medium">0</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Family Groups</span>
                        <span className="font-medium">0</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Collaborations</span>
                        <span className="font-medium">0</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Profile Details */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Profile Information</CardTitle>
                      <CardDescription>Update your personal details</CardDescription>
                    </div>
                    <Button
                      variant={isEditing ? "default" : "outline"}
                      onClick={() => setIsEditing(!isEditing)}
                      data-testid="button-edit-profile"
                    >
                      <i className={`fas ${isEditing ? 'fa-check' : 'fa-edit'} mr-2`}></i>
                      {isEditing ? 'Save' : 'Edit'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={!isEditing}
                        data-testid="input-first-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={!isEditing}
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={!isEditing}
                      data-testid="input-username"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={!isEditing}
                      data-testid="input-email"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      placeholder="Tell us about yourself..."
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      disabled={!isEditing}
                      rows={3}
                      data-testid="textarea-bio"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        placeholder="City, Country"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        disabled={!isEditing}
                        data-testid="input-location"
                      />
                    </div>
                    <div>
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        type="url"
                        placeholder="https://yourwebsite.com"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        disabled={!isEditing}
                        data-testid="input-website"
                      />
                    </div>
                  </div>
                  
                  {isEditing && (
                    <div className="flex justify-end space-x-4 pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => setIsEditing(false)}
                        data-testid="button-cancel-edit"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveProfile}
                        data-testid="button-save-profile"
                      >
                        <i className="fas fa-save mr-2"></i>
                        Save Changes
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Your latest actions on FamFlix</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <i className="fas fa-video text-primary text-xs"></i>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Created "Family Vacation 2024"</p>
                        <p className="text-xs text-muted-foreground">2 hours ago</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <i className="fas fa-microphone text-primary text-xs"></i>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Added voice profile "Dad's Voice"</p>
                        <p className="text-xs text-muted-foreground">1 day ago</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <i className="fas fa-users text-primary text-xs"></i>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Joined "Smith Family" group</p>
                        <p className="text-xs text-muted-foreground">3 days ago</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}