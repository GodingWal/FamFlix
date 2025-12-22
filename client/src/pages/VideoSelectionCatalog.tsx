import { useState, useMemo, useEffect, type ComponentType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { 
  Search, 
  Play, 
  Clock, 
  Sparkles, 
  Filter,
  ChevronRight,
  Video,
  Heart,
  Star
} from "lucide-react";

interface TemplateVideo {
  id: number;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  duration: number;
  category: string;
  tags: string[];
  difficulty: string;
  isActive: boolean;
  metadata?: {
    pipelineStatus?: string;
    sourceVideoId?: string;
  };
}

const categoryIconMap: Record<string, ComponentType<{ className?: string }>> = {
  birthday: Heart,
  birthdays: Heart,
  holiday: Sparkles,
  holidays: Sparkles,
  anniversary: Heart,
  anniversaries: Heart,
  celebration: Star,
  celebrations: Star,
  family: Heart,
};

const difficulties = [
  { value: "all", label: "All Difficulties" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Advanced" },
];

export default function VideoSelectionCatalog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState("all");
  const [hoveredVideo, setHoveredVideo] = useState<number | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<TemplateVideo | null>(null);

  // Fetch template videos
  const { data: videos, isLoading } = useQuery<TemplateVideo[]>({
    queryKey: ["/api/template-videos"],
  });

  const categoryOptions = useMemo(() => {
    const formatLabel = (value: string) =>
      value
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

    const derived = new Map<string, { value: string; label: string; icon: React.ComponentType<{ className?: string }> }>();

    videos?.forEach((video) => {
      if (!video.category) return;
      const value = video.category;
      if (derived.has(value)) return;
      const Icon = categoryIconMap[value.toLowerCase()] ?? Sparkles;
      derived.set(value, {
        value,
        label: formatLabel(value),
        icon: Icon,
      });
    });

    return [
      { value: "all", label: "All Videos", icon: Video },
      ...Array.from(derived.values()).sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [videos]);

  useEffect(() => {
    if (selectedCategory === "all") return;
    if (!categoryOptions.some((category) => category.value === selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [categoryOptions, selectedCategory]);

  // Filter videos based on search and filters
  const filteredVideos = useMemo(() => {
    if (!videos) return [];
    
    return videos.filter((video) => {
      const matchesSearch = 
        video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = selectedCategory === "all" || video.category === selectedCategory;
      const matchesDifficulty = selectedDifficulty === "all" || video.difficulty === selectedDifficulty;
      
      return matchesSearch && matchesCategory && matchesDifficulty && video.isActive;
    });
  }, [videos, searchQuery, selectedCategory, selectedDifficulty]);

  const createProjectMutation = useMutation({
    mutationFn: async (videoId: number) => {
      const response = await apiRequest("POST", "/api/video-projects", {
        templateVideoId: videoId,
        status: "pending",
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Project Created! 🎬",
        description: "Your video project has been created. Let's add your voice!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/video-projects"] });
      // Navigate to voice recording or face upload
      navigate(`/projects/${data.id}/setup`);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Project",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSelectVideo = (video: TemplateVideo) => {
    setSelectedVideo(video);
    if (video.metadata?.pipelineStatus !== "completed") {
      toast({
        title: "Transcript still processing",
        description: "We will transcribe the audio during project processing.",
      });
    }
  };

  const handleCreateProject = () => {
    if (!selectedVideo) return;
    
    if (!user) {
      toast({
        title: "Please Sign In",
        description: "You need to be signed in to create a project",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    createProjectMutation.mutate(selectedVideo.id);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "medium": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "hard": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="pt-16">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-primary/10 via-background to-background border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                Choose Your Video Template
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                Select from our professionally crafted video templates. We'll add your voice to create personalized family memories!
              </p>
              
              {/* Search Bar */}
              <div className="relative max-w-2xl mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search videos by title, description, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 h-12 text-lg"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="border-b bg-background/95 backdrop-blur sticky top-16 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              {/* Category Tabs */}
              <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="flex-1">
                <TabsList className="flex flex-wrap gap-2">
                  {categoryOptions.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <TabsTrigger 
                        key={cat.value} 
                        value={cat.value}
                        className="flex items-center gap-1 text-xs md:text-sm"
                      >
                        <Icon className="h-3 w-3 md:h-4 md:w-4" />
                        <span className="hidden md:inline">{cat.label}</span>
                        <span className="md:hidden">{cat.label.split(' ')[0]}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>

              {/* Difficulty Filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    {difficulties.map((diff) => (
                      <SelectItem key={diff.value} value={diff.value}>
                        {diff.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Results Count */}
            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between w-full">
              <div className="text-sm text-muted-foreground">
                {filteredVideos.length} {filteredVideos.length === 1 ? 'video' : 'videos'} found
              </div>
            </div>
          </div>
        </div>

        {/* Video Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <div className="aspect-video bg-muted animate-pulse" />
                  <CardContent className="p-4 space-y-2">
                    <div className="h-6 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="text-center py-16">
              <Video className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No videos found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredVideos.map((video) => (
                <Card
                  key={video.id}
                  className={`group overflow-hidden cursor-pointer transition-all hover:shadow-xl ${
                    selectedVideo?.id === video.id ? 'ring-2 ring-primary shadow-lg' : ''
                  }`}
                  onMouseEnter={() => setHoveredVideo(video.id)}
                  onMouseLeave={() => setHoveredVideo(null)}
                  onClick={() => handleSelectVideo(video)}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-muted overflow-hidden">
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
                        <Video className="h-16 w-16 text-primary/50" />
                      </div>
                    )}
                    
                    {/* Overlay on hover */}
                    {hoveredVideo === video.id && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity">
                        <div className="text-center space-y-2">
                          <Button size="lg" variant="secondary" className="gap-2">
                            <Play className="h-5 w-5" />
                            Preview
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Duration Badge */}
                    <div className="absolute top-2 right-2 bg-black/75 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(video.duration)}
                    </div>

                    {/* Selected Indicator */}
                    {selectedVideo?.id === video.id && (
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Selected
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg line-clamp-1">{video.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{video.description}</p>
                      
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1">
                        {video.tags.slice(0, 3).map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {video.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{video.tags.length - 3}
                          </Badge>
                        )}
                      </div>

                      {/* Difficulty */}
                      <div className="flex items-center justify-between pt-2">
                        <Badge variant="outline" className={`text-xs ${getDifficultyColor(video.difficulty)}`}>
                          {video.difficulty.charAt(0).toUpperCase() + video.difficulty.slice(1)}
                        </Badge>
                        {selectedVideo?.id === video.id && (
                          <ChevronRight className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Floating Action Button */}
        {selectedVideo && (
          <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t p-4 z-20">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted">
                  {selectedVideo.thumbnailUrl ? (
                    <img src={selectedVideo.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold">{selectedVideo.title}</h4>
                  <p className="text-sm text-muted-foreground">Ready to personalize this video</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedVideo(null)}>
                  Cancel
                </Button>
                <Button 
                  size="lg" 
                  onClick={handleCreateProject}
                  disabled={createProjectMutation.isPending}
                  className="gap-2"
                >
                  {createProjectMutation.isPending ? (
                    <>Creating...</>
                  ) : (
                    <>
                      Continue with this Video
                      <ChevronRight className="h-5 w-5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
