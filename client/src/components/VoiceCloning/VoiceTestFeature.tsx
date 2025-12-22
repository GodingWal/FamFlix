import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  Pause, 
  Volume2, 
  Loader2, 
  ThumbsUp, 
  ThumbsDown,
  RefreshCw,
  Sparkles,
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

interface VoiceProfile {
  id: string;
  name: string;
  status: string;
  qualityScore?: number;
  createdAt?: string;
  familyId?: string;
  audioSampleUrl?: string;
  metadata?: Record<string, any> | null;
}

interface VoiceTestFeatureProps {
  voiceProfileId?: string;
  voiceName?: string;
  voiceProfiles?: VoiceProfile[];
  selectedVoiceId?: string | null;
  onVoiceSelect?: (voice: VoiceProfile) => void;
  onRatingSubmit?: (rating: number, feedback: string) => void;
  className?: string;
}

const TEST_PHRASES = [
  "Hello! This is a test of my cloned voice. I hope it sounds just like me!",
  "The quick brown fox jumps over the lazy dog near the riverbank.",
  "Today is a wonderful day for exploring new places and meeting new friends.",
  "Can you believe how amazing this voice cloning technology is? It's incredible!",
  "Remember to always stay curious and keep learning new things every day."
];

export const VoiceTestFeature: React.FC<VoiceTestFeatureProps> = ({
  voiceProfileId: directVoiceProfileId,
  voiceName: directVoiceName,
  voiceProfiles = [],
  selectedVoiceId,
  onVoiceSelect,
  onRatingSubmit,
  className
}) => {
  const [customText, setCustomText] = useState('');
  const [selectedPhrase, setSelectedPhrase] = useState(TEST_PHRASES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [generationTime, setGenerationTime] = useState<number | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);

  // Determine the active voice profile
  const activeVoiceId = directVoiceProfileId || selectedVoiceId || internalSelectedId || voiceProfiles[0]?.id;
  const activeVoice = voiceProfiles.find(p => p.id === activeVoiceId);
  const voiceProfileId = activeVoiceId || '';
  const voiceName = directVoiceName || activeVoice?.name || 'Voice';

  const handleVoiceChange = (id: string) => {
    setInternalSelectedId(id);
    const voice = voiceProfiles.find(p => p.id === id);
    if (voice && onVoiceSelect) {
      onVoiceSelect(voice);
    }
    // Clear previous audio when switching voices
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  const generateTestAudio = async (text: string) => {
    // Compute the current voice ID at call time to avoid stale closure issues
    const currentVoiceId = directVoiceProfileId || selectedVoiceId || internalSelectedId || voiceProfiles[0]?.id || '';
    
    if (!currentVoiceId) {
      toast({
        title: 'No voice selected',
        description: 'Please select a voice profile first.',
        variant: 'destructive'
      });
      return;
    }

    if (!text.trim()) {
      toast({
        title: 'Enter some text',
        description: 'Please enter or select text to test your voice.',
        variant: 'destructive'
      });
      return;
    }

    setIsGenerating(true);
    setAudioUrl(null);
    const startTime = Date.now();

    try {
      const response = await apiRequest('POST', '/api/voice-profiles/test', {
        voiceProfileId: currentVoiceId,
        text: text.trim()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate test audio');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setGenerationTime((Date.now() - startTime) / 1000);

      toast({
        title: 'Test audio ready!',
        description: 'Click play to hear your cloned voice.'
      });
    } catch (error: any) {
      console.error('Voice test generation failed:', error);
      toast({
        title: 'Generation failed',
        description: error.message || 'Could not generate test audio. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const submitRating = () => {
    if (rating === null) {
      toast({
        title: 'Rate the quality',
        description: 'Please select a rating before submitting.',
        variant: 'destructive'
      });
      return;
    }

    onRatingSubmit?.(rating, feedback);
    
    toast({
      title: 'Feedback submitted',
      description: 'Thank you for rating your voice clone!'
    });
  };

  const textToGenerate = customText.trim() || selectedPhrase;

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Test Your Voice Clone
        </CardTitle>
        <CardDescription>
          Preview how "{voiceName}" sounds with different phrases
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Voice Profile Selector (when multiple profiles available) */}
        {voiceProfiles.length > 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Select a voice:</label>
            <div className="flex flex-wrap gap-2">
              {voiceProfiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleVoiceChange(profile.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-sm transition-colors",
                    activeVoiceId === profile.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {profile.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Select a test phrase:</label>
          <div className="grid gap-2">
            {TEST_PHRASES.map((phrase, index) => (
              <button
                key={index}
                onClick={() => {
                  setSelectedPhrase(phrase);
                  setCustomText('');
                }}
                className={cn(
                  "text-left p-3 rounded-lg border text-sm transition-colors",
                  selectedPhrase === phrase && !customText
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Or enter custom text:</label>
          <Textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Type anything you want to hear in your cloned voice..."
            className="min-h-[80px]"
            maxLength={500}
          />
          <div className="text-xs text-muted-foreground text-right">
            {customText.length}/500 characters
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={() => generateTestAudio(textToGenerate)}
            disabled={isGenerating || !textToGenerate.trim()}
            className="flex-1"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Test Audio
              </>
            )}
          </Button>
          
          {audioUrl && (
            <Button
              variant="outline"
              onClick={() => generateTestAudio(textToGenerate)}
              disabled={isGenerating}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {audioUrl && (
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={togglePlayback}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <div>
                  <p className="text-sm font-medium">Test Audio Ready</p>
                  <p className="text-xs text-muted-foreground">
                    Generated in {generationTime?.toFixed(1)}s
                  </p>
                </div>
              </div>
              <Volume2 className="h-5 w-5 text-muted-foreground" />
            </div>

            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={handleAudioEnded}
              className="hidden"
            />

            <div className="space-y-3 pt-2 border-t">
              <label className="text-sm font-medium">Rate the quality:</label>
              <div className="flex gap-1 justify-center">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setRating(value)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      rating !== null && rating >= value
                        ? "text-yellow-500"
                        : "text-muted-foreground hover:text-yellow-400"
                    )}
                  >
                    <Star 
                      className={cn(
                        "h-6 w-6",
                        rating !== null && rating >= value && "fill-current"
                      )} 
                    />
                  </button>
                ))}
              </div>

              <div className="flex gap-2 justify-center">
                <Button
                  variant={rating === 1 ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setRating(1)}
                >
                  <ThumbsDown className="h-4 w-4 mr-1" />
                  Poor
                </Button>
                <Button
                  variant={rating === 3 ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setRating(3)}
                >
                  Okay
                </Button>
                <Button
                  variant={rating === 5 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRating(5)}
                >
                  <ThumbsUp className="h-4 w-4 mr-1" />
                  Great
                </Button>
              </div>

              {rating !== null && (
                <div className="space-y-2">
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Optional: Tell us what could be improved..."
                    className="min-h-[60px]"
                  />
                  <Button 
                    onClick={submitRating} 
                    className="w-full"
                    size="sm"
                  >
                    Submit Feedback
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {rating !== null && rating <= 2 && (
          <Alert>
            <AlertDescription>
              If the voice doesn't sound right, try re-recording your samples in a quieter environment 
              with more varied speech patterns. Quality recordings lead to better voice clones!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
