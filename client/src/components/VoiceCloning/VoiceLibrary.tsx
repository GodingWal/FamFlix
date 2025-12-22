import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Play,
  Pause,
  Edit,
  Trash2,
  Search,
  Star,
  StarOff,
  Share,
  Copy,
  MoreVertical,
  Volume2,
  User,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

interface VoiceProfile {
  id: string;
  name: string;
  status: 'training' | 'ready' | 'error';
  qualityScore: number;
  createdAt: string;
  updatedAt: string;
  familyId?: string;
  familyName?: string;
  audioSampleUrl?: string;
  modelId?: string;
  metadata?: {
    duration?: number;
    recordingCount?: number;
    lastUsed?: string;
    usageCount?: number;
  };
  isFavorite?: boolean;
}

interface Family {
  id: string;
  name: string;
}

interface VoiceLibraryProps {
  onSelectVoice?: (voice: VoiceProfile) => void;
  onPreviewVoice?: (voice: VoiceProfile) => void;
  previewingVoiceId?: string | null;
  selectionMode?: boolean;
  selectedVoices?: string[];
}

export const VoiceLibrary: React.FC<VoiceLibraryProps> = ({
  onSelectVoice,
  onPreviewVoice,
  previewingVoiceId = null,
  selectionMode = false,
  selectedVoices = []
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const queryClient = useQueryClient();

  // Fetch voice profiles
  const { data: voices = [], isLoading, error, refetch } = useQuery({
    queryKey: ['voice-profiles', searchQuery, statusFilter, familyFilter, sortBy],
    queryFn: async (): Promise<VoiceProfile[]> => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (familyFilter !== 'all') params.append('familyId', familyFilter);
      params.append('sortBy', sortBy);
      
      const response = await apiRequest('GET', `/api/voice-profiles?${params}`);
      return response.json();
    },
  });

  // Fetch families for filtering
  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: async (): Promise<Family[]> => {
      const response = await apiRequest('GET', '/api/families');
      return response.json();
    },
  });

  // Delete voice profile mutation
  const deleteVoiceMutation = useMutation({
    mutationFn: async (voiceId: string) => {
      await apiRequest('DELETE', `/api/voice-profiles/${voiceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
      toast({
        title: "Voice Deleted",
        description: "Voice profile has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Could not delete voice profile",
        variant: "destructive",
      });
    },
  });

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ voiceId, isFavorite }: { voiceId: string; isFavorite: boolean }) => {
      await apiRequest('PATCH', `/api/voice-profiles/${voiceId}`, { isFavorite });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Could not update voice profile",
        variant: "destructive",
      });
    },
  });

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const handlePlay = async (voice: VoiceProfile) => {
    if (!voice.audioSampleUrl) {
      toast({
        title: "No Sample Available",
        description: "This voice profile doesn't have an audio sample",
        variant: "destructive",
      });
      return;
    }

    try {
      if (playingVoice === voice.id) {
        // Stop playing
        stopAudio();
        setPlayingVoice(null);
      } else {
        // Start playing
        stopAudio();
        setPlayingVoice(voice.id);
        const audio = new Audio(voice.audioSampleUrl);
        audioRef.current = audio;

        audio.onended = () => {
          stopAudio();
          setPlayingVoice(null);
        };

        audio.onerror = () => {
          stopAudio();
          setPlayingVoice(null);
          toast({
            title: "Playback Failed",
            description: "Could not play the voice sample",
            variant: "destructive",
          });
        };

        await audio.play();
      }
    } catch (error) {
      stopAudio();
      setPlayingVoice(null);
      toast({
        title: "Playback Failed",
        description: "Could not play the voice sample",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const currentAudio = audioRef.current;

    return () => {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;

        if (audioRef.current === currentAudio) {
          audioRef.current = null;
        }
      }
    };
  }, [playingVoice]);

  const handleCopyVoiceId = (voice: VoiceProfile) => {
    if (voice.modelId) {
      navigator.clipboard.writeText(voice.modelId);
      toast({
        title: "Copied!",
        description: "Voice ID copied to clipboard",
      });
    }
  };

  const handleDelete = (voice: VoiceProfile) => {
    if (window.confirm(`Are you sure you want to delete "${voice.name}"? This action cannot be undone.`)) {
      deleteVoiceMutation.mutate(voice.id);
    }
  };

  const handleToggleFavorite = (voice: VoiceProfile) => {
    toggleFavoriteMutation.mutate({
      voiceId: voice.id,
      isFavorite: !voice.isFavorite
    });
  };

  const getStatusBadgeVariant = (status: VoiceProfile['status']) => {
    switch (status) {
      case 'ready': return 'default';
      case 'training': return 'secondary';
      case 'error': return 'destructive';
      default: return 'secondary';
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredVoices = voices.filter(voice => {
    const matchesSearch = searchQuery === '' || 
      voice.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voice.familyName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load voice profiles. Please try again.
          <Button onClick={() => refetch()} variant="outline" size="sm" className="ml-2">
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search voice profiles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="training">Training</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={familyFilter} onValueChange={setFamilyFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Family" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Families</SelectItem>
              {families.map(family => (
                <SelectItem key={family.id} value={family.id}>
                  {family.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="quality">Quality</SelectItem>
              <SelectItem value="family">Family</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Voice Profiles Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded"></div>
                  <div className="h-3 bg-muted rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredVoices.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Volume2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Voice Profiles Found</h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== 'all' || familyFilter !== 'all'
                  ? "Try adjusting your search or filters"
                  : "Create your first voice profile to get started"
                }
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVoices.map((voice) => (
            <Card 
              key={voice.id} 
              className={cn(
                "overflow-hidden transition-all hover:shadow-md",
                selectionMode && selectedVoices.includes(voice.id) && "ring-2 ring-primary",
                selectionMode && "cursor-pointer"
              )}
              onClick={selectionMode ? () => onSelectVoice?.(voice) : undefined}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate flex items-center gap-2">
                      {voice.name}
                      {voice.isFavorite && (
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                      )}
                    </CardTitle>
                    {voice.familyName && (
                      <p className="text-sm text-muted-foreground truncate">
                        {voice.familyName}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Badge variant={getStatusBadgeVariant(voice.status)}>
                      {voice.status}
                    </Badge>
                    
                    {!selectionMode && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleToggleFavorite(voice)}>
                            {voice.isFavorite ? (
                              <>
                                <StarOff className="h-4 w-4 mr-2" />
                                Remove from Favorites
                              </>
                            ) : (
                              <>
                                <Star className="h-4 w-4 mr-2" />
                                Add to Favorites
                              </>
                            )}
                          </DropdownMenuItem>
                          {voice.modelId && (
                            <DropdownMenuItem onClick={() => handleCopyVoiceId(voice)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Voice ID
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>
                            <Share className="h-4 w-4 mr-2" />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDelete(voice)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Quality:</span>
                    <span className={cn("ml-1 font-medium", getQualityColor(voice.qualityScore))}>
                      {voice.qualityScore}/100
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <span className="ml-1">
                      {new Date(voice.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {voice.metadata && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {voice.metadata.recordingCount && (
                      <div>
                        <span className="text-muted-foreground">Recordings:</span>
                        <span className="ml-1">{voice.metadata.recordingCount}</span>
                      </div>
                    )}
                    {voice.metadata.duration && (
                      <div>
                        <span className="text-muted-foreground">Duration:</span>
                        <span className="ml-1">{Math.round(voice.metadata.duration)}s</span>
                      </div>
                    )}
                  </div>
                )}

                {!selectionMode && voice.status === 'ready' && (
                  <div className="flex gap-2">
                    {voice.audioSampleUrl && (
                      <Button
                        onClick={() => handlePlay(voice)}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={playingVoice === voice.id}
                      >
                        {playingVoice === voice.id ? (
                          <Pause className="h-4 w-4 mr-2" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        {playingVoice === voice.id ? 'Playing' : 'Play Sample'}
                      </Button>
                    )}

                    <Button
                      onClick={() => (onPreviewVoice ? onPreviewVoice(voice) : onSelectVoice?.(voice))}
                      size="sm"
                      className="flex-1"
                      variant="secondary"
                      disabled={previewingVoiceId === voice.id}
                    >
                      {previewingVoiceId === voice.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {previewingVoiceId === voice.id ? 'Preparing...' : 'Preview Story'}
                    </Button>

                    <Button
                      onClick={() => onSelectVoice?.(voice)}
                      size="sm"
                      className="flex-1"
                    >
                      <User className="h-4 w-4 mr-2" />
                      Use Voice
                    </Button>
                  </div>
                )}

                {selectionMode && selectedVoices.includes(voice.id) && (
                  <div className="text-center text-sm text-primary font-medium">
                    Selected
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
