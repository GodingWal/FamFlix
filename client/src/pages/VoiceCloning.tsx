import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { 
  Mic, 
  MicOff,
  Upload, 
  Play, 
  Pause, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  Loader2,
  Volume2,
  Trash2,
  Sparkles,
  User,
  AlertCircle,
  CheckCircle2,
  Info,
  Headphones,
  Shield,
  Wand2
} from "lucide-react";
import { cn } from "@/lib/utils";

type WizardStep = 'intro' | 'environment' | 'record' | 'review' | 'create';

interface VoiceProfile {
  id: string;
  name: string;
  status: 'pending' | 'training' | 'ready' | 'failed';
  provider?: string;
  createdAt?: string;
}

const SAMPLE_SCRIPTS = [
  {
    id: 'greeting',
    title: 'Natural Greeting',
    text: "Hello! My name is [say your name]. I'm excited to create my personal voice clone today. This technology is truly amazing, and I can't wait to hear how it turns out.",
    duration: '15-20 seconds'
  },
  {
    id: 'story',
    title: 'Short Story',
    text: "Once upon a time, in a land far away, there lived a curious little fox who loved to explore. Every morning, the fox would venture into the forest, discovering new paths and making friends along the way.",
    duration: '20-25 seconds'
  },
  {
    id: 'variety',
    title: 'Emotional Range',
    text: "I'm so happy to see you today! Wait, did you hear that noise? Oh, it's nothing to worry about. Anyway, let me tell you something important. Are you ready? Here it comes!",
    duration: '15-20 seconds'
  }
];

export default function VoiceCloning() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('intro');
  const [voiceName, setVoiceName] = useState('');
  const [selectedScript, setSelectedScript] = useState(SAMPLE_SCRIPTS[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [noiseLevel, setNoiseLevel] = useState<'low' | 'medium' | 'high'>('low');
  const [environmentChecked, setEnvironmentChecked] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: voiceProfiles, isLoading: profilesLoading } = useQuery<VoiceProfile[]>({
    queryKey: ["/api/voice-profiles"],
    refetchInterval: 5000,
  });

  const createProfileMutation = useMutation({
    mutationFn: async ({ name, audio }: { name: string; audio: File }) => {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("audio", audio);

      const response = await fetch("/api/voice-profiles", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create voice profile");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Voice Clone Created!",
        description: "Your voice is being processed. This takes about 30 seconds.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/voice-profiles"] });
      setSelectedProfileId(data.id);
      resetWizard();
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Could not create voice profile",
        variant: "destructive",
      });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const response = await fetch(`/api/voice-profiles/${profileId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete voice profile");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Voice Deleted",
        description: "The voice profile has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/voice-profiles"] });
      if (selectedProfileId) {
        setSelectedProfileId(null);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Could not delete voice profile",
        variant: "destructive",
      });
    },
  });

  const stopMicrophone = useCallback(() => {
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }
    if (audioContext) {
      audioContext.close();
      setAudioContext(null);
    }
    setAnalyser(null);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, [audioStream, audioContext]);

  const resetWizard = useCallback(() => {
    stopMicrophone();
    setCurrentStep('intro');
    setVoiceName('');
    setRecordedAudio(null);
    setUploadedFile(null);
    setRecordingTime(0);
    setIsPlaying(false);
    setEnvironmentChecked(false);
    setAudioLevel(0);
    setNoiseLevel('low');
  }, [stopMicrophone]);

  const drawWaveform = useCallback(() => {
    if (!analyser || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 3;
    ctx.strokeStyle = isRecording ? '#ef4444' : '#8b5cf6';
    ctx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += Math.abs(dataArray[i] - 128);
    }
    const avgLevel = sum / bufferLength;
    setAudioLevel(Math.min(100, avgLevel * 2));

    if (avgLevel < 5) {
      setNoiseLevel('low');
    } else if (avgLevel < 15) {
      setNoiseLevel('medium');
    } else {
      setNoiseLevel('high');
    }

    animationRef.current = requestAnimationFrame(drawWaveform);
  }, [analyser, isRecording]);

  const checkEnvironment = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true
        } 
      });
      
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);
      
      setAudioContext(ctx);
      setAnalyser(analyserNode);
      setAudioStream(stream);
      setEnvironmentChecked(true);
      
      toast({
        title: "Microphone Connected",
        description: "Your microphone is ready. Noise suppression is enabled.",
      });
    } catch (error) {
      toast({
        title: "Microphone Access Required",
        description: "Please allow microphone access to continue.",
        variant: "destructive",
      });
    }
  };

  const startRecording = async () => {
    if (!audioStream) {
      await checkEnvironment();
      return;
    }

    try {
      const recorder = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedAudio(audioBlob);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
      };
      
      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      toast({
        title: "Recording Error",
        description: "Could not start recording. Please try again.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith("audio/")) {
        setUploadedFile(file);
        setRecordedAudio(null);
        setCurrentStep('review');
        toast({
          title: "File Uploaded",
          description: `${file.name} is ready for review.`,
        });
      } else {
        toast({
          title: "Invalid File",
          description: "Please upload an audio file (MP3, WAV, etc.)",
          variant: "destructive",
        });
      }
    }
  };

  const playRecordedAudio = () => {
    if (!audioRef.current) return;
    
    const audioSource = recordedAudio || uploadedFile;
    if (!audioSource) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const url = URL.createObjectURL(audioSource);
      audioRef.current.src = url;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleCreateProfile = () => {
    const audioSource = recordedAudio || uploadedFile;
    if (!audioSource || !voiceName.trim()) return;
    
    const file = audioSource instanceof File 
      ? audioSource 
      : new File([audioSource], 'recording.webm', { type: 'audio/webm' });
    
    createProfileMutation.mutate({ name: voiceName.trim(), audio: file });
  };

  const playVoicePreview = async (profileId: string) => {
    try {
      const response = await fetch(`/api/voice-profiles/${profileId}/preview`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Preview not available");
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setIsPlaying(true);
        setSelectedProfileId(profileId);
      }
    } catch (error) {
      toast({
        title: "Preview Unavailable",
        description: "Voice preview is not ready yet.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onended = () => setIsPlaying(false);
    }
  }, []);

  useEffect(() => {
    if (analyser && (currentStep === 'environment' || currentStep === 'record')) {
      drawWaveform();
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, currentStep, drawWaveform]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
      }
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [audioStream, audioContext]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hasAudio = recordedAudio || uploadedFile;
  const canProceed = voiceName.trim().length >= 2;

  const steps = [
    { id: 'intro', label: 'Start' },
    { id: 'environment', label: 'Setup' },
    { id: 'record', label: 'Record' },
    { id: 'review', label: 'Review' },
    { id: 'create', label: 'Create' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 text-foreground">
      <audio ref={audioRef} preload="none" />
      <Navigation />
      
      <main className="pt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Wand2 className="w-4 h-4" />
              AI Voice Cloning
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">
              Create Your Voice Clone
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Record a high-quality voice sample and we'll create a digital copy that sounds just like you
            </p>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between max-w-md mx-auto">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div 
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                      index < currentStepIndex && "bg-primary text-primary-foreground",
                      index === currentStepIndex && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                      index > currentStepIndex && "bg-muted text-muted-foreground"
                    )}
                  >
                    {index < currentStepIndex ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={cn(
                      "w-8 sm:w-12 h-0.5 mx-1",
                      index < currentStepIndex ? "bg-primary" : "bg-muted"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <Card className="border-0 shadow-xl bg-card/50 backdrop-blur">
            <CardContent className="p-6 sm:p-8">
              
              {currentStep === 'intro' && (
                <div className="space-y-8">
                  <div className="text-center">
                    <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-primary/25">
                      <Mic className="w-12 h-12 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Let's Get Started</h2>
                    <p className="text-muted-foreground">
                      First, give your voice clone a memorable name
                    </p>
                  </div>

                  <div className="max-w-sm mx-auto space-y-4">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value)}
                        placeholder="Enter voice name..."
                        className="pl-10 h-12 text-lg"
                        maxLength={50}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Examples: "Dad's Voice", "Grandma Mary", "My Voice"
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                      <Shield className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Noise Removal</p>
                        <p className="text-xs text-muted-foreground">Background noise is automatically filtered</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                      <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">AI Enhanced</p>
                        <p className="text-xs text-muted-foreground">Advanced processing for clear audio</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                      <Headphones className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">High Quality</p>
                        <p className="text-xs text-muted-foreground">Studio-grade voice cloning</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button 
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!canProceed}
                      className="flex-1 gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Upload Audio
                    </Button>
                    <Button 
                      onClick={() => setCurrentStep('environment')}
                      disabled={!canProceed}
                      className="flex-1 gap-2"
                    >
                      Record Voice
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {currentStep === 'environment' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2">Environment Check</h2>
                    <p className="text-muted-foreground">
                      Let's make sure your recording environment is optimal
                    </p>
                  </div>

                  <div className="bg-muted/30 rounded-xl p-6 space-y-4">
                    <canvas 
                      ref={canvasRef} 
                      width={600} 
                      height={100}
                      className="w-full h-24 rounded-lg bg-slate-900"
                    />
                    
                    {environmentChecked && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Audio Level</span>
                          <span className="text-sm font-medium">{Math.round(audioLevel)}%</span>
                        </div>
                        <Progress value={audioLevel} className="h-2" />
                        
                        <div className={cn(
                          "flex items-center gap-2 p-3 rounded-lg",
                          noiseLevel === 'low' && "bg-green-500/10 text-green-600",
                          noiseLevel === 'medium' && "bg-yellow-500/10 text-yellow-600",
                          noiseLevel === 'high' && "bg-red-500/10 text-red-600"
                        )}>
                          {noiseLevel === 'low' ? (
                            <>
                              <CheckCircle2 className="w-5 h-5" />
                              <span className="text-sm font-medium">Excellent! Your environment is quiet</span>
                            </>
                          ) : noiseLevel === 'medium' ? (
                            <>
                              <AlertCircle className="w-5 h-5" />
                              <span className="text-sm font-medium">Some background noise detected</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-5 h-5" />
                              <span className="text-sm font-medium">Too much noise - find a quieter spot</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold">1</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">Find a quiet room</p>
                        <p className="text-xs text-muted-foreground">Close windows and doors</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold">2</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">Turn off fans & AC</p>
                        <p className="text-xs text-muted-foreground">Minimize humming sounds</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold">3</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">Position properly</p>
                        <p className="text-xs text-muted-foreground">6-8 inches from microphone</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold">4</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">Speak naturally</p>
                        <p className="text-xs text-muted-foreground">Normal pace and volume</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button 
                      variant="outline"
                      onClick={() => setCurrentStep('intro')}
                      className="gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </Button>
                    {!environmentChecked ? (
                      <Button 
                        onClick={checkEnvironment}
                        className="flex-1 gap-2"
                      >
                        <Mic className="w-4 h-4" />
                        Check Microphone
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => setCurrentStep('record')}
                        className="flex-1 gap-2"
                        disabled={noiseLevel === 'high'}
                      >
                        Continue to Recording
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 'record' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2">Record Your Voice</h2>
                    <p className="text-muted-foreground">
                      Read the script below naturally for best results
                    </p>
                  </div>

                  <div className="flex gap-2 justify-center flex-wrap">
                    {SAMPLE_SCRIPTS.map((script) => (
                      <Button
                        key={script.id}
                        variant={selectedScript.id === script.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedScript(script)}
                        disabled={isRecording}
                      >
                        {script.title}
                      </Button>
                    ))}
                  </div>

                  <div className="bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20 rounded-xl p-6">
                    <div className="flex items-start gap-3 mb-3">
                      <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Script to Read ({selectedScript.duration})</p>
                      </div>
                    </div>
                    <p className="text-lg leading-relaxed">
                      "{selectedScript.text}"
                    </p>
                  </div>

                  <div className="bg-muted/30 rounded-xl p-6 space-y-4">
                    <canvas 
                      ref={canvasRef} 
                      width={600} 
                      height={80}
                      className="w-full h-20 rounded-lg bg-slate-900"
                    />
                    
                    <div className="flex items-center justify-center gap-6">
                      <div className="text-center">
                        <div className={cn(
                          "text-4xl font-mono font-bold",
                          isRecording && "text-red-500"
                        )}>
                          {formatTime(recordingTime)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {isRecording ? "Recording..." : "Ready"}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <Button
                        size="lg"
                        variant={isRecording ? "destructive" : "default"}
                        onClick={isRecording ? stopRecording : startRecording}
                        className={cn(
                          "w-20 h-20 rounded-full p-0 transition-all",
                          isRecording && "animate-pulse"
                        )}
                      >
                        {isRecording ? (
                          <div className="w-6 h-6 bg-white rounded-sm" />
                        ) : (
                          <Mic className="w-8 h-8" />
                        )}
                      </Button>
                    </div>

                    <p className="text-center text-sm text-muted-foreground">
                      {isRecording ? "Click to stop recording" : "Click to start recording"}
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <Button 
                      variant="outline"
                      onClick={() => setCurrentStep('environment')}
                      className="gap-2"
                      disabled={isRecording}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </Button>
                    <Button 
                      onClick={() => setCurrentStep('review')}
                      disabled={!recordedAudio || isRecording}
                      className="flex-1 gap-2"
                    >
                      Review Recording
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {currentStep === 'review' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Review Your Recording</h2>
                    <p className="text-muted-foreground">
                      Listen to make sure it sounds clear and natural
                    </p>
                  </div>

                  <Card className="bg-muted/30 border-0">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Button
                            size="lg"
                            variant="outline"
                            onClick={playRecordedAudio}
                            className="w-14 h-14 rounded-full p-0"
                            aria-label={isPlaying ? "Pause playback" : "Play recording"}
                          >
                            {isPlaying ? (
                              <Pause className="w-6 h-6" />
                            ) : (
                              <Play className="w-6 h-6 ml-1" />
                            )}
                          </Button>
                          <div>
                            <p className="font-medium">{voiceName}</p>
                            <p className="text-sm text-muted-foreground">
                              {uploadedFile ? uploadedFile.name : `${formatTime(recordingTime)} recording`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium",
                            "bg-green-500/10 text-green-600"
                          )}>
                            Noise Filtered
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm text-blue-600">Quality Check</p>
                        <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                          <li>Is your voice clear and audible?</li>
                          <li>Did you read the full script?</li>
                          <li>Is there minimal background noise?</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setRecordedAudio(null);
                        setUploadedFile(null);
                        setCurrentStep('record');
                      }}
                      className="gap-2"
                    >
                      <MicOff className="w-4 h-4" />
                      Re-record
                    </Button>
                    <Button 
                      onClick={() => setCurrentStep('create')}
                      className="flex-1 gap-2"
                    >
                      Sounds Good!
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {currentStep === 'create' && (
                <div className="space-y-8 text-center">
                  <div>
                    <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center mb-6 shadow-lg shadow-primary/25 animate-pulse">
                      <Sparkles className="w-12 h-12 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Ready to Create!</h2>
                    <p className="text-muted-foreground">
                      Your voice clone "<span className="text-foreground font-medium">{voiceName}</span>" will be ready in about 30 seconds
                    </p>
                  </div>

                  <Card className="bg-muted/30 border-0 max-w-sm mx-auto">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <Volume2 className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{voiceName}</p>
                          <p className="text-sm text-muted-foreground">
                            {uploadedFile ? uploadedFile.name : `${formatTime(recordingTime)} recording`}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-center gap-4 pt-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Shield className="w-4 h-4 text-green-500" />
                          Noise Filtered
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          Quality Verified
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex gap-4 max-w-sm mx-auto">
                    <Button 
                      variant="outline"
                      onClick={() => setCurrentStep('review')}
                      className="gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </Button>
                    <Button 
                      onClick={handleCreateProfile}
                      disabled={createProfileMutation.isPending}
                      className="flex-1 gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                    >
                      {createProfileMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Create Voice Clone
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {Array.isArray(voiceProfiles) && voiceProfiles.length > 0 && (
            <div className="mt-12 space-y-4">
              <h2 className="text-xl font-semibold">Your Voice Clones</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {voiceProfiles.map((profile) => (
                  <Card 
                    key={profile.id}
                    className={cn(
                      "transition-all hover:shadow-md",
                      selectedProfileId === profile.id && "ring-2 ring-primary"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            profile.status === 'ready' 
                              ? "bg-green-500/20" 
                              : profile.status === 'training'
                              ? "bg-yellow-500/20"
                              : profile.status === 'failed'
                              ? "bg-red-500/20"
                              : "bg-muted"
                          )}>
                            {profile.status === 'ready' ? (
                              <Volume2 className="w-5 h-5 text-green-600" />
                            ) : profile.status === 'training' ? (
                              <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />
                            ) : profile.status === 'failed' ? (
                              <AlertCircle className="w-5 h-5 text-red-600" />
                            ) : (
                              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{profile.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {profile.status === 'ready' ? 'Ready to use' : profile.status}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {profile.status === 'ready' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => playVoicePreview(profile.id)}
                              disabled={isPlaying && selectedProfileId === profile.id}
                              aria-label={isPlaying && selectedProfileId === profile.id ? `Pause ${profile.name} preview` : `Play ${profile.name} preview`}
                            >
                              {isPlaying && selectedProfileId === profile.id ? (
                                <Pause className="w-4 h-4" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Delete voice "${profile.name}"?`)) {
                                deleteProfileMutation.mutate(profile.id);
                              }
                            }}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${profile.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {profilesLoading && (
            <div className="flex justify-center py-8 mt-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {!profilesLoading && (!voiceProfiles || voiceProfiles.length === 0) && currentStep === 'intro' && (
            <div className="text-center py-8 mt-8 text-muted-foreground">
              <Volume2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No voice clones yet. Create your first one above!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
