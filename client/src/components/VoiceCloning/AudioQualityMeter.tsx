import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Mic, Volume2, VolumeX } from 'lucide-react';
import type { RealTimeMetrics } from '@/lib/audioAnalyzer';

interface AudioQualityMeterProps {
  stream: MediaStream | null;
  isRecording: boolean;
  className?: string;
}

export const AudioQualityMeter: React.FC<AudioQualityMeterProps> = ({
  stream,
  isRecording,
  className
}) => {
  const [metrics, setMetrics] = useState<RealTimeMetrics>({
    level: 0,
    peakLevel: 0,
    isClipping: false,
    isTooQuiet: false,
    noiseLevel: 0,
    speechDetected: false
  });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const peakHoldRef = useRef(0);
  const noiseEstimateRef = useRef(0.1);
  const speechCounterRef = useRef(0);

  useEffect(() => {
    if (!stream || !isRecording) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setMetrics({
        level: 0,
        peakLevel: 0,
        isClipping: false,
        isTooQuiet: false,
        noiseLevel: 0,
        speechDetected: false
      });
      return;
    }

    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048;
    analyserRef.current.smoothingTimeConstant = 0.8;
    
    sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
    sourceRef.current.connect(analyserRef.current);

    const bufferLength = analyserRef.current.frequencyBinCount;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    const updateMetrics = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteTimeDomainData(timeData);
      analyserRef.current.getByteFrequencyData(freqData);
      
      let sumSquares = 0;
      let max = 0;
      
      for (let i = 0; i < timeData.length; i++) {
        const normalized = (timeData[i] - 128) / 128;
        sumSquares += normalized * normalized;
        max = Math.max(max, Math.abs(normalized));
      }
      
      const rms = Math.sqrt(sumSquares / timeData.length);
      const level = Math.min(1, rms * 3);
      
      peakHoldRef.current = Math.max(peakHoldRef.current * 0.95, max);
      
      const avgFreq = freqData.reduce((a, b) => a + b, 0) / freqData.length / 255;
      
      if (level < 0.05) {
        noiseEstimateRef.current = noiseEstimateRef.current * 0.99 + level * 0.01;
      }
      
      const isSpeech = level > noiseEstimateRef.current * 3 && avgFreq > 0.1;
      speechCounterRef.current = isSpeech 
        ? Math.min(10, speechCounterRef.current + 1) 
        : Math.max(0, speechCounterRef.current - 1);
      
      setMetrics({
        level,
        peakLevel: peakHoldRef.current,
        isClipping: max > 0.95,
        isTooQuiet: level < 0.05 && speechCounterRef.current === 0,
        noiseLevel: noiseEstimateRef.current,
        speechDetected: speechCounterRef.current > 3
      });

      animationRef.current = requestAnimationFrame(updateMetrics);
    };

    animationRef.current = requestAnimationFrame(updateMetrics);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream, isRecording]);

  const getLevelColor = () => {
    if (metrics.isClipping) return 'bg-red-500';
    if (metrics.isTooQuiet) return 'bg-yellow-500';
    if (metrics.level > 0.7) return 'bg-orange-500';
    if (metrics.level > 0.3) return 'bg-green-500';
    return 'bg-gray-400';
  };

  const getStatusIcon = () => {
    if (metrics.isClipping) {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    if (metrics.isTooQuiet) {
      return <VolumeX className="h-4 w-4 text-yellow-500" />;
    }
    if (metrics.speechDetected) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <Mic className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (metrics.isClipping) return 'Too loud! Move back';
    if (metrics.isTooQuiet) return 'Speak louder';
    if (metrics.speechDetected) return 'Perfect level';
    if (isRecording) return 'Waiting for speech...';
    return 'Ready';
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>
      
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Volume2 className="h-3 w-3 text-muted-foreground" />
          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn("h-full transition-all duration-75 rounded-full", getLevelColor())}
              style={{ width: `${Math.min(100, metrics.level * 100)}%` }}
            />
          </div>
        </div>
        
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Quiet</span>
          <span className="text-center">Optimal</span>
          <span>Loud</span>
        </div>
        
        <div className="flex gap-1 justify-center mt-1">
          {[0.2, 0.4, 0.6, 0.8].map((threshold, i) => (
            <div
              key={i}
              className={cn(
                "w-2 h-2 rounded-full transition-colors duration-75",
                metrics.level > threshold 
                  ? (threshold >= 0.8 ? 'bg-red-500' : threshold >= 0.6 ? 'bg-orange-500' : 'bg-green-500')
                  : 'bg-muted'
              )}
            />
          ))}
        </div>
      </div>

      {(metrics.isClipping || metrics.isTooQuiet) && (
        <div className={cn(
          "text-xs p-2 rounded-md",
          metrics.isClipping ? "bg-red-500/10 text-red-600" : "bg-yellow-500/10 text-yellow-600"
        )}>
          {metrics.isClipping 
            ? "Audio is distorting. Reduce volume or move away from mic."
            : "Recording is too quiet. Speak louder or move closer to mic."}
        </div>
      )}
    </div>
  );
};
