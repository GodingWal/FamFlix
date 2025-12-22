import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Seo, { BASE_URL } from "@/components/Seo";

interface VideoDetailsResponse {
  id: string;
  title: string;
  description?: string;
  videoUrl: string;
  thumbnail?: string;
  duration?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  familyId?: string;
}

export default function VideoDetails() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/videos/:id");
  const videoId = params?.id;

  const {
    data: video,
    isLoading,
    error,
  } = useQuery<VideoDetailsResponse>({
    queryKey: ["/api/videos", videoId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/videos/${videoId}`);
      return response.json();
    },
    enabled: Boolean(videoId),
  });

  const formattedDate = useMemo(() => {
    if (!video?.updatedAt) return "";
    return new Date(video.updatedAt).toLocaleString();
  }, [video?.updatedAt]);

  const sharePath = video ? `/videos/${video.id}` : "";
  const canonicalUrl = video ? `${BASE_URL}/videos/${video.id}` : `${BASE_URL}/videos`;

  const videoDurationIso = video?.duration
    ? (() => {
        const minutes = Math.floor(video.duration / 60);
        const seconds = Math.max(video.duration % 60, 0);
        return `PT${minutes}M${seconds}S`;
      })()
    : undefined;

  const videoJsonLd = video
    ? {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: video.title,
        description:
          video.description ||
          "Watch an AI-personalized family story created with FamFlix’s collaborative video studio.",
        uploadDate: video.createdAt,
        dateModified: video.updatedAt,
        ...(video.thumbnail ? { thumbnailUrl: [video.thumbnail] } : {}),
        ...(video.videoUrl ? { contentUrl: video.videoUrl } : {}),
        ...(videoDurationIso ? { duration: videoDurationIso } : {}),
        mainEntityOfPage: canonicalUrl,
        publisher: {
          "@type": "Organization",
          name: "FamFlix",
          url: BASE_URL,
        },
        potentialAction: {
          "@type": "WatchAction",
          target: canonicalUrl,
        },
      }
    : undefined;

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "--:--";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const handleEdit = () => {
    if (!video) return;
    setLocation(`/videos/${video.id}/edit`);
  };

  const handleShare = async () => {
    if (!video) return;

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: video.title,
          text: video.description,
          url: `${window.location.origin}${sharePath}`,
        });
      } else {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(sharePath);
          toast({
            title: "Link copied",
            description: "Video link has been copied to clipboard",
          });
        } else {
          throw new Error("Sharing is not supported on this device");
        }
      }
    } catch (err) {
      toast({
        title: "Share failed",
        description: err instanceof Error ? err.message : "Unable to share video",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <>
        <Seo
          title="Loading video"
          description="View AI-personalized family videos and share them with loved ones on FamFlix."
          canonical={canonicalUrl}
          openGraph={{ url: canonicalUrl, title: "Loading video | FamFlix" }}
        />
        <div className="min-h-screen flex items-center justify-center bg-background">
          <LoadingSpinner size="lg" />
        </div>
      </>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : "Failed to load video";
    return (
      <>
        <Seo
          title="Video unavailable"
          description="We couldn't load this FamFlix video right now. Try returning to your library to explore more AI-crafted stories."
          canonical={canonicalUrl}
          openGraph={{
            url: canonicalUrl,
            title: "Video unavailable | FamFlix",
            description:
              "We couldn't load this FamFlix video right now. Try returning to your library to explore more AI-crafted stories.",
          }}
          twitter={{
            title: "Video unavailable | FamFlix",
            description: message,
          }}
        />
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <p className="text-destructive mb-4">{message}</p>
              <Button onClick={() => setLocation("/videos")}>Back to library</Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (!video) {
    return (
      <>
        <Seo
          title="Video not found"
          description="The FamFlix video you're looking for may have moved or been removed. Head back to your AI-powered library to keep creating."
          canonical={canonicalUrl}
          openGraph={{
            url: canonicalUrl,
            title: "Video not found | FamFlix",
            description:
              "The FamFlix video you're looking for may have moved or been removed. Head back to your AI-powered library to keep creating.",
          }}
        />
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground mb-4">Video not found.</p>
              <Button onClick={() => setLocation("/videos")}>Back to library</Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo
        title={video.title}
        description={
          video.description ||
          "Watch an AI-personalized family story built with FamFlix voice cloning, scripting, and collaborative editing."
        }
        canonical={canonicalUrl}
        openGraph={{
          type: "video.other",
          url: canonicalUrl,
          title: `${video.title} | FamFlix`,
          description:
            video.description ||
            "Watch an AI-personalized family story built with FamFlix voice cloning, scripting, and collaborative editing.",
          ...(video.thumbnail ? { image: video.thumbnail } : {}),
        }}
        twitter={{
          title: `${video.title} | FamFlix`,
          description:
            video.description ||
            "Watch an AI-personalized family story built with FamFlix voice cloning, scripting, and collaborative editing.",
          ...(video.thumbnail ? { image: video.thumbnail } : {}),
        }}
        jsonLd={videoJsonLd}
      />
      <Navigation />

      <main className="pt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold gradient-text mb-2">{video.title}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="capitalize">
                  {video.status}
                </Badge>
                {formattedDate && <span>Updated {formattedDate}</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLocation("/videos")}>Back</Button>
              <Button variant="default" onClick={handleEdit} data-testid="button-edit-video">
                <i className="fas fa-edit mr-2" />
                Edit
              </Button>
              <Button onClick={handleShare} data-testid="button-share-video">
                <i className="fas fa-share mr-2" />
                Share
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                {video.videoUrl ? (
                  <video
                    controls
                    src={video.videoUrl}
                    className="w-full h-full"
                    poster={video.thumbnail}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Video source unavailable
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {video.description && (
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Description
                  </h2>
                  <p className="text-base leading-relaxed whitespace-pre-line">{video.description}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground block">Created</span>
                  <span>{new Date(video.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground block">Last Updated</span>
                  <span>{formattedDate || "--"}</span>
                </div>
                {video.duration && (
                  <div>
                    <span className="font-medium text-foreground block">Duration</span>
                    <span>{formatDuration(video.duration)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
