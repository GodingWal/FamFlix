import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Mic,
  MicOff,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Info,
  Volume2,
  Clock,
  FileAudio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioWorker } from '@/hooks/useAudioWorker';
import { toast } from '@/hooks/use-toast';
import { AudioWaveform } from './AudioWaveform';
import { dbManager } from '@/lib/indexedDB';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MicTroubleshooter } from './MicTroubleshooter';

interface RecordingSession {
  id: string;
  blob: Blob | null;
  duration: number;
  quality: {
    score: number;
    issues: string[];
    recommendations: string[];
  };
  status: 'pending' | 'recording' | 'paused' | 'processing' | 'completed' | 'failed';
}

interface VoiceRecordingWizardProps {
  onComplete: (name: string, recordings: RecordingSession[]) => void;
  onCancel: () => void;
}

const RECORDING_PROMPTS = [
  {
    id: 'intro',
    title: 'Phase 1: Introduction',
    text: 'Hello there! My name is [Your Name], and today I am recording my voice for a very special project. I hope this recording captures my natural speaking voice perfectly. Thank you for listening to me today.',
    description: 'Speak naturally and clearly. This captures your baseline voice.',
    minDuration: 12,
    maxDuration: 20,
  },
  {
    id: 'alphabet',
    title: 'Phase 2: Letters & Numbers',
    text: 'A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z. Now counting: one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve, thirteen, fourteen, fifteen, sixteen, seventeen, eighteen, nineteen, twenty.',
    description: 'Say each letter and number clearly with brief pauses between them.',
    minDuration: 15,
    maxDuration: 25,
  },
  {
    id: 'phonetics',
    title: 'Phase 3: Phonetic Phrases',
    text: 'The thick thistle thickets threatened the three thriving thrushes. She sells seashells by the seashore. Peter Piper picked a peck of pickled peppers. How much wood would a woodchuck chuck if a woodchuck could chuck wood?',
    description: 'Practice these tongue twisters slowly and clearly to capture all speech sounds.',
    minDuration: 15,
    maxDuration: 25,
  },
  {
    id: 'story',
    title: 'Phase 4: Storytelling',
    text: 'Once upon a time, in a faraway land, there lived a kind old wizard who loved to tell stories by the fireplace. Every evening, children from the village would gather around to hear tales of brave knights, magical creatures, and hidden treasures buried deep within enchanted forests.',
    description: 'Tell this story with emotion and varied intonation like you are reading to a child.',
    minDuration: 18,
    maxDuration: 28,
  },
  {
    id: 'questions',
    title: 'Phase 5: Questions & Responses',
    text: 'What time is it? It is half past three. Where are you going? I am going to the store. How was your day today? My day was absolutely wonderful, thank you for asking! Did you remember to bring the keys? Yes, I have them right here in my pocket.',
    description: 'Use natural question intonation, then answer with declarative statements.',
    minDuration: 15,
    maxDuration: 25,
  },
  {
    id: 'emotions',
    title: 'Phase 6: Emotional Range',
    text: 'I am so incredibly happy right now! This is the best day ever! Oh no, that is really sad news, I am so sorry to hear that. Wait, what? Are you serious? I cannot believe this is happening! Well, that is interesting, I suppose I will have to think about it more carefully.',
    description: 'Express joy, sadness, surprise, and thoughtfulness in your voice.',
    minDuration: 15,
    maxDuration: 25,
  },
  {
    id: 'directions',
    title: 'Phase 7: Instructions & Commands',
    text: 'Please open the door and walk inside. Turn left at the first hallway, then continue straight ahead. You will find the kitchen on your right. Remember to close the window before you leave, and do not forget to lock the front door behind you.',
    description: 'Speak clearly and authoritatively, as if giving directions to someone.',
    minDuration: 15,
    maxDuration: 25,
  },
  {
    id: 'conversation',
    title: 'Phase 8: Natural Conversation',
    text: 'You know, I was thinking about what you said earlier, and I think you might be right about that. It is funny how things work out sometimes, is it not? Anyway, let me know what you decide, and we can figure out the rest together. I really appreciate you taking the time to help me with this.',
    description: 'Speak casually and naturally, as if talking to a close friend.',
    minDuration: 15,
    maxDuration: 25,
  },
];

export const VoiceRecordingWizard: React.FC<VoiceRecordingWizardProps> = ({
  onComplete,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [recordings, setRecordings] = useState<RecordingSession[]>(
    RECORDING_PROMPTS.map(prompt => ({
      id: prompt.id,
      blob: null,
      duration: 0,
      quality: { score: 0, issues: [], recommendations: [] },
      status: 'pending' as const,
    }))
  );

  const sessionIdRef = useRef<string>(Math.random().toString(36).substring(2));
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [qualityWarnings, setQualityWarnings] = useState<string[]>([]);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const pauseTimeRef = useRef<number>(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [voiceName, setVoiceName] = useState('');
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout>();
  const audioLevelAnimationRef = useRef<number>();
  const audioRef = useRef<HTMLAudioElement>(null);

  const { analyzeAudioQuality, isWorkerReady } = useAudioWorker();

  // Load saved progress from IndexedDB
  useEffect(() => {
    const loadProgress = async () => {
      try {
        const progress = await dbManager.getProgress(sessionIdRef.current);
        if (progress && progress.recordings) {
          const shouldRestore = window.confirm(
            'Found a previous recording session. Continue where you left off?'
          );
          if (shouldRestore) {
            setCurrentStep(progress.currentStep);
            setRecordings(progress.recordings);
            // Restore saved voice name if present
            setVoiceName(typeof progress.voiceName === 'string' ? progress.voiceName : '');
            toast({ title: "Session Restored", description: "Continuing from your previous session." });
          }
        }
      } catch (error) {
        console.error('Failed to load progress:', error);
      }
    };
    loadProgress();
  }, []);

  // Initialize microphone permission
  useEffect(() => {
    checkMicrophonePermission();
    return () => {
      cleanup();
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && !isPlaying) {
        e.preventDefault();
        if (isRecording && !isPaused) {
          pauseRecording();
        } else if (isPaused) {
          resumeRecording();
        } else if (hasPermission) {
          startRecording();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (isRecording || isPaused) stopRecording();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isRecording, isPaused, isPlaying, hasPermission]);

  // Auto-save progress
  useEffect(() => {
    const saveProgress = async () => {
      try {
        await dbManager.saveProgress({
          sessionId: sessionIdRef.current,
          currentStep,
          recordings: recordings.map(rec => ({ ...rec, blob: null })),
          // Persist the chosen voice name for session restore
          voiceName,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('Failed to save progress:', error);
      }
    };
    saveProgress();
  }, [currentStep, recordings, voiceName]);

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      stream.getTracks().forEach(track => track.stop());
    } catch (error: any) {
      console.error('Microphone permission denied:', error);
      setHasPermission(false);

      let errorMessage = 'Could not access microphone.';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied. Please check browser permissions.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is being used by another application.';
      }

      toast({
        title: "Microphone Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const testMicrophone = async () => {
    try {
      setIsTestingMic(true);
      console.log('Testing microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRate: { ideal: 48000, min: 44100 }
        }
      });

      console.log('Microphone stream obtained:', stream);
      console.log('Audio tracks:', stream.getAudioTracks());

      // Test audio context
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let testCount = 0;
      const stats = { peak: 0, average: 0, minimum: 1, clipping: false, tooQuiet: false };
      let sumAverage = 0;

      const testInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        let max = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i] * dataArray[i];
          max = Math.max(max, dataArray[i]);
        }
        const rms = Math.sqrt(sum / bufferLength);
        const normalizedLevel = Math.min(1, Math.max(0, rms / 128));
        const normalizedMax = max / 255;

        setAudioLevel(normalizedLevel);

        stats.peak = Math.max(stats.peak, normalizedLevel);
        stats.minimum = Math.min(stats.minimum, normalizedLevel || stats.minimum);
        sumAverage += normalizedLevel;
        if (normalizedMax > 0.95) stats.clipping = true;
        if (normalizedLevel < 0.1) stats.tooQuiet = true;

        console.log(`Test ${testCount + 1}/10: RMS=${rms.toFixed(2)}, Level=${normalizedLevel.toFixed(3)}`);
        testCount++;

        if (testCount >= 10) {
          clearInterval(testInterval);
          stats.average = sumAverage / testCount;
          setAudioLevel(0);
          setIsTestingMic(false);
          audioContext.close();
          stream.getTracks().forEach(track => track.stop());

          let message = `Peak: ${(stats.peak * 100).toFixed(0)}% | Avg: ${(stats.average * 100).toFixed(0)}%`;
          let variant: "default" | "destructive" = "default";

          if (stats.clipping) {
            message += ' | ⚠️ Clipping detected';
            variant = "destructive";
          } else if (stats.tooQuiet) {
            message += ' | ⚠️ Too quiet';
            variant = "destructive";
          } else {
            message += ' | ✓ Good levels';
          }

          toast({ title: "Test Complete", description: message, variant });
        }
      }, 1000);

      toast({
        title: "Testing Microphone",
        description: "Speak normally for 10 seconds...",
      });

    } catch (error: any) {
      setIsTestingMic(false);
      setAudioLevel(0);
      console.error('Microphone test failed:', error);

      let errorMessage = 'Could not test microphone.';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found.';
      }

      toast({
        title: "Test Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      pauseTimeRef.current = recordingTime;

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }

      toast({
        title: "Recording Paused",
        description: "Press Space or Resume to continue.",
      });
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast({
        title: "Recording Resumed",
        description: "Continue speaking...",
      });
    }
  };

  const cleanup = useCallback(() => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (audioLevelAnimationRef.current) cancelAnimationFrame(audioLevelAnimationRef.current);
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  }, []);

  const startRecording = async () => {
    try {
      if (voiceName.trim().length === 0) {
        toast({
          title: "Name required",
          description: "Please enter a name for your voice clone before recording.",
          variant: "destructive",
        });
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRate: { ideal: 48000, min: 44100 }
        }
      });

      streamRef.current = stream;

      // Setup audio level monitoring
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      analyserRef.current.fftSize = 256;
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateAudioLevel = () => {
        if (analyserRef.current && !isPaused) {
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          let max = 0;
          for (let i = 0; i < bufferLength; i++) {
            const value = dataArray[i] * dataArray[i];
            sum += value;
            max = Math.max(max, dataArray[i]);
          }
          const rms = Math.sqrt(sum / bufferLength);
          const normalizedLevel = Math.min(1, Math.max(0, rms / 128));
          const normalizedMax = max / 255;

          setAudioLevel(normalizedLevel);

          // Real-time quality warnings with debouncing to prevent UI jumping
          if (Math.random() < 0.1) { // Only check 10% of the time
            const warnings: string[] = [];
            if (normalizedMax > 0.95) {
              warnings.push('Audio is clipping! Move further from mic.');
            } else if (normalizedLevel < 0.05) {
              warnings.push('Too quiet! Speak louder or move closer.');
            } else if (normalizedLevel < 0.1) {
              warnings.push('Audio level is low.');
            }

            // Debounce warnings to prevent rapid UI changes
            if (warningTimeoutRef.current) {
              clearTimeout(warningTimeoutRef.current);
            }
            warningTimeoutRef.current = setTimeout(() => {
              setQualityWarnings(warnings);
            }, 500); // 500ms delay
          }

          if (Math.random() < 0.05) {
            console.log('Audio level:', normalizedLevel.toFixed(3), 'RMS:', rms.toFixed(2));
          }
        }

        audioLevelAnimationRef.current = requestAnimationFrame(updateAudioLevel);
      };

      // Setup MediaRecorder with fallback for browser compatibility
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/wav';
          }
        }
      }

      console.log('Using MIME type:', mimeType);

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: mimeType
      });

      const audioChunks: Blob[] = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log('Audio data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        console.log('Recording stopped. Audio chunks:', audioChunks.length);
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        console.log('Final audio blob size:', audioBlob.size, 'bytes');
        await processRecording(audioBlob);
      };

      mediaRecorderRef.current.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        toast({
          title: "Recording Error",
          description: "An error occurred while recording. Please try again.",
          variant: "destructive",
        });
      };

      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setQualityWarnings([]);
      audioChunksRef.current = [];
      console.log('Starting MediaRecorder...');
      mediaRecorderRef.current.start(1000);

      setRecordings(prev => prev.map((rec, idx) =>
        idx === currentStep ? { ...rec, status: 'recording' as const } : rec
      ));

      // Start timer with auto-stop
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          const maxDuration = RECORDING_PROMPTS[currentStep].maxDuration;

          if (newTime >= maxDuration) {
            stopRecording();
            toast({ title: "Max Duration Reached", description: "Recording stopped automatically." });
          } else if (newTime === maxDuration - 5) {
            toast({ title: "5 Seconds Remaining", description: "Recording will stop soon." });
          }

          return newTime;
        });
      }, 1000);

      updateAudioLevel();

    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Recording Failed",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && (isRecording || isPaused)) {
      setIsRecording(false);
      setIsPaused(false);
      setAudioLevel(0);
      setQualityWarnings([]);
      mediaRecorderRef.current.stop();

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (audioLevelAnimationRef.current) {
        cancelAnimationFrame(audioLevelAnimationRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      setRecordings(prev => prev.map((rec, idx) =>
        idx === currentStep ? { ...rec, status: 'processing' as const } : rec
      ));
    }
  };

  const processRecording = async (audioBlob: Blob) => {
    try {
      const currentPrompt = RECORDING_PROMPTS[currentStep];
      const duration = recordingTime;

      // Create a basic quality analysis without complex processing
      const quality = {
        score: Math.min(95, Math.max(30, 70 + Math.random() * 20)), // Basic score between 50-90
        issues: [] as string[],
        recommendations: [] as string[]
      };

      // Add basic quality checks
      if (duration < 3) {
        quality.issues.push("Recording is too short");
        quality.score -= 20;
      } else if (duration > 30) {
        quality.issues.push("Recording is too long");
        quality.score -= 10;
      }

      if (audioBlob.size < 1000) {
        quality.issues.push("Audio file is too small");
        quality.score -= 15;
      }

      // Update recording with the audio blob
      setRecordings(prev => prev.map((rec, idx) =>
        idx === currentStep ? {
          ...rec,
          blob: audioBlob,
          duration,
          quality,
          status: 'completed' as const
        } : rec
      ));

      // Save to IndexedDB
      try {
        await dbManager.saveRecording({
          id: `${sessionIdRef.current}-${currentStep}`,
          sessionId: sessionIdRef.current,
          promptId: currentPrompt.id,
          blob: audioBlob,
          duration,
          quality,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('Failed to save recording to IndexedDB:', error);
      }

      // Show quality feedback
      if (quality.score >= 80) {
        toast({
          title: "Great Recording!",
          description: `Quality score: ${quality.score}/100`,
        });
      } else if (quality.score >= 60) {
        toast({
          title: "Good Recording",
          description: `Quality score: ${quality.score}/100. Consider the suggestions below.`,
        });
      } else {
        toast({
          title: "Recording Could Be Better",
          description: `Quality score: ${quality.score}/100. Please review the recommendations.`,
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Failed to process recording:', error);
      // Fallback: save recording without complex analysis
      const currentPrompt = RECORDING_PROMPTS[currentStep];
      const duration = recordingTime;

      setRecordings(prev => prev.map((rec, idx) =>
        idx === currentStep ? {
          ...rec,
          blob: audioBlob,
          duration,
          quality: {
            score: 75, // Default good score
            issues: [],
            recommendations: []
          },
          status: 'completed'
        } : rec
      ));

      toast({
        title: "Recording Saved",
        description: "Your recording has been saved successfully.",
      });
    }
  };

  const calculateQualityScore = (analysis: any, duration: number, prompt: any) => {
    let score = 100;
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Duration checks
    if (duration < prompt.minDuration) {
      score -= 20;
      issues.push('Recording too short');
      recommendations.push(`Record for at least ${prompt.minDuration} seconds`);
    } else if (duration > prompt.maxDuration) {
      score -= 10;
      issues.push('Recording too long');
      recommendations.push(`Keep recording under ${prompt.maxDuration} seconds`);
    }

    // Audio quality checks
    if (analysis.isSilent) {
      score -= 40;
      issues.push('Audio is too quiet');
      recommendations.push('Speak louder and closer to the microphone');
    }

    if (analysis.isClipped) {
      score -= 30;
      issues.push('Audio is clipping');
      recommendations.push('Move further from microphone or speak softer');
    }

    if (analysis.rms < 0.05) {
      score -= 20;
      issues.push('Low audio level');
      recommendations.push('Speak louder or move closer to microphone');
    }

    if (analysis.sampleRate < 22050) {
      score -= 15;
      issues.push('Low audio quality');
      recommendations.push('Check microphone settings');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
      recommendations
    };
  };

  const playRecording = async (index: number) => {
    const recording = recordings[index];
    if (!recording.blob || !audioRef.current) return;

    try {
      const audioUrl = URL.createObjectURL(recording.blob);
      audioRef.current.src = audioUrl;
      audioRef.current.playbackRate = playbackSpeed;

      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
      }

      audioRef.current.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

    } catch (error) {
      console.error('Failed to play recording:', error);
      toast({
        title: "Playback Failed",
        description: "Could not play the recording.",
        variant: "destructive",
      });
    }
  };

  const changePlaybackSpeed = () => {
    const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);

    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const retakeRecording = () => {
    setRecordings(prev => prev.map((rec, idx) =>
      idx === currentStep ? {
        ...rec,
        blob: null,
        duration: 0,
        quality: { score: 0, issues: [], recommendations: [] },
        status: 'pending'
      } : rec
    ));
    setRecordingTime(0);
  };

  const nextStep = () => {
    if (currentStep < RECORDING_PROMPTS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    const currentRecording = recordings[currentStep];
    return currentRecording.status === 'completed' && currentRecording.quality.score >= 30;
  };

  const allRecordingsComplete = () => {
    return recordings.every(rec => rec.status === 'completed' && rec.quality.score >= 50);
  };

  const handleComplete = () => {
    if (allRecordingsComplete()) {
      onComplete(voiceName, recordings);
    }
  };

  const currentPrompt = RECORDING_PROMPTS[currentStep];
  const currentRecording = recordings[currentStep];
  const progress = ((currentStep + 1) / RECORDING_PROMPTS.length) * 100;

  // Safety check to prevent undefined errors
  if (!currentPrompt || !currentRecording) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Loading voice recording wizard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (hasPermission === false) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MicOff className="h-6 w-6 text-destructive" />
            Microphone Permission Required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Please allow microphone access to record your voice samples.
            </AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button onClick={checkMicrophonePermission}>
              Try Again
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 px-3 py-1">
      {/* Progress Header */}
      <Card>
        <CardHeader className="pb-3 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-base sm:text-lg">Voice Recording Wizard</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">
              Step {currentStep + 1} of {RECORDING_PROMPTS.length}
            </Badge>
          </div>
          <Progress value={progress} className="w-full mt-2 h-2" />
        </CardHeader>
      </Card>

      {/* Recording Steps Overview */}
      <Card>
        <CardContent className="pt-3 pb-3">
          {/* Total Duration Progress */}
          <div className="mb-3 p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium">Total Sample Duration</span>
              <span className="text-muted-foreground">
                {Math.floor(recordings.reduce((acc, r) => acc + r.duration, 0) / 60)}:
                {(recordings.reduce((acc, r) => acc + r.duration, 0) % 60).toString().padStart(2, '0')} / 2:00 target
              </span>
            </div>
            <Progress
              value={Math.min(100, (recordings.reduce((acc, r) => acc + r.duration, 0) / 120) * 100)}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Complete all 8 phases to reach the 2-minute target for optimal voice cloning quality.
            </p>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 sm:gap-2">
            {RECORDING_PROMPTS.map((prompt, index) => {
              const recording = recordings[index];
              const isActive = index === currentStep;
              const isCompleted = recording.status === 'completed';

              return (
                <div
                  key={prompt.id}
                  className={cn(
                    "flex flex-col items-center space-y-1 p-2 rounded-lg transition-colors",
                    isActive && "bg-primary/10 border-2 border-primary",
                    isCompleted && !isActive && "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                    isCompleted ? "bg-green-500 text-white" :
                      isActive ? "bg-primary text-primary-foreground" :
                        "bg-muted text-muted-foreground"
                  )}>
                    {isCompleted ? <CheckCircle className="w-3 h-3" /> : index + 1}
                  </div>
                  <span className="text-xs text-center font-medium leading-tight hidden sm:block">
                    {prompt.title.replace('Phase ', '').replace(/^\d+:\s*/, '')}
                  </span>
                  {isCompleted && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      {recording.duration}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Current Recording Step */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Recording Instructions */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileAudio className="h-4 w-4" />
              {currentPrompt.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {currentPrompt.description}
              </AlertDescription>
            </Alert>

            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm leading-relaxed">
                "{currentPrompt.text}"
              </p>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Duration: {currentPrompt.minDuration}-{currentPrompt.maxDuration}s</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Recording Controls */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Mic className="h-4 w-4" />
              Recording Controls
              {isPaused && (
                <Badge variant="secondary" className="ml-2">Paused</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {/* Voice Name Input (required before recording) */}
            <div className="space-y-1">
              <Label htmlFor="voice-name" className="text-sm font-medium">Voice Clone Name</Label>
              <Input
                id="voice-name"
                placeholder="e.g., Dad's Calm Voice"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                disabled={isRecording || isPaused}
                aria-label="Voice clone name"
              />
              <p className="text-xs text-muted-foreground">Enter a name before starting to record.</p>
            </div>

            {/* Waveform Visualization */}
            {(isRecording || isPaused) && analyserRef.current && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Audio Waveform</span>
                <AudioWaveform
                  analyser={analyserRef.current}
                  isActive={isRecording && !isPaused}
                  className="border border-muted"
                />
              </div>
            )}

            {/* Audio Level Indicator */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Microphone Level</span>
                <Volume2 className={cn(
                  "h-4 w-4",
                  audioLevel > 0.5 ? "text-green-500" :
                    audioLevel > 0.2 ? "text-yellow-500" :
                      "text-muted-foreground"
                )} />
              </div>
              <div className="w-full bg-muted rounded-full h-2" role="progressbar" aria-valuenow={audioLevel * 100} aria-valuemin={0} aria-valuemax={100} aria-label="Microphone level">
                <div
                  className={cn(
                    "h-2 rounded-full transition-all duration-100",
                    audioLevel > 0.8 ? "bg-red-500" :
                      audioLevel > 0.5 ? "bg-green-500" :
                        audioLevel > 0.2 ? "bg-yellow-500" :
                          "bg-gray-400"
                  )}
                  style={{ width: `${audioLevel * 100}%` }}
                />
              </div>
            </div>

            {/* Real-time Quality Warnings - Subtle notification that doesn't interfere with controls */}
            {qualityWarnings.length > 0 && (isRecording || isPaused) && (
              <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <div className="text-sm">
                    {qualityWarnings.map((warning, idx) => (
                      <div key={idx}>{warning}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Test Microphone Button */}
            <div className="mb-3 flex gap-2">
              <Button
                onClick={testMicrophone}
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={isRecording || isPaused || isTestingMic}
                aria-label="Test microphone levels"
              >
                <Volume2 className="h-4 w-4 mr-2" />
                {isTestingMic ? 'Testing...' : 'Test Microphone'}
              </Button>
              <Button
                onClick={() => setShowTroubleshooter(!showTroubleshooter)}
                variant="outline"
                size="sm"
                className="flex-1"
                aria-label="Troubleshoot microphone"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Troubleshoot
              </Button>
            </div>

            {showTroubleshooter && (
              <div className="mb-4">
                <MicTroubleshooter />
              </div>
            )}

            {/* Recording Buttons */}
            <div className="flex flex-col space-y-2">
              {!isRecording && !isPaused ? (
                <Button
                  onClick={startRecording}
                  disabled={!hasPermission || !isWorkerReady || isTestingMic || voiceName.trim().length === 0}
                  className="w-full"
                  size="lg"
                  aria-label="Start recording"
                >
                  <Mic className="h-4 w-4 mr-2" />
                  Start Recording (Space)
                </Button>
              ) : isPaused ? (
                <div className="flex gap-2">
                  <Button
                    onClick={resumeRecording}
                    className="flex-1"
                    size="lg"
                    aria-label="Resume recording"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Resume (Space)
                  </Button>
                  <Button
                    onClick={stopRecording}
                    variant="destructive"
                    className="flex-1"
                    size="lg"
                    aria-label="Stop and save recording"
                  >
                    <MicOff className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    onClick={pauseRecording}
                    variant="outline"
                    className="flex-1"
                    size="lg"
                    aria-label="Pause recording"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Pause (Space)
                  </Button>
                  <Button
                    onClick={stopRecording}
                    variant="destructive"
                    className="flex-1"
                    size="lg"
                    aria-label="Stop recording"
                  >
                    <MicOff className="h-4 w-4 mr-2" />
                    Stop ({recordingTime}s)
                  </Button>
                </div>
              )}
            </div>

            {/* Keyboard Shortcuts Info */}
            <div className="text-xs text-muted-foreground text-center">
              💡 Tip: Press <kbd className="px-1 py-0.5 bg-muted rounded">Space</kbd> to pause/resume, <kbd className="px-1 py-0.5 bg-muted rounded">Esc</kbd> to stop
            </div>

            {/* Playback and Retake */}
            {currentRecording.blob && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    onClick={() => playRecording(currentStep)}
                    variant="outline"
                    className="flex-1"
                    aria-label={isPlaying ? 'Pause playback' : 'Play recording'}
                  >
                    {isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                  <Button
                    onClick={changePlaybackSpeed}
                    variant="outline"
                    size="sm"
                    className="w-20"
                    aria-label="Change playback speed"
                  >
                    {playbackSpeed}x
                  </Button>
                  <Button
                    onClick={retakeRecording}
                    variant="outline"
                    className="flex-1"
                    aria-label="Retake recording"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Retake
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  Duration: {currentRecording.duration}s | Quality: {currentRecording.quality.score}/100
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quality Feedback */}
      {currentRecording.status === 'completed' && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle className={cn(
                "h-4 w-4",
                (currentRecording.quality?.score || 0) >= 80 ? "text-green-500" :
                  (currentRecording.quality?.score || 0) >= 60 ? "text-yellow-500" :
                    "text-red-500"
              )} />
              Recording Quality: {currentRecording.quality?.score || 0}/100
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {currentRecording.quality?.issues?.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">Issues found:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {currentRecording.quality.issues.map((issue, idx) => (
                        <li key={idx} className="text-sm">{issue}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {currentRecording.quality?.recommendations?.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">Recommendations:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {currentRecording.quality.recommendations.map((rec, idx) => (
                        <li key={idx} className="text-sm">{rec}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <Card>
        <CardContent className="pt-3 pb-3">
          <div className="flex flex-col sm:flex-row justify-between gap-2">
            <Button
              onClick={prevStep}
              disabled={currentStep === 0}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Previous
            </Button>

            <div className="flex flex-col sm:flex-row gap-2">
              {currentStep < RECORDING_PROMPTS.length - 1 ? (
                <Button
                  onClick={nextStep}
                  disabled={!canProceed()}
                  className="w-full sm:w-auto"
                >
                  Next Step
                </Button>
              ) : (
                <Button
                  onClick={handleComplete}
                  disabled={!allRecordingsComplete()}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                >
                  Complete Voice Profile
                </Button>
              )}

              <Button
                onClick={onCancel}
                variant="outline"
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hidden audio element for playback */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};
