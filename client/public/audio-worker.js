// Audio processing web worker
class AudioProcessor {
  constructor() {
    this.audioContext = null;
  }

  async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (self.AudioContext || self.webkitAudioContext)({
        sampleRate: 44100
      });
    }
    return this.audioContext;
  }

  async combineAudioBuffers(audioBuffersData) {
    try {
      const audioContext = await this.initializeAudioContext();
      const audioBuffers = [];
      
      // Convert array buffer data back to AudioBuffers
      for (const bufferData of audioBuffersData) {
        const audioBuffer = audioContext.createBuffer(
          bufferData.numberOfChannels,
          bufferData.length,
          bufferData.sampleRate
        );
        
        for (let channel = 0; channel < bufferData.numberOfChannels; channel++) {
          audioBuffer.copyToChannel(new Float32Array(bufferData.channelData[channel]), channel);
        }
        
        audioBuffers.push(audioBuffer);
      }

      if (audioBuffers.length === 0) {
        throw new Error('No audio buffers to combine');
      }

      if (audioBuffers.length === 1) {
        return this.audioBufferToWAV(audioBuffers[0]);
      }

      // Calculate total length
      const totalLength = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
      
      // Create combined buffer (mono for voice cloning)
      const combinedBuffer = audioContext.createBuffer(1, totalLength, 44100);
      const combinedChannelData = combinedBuffer.getChannelData(0);

      let offset = 0;
      for (const buffer of audioBuffers) {
        // Convert to mono if needed
        const monoData = this.convertToMono(buffer);
        
        // Resample if needed
        const resampledData = this.resample(monoData, buffer.sampleRate, 44100);
        
        combinedChannelData.set(resampledData, offset);
        offset += resampledData.length;
      }

      // Apply audio enhancements
      this.normalizeAudio(combinedChannelData);
      this.applyHighPassFilter(combinedChannelData, 44100, 80);

      return this.audioBufferToWAV(combinedBuffer);
    } catch (error) {
      throw new Error(`Audio combination failed: ${error.message}`);
    }
  }

  convertToMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0);
    }

    const monoData = new Float32Array(audioBuffer.length);
    for (let i = 0; i < audioBuffer.length; i++) {
      let sum = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        sum += audioBuffer.getChannelData(channel)[i];
      }
      monoData[i] = sum / audioBuffer.numberOfChannels;
    }
    return monoData;
  }

  resample(inputData, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      return inputData;
    }

    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.floor(inputData.length / ratio);
    const outputData = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const inputIndex = i * ratio;
      const index = Math.floor(inputIndex);
      const fraction = inputIndex - index;

      if (index + 1 < inputData.length) {
        // Linear interpolation
        outputData[i] = inputData[index] * (1 - fraction) + inputData[index + 1] * fraction;
      } else {
        outputData[i] = inputData[index];
      }
    }

    return outputData;
  }

  normalizeAudio(audioData) {
    // Find peak amplitude
    let peak = 0;
    for (let i = 0; i < audioData.length; i++) {
      peak = Math.max(peak, Math.abs(audioData[i]));
    }

    if (peak === 0) return;

    // Normalize to -3dB (0.707 amplitude) to prevent clipping
    const targetAmplitude = 0.707;
    const gain = targetAmplitude / peak;

    for (let i = 0; i < audioData.length; i++) {
      audioData[i] *= gain;
    }
  }

  applyHighPassFilter(audioData, sampleRate, cutoffFreq) {
    // Simple high-pass filter to remove low-frequency noise
    const rc = 1.0 / (cutoffFreq * 2 * Math.PI);
    const dt = 1.0 / sampleRate;
    const alpha = rc / (rc + dt);

    let previousInput = 0;
    let previousOutput = 0;

    for (let i = 0; i < audioData.length; i++) {
      const currentInput = audioData[i];
      const currentOutput = alpha * (previousOutput + currentInput - previousInput);
      
      audioData[i] = currentOutput;
      
      previousInput = currentInput;
      previousOutput = currentOutput;
    }
  }

  audioBufferToWAV(audioBuffer) {
    const length = audioBuffer.length;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }

    return arrayBuffer;
  }

  async analyzeAudioQuality(audioBufferData) {
    try {
      const audioContext = await this.initializeAudioContext();
      const audioBuffer = audioContext.createBuffer(
        audioBufferData.numberOfChannels,
        audioBufferData.length,
        audioBufferData.sampleRate
      );
      
      for (let channel = 0; channel < audioBufferData.numberOfChannels; channel++) {
        audioBuffer.copyToChannel(new Float32Array(audioBufferData.channelData[channel]), channel);
      }

      const channelData = audioBuffer.getChannelData(0);
      const duration = audioBuffer.duration;
      
      // Calculate RMS (volume level)
      let rms = 0;
      for (let i = 0; i < channelData.length; i++) {
        rms += channelData[i] * channelData[i];
      }
      rms = Math.sqrt(rms / channelData.length);

      // Calculate peak amplitude
      let peak = 0;
      for (let i = 0; i < channelData.length; i++) {
        peak = Math.max(peak, Math.abs(channelData[i]));
      }

      // Check for silence (very low RMS)
      const isSilent = rms < 0.01;
      
      // Check for clipping (peak near 1.0)
      const isClipped = peak > 0.95;

      return {
        duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        rms,
        peak,
        isSilent,
        isClipped,
        qualityScore: this.calculateQualityScore(duration, rms, peak, audioBuffer.sampleRate)
      };
    } catch (error) {
      throw new Error(`Audio analysis failed: ${error.message}`);
    }
  }

  calculateQualityScore(duration, rms, peak, sampleRate) {
    let score = 100;

    // Duration scoring
    if (duration < 5) score -= 30; // Too short
    else if (duration < 10) score -= 15;
    else if (duration > 1800) score -= 20; // Too long (30+ minutes)

    // Volume scoring
    if (rms < 0.01) score -= 40; // Too quiet
    else if (rms < 0.05) score -= 20;
    else if (rms > 0.5) score -= 10; // Too loud

    // Peak scoring (clipping detection)
    if (peak > 0.95) score -= 30; // Likely clipped

    // Sample rate scoring
    if (sampleRate < 22050) score -= 25; // Low quality
    else if (sampleRate < 44100) score -= 10;

    return Math.max(0, Math.min(100, score));
  }
}

const processor = new AudioProcessor();

// Handle messages from main thread
self.onmessage = async function(e) {
  const { type, data, id } = e.data;

  try {
    let result;
    
    switch (type) {
      case 'combineAudio':
        result = await processor.combineAudioBuffers(data.audioBuffers);
        break;
      case 'analyzeQuality':
        result = await processor.analyzeAudioQuality(data.audioBuffer);
        break;
      default:
        throw new Error(`Unknown operation: ${type}`);
    }

    self.postMessage({
      type: 'success',
      id,
      result
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error.message
    });
  }
};
