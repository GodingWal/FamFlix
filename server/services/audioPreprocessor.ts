import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';

interface AudioMetrics {
  duration: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  peakLevel: number;
  rmsLevel: number;
  silenceRatio: number;
}

interface PreprocessingResult {
  outputPath: string;
  metrics: AudioMetrics;
  wasNormalized: boolean;
  wasDenoised: boolean;
  wasTrimmed: boolean;
}

export class AudioPreprocessor {
  private tempDir: string;

  constructor() {
    this.tempDir = path.resolve(process.cwd(), 'temp', 'audio-processing');
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async preprocessForVoiceCloning(inputPath: string): Promise<PreprocessingResult> {
    const metrics = await this.analyzeAudio(inputPath);
    
    let currentPath = inputPath;
    let wasNormalized = false;
    let wasDenoised = false;
    let wasTrimmed = false;

    if (metrics.silenceRatio > 0.3) {
      currentPath = await this.trimSilence(currentPath);
      wasTrimmed = true;
    }

    if (metrics.rmsLevel < 0.1 || metrics.peakLevel < 0.5) {
      currentPath = await this.normalizeAudio(currentPath);
      wasNormalized = true;
    }

    if (metrics.rmsLevel > 0 && (metrics.peakLevel / metrics.rmsLevel) < 3) {
      currentPath = await this.applyNoiseReduction(currentPath);
      wasDenoised = true;
    }

    currentPath = await this.convertToOptimalFormat(currentPath);

    const finalMetrics = await this.analyzeAudio(currentPath);

    return {
      outputPath: currentPath,
      metrics: finalMetrics,
      wasNormalized,
      wasDenoised,
      wasTrimmed
    };
  }

  async analyzeAudio(inputPath: string): Promise<AudioMetrics> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-af', 'volumedetect,silencedetect=noise=-30dB:d=0.5',
        '-f', 'null',
        '-'
      ];

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        const duration = durationMatch 
          ? parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3])
          : 0;

        const sampleRateMatch = stderr.match(/(\d+) Hz/);
        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1]) : 44100;

        const channelsMatch = stderr.match(/(\d+) channels|mono|stereo/i);
        let channels = 1;
        if (channelsMatch) {
          if (channelsMatch[0].toLowerCase() === 'stereo') channels = 2;
          else if (channelsMatch[1]) channels = parseInt(channelsMatch[1]);
        }

        const peakMatch = stderr.match(/max_volume: ([-\d.]+) dB/);
        const peakLevel = peakMatch ? Math.pow(10, parseFloat(peakMatch[1]) / 20) : 0.5;

        const meanMatch = stderr.match(/mean_volume: ([-\d.]+) dB/);
        const rmsLevel = meanMatch ? Math.pow(10, parseFloat(meanMatch[1]) / 20) : 0.1;

        const silenceMatches = stderr.match(/silence_end/g);
        const silenceCount = silenceMatches ? silenceMatches.length : 0;
        const silenceRatio = duration > 0 ? Math.min(1, silenceCount * 0.5 / duration) : 0;

        resolve({
          duration,
          sampleRate,
          channels,
          bitDepth: 16,
          peakLevel: Math.min(1, peakLevel),
          rmsLevel: Math.min(1, rmsLevel),
          silenceRatio
        });
      });

      proc.on('error', reject);
    });
  }

  async normalizeAudio(inputPath: string): Promise<string> {
    const outputPath = path.join(this.tempDir, `normalized-${nanoid(8)}.wav`);
    
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inputPath,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ar', '24000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
        outputPath
      ];

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`Normalization failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  async trimSilence(inputPath: string): Promise<string> {
    const outputPath = path.join(this.tempDir, `trimmed-${nanoid(8)}.wav`);
    
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inputPath,
        '-af', 'silenceremove=start_periods=1:start_silence=0.1:start_threshold=-40dB:stop_periods=-1:stop_silence=0.1:stop_threshold=-40dB',
        '-ar', '24000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
        outputPath
      ];

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`Silence trimming failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  async applyNoiseReduction(inputPath: string): Promise<string> {
    const outputPath = path.join(this.tempDir, `denoised-${nanoid(8)}.wav`);
    
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inputPath,
        '-af', 'highpass=f=80,lowpass=f=8000,afftdn=nf=-25',
        '-ar', '24000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
        outputPath
      ];

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`Noise reduction failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  async convertToOptimalFormat(inputPath: string): Promise<string> {
    const outputPath = path.join(this.tempDir, `optimized-${nanoid(8)}.wav`);
    
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inputPath,
        '-ar', '24000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
        '-f', 'wav',
        outputPath
      ];

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`Format conversion failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  async combineAudioFiles(inputPaths: string[]): Promise<string> {
    if (inputPaths.length === 0) {
      throw new Error('No audio files to combine');
    }
    
    if (inputPaths.length === 1) {
      return inputPaths[0];
    }

    const outputPath = path.join(this.tempDir, `combined-${nanoid(8)}.wav`);
    const listPath = path.join(this.tempDir, `filelist-${nanoid(8)}.txt`);
    
    const fileListContent = inputPaths
      .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n');
    
    fs.writeFileSync(listPath, fileListContent);
    
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-ar', '24000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
        outputPath
      ];

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        fs.unlinkSync(listPath);
        
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`Combining audio failed: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        try { fs.unlinkSync(listPath); } catch {}
        reject(err);
      });
    });
  }

  cleanup(filePath: string): void {
    try {
      if (filePath.startsWith(this.tempDir) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Failed to cleanup temp file:', filePath, error);
    }
  }
}

export const audioPreprocessor = new AudioPreprocessor();
