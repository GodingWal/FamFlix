import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { 
  Upload, 
  Mic, 
  User, 
  CheckCircle, 
  Loader2,
  Play,
  ArrowRight,
  AlertTriangle,
  Music
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Feature flags
const FACE_FEATURE_ENABLED = false;

interface VideoProject {
  id: number;
  user_id: number;
  template_video_id: number;
  voice_profile_id?: number;
  face_image_url?: string;
  status: string;
  output_video_url?: string;
  processing_progress: number;
  template_title?: string;
  template_thumbnail?: string;
  template_video_url?: string;
  category?: string;
  difficulty?: string;
}

export default function ProjectSetup() {
  const [, params] = useRoute("/projects/:id/setup");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const projectId = params?.id;

  const [voiceProfileId, setVoiceProfileId] = useState<number | null>(null);
  const [faceImage, setFaceImage] = useState<File | null>(null);
  const [faceImagePreview, setFaceImagePreview] = useState<string | null>(null);
  const [uploadingFace, setUploadingFace] = useState(false);
  const [preserveBackground, setPreserveBackground] = useState(true);

  // Fetch project details
  const { data: project, isLoading: projectLoading } = useQuery<VideoProject>({
    queryKey: [`/api/video-projects/${projectId}`],
    enabled: !!projectId,
  });

  // Fetch user's voice profiles
  const { data: voiceProfiles } = useQuery<any[]>({
    queryKey: ["/api/voice-profiles"],
    enabled: !!user,
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (data: { voiceProfileId?: number; faceImageUrl?: string }) => {
      const response = await apiRequest("PATCH", `/api/video-projects/${projectId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/video-projects/${projectId}`] });
    },
  });

  const startProcessingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/video-projects/${projectId}/process`, {
        preserveBackground,
        backgroundDuckLevel: -12
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Processing Started! 🎬",
        description: "Your personalized video is being created. This may take a few minutes.",
      });
      navigate("/videos");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Start Processing",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleVoiceProfileSelect = async (profileId: number) => {
    setVoiceProfileId(profileId);
    await updateProjectMutation.mutateAsync({ voiceProfileId: profileId });
    toast({
      title: "Voice Profile Selected",
      description: "Your voice will be applied to the video.",
    });
  };

  const handleFaceImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setFaceImage(file);
    setFaceImagePreview(URL.createObjectURL(file));

    // Upload to server
    setUploadingFace(true);
    try {
      const formData = new FormData();
      formData.append("face", file);

      const response = await fetch(`/api/video-projects/${projectId}/upload-face`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload face image");
      }

      const data = await response.json();
      await updateProjectMutation.mutateAsync({ faceImageUrl: data.faceImageUrl });
      
      toast({
        title: "Face Photo Uploaded",
        description: "Your face will be applied to the video.",
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploadingFace(false);
    }
  };

  // Processing now only requires a voice profile
  const canStartProcessing = Boolean(project?.voice_profile_id);

  const setupProgress = (() => {
    // 0% until voice is selected, then 100%
    return project?.voice_profile_id ? 100 : 0;
  })();

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="pt-16 max-w-2xl mx-auto px-4 py-16 text-center">
          <AlertTriangle className="h-16 w-16 mx-auto text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">Project Not Found</h1>
          <p className="text-muted-foreground mb-4">This project doesn't exist or you don't have access to it.</p>
          <Button onClick={() => navigate("/create")}>Back to Video Selection</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Personalize Your Video</h1>
            <p className="text-muted-foreground">Add your voice to create your personalized video</p>
            
            {/* Progress */}
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Setup Progress</span>
                <span className="font-medium">{setupProgress}%</span>
              </div>
              <Progress value={setupProgress} className="h-2" />
            </div>
          </div>

          {/* Template Video Preview */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Selected Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="w-32 h-20 rounded-lg overflow-hidden bg-muted">
                  {project.template_thumbnail ? (
                    <img src={project.template_thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">{project.template_title}</h3>
                  <Badge variant="secondary">{project.category}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className={FACE_FEATURE_ENABLED ? "grid grid-cols-1 md:grid-cols-2 gap-6 mb-8" : "grid grid-cols-1 gap-6 mb-8"}>
            {/* Voice Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="h-5 w-5" />
                  Step 1: Select Voice
                  {project.voice_profile_id && (
                    <CheckCircle className="h-5 w-5 text-green-500 ml-auto" />
                  )}
                </CardTitle>
                <CardDescription>Choose which voice to use in the video</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {voiceProfiles && voiceProfiles.length > 0 ? (
                  voiceProfiles.map((profile: any) => (
                    <Card
                      key={profile.id}
                      className={`cursor-pointer transition-all ${
                        voiceProfileId === profile.id || project.voice_profile_id === profile.id
                          ? "ring-2 ring-primary bg-primary/5"
                          : "hover:bg-secondary/20"
                      }`}
                      onClick={() => handleVoiceProfileSelect(profile.id)}
                    >
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{profile.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {profile.recordings_count || 0} recordings
                          </p>
                        </div>
                        {(voiceProfileId === profile.id || project.voice_profile_id === profile.id) && (
                          <CheckCircle className="h-5 w-5 text-primary" />
                        )}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Alert>
                    <AlertDescription>
                      No voice profiles found. <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/voice-cloning")}>Create one now</Button>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Face Upload (disabled) */}
            {FACE_FEATURE_ENABLED && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Step 2: Upload Face Photo
                    {project.face_image_url && (
                      <CheckCircle className="h-5 w-5 text-green-500 ml-auto" />
                    )}
                  </CardTitle>
                  <CardDescription>Upload a clear photo of your face</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <input
                        type="file"
                        id="faceImage"
                        accept="image/*"
                        onChange={handleFaceImageChange}
                        className="hidden"
                        disabled={uploadingFace}
                      />
                      <label htmlFor="faceImage" className="cursor-pointer">
                        {faceImagePreview || project.face_image_url ? (
                          <div className="space-y-2">
                            <img
                              src={faceImagePreview || project.face_image_url}
                              alt="Face preview"
                              className="w-32 h-32 mx-auto rounded-full object-cover"
                            />
                            <p className="text-sm text-muted-foreground">Click to change</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground mb-1">
                              {uploadingFace ? "Uploading..." : "Click to upload face photo"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              JPG, PNG (Max 5MB)
                            </p>
                          </>
                        )}
                      </label>
                    </div>

                    <Alert>
                      <AlertDescription className="text-xs">
                        💡 <strong>Tip:</strong> Use a front-facing photo with good lighting for best results
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Audio Options */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                Audio Options
              </CardTitle>
              <CardDescription>Configure how the audio is processed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="preserve-background" className="text-base">
                    Preserve Background Audio
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Keep background music and sounds, only replace the voice
                  </p>
                </div>
                <Switch
                  id="preserve-background"
                  checked={preserveBackground}
                  onCheckedChange={setPreserveBackground}
                />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => navigate("/create")}>
              Back to Selection
            </Button>
            <Button
              size="lg"
              onClick={() => startProcessingMutation.mutate()}
              disabled={!canStartProcessing || startProcessingMutation.isPending}
              className="gap-2"
            >
              {startProcessingMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  Create My Video
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
