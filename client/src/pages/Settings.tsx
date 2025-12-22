import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [familyUpdates, setFamilyUpdates] = useState(true);
  const [videoSharing, setVideoSharing] = useState(true);
  
  // Privacy settings
  const [profileVisibility, setProfileVisibility] = useState("friends");
  const [dataSharing, setDataSharing] = useState(false);
  
  // Account settings
  const [autoSave, setAutoSave] = useState(true);
  const [videoQuality, setVideoQuality] = useState("high");

  const handleSaveSettings = () => {
    // In a real app, this would send settings to the server
    toast({
      title: "Settings saved",
      description: "Your preferences have been updated successfully.",
    });
  };

  const handleExportData = () => {
    toast({
      title: "Data export requested",
      description: "Your data export will be ready for download within 24 hours.",
    });
  };

  const handleDeleteAccount = () => {
    toast({
      title: "Account deletion",
      description: "Please contact support to delete your account.",
      variant: "destructive",
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      
      <main className="pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold gradient-text mb-2">Settings</h1>
            <p className="text-muted-foreground">Manage your account preferences and privacy settings</p>
          </div>

          <div className="space-y-8">
            {/* Notification Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-bell mr-2 text-primary"></i>
                  Notifications
                </CardTitle>
                <CardDescription>Control how you receive notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-notifications">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive updates via email</p>
                  </div>
                  <Switch
                    id="email-notifications"
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                    data-testid="switch-email-notifications"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="push-notifications">Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive browser notifications</p>
                  </div>
                  <Switch
                    id="push-notifications"
                    checked={pushNotifications}
                    onCheckedChange={setPushNotifications}
                    data-testid="switch-push-notifications"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="family-updates">Family Updates</Label>
                    <p className="text-sm text-muted-foreground">Get notified about family activity</p>
                  </div>
                  <Switch
                    id="family-updates"
                    checked={familyUpdates}
                    onCheckedChange={setFamilyUpdates}
                    data-testid="switch-family-updates"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="video-sharing">Video Sharing</Label>
                    <p className="text-sm text-muted-foreground">Notifications when videos are shared</p>
                  </div>
                  <Switch
                    id="video-sharing"
                    checked={videoSharing}
                    onCheckedChange={setVideoSharing}
                    data-testid="switch-video-sharing"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Privacy Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-shield-alt mr-2 text-primary"></i>
                  Privacy & Security
                </CardTitle>
                <CardDescription>Control your privacy and data sharing preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="profile-visibility">Profile Visibility</Label>
                  <select
                    id="profile-visibility"
                    value={profileVisibility}
                    onChange={(e) => setProfileVisibility(e.target.value)}
                    className="w-full p-2 border rounded-lg bg-background"
                    data-testid="select-profile-visibility"
                  >
                    <option value="public">Public</option>
                    <option value="friends">Friends Only</option>
                    <option value="family">Family Only</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="data-sharing">Analytics Data Sharing</Label>
                    <p className="text-sm text-muted-foreground">Help improve our service by sharing usage data</p>
                  </div>
                  <Switch
                    id="data-sharing"
                    checked={dataSharing}
                    onCheckedChange={setDataSharing}
                    data-testid="switch-data-sharing"
                  />
                </div>
              </CardContent>
            </Card>

            {/* App Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-cog mr-2 text-primary"></i>
                  App Preferences
                </CardTitle>
                <CardDescription>Customize your app experience</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-save">Auto-save Videos</Label>
                    <p className="text-sm text-muted-foreground">Automatically save work in progress</p>
                  </div>
                  <Switch
                    id="auto-save"
                    checked={autoSave}
                    onCheckedChange={setAutoSave}
                    data-testid="switch-auto-save"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="video-quality">Default Video Quality</Label>
                  <select
                    id="video-quality"
                    value={videoQuality}
                    onChange={(e) => setVideoQuality(e.target.value)}
                    className="w-full p-2 border rounded-lg bg-background"
                    data-testid="select-video-quality"
                  >
                    <option value="low">Low (480p)</option>
                    <option value="medium">Medium (720p)</option>
                    <option value="high">High (1080p)</option>
                    <option value="ultra">Ultra (4K)</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Account Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-user-cog mr-2 text-primary"></i>
                  Account Management
                </CardTitle>
                <CardDescription>Manage your account data and preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    onClick={handleExportData}
                    className="flex items-center justify-center"
                    data-testid="button-export-data"
                  >
                    <i className="fas fa-download mr-2"></i>
                    Export My Data
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => toast({ title: "Coming Soon", description: "Theme customization will be available soon." })}
                    className="flex items-center justify-center"
                    data-testid="button-change-theme"
                  >
                    <i className="fas fa-palette mr-2"></i>
                    Change Theme
                  </Button>
                </div>
                
                <Separator />
                
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <h4 className="font-medium text-destructive mb-2">Danger Zone</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Once you delete your account, there is no going back. Please be certain.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    className="flex items-center"
                    data-testid="button-delete-account"
                  >
                    <i className="fas fa-trash-alt mr-2"></i>
                    Delete Account
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleSaveSettings}
                className="px-8"
                data-testid="button-save-settings"
              >
                <i className="fas fa-save mr-2"></i>
                Save All Settings
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}