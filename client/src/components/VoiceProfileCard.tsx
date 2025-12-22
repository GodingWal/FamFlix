import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface VoiceProfileCardProps {
  profile: {
    id: string;
    name: string;
    userId: string;
    trainingProgress: number;
    status: string;
    audioSampleUrl?: string;
    createdAt: string;
    metadata?: any;
  };
  onSelect?: () => void;
  isSelected?: boolean;
}

export function VoiceProfileCard({ profile, onSelect, isSelected }: VoiceProfileCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const deleteProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const response = await apiRequest("DELETE", `/api/voice-profiles/${profileId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Voice profile deleted",
        description: "The voice profile has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/voice-profiles"] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete voice profile",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'bg-primary/20 text-primary';
      case 'training':
        return 'bg-accent/20 text-accent';
      case 'error':
        return 'bg-destructive/20 text-destructive';
      default:
        return 'bg-muted/20 text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return 'fas fa-check';
      case 'training':
        return 'fas fa-spinner fa-spin';
      case 'error':
        return 'fas fa-exclamation';
      default:
        return 'fas fa-clock';
    }
  };

  const handlePlaySample = async () => {
    if (!profile.audioSampleUrl) {
      toast({
        title: "No audio sample",
        description: "This voice profile doesn't have an audio sample available",
        variant: "destructive",
      });
      return;
    }

    try {
      if (isPlaying) {
        // Stop current audio
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setIsPlaying(false);
        }
        return;
      }

      // In development mode, simulate audio playback since files don't exist
      if (import.meta.env.DEV) {
        setIsPlaying(true);
        
        // Simulate audio duration
        setTimeout(() => {
          setIsPlaying(false);
        }, 3000); // 3 second simulated playback
        
        toast({
          title: "Demo Playback",
          description: `Playing ${profile.name}'s voice sample (simulated in development mode)`,
        });
        return;
      }

      // Production audio playback
      if (audioRef.current) {
        audioRef.current.src = profile.audioSampleUrl;
        setIsPlaying(true);
        
        // Set up event handlers before playing
        audioRef.current.onended = () => {
          setIsPlaying(false);
        };
        
        audioRef.current.onerror = (error) => {
          console.error('Audio loading failed:', error);
          setIsPlaying(false);
          toast({
            title: "Audio Unavailable",
            description: "Could not load the voice sample. It may still be processing.",
            variant: "destructive",
          });
        };
        
        audioRef.current.onloadstart = () => {
          // Audio is starting to load
        };
        
        audioRef.current.oncanplay = () => {
          // Audio is ready to play
        };
        
        try {
          await audioRef.current.play();
        } catch (playError) {
          console.error('Audio play failed:', playError);
          setIsPlaying(false);
          toast({
            title: "Playback Error",
            description: "Unable to play audio. Your browser may require user interaction first.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Audio playback error:', error);
      setIsPlaying(false);
      toast({
        title: "Playback Error",
        description: "An unexpected error occurred during audio playback.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${profile.name}" voice profile?`)) {
      deleteProfileMutation.mutate(profile.id);
    }
  };

  const handleSelect = () => {
    if (profile.status === 'ready' && onSelect) {
      onSelect();
    }
  };

  // Calculate estimated time remaining for training
  const getTrainingTimeEstimate = () => {
    if (profile.status !== 'training') return null;
    
    const metadata = profile.metadata as any;
    const estimatedCompletion = metadata?.estimatedCompletionTime;
    const trainingStart = metadata?.trainingStartTime;
    
    if (estimatedCompletion) {
      const remaining = new Date(estimatedCompletion).getTime() - Date.now();
      if (remaining > 0) {
        const minutes = Math.ceil(remaining / 60000);
        return `~${minutes} min remaining`;
      }
    }
    
    // Fallback calculation based on progress
    const progress = profile.trainingProgress || 0;
    if (progress < 100) {
      const estimatedMinutes = Math.ceil((100 - progress) / 100 * 2); // Assume 2 minutes total
      return `~${estimatedMinutes} min remaining`;
    }
    
    return 'Almost ready...';
  };

  return (
    <>
      <audio ref={audioRef} preload="none" />
      <Card 
      className={`transition-all cursor-pointer ${
        isSelected 
          ? 'ring-2 ring-primary bg-primary/5' 
          : 'hover:bg-secondary/30'
      } ${profile.status !== 'ready' ? 'opacity-75' : ''}`}
      onClick={handleSelect}
      data-testid={`voice-profile-${profile.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            {/* Avatar */}
            <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
              <i className="fas fa-user text-primary"></i>
            </div>
            
            {/* Profile Info */}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium truncate" data-testid="profile-name">
                {profile.name}
              </h4>
              <div className="flex items-center space-x-2 mt-1">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(profile.status)}`}>
                  <i className={`${getStatusIcon(profile.status)} mr-1`}></i>
                  {profile.status}
                </span>
                {profile.status === 'training' && (
                  <span className="text-xs text-muted-foreground">
                    {profile.trainingProgress}% • {getTrainingTimeEstimate()}
                  </span>
                )}
              </div>
              
              {/* Training Progress */}
              {profile.status === 'training' && (
                <div className="mt-2">
                  <Progress 
                    value={profile.trainingProgress} 
                    className="h-2"
                    data-testid="training-progress"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Training Voice Clone...</span>
                    <span>{profile.trainingProgress}%</span>
                  </div>
                </div>
              )}
              
              {/* AI Quality Score */}
              {profile.metadata?.qualityScore && (
                <div className="text-xs text-muted-foreground mt-1">
                  Quality: <span className={`font-medium ${
                    profile.metadata.qualityScore >= 8 ? 'text-green-600' :
                    profile.metadata.qualityScore >= 6 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {profile.metadata.qualityScore}/10
                  </span>
                  {profile.metadata.emotionalTone && (
                    <span className="ml-2 capitalize">• {profile.metadata.emotionalTone}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center space-x-2 ml-4">
            {profile.audioSampleUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlaySample();
                }}
                disabled={isPlaying}
                className="text-muted-foreground hover:text-primary"
                data-testid="button-play-sample"
              >
                <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
              </Button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground hover:text-primary"
                  data-testid="button-profile-menu"
                >
                  <i className="fas fa-ellipsis-v"></i>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {profile.audioSampleUrl && (
                  <DropdownMenuItem 
                    onClick={handlePlaySample}
                    data-testid="menu-play-sample"
                  >
                    <i className="fas fa-play mr-2"></i>
                    Play Sample
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                  disabled={deleteProfileMutation.isPending}
                  data-testid="menu-delete-profile"
                >
                  <i className="fas fa-trash mr-2"></i>
                  {deleteProfileMutation.isPending ? "Deleting..." : "Delete Profile"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
