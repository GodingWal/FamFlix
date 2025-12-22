import type { useToast } from "@/hooks/use-toast";

interface ShareVideoOptions {
  title: string;
  description?: string;
  sharePath: string;
  toast: ReturnType<typeof useToast>["toast"];
}

export async function shareVideo({ title, description, sharePath, toast }: ShareVideoOptions) {
  const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${sharePath}` : sharePath;

  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title,
        text: description,
        url: fullUrl,
      });
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(sharePath);
      toast({
        title: "Link copied",
        description: "Video link has been copied to clipboard",
      });
      return;
    }

    throw new Error("Sharing is not supported on this device");
  } catch (error) {
    toast({
      title: "Share failed",
      description: error instanceof Error ? error.message : "Unable to share video",
      variant: "destructive",
    });
  }
}
