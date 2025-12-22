import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as os from "os";
import { exec, spawn } from "child_process";
import { promisify } from "util";
// @ts-ignore - p-limit and p-retry have built-in types but may have ESM/CJS issues
import pLimit from "p-limit";
// @ts-ignore
import pRetry from "p-retry";

const execPromise = promisify(exec);

const CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8MB limit for Gemini inline data

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptionResult {
  segments: TranscriptSegment[];
  fullText: string;
  duration: number;
}

// Helper function to check if error is rate limit or quota violation
function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

// Extract audio from video file using ffmpeg
async function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  const args = [
    '-i', videoPath,
    '-vn',              // No video
    '-acodec', 'pcm_s16le', // 16-bit PCM
    '-ar', '16000',     // 16kHz sample rate (good for speech)
    '-ac', '1',         // Mono
    '-y',               // Overwrite output
    outputPath
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg audio extraction failed with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

// Get media duration using ffprobe
async function getMediaDuration(filePath: string): Promise<number> {
  const { stdout } = await execPromise(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
  );
  return parseFloat(stdout.trim());
}

// Chunk audio file for Gemini's 8MB limit
async function chunkAudio(audioPath: string, mimeType: string = "audio/wav"): Promise<{ buffer: Buffer; startTime: number; endTime: number }[]> {
  const buffer = await fsp.readFile(audioPath);
  
  if (buffer.length <= CHUNK_SIZE_BYTES) {
    const duration = await getMediaDuration(audioPath);
    return [{ buffer, startTime: 0, endTime: duration }];
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-chunk-'));
  const ext = path.extname(audioPath) || '.wav';

  try {
    const duration = await getMediaDuration(audioPath);
    const numChunks = Math.ceil(buffer.length / CHUNK_SIZE_BYTES);
    const segmentDuration = duration / numChunks;

    const chunks: { buffer: Buffer; startTime: number; endTime: number }[] = [];

    for (let i = 0; i < numChunks; i++) {
      const outputPath = path.join(tempDir, `chunk_${i}${ext}`);
      const startTime = i * segmentDuration;
      const endTime = Math.min((i + 1) * segmentDuration, duration);

      await execPromise(
        `ffmpeg -i "${audioPath}" -ss ${startTime} -t ${segmentDuration} -c copy -avoid_negative_ts 1 -y "${outputPath}" 2>&1`
      );

      chunks.push({
        buffer: await fsp.readFile(outputPath),
        startTime,
        endTime
      });

      await fsp.unlink(outputPath);
    }

    return chunks;
  } finally {
    try {
      await fsp.rmdir(tempDir);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Parse Gemini's transcript response into segments
function parseTranscriptResponse(text: string, startOffset: number, endOffset: number): TranscriptSegment[] {
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((seg: any) => ({
        start: (seg.start ?? seg.startTime ?? 0) + startOffset,
        end: (seg.end ?? seg.endTime ?? endOffset) + startOffset,
        text: seg.text?.trim() || ''
      })).filter((s: TranscriptSegment) => s.text.length > 0);
    }
  } catch (e) {
    // Not JSON, parse as plain text
  }

  // If plain text, create a single segment for this chunk
  const cleanText = text.replace(/^(transcript|transcription|here is the transcript|the transcript is)?:?\s*/i, '').trim();
  if (cleanText.length > 0) {
    return [{
      start: startOffset,
      end: endOffset,
      text: cleanText
    }];
  }

  return [];
}

export class TranscriptionService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

    if (apiKey && baseUrl) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          apiVersion: "",
          baseUrl,
        },
      });
      console.log('[TranscriptionService] Initialized with Gemini AI integration');
    } else {
      console.warn('[TranscriptionService] Gemini AI integration not configured. Transcription will not be available.');
    }
  }

  isConfigured(): boolean {
    return this.ai !== null;
  }

  // Transcribe a video file
  async transcribeVideo(videoPath: string): Promise<TranscriptionResult> {
    if (!this.ai) {
      throw new Error('Transcription service is not configured. Gemini AI integration required.');
    }

    console.log('[TranscriptionService] Starting transcription for:', videoPath);

    // Create temp directory for audio extraction
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-'));
    const audioPath = path.join(tempDir, 'audio.wav');

    try {
      // Extract audio from video
      console.log('[TranscriptionService] Extracting audio...');
      await extractAudio(videoPath, audioPath);

      // Get total duration
      const duration = await getMediaDuration(audioPath);
      console.log('[TranscriptionService] Audio duration:', duration, 'seconds');

      // Chunk audio if needed
      console.log('[TranscriptionService] Chunking audio...');
      const chunks = await chunkAudio(audioPath);
      console.log('[TranscriptionService] Processing', chunks.length, 'chunk(s)');

      // Process chunks with rate limiting and retries
      const limit = pLimit(2); // Process up to 2 chunks concurrently
      const allSegments: TranscriptSegment[] = [];

      const chunkPromises = chunks.map((chunk, i) =>
        limit(() =>
          pRetry(
            async () => {
              try {
                console.log(`[TranscriptionService] Processing chunk ${i + 1}/${chunks.length}`);

                const prompt = `Transcribe this audio completely and accurately. 
Return ONLY the spoken words as plain text, with no extra commentary or formatting.
If there are multiple speakers, just transcribe what they say in order.
Do not add timestamps or speaker labels.`;

                const response = await this.ai!.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: [{
                    role: "user",
                    parts: [
                      { text: prompt },
                      { 
                        inlineData: { 
                          mimeType: "audio/wav", 
                          data: chunk.buffer.toString("base64") 
                        } 
                      }
                    ]
                  }]
                });

                const responseText = response.text || "";
                console.log(`[TranscriptionService] Chunk ${i + 1} transcribed:`, responseText.slice(0, 100) + '...');

                return parseTranscriptResponse(responseText, chunk.startTime, chunk.endTime);
              } catch (error: any) {
                if (isRateLimitError(error)) {
                  console.log(`[TranscriptionService] Rate limited on chunk ${i + 1}, retrying...`);
                  throw error;
                }
                throw new pRetry.AbortError(error);
              }
            },
            {
              retries: 7,
              minTimeout: 2000,
              maxTimeout: 128000,
              factor: 2,
            }
          )
        )
      );

      const chunkResults = await Promise.all(chunkPromises);
      for (const segments of chunkResults) {
        allSegments.push(...segments);
      }

      // Sort segments by start time
      allSegments.sort((a, b) => a.start - b.start);

      // Combine into full text
      const fullText = allSegments.map(s => s.text).join(' ');

      console.log('[TranscriptionService] Transcription complete:', fullText.length, 'characters');

      return {
        segments: allSegments,
        fullText,
        duration
      };
    } finally {
      // Cleanup temp files
      try {
        if (fs.existsSync(audioPath)) {
          await fsp.unlink(audioPath);
        }
        await fsp.rmdir(tempDir);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  // Transcribe from audio file directly
  async transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
    if (!this.ai) {
      throw new Error('Transcription service is not configured. Gemini AI integration required.');
    }

    console.log('[TranscriptionService] Starting audio transcription for:', audioPath);

    const duration = await getMediaDuration(audioPath);
    const chunks = await chunkAudio(audioPath);

    const limit = pLimit(2);
    const allSegments: TranscriptSegment[] = [];

    const chunkPromises = chunks.map((chunk, i) =>
      limit(() =>
        pRetry(
          async () => {
            try {
              const prompt = `Transcribe this audio completely and accurately. Return ONLY the spoken words as plain text.`;

              const response = await this.ai!.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{
                  role: "user",
                  parts: [
                    { text: prompt },
                    { 
                      inlineData: { 
                        mimeType: "audio/wav", 
                        data: chunk.buffer.toString("base64") 
                      } 
                    }
                  ]
                }]
              });

              return parseTranscriptResponse(response.text || "", chunk.startTime, chunk.endTime);
            } catch (error: any) {
              if (isRateLimitError(error)) {
                throw error;
              }
              throw new pRetry.AbortError(error);
            }
          },
          {
            retries: 7,
            minTimeout: 2000,
            maxTimeout: 128000,
            factor: 2,
          }
        )
      )
    );

    const chunkResults = await Promise.all(chunkPromises);
    for (const segments of chunkResults) {
      allSegments.push(...segments);
    }

    allSegments.sort((a, b) => a.start - b.start);
    const fullText = allSegments.map(s => s.text).join(' ');

    return {
      segments: allSegments,
      fullText,
      duration
    };
  }
}

export const transcriptionService = new TranscriptionService();
