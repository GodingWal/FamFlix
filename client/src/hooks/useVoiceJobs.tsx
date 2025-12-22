import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import type { VoiceJob } from '@/components/VoiceCloning/JobStatusMonitor';

interface CreateVoiceJobData {
  name: string;
  familyId?: string;
  recordings: {
    id: string;
    blob: Blob;
    duration: number;
    quality: {
      score: number;
      issues: string[];
      recommendations: string[];
    };
  }[];
}

export const useVoiceJobs = () => {
  const queryClient = useQueryClient();
  const [pollingEnabled, setPollingEnabled] = useState(false);

  // Fetch voice jobs
  const {
    data: jobs = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['voice-jobs'],
    queryFn: async (): Promise<VoiceJob[]> => {
      const response = await apiRequest('GET', '/api/voice-jobs');
      const data = await response.json();
      return data.map((job: any) => ({
        ...job,
        startTime: new Date(job.startTime),
        completedTime: job.completedTime ? new Date(job.completedTime) : undefined,
      }));
    },
    refetchInterval: pollingEnabled ? 3000 : false, // Poll every 3 seconds when enabled
    refetchIntervalInBackground: false,
  });

  // Enable/disable polling based on active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(job => 
      job.status === 'pending' || job.status === 'processing'
    );
    setPollingEnabled(hasActiveJobs);
  }, [jobs]);

  // Create voice job mutation
  const createJobMutation = useMutation({
    mutationFn: async (data: CreateVoiceJobData): Promise<VoiceJob> => {
      console.log('Creating voice job with data:', {
        name: data.name,
        familyId: data.familyId,
        recordingCount: data.recordings.length,
        recordings: data.recordings.map(r => ({
          id: r.id,
          duration: r.duration,
          blobSize: r.blob.size,
          quality: r.quality
        }))
      });

      const formData = new FormData();
      
      // Add metadata
      formData.append('name', data.name);
      if (data.familyId) {
        formData.append('familyId', data.familyId);
      }
      
      // Add recordings with the correct field name for multer
      data.recordings.forEach((recording, index) => {
        console.log(`Adding recording ${index}:`, {
          id: recording.id,
          duration: recording.duration,
          blobSize: recording.blob.size,
          blobType: recording.blob.type
        });
        
        formData.append('recordings', recording.blob, `recording-${index}.webm`);
        formData.append(`recordingMetadata[${index}]`, JSON.stringify({
          id: recording.id,
          duration: recording.duration,
          quality: recording.quality,
        }));
      });

      console.log('FormData entries:');
      for (const [key, value] of formData.entries()) {
        console.log(`${key}:`, value);
      }

      const response = await apiRequest('POST', '/api/voice-jobs', formData);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Voice job creation failed:', errorData);
        throw new Error(errorData.error || 'Failed to create voice job');
      }
      
      const result = await response.json();
      
      return {
        ...result,
        startTime: new Date(result.startTime),
        completedTime: result.completedTime ? new Date(result.completedTime) : undefined,
      };
    },
    onSuccess: (newJob) => {
      queryClient.setQueryData(['voice-jobs'], (old: VoiceJob[] = []) => [newJob, ...old]);
      toast({
        title: "Voice Job Created",
        description: `Started processing "${newJob.name}"`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Voice Job",
        description: error.message || "An error occurred while creating the voice job",
        variant: "destructive",
      });
    },
  });

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest('POST', `/api/voice-jobs/${jobId}/cancel`);
      return response.json();
    },
    onSuccess: (_, jobId) => {
      queryClient.setQueryData(['voice-jobs'], (old: VoiceJob[] = []) =>
        old.map(job => 
          job.id === jobId 
            ? { ...job, status: 'failed' as const, error: 'Cancelled by user' }
            : job
        )
      );
      toast({
        title: "Job Cancelled",
        description: "Voice processing job has been cancelled",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Cancel Job",
        description: error.message || "Could not cancel the voice job",
        variant: "destructive",
      });
    },
  });

  // Retry job mutation
  const retryJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest('POST', `/api/voice-jobs/${jobId}/retry`);
      return response.json();
    },
    onSuccess: (updatedJob) => {
      queryClient.setQueryData(['voice-jobs'], (old: VoiceJob[] = []) =>
        old.map(job => 
          job.id === updatedJob.id 
            ? {
                ...updatedJob,
                startTime: new Date(updatedJob.startTime),
                completedTime: updatedJob.completedTime ? new Date(updatedJob.completedTime) : undefined,
              }
            : job
        )
      );
      toast({
        title: "Job Retried",
        description: "Voice processing job has been restarted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Retry Job",
        description: error.message || "Could not retry the voice job",
        variant: "destructive",
      });
    },
  });

  // Get job details
  const getJobDetails = useCallback(async (jobId: string) => {
    try {
      const response = await apiRequest('GET', `/api/voice-jobs/${jobId}`);
      return response.json();
    } catch (error: any) {
      toast({
        title: "Failed to Get Job Details",
        description: error.message || "Could not fetch job details",
        variant: "destructive",
      });
      throw error;
    }
  }, []);

  // Play sample audio
  const playSample = useCallback(async (sampleUrl: string) => {
    try {
      const audio = new Audio(sampleUrl);
      await audio.play();
      
      toast({
        title: "Playing Sample",
        description: "Voice sample is now playing",
      });
    } catch (error: any) {
      toast({
        title: "Playback Failed",
        description: "Could not play the voice sample",
        variant: "destructive",
      });
    }
  }, []);

  // Get jobs by status
  const getJobsByStatus = useCallback((status: VoiceJob['status']) => {
    return jobs.filter(job => job.status === status);
  }, [jobs]);

  // Get active jobs (pending or processing)
  const getActiveJobs = useCallback(() => {
    return jobs.filter(job => job.status === 'pending' || job.status === 'processing');
  }, [jobs]);

  // Get completed jobs
  const getCompletedJobs = useCallback(() => {
    return jobs.filter(job => job.status === 'completed');
  }, [jobs]);

  // Get failed jobs
  const getFailedJobs = useCallback(() => {
    return jobs.filter(job => job.status === 'failed');
  }, [jobs]);

  return {
    // Data
    jobs,
    isLoading,
    error,
    
    // Mutations
    createJob: createJobMutation.mutate,
    isCreatingJob: createJobMutation.isPending,
    
    cancelJob: cancelJobMutation.mutate,
    isCancellingJob: cancelJobMutation.isPending,
    
    retryJob: retryJobMutation.mutate,
    isRetryingJob: retryJobMutation.isPending,
    
    // Actions
    refetch,
    getJobDetails,
    playSample,
    
    // Filters
    getJobsByStatus,
    getActiveJobs,
    getCompletedJobs,
    getFailedJobs,
    
    // Status
    hasActiveJobs: getActiveJobs().length > 0,
    totalJobs: jobs.length,
  };
};
