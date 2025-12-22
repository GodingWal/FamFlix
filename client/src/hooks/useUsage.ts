import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { apiRequest } from "@/lib/queryClient";

export interface UsageStatus {
  plan: string;
  videosCreated: number;
  storiesCreated: number;
  voiceClones: number;
  limits: {
    videosPerMonth: number;
    storiesPerMonth: number;
    voiceClones: number;
    showAds: boolean;
  };
  remaining: {
    videos: number | 'unlimited';
    stories: number | 'unlimited';
    voiceClones: number;
  };
  canCreate: {
    video: boolean;
    story: boolean;
    voiceClone: boolean;
  };
}

export function useUsage() {
  const { isAuthenticated } = useAuth();

  const query = useQuery<UsageStatus>({
    queryKey: ["usage"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/usage");
      return response.json();
    },
    enabled: isAuthenticated,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  return {
    usage: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    showAds: query.data?.limits?.showAds ?? false,
    canCreateVideo: query.data?.canCreate?.video ?? true,
    canCreateStory: query.data?.canCreate?.story ?? true,
    canCreateVoiceClone: query.data?.canCreate?.voiceClone ?? true,
  };
}
