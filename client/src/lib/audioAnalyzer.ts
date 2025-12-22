export interface AudioAnalysisResult {
  rmsLevel: number;
  peakLevel: number;
  dynamicRange: number;
  silenceRatio: number;
  clippingRatio: number;
  noiseFloor: number;
  signalToNoise: number;
  spectralCentroid: number;
  spectralFlatness: number;
  zeroCrossingRate: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
  recommendations: string[];
  score: number;
}

export interface RealTimeMetrics {
  level: number;
  peakLevel: number;
  isClipping: boolean;
  isTooQuiet: boolean;
  noiseLevel: number;
  speechDetected: boolean;
}

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private noiseProfile: Float32Array | null = null;
  
  constructor() {
    this.initContext();
  }

  private initContext() {
    if (typeof window !== 'undefined' && !this.audioContext) {
      this.audioContext = new AudioContext();
    }
  }

  async analyzeBlob(blob: Blob): Promise<AudioAnalysisResult> {
    this.initContext();
    if (!this.audioContext) {
      throw new Error('AudioContext not available');
    }

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    return this.analyzeBuffer(audioBuffer);
  }

  analyzeBuffer(audioBuffer: AudioBuffer): AudioAnalysisResult {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    const rmsLevel = this.calculateRMS(channelData);
    const peakLevel = this.calculatePeak(channelData);
    const dynamicRange = this.calculateDynamicRange(channelData);
    const silenceRatio = this.calculateSilenceRatio(channelData, 0.01);
    const clippingRatio = this.calculateClippingRatio(channelData, 0.99);
    const noiseFloor = this.estimateNoiseFloor(channelData);
    const signalToNoise = rmsLevel > 0 ? 20 * Math.log10(rmsLevel / Math.max(noiseFloor, 0.0001)) : 0;
    const spectralCentroid = this.calculateSpectralCentroid(channelData, sampleRate);
    const spectralFlatness = this.calculateSpectralFlatness(channelData);
    const zeroCrossingRate = this.calculateZeroCrossingRate(channelData);
    
    const { quality, issues, recommendations, score } = this.assessQuality({
      rmsLevel,
      peakLevel,
      dynamicRange,
      silenceRatio,
      clippingRatio,
      noiseFloor,
      signalToNoise,
      spectralCentroid,
      spectralFlatness,
      zeroCrossingRate,
      sampleRate
    });

    return {
      rmsLevel,
      peakLevel,
      dynamicRange,
      silenceRatio,
      clippingRatio,
      noiseFloor,
      signalToNoise,
      spectralCentroid,
      spectralFlatness,
      zeroCrossingRate,
      quality,
      issues,
      recommendations,
      score
    };
  }

  createRealTimeAnalyzer(stream: MediaStream): {
    getMetrics: () => RealTimeMetrics;
    destroy: () => void;
  } {
    this.initContext();
    if (!this.audioContext) {
      throw new Error('AudioContext not available');
    }

    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);
    
    let peakHold = 0;
    let noiseEstimate = 0.1;
    let speechCounter = 0;

    const getMetrics = (): RealTimeMetrics => {
      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(freqData);
      
      let sumSquares = 0;
      let max = 0;
      
      for (let i = 0; i < timeData.length; i++) {
        const normalized = (timeData[i] - 128) / 128;
        sumSquares += normalized * normalized;
        max = Math.max(max, Math.abs(normalized));
      }
      
      const rms = Math.sqrt(sumSquares / timeData.length);
      const level = Math.min(1, rms * 3);
      
      peakHold = Math.max(peakHold * 0.95, max);
      
      const avgFreq = freqData.reduce((a, b) => a + b, 0) / freqData.length / 255;
      
      if (level < 0.05) {
        noiseEstimate = noiseEstimate * 0.99 + level * 0.01;
      }
      
      const isSpeech = level > noiseEstimate * 3 && avgFreq > 0.1;
      speechCounter = isSpeech ? Math.min(10, speechCounter + 1) : Math.max(0, speechCounter - 1);
      
      return {
        level,
        peakLevel: peakHold,
        isClipping: max > 0.95,
        isTooQuiet: level < 0.05 && speechCounter === 0,
        noiseLevel: noiseEstimate,
        speechDetected: speechCounter > 3
      };
    };

    const destroy = () => {
      source.disconnect();
    };

    return { getMetrics, destroy };
  }

  captureNoiseProfile(channelData: Float32Array): void {
    this.noiseProfile = new Float32Array(256);
    const fft = this.simpleFFT(channelData.slice(0, 2048));
    for (let i = 0; i < 256; i++) {
      this.noiseProfile[i] = fft[i] || 0;
    }
  }

  private calculateRMS(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }

  private calculatePeak(data: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
    return peak;
  }

  private calculateDynamicRange(data: Float32Array): number {
    const windowSize = Math.floor(data.length / 100);
    const rmsValues: number[] = [];
    
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        sum += data[i + j] * data[i + j];
      }
      rmsValues.push(Math.sqrt(sum / windowSize));
    }
    
    rmsValues.sort((a, b) => a - b);
    const low = rmsValues[Math.floor(rmsValues.length * 0.1)] || 0.0001;
    const high = rmsValues[Math.floor(rmsValues.length * 0.9)] || 0.0001;
    
    return 20 * Math.log10(high / Math.max(low, 0.0001));
  }

  private calculateSilenceRatio(data: Float32Array, threshold: number): number {
    let silentSamples = 0;
    const windowSize = 1024;
    
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        sum += Math.abs(data[i + j]);
      }
      if (sum / windowSize < threshold) {
        silentSamples += windowSize;
      }
    }
    
    return silentSamples / data.length;
  }

  private calculateClippingRatio(data: Float32Array, threshold: number): number {
    let clippedSamples = 0;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) {
        clippedSamples++;
      }
    }
    return clippedSamples / data.length;
  }

  private estimateNoiseFloor(data: Float32Array): number {
    const windowSize = 1024;
    const windowRMS: number[] = [];
    
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        sum += data[i + j] * data[i + j];
      }
      windowRMS.push(Math.sqrt(sum / windowSize));
    }
    
    windowRMS.sort((a, b) => a - b);
    const percentile10 = windowRMS[Math.floor(windowRMS.length * 0.1)] || 0;
    return percentile10;
  }

  private calculateSpectralCentroid(data: Float32Array, sampleRate: number): number {
    const fft = this.simpleFFT(data.slice(0, Math.min(4096, data.length)));
    
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < fft.length; i++) {
      const frequency = (i * sampleRate) / (fft.length * 2);
      weightedSum += frequency * fft[i];
      magnitudeSum += fft[i];
    }
    
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  private calculateSpectralFlatness(data: Float32Array): number {
    const fft = this.simpleFFT(data.slice(0, Math.min(4096, data.length)));
    
    let geometricMean = 0;
    let arithmeticMean = 0;
    let count = 0;
    
    for (let i = 1; i < fft.length; i++) {
      if (fft[i] > 0.0001) {
        geometricMean += Math.log(fft[i]);
        arithmeticMean += fft[i];
        count++;
      }
    }
    
    if (count === 0) return 0;
    
    geometricMean = Math.exp(geometricMean / count);
    arithmeticMean = arithmeticMean / count;
    
    return arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
  }

  private calculateZeroCrossingRate(data: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < data.length; i++) {
      if ((data[i] >= 0) !== (data[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / data.length;
  }

  private simpleFFT(data: Float32Array): Float32Array {
    const n = Math.min(data.length, 4096);
    const result = new Float32Array(n / 2);
    
    for (let k = 0; k < n / 2; k++) {
      let real = 0;
      let imag = 0;
      
      for (let t = 0; t < n; t++) {
        const angle = (2 * Math.PI * k * t) / n;
        real += data[t] * Math.cos(angle);
        imag -= data[t] * Math.sin(angle);
      }
      
      result[k] = Math.sqrt(real * real + imag * imag) / n;
    }
    
    return result;
  }

  private assessQuality(metrics: {
    rmsLevel: number;
    peakLevel: number;
    dynamicRange: number;
    silenceRatio: number;
    clippingRatio: number;
    noiseFloor: number;
    signalToNoise: number;
    spectralCentroid: number;
    spectralFlatness: number;
    zeroCrossingRate: number;
    sampleRate: number;
  }): { quality: 'excellent' | 'good' | 'fair' | 'poor'; issues: string[]; recommendations: string[]; score: number } {
    let score = 100;
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (metrics.clippingRatio > 0.01) {
      score -= 30;
      issues.push('Audio is clipping (distortion detected)');
      recommendations.push('Move further from the microphone or reduce input volume');
    } else if (metrics.clippingRatio > 0.001) {
      score -= 15;
      issues.push('Minor audio clipping detected');
      recommendations.push('Slightly reduce your speaking volume');
    }

    if (metrics.rmsLevel < 0.02) {
      score -= 30;
      issues.push('Recording volume is too low');
      recommendations.push('Speak louder or move closer to the microphone');
    } else if (metrics.rmsLevel < 0.05) {
      score -= 15;
      issues.push('Recording volume could be higher');
      recommendations.push('Try speaking slightly louder');
    }

    if (metrics.silenceRatio > 0.5) {
      score -= 25;
      issues.push('Too much silence in recording');
      recommendations.push('Speak continuously without long pauses');
    } else if (metrics.silenceRatio > 0.3) {
      score -= 10;
      issues.push('Recording contains extended silent periods');
      recommendations.push('Try to minimize pauses between phrases');
    }

    if (metrics.signalToNoise < 10) {
      score -= 30;
      issues.push('High background noise detected');
      recommendations.push('Record in a quieter environment or use a better microphone');
    } else if (metrics.signalToNoise < 20) {
      score -= 15;
      issues.push('Some background noise present');
      recommendations.push('Try recording in a quieter room');
    }

    if (metrics.dynamicRange < 6) {
      score -= 10;
      issues.push('Limited dynamic range (monotone)');
      recommendations.push('Try varying your pitch and emphasis while speaking');
    }

    if (metrics.spectralCentroid < 200) {
      score -= 10;
      issues.push('Voice sounds muffled');
      recommendations.push('Ensure microphone is not covered and speak clearly');
    }

    if (metrics.sampleRate < 44100) {
      score -= 5;
      issues.push('Recording quality could be higher');
      recommendations.push('Check microphone settings for higher sample rate');
    }

    score = Math.max(0, Math.min(100, score));

    let quality: 'excellent' | 'good' | 'fair' | 'poor';
    if (score >= 85) quality = 'excellent';
    else if (score >= 70) quality = 'good';
    else if (score >= 50) quality = 'fair';
    else quality = 'poor';

    return { quality, issues, recommendations, score };
  }

  destroy(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const audioAnalyzer = new AudioAnalyzer();
