import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigation } from '@/components/Navigation';
import { VoiceRecordingWizard } from '@/components/VoiceCloning/VoiceRecordingWizard';
import { JobStatusMonitor } from '@/components/VoiceCloning/JobStatusMonitor';
import { VoiceLibrary } from '@/components/VoiceCloning/VoiceLibrary';
import { VoiceTestFeature } from '@/components/VoiceCloning/VoiceTestFeature';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Mic,
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap,
  Loader2,
  Volume2,
  BookOpen,
  StopCircle,
  Sparkles
} from 'lucide-react';
import { useVoiceJobs } from '@/hooks/useVoiceJobs';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface VoiceProfile {
  id: string;
  name: string;
  status: string;
  qualityScore: number;
  createdAt: string;
  familyId?: string;
  audioSampleUrl?: string;
  metadata?: Record<string, any> | null;
}

interface Family {
  id: string;
  name: string;
}

export default function VoiceCloningEnhanced() {
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const {
    jobs,
    createJob,
    isCreatingJob,
    cancelJob,
    retryJob,
    refetch: refetchJobs,
    getActiveJobs,
    getCompletedJobs,
    getFailedJobs,
    hasActiveJobs,
    playSample,
  } = useVoiceJobs();

  // Fetch existing voice profiles
  const { data: voiceProfiles = [] } = useQuery({
    queryKey: ['voice-profiles'],
    queryFn: async (): Promise<VoiceProfile[]> => {
      const response = await apiRequest('GET', '/api/voice-profiles');
      return response.json();
    },
  });

  // Fetch families for selection
  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: async (): Promise<Family[]> => {
      const response = await apiRequest('GET', '/api/families');
      return response.json();
    },
  });

  // Local audio ref for preview playback and state management
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const [previewVoice, setPreviewVoice] = useState<VoiceProfile | null>(null);
  const [previewStory, setPreviewStory] = useState<string | null>(null);
  const [previewAudioPath, setPreviewAudioPath] = useState<string | null>(null);
  const [previewAudioRequiresAuth, setPreviewAudioRequiresAuth] = useState(false);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [selectedVoiceForTest, setSelectedVoiceForTest] = useState<VoiceProfile | null>(null);

  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      try {
        previewAudioRef.current.pause();
      } catch (error) {
        // ignore pause errors
      }
      previewAudioRef.current.src = '';
      previewAudioRef.current = null;
    }
    setIsPreviewPlaying(false);
  };

  const playAudioSrc = async (audioUrl: string, { requiresAuth = false }: { requiresAuth?: boolean } = {}) => {
    stopPreviewAudio();

    let revokeUrl: string | null = null;
    try {
      let audioElement: HTMLAudioElement;

      // Treat relative URLs as API endpoints that may need auth (prevents the browser
      // from fetching the React index.html and failing with "no supported source").
      const isRelative = !/^https?:\/\//i.test(audioUrl);
      const shouldAuthFetch = requiresAuth || isRelative;
      const resolvedUrl = isRelative ? `${window.location.origin}${audioUrl}` : audioUrl;

      if (shouldAuthFetch) {
        const token = localStorage.getItem('token');
        const res = await fetch(resolvedUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Failed to load audio (${res.status})`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        revokeUrl = url;
        audioElement = new Audio(url);
      } else {
        audioElement = new Audio(resolvedUrl);
      }

      previewAudioRef.current = audioElement;
      audioElement.onended = () => {
        if (revokeUrl) URL.revokeObjectURL(revokeUrl);
        stopPreviewAudio();
      };
      audioElement.onpause = () => {
        if (audioElement.currentTime < audioElement.duration) {
          setIsPreviewPlaying(false);
        }
      };
      audioElement.onerror = () => {
        if (revokeUrl) URL.revokeObjectURL(revokeUrl);
        stopPreviewAudio();
        toast({ title: 'Preview playback failed', description: 'Could not play the preview audio', variant: 'destructive' });
      };

      const playPromise = audioElement.play();
      if (playPromise) {
        await playPromise;
      }
      setIsPreviewPlaying(true);
    } catch (err) {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
      stopPreviewAudio();
      throw err;
    }
  };

  const replayPreviewAudio = async () => {
    if (!previewAudioPath) {
      toast({ title: 'No preview available', description: 'Generate a preview story first.' });
      return;
    }

    try {
      await playAudioSrc(previewAudioPath, { requiresAuth: previewAudioRequiresAuth });
    } catch (error: any) {
      toast({ title: 'Preview failed', description: error?.message || 'Unable to play preview audio', variant: 'destructive' });
    }
  };

  const handleStopPreview = () => {
    if (!previewAudioRef.current) return;
    stopPreviewAudio();
  };

  // Trigger ~20s preview using selected voice; fall back to sample on failure
  const handlePreviewVoice = async (voice: VoiceProfile) => {
    if (voice.status !== 'ready') {
      toast({ title: 'Voice not ready', description: 'Please wait until training completes', variant: 'destructive' });
      return;
    }

    setPreviewVoice(voice);
    setPreviewStory(null);
    setPreviewAudioPath(null);
    setPreviewWarning(null);
    setPreviewError(null);
    setIsPreviewLoading(true);

    try {
      const familyId = families?.[0]?.id;
      const res = await apiRequest('POST', `/api/voice-profiles/${voice.id}/preview`, {
        familyId,
        targetSeconds: 20,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate preview');
      }

      const data = await res.json();

      if (data?.story) {
        setPreviewStory(data.story);
        toast({ title: 'Preview story ready', description: 'Playing a ~20s kids story with your voice.' });
      } else {
        setPreviewStory(null);
      }

      const warningMessage = typeof data?.warning === 'string' ? data.warning : null;
      const fatalWarning = warningMessage ? /missing dependencies|fallback_beep_audio/i.test(warningMessage) : false;

      if (warningMessage) {
        setPreviewWarning(warningMessage);
      }

      const audioUrl: string | undefined = data?.generation?.audioUrl;
      if (audioUrl) {
        setPreviewAudioPath(audioUrl);
        setPreviewAudioRequiresAuth(true);
        await playAudioSrc(audioUrl, { requiresAuth: true });
      } else if (fatalWarning) {
        const description = warningMessage || 'Preview audio could not be generated. Check your TTS setup.';
        setPreviewError(description);
        toast({ title: 'Preview unavailable', description, variant: 'destructive' });
        return;
      } else if (voice?.audioSampleUrl) {
        setPreviewAudioPath(voice.audioSampleUrl);
        setPreviewAudioRequiresAuth(false);
        await playAudioSrc(voice.audioSampleUrl, { requiresAuth: false });
        toast({ title: 'Sample played', description: 'TTS preview unavailable; playing voice sample instead.' });
      } else {
        setPreviewError('Could not locate preview audio for this voice.');
        toast({ title: 'Preview unavailable', description: 'Could not locate preview audio URL', variant: 'destructive' });
      }
    } catch (error: any) {
      const msg = String(error?.message || '');
      setPreviewError(msg || 'Unable to generate preview');

      const fatalMsg = /missing dependencies|fallback_beep_audio/i.test(msg);
      if (!fatalMsg && /voice cloning service|TTS/i.test(msg) && voice?.audioSampleUrl) {
        toast({
          title: 'Voice service unavailable',
          description: 'Preview TTS unavailable; playing the voice sample instead.',
        });
        try {
          setPreviewAudioPath(voice.audioSampleUrl);
          setPreviewAudioRequiresAuth(false);
          await playAudioSrc(voice.audioSampleUrl, { requiresAuth: false });
          setPreviewError(null);
        } catch (sampleError: any) {
          toast({ title: 'Preview failed', description: sampleError?.message || 'Unable to play voice sample', variant: 'destructive' });
        }
      } else {
        toast({ title: 'Preview failed', description: msg || 'Unable to generate preview', variant: 'destructive' });
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      stopPreviewAudio();
    };
  }, []);

  const handleWizardComplete = async (nameFromWizard: string, recordings: any[]) => {
    try {
      const name = (nameFromWizard?.trim()?.length ? nameFromWizard.trim() : `Voice Profile ${new Date().toLocaleDateString()}`);
      
      await createJob({
        name,
        recordings: recordings.map(rec => ({
          id: rec.id,
          blob: rec.blob!,
          duration: rec.duration,
          quality: rec.quality,
        })),
      });

      setShowWizard(false);
      setActiveTab('jobs');
      
      toast({
        title: "Voice Processing Started",
        description: `Created voice profile "${name}" and started processing`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to Create Voice Profile",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleWizardCancel = () => {
    setShowWizard(false);
  };

  const getStatusStats = () => {
    const activeJobs = getActiveJobs();
    const completedJobs = getCompletedJobs();
    const failedJobs = getFailedJobs();
    
    return {
      active: activeJobs.length,
      completed: completedJobs.length,
      failed: failedJobs.length,
      total: jobs.length,
    };
  };

  const stats = getStatusStats();

  if (showWizard) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navigation />
        <div className="container mx-auto px-2 pt-20 pb-4">
          <VoiceRecordingWizard
            onComplete={handleWizardComplete}
            onCancel={handleWizardCancel}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      
      <div className="container mx-auto px-4 pt-20 pb-6">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-3">
            Voice Cloning Studio
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-6">
            Transform your voice into AI-powered clones with just a few recordings
          </p>
          
          <Button 
            onClick={() => setShowWizard(true)}
            disabled={isCreatingJob}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 text-lg font-medium rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
          >
            <Mic className="h-5 w-5 mr-2" />
            Start Creating
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-2xl p-6 shadow-lg border border-border text-center">
            <div className="w-12 h-12 bg-blue-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Clock className="h-6 w-6 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.active}</p>
            <p className="text-sm text-slate-400">Active</p>
          </div>
          
          <div className="bg-card rounded-2xl p-6 shadow-lg border border-border text-center">
            <div className="w-12 h-12 bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="h-6 w-6 text-green-400" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.completed}</p>
            <p className="text-sm text-slate-400">Completed</p>
          </div>
          
          <div className="bg-card rounded-2xl p-6 shadow-lg border border-border text-center">
            <div className="w-12 h-12 bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <p className="text-2xl font-bold text-white">{stats.failed}</p>
            <p className="text-sm text-slate-400">Failed</p>
          </div>
          
          <div className="bg-card rounded-2xl p-6 shadow-lg border border-border text-center">
            <div className="w-12 h-12 bg-purple-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Mic className="h-6 w-6 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-white">{voiceProfiles.length}</p>
            <p className="text-sm text-slate-400">Profiles</p>
          </div>
        </div>

        {/* Active Jobs Notification */}
        {hasActiveJobs && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-2xl p-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-900/50 rounded-full flex items-center justify-center">
                <Zap className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-blue-200">
                  {stats.active} voice profile{stats.active !== 1 ? 's' : ''} processing
                </p>
                <p className="text-sm text-blue-300">
                  This typically takes 2-10 minutes
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Simple Navigation */}
        <div className="flex gap-2 mb-8">
          <Button
            variant={activeTab === "overview" ? "default" : "outline"}
            onClick={() => setActiveTab("overview")}
            className="rounded-full"
          >
            Overview
          </Button>
          <Button
            variant={activeTab === "jobs" ? "default" : "outline"}
            onClick={() => setActiveTab("jobs")}
            className="rounded-full"
          >
            Jobs {stats.active > 0 && `(${stats.active})`}
          </Button>
          <Button
            variant={activeTab === "profiles" ? "default" : "outline"}
            onClick={() => setActiveTab("profiles")}
            className="rounded-full"
          >
            Profiles ({voiceProfiles.length})
          </Button>
        </div>

        {/* Overview Content */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* How It Works */}
            <div className="bg-card rounded-3xl p-8 shadow-lg border border-border">
              <h3 className="text-xl font-bold text-white mb-6">How It Works</h3>
              <div className="space-y-4">
                {[
                  { step: "1", title: "Record Samples", desc: "Follow our guided prompts to record 5 voice samples" },
                  { step: "2", title: "AI Analysis", desc: "Our AI analyzes your voice patterns and quality" },
                  { step: "3", title: "Model Training", desc: "Advanced AI technology trains your voice model" },
                  { step: "4", title: "Ready to Use", desc: "Your voice profile is ready for videos" }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{item.title}</h4>
                      <p className="text-sm text-slate-300">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="bg-card rounded-3xl p-8 shadow-lg border border-border">
              <h3 className="text-xl font-bold text-white mb-6">Tips for Best Results</h3>
              <div className="space-y-3">
                {[
                  "Record in a quiet environment",
                  "Speak clearly and naturally", 
                  "Use a good quality microphone",
                  "Express different emotions and tones",
                  "Ensure consistent audio levels"
                ].map((tip, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex-shrink-0"></div>
                    <span className="text-slate-300">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Jobs Content */}
        {activeTab === "jobs" && (
          <div className="bg-card rounded-3xl p-8 shadow-lg border border-border">
            <JobStatusMonitor
              jobs={jobs}
              onRefresh={refetchJobs}
              onCancel={cancelJob}
              onRetry={retryJob}
              onPlaySample={playSample}
            />
          </div>
        )}

        {/* Profiles Content */}
        {activeTab === "profiles" && (
          <div className="bg-card rounded-3xl p-8 shadow-lg border border-border space-y-6">
            <div className="rounded-2xl border border-border/60 bg-background/40 p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-300">
                    <BookOpen className="h-4 w-4" />
                    20-second story preview
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    {previewVoice ? previewVoice.name : 'Choose a voice to hear a preview'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {previewVoice
                      ? `Hear ${previewVoice.name} narrate a short kids story so you can decide what to do next.`
                      : 'Select any ready voice profile below to generate a short kids story preview using the cloned voice.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={replayPreviewAudio}
                    disabled={!previewAudioPath || isPreviewLoading}
                    size="sm"
                  >
                    {isPreviewLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Volume2 className="mr-2 h-4 w-4" />
                    )}
                    {isPreviewLoading ? 'Loading...' : isPreviewPlaying ? 'Replay Preview' : 'Play Preview'}
                  </Button>
                  <Button
                    onClick={handleStopPreview}
                    variant="outline"
                    size="sm"
                    disabled={!isPreviewPlaying}
                  >
                    <StopCircle className="mr-2 h-4 w-4" />
                    Stop
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {isPreviewLoading && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Crafting a 20-second kids story and generating preview audio...
                  </div>
                )}

                {previewWarning && (
                  <Alert>
                    <AlertDescription>{previewWarning}</AlertDescription>
                  </Alert>
                )}

                {previewError && !isPreviewLoading && (
                  <Alert variant="destructive">
                    <AlertDescription>{previewError}</AlertDescription>
                  </Alert>
                )}

                {previewStory && (
                  <div className="rounded-xl border border-border/50 bg-background/60 p-4 text-sm leading-relaxed text-slate-100 whitespace-pre-line">
                    {previewStory}
                  </div>
                )}

                {!previewStory && !isPreviewLoading && !previewError && (
                  <p className="text-sm text-slate-300">
                    When you preview a voice, we create a fresh, age-appropriate story that takes about twenty seconds to read aloud.
                    You can replay it or stop playback anytime.
                  </p>
                )}
              </div>
            </div>

            <VoiceLibrary
              onPreviewVoice={handlePreviewVoice}
              previewingVoiceId={isPreviewLoading && previewVoice ? previewVoice.id : null}
            />

            {/* Voice Test Feature */}
            <div className="mt-6 rounded-2xl border border-border/60 bg-background/40 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <h3 className="text-lg font-semibold text-white">Test Your Voice Clone</h3>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Type any text to hear how your cloned voice sounds. Great for testing pronunciation and quality.
              </p>
              {voiceProfiles.filter(p => p.status === 'ready').length > 0 ? (
                <VoiceTestFeature 
                  voiceProfiles={voiceProfiles.filter(p => p.status === 'ready')}
                  selectedVoiceId={selectedVoiceForTest?.id || voiceProfiles.find(p => p.status === 'ready')?.id || null}
                  onVoiceSelect={(voice) => setSelectedVoiceForTest(voice as VoiceProfile)}
                />
              ) : (
                <Alert>
                  <AlertDescription>
                    No ready voice profiles available. Complete the voice cloning wizard first.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
