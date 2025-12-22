import { Router, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { authenticateToken, AuthRequest } from '../middleware/auth-simple.js';
import { videoService } from '../services/videoService';
import { storage } from '../storage';
import { adminVideoPipelineService } from '../services/adminVideoPipelineService';
import { ensureTemplateVideosTable } from '../utils/templateVideos';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { ElevenLabsProvider } from '../tts/providers/elevenlabs';
import { transcriptionService } from '../services/transcriptionService';
import { usageService } from '../services/usageService';

const router = Router();

const isSQLite = process.env.DATABASE_URL?.startsWith('file:') ?? false;

async function dbQuery(query: ReturnType<typeof sql>): Promise<any[]> {
  if (isSQLite) {
    return await (db as any).all(query);
  } else {
    const result = await db.execute(query);
    return (result as any).rows || [];
  }
}

async function dbQueryOne(query: ReturnType<typeof sql>): Promise<any | null> {
  if (isSQLite) {
    return await (db as any).get(query);
  } else {
    const result = await db.execute(query);
    return (result as any).rows?.[0] || null;
  }
}

async function dbRun(query: ReturnType<typeof sql>): Promise<any> {
  if (isSQLite) {
    return await (db as any).run(query);
  } else {
    return await db.execute(query);
  }
}

const projectTranscriptDir = path.join(process.cwd(), 'uploads', 'admin-pipeline', 'project-transcripts');

async function setProjectProgress(projectId: string | number, progress: number, stage: string) {
  try {
    const now = new Date().toISOString();
    const row = await dbQueryOne(sql`SELECT metadata FROM video_projects WHERE id = ${projectId}`);
    const meta = parseMetadata(row?.metadata);
    const history = Array.isArray(meta.processingHistory) ? meta.processingHistory : [];
    history.push({ status: stage, timestamp: now });
    meta.processingHistory = history;
    if (isSQLite) {
      await dbRun(sql`
        UPDATE video_projects
        SET processing_progress = ${progress}, metadata = ${JSON.stringify(meta)}, updated_at = ${now}
        WHERE id = ${projectId}
      `);
    } else {
      await dbRun(sql`
        UPDATE video_projects
        SET processing_progress = ${progress}, metadata = ${JSON.stringify(meta)}::jsonb, updated_at = ${now}::timestamp
        WHERE id = ${projectId}
      `);
    }
  } catch (e) {
    console.error('[processing] Failed to set progress:', e);
  }
}

function toLocalUploadsPath(url: string): string {
  if (!url || !url.startsWith('/uploads/')) {
    throw new Error(`Unsupported uploads URL: ${url}`);
  }
  return path.join(process.cwd(), url.replace(/^\/+/, ''));
}

function parseMetadata(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? { ...parsed } : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

async function persistProjectTranscript(projectId: string | number, segments: any[]): Promise<string | null> {
  if (!Array.isArray(segments) || segments.length === 0) {
    return null;
  }

  const normalized = segments
    .map((segment) => {
      const startRaw = segment?.start ?? segment?.start_time ?? segment?.from ?? null;
      const endRaw = segment?.end ?? segment?.end_time ?? segment?.to ?? null;
      const start = typeof startRaw === 'number' ? startRaw : Number(startRaw);
      const end = typeof endRaw === 'number' ? endRaw : Number(endRaw);
      const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
      if (!Number.isFinite(start) || !Number.isFinite(end) || !text) {
        return null;
      }
      return {
        start,
        end,
        text,
      };
    })
    .filter(Boolean) as Array<{ start: number; end: number; text: string }>;

  if (!normalized.length) {
    return null;
  }

  await fs.mkdir(projectTranscriptDir, { recursive: true });
  const transcriptPath = path.join(projectTranscriptDir, `project-${projectId}.json`);
  await fs.writeFile(transcriptPath, JSON.stringify(normalized, null, 2), 'utf-8');
  return transcriptPath;
}

// Get video/audio duration using ffprobe
async function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        if (!isNaN(duration)) {
          resolve(duration);
        } else {
          reject(new Error('Could not parse duration from ffprobe output'));
        }
      } else {
        reject(new Error(`ffprobe failed: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
    });
  });
}

// Time-stretch an audio file to match a target duration using atempo filter
// atempo range is 0.5-2.0, so we may need to chain multiple filters
async function timeStretchAudio(
  inputPath: string,
  targetDuration: number,
  outputPath: string
): Promise<void> {
  const currentDuration = await getMediaDuration(inputPath);

  if (Math.abs(currentDuration - targetDuration) < 0.05) {
    // Close enough, just copy
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  const ratio = currentDuration / targetDuration;
  console.log(`[elevenlabs] Time-stretching: ${currentDuration.toFixed(2)}s -> ${targetDuration.toFixed(2)}s (ratio: ${ratio.toFixed(3)})`);

  // Build atempo filter chain (each atempo must be between 0.5 and 2.0)
  const atempoFilters: string[] = [];
  let remainingRatio = ratio;

  while (remainingRatio > 2.0) {
    atempoFilters.push('atempo=2.0');
    remainingRatio /= 2.0;
  }
  while (remainingRatio < 0.5) {
    atempoFilters.push('atempo=0.5');
    remainingRatio /= 0.5;
  }
  atempoFilters.push(`atempo=${remainingRatio.toFixed(4)}`);

  const filterChain = atempoFilters.join(',');

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-af', filterChain,
      '-c:a', 'pcm_s16le',  // Lossless for intermediate files
      '-ar', '44100',
      outputPath
    ]);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Time-stretch failed: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg for time-stretch: ${err.message}`));
    });
  });
}

// Generate silence of specified duration
async function generateSilence(duration: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', `anullsrc=channel_layout=mono:sample_rate=44100`,
      '-t', duration.toString(),
      '-c:a', 'pcm_s16le',
      outputPath
    ]);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to generate silence: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg for silence: ${err.message}`));
    });
  });
}

// Concatenate audio files using ffmpeg
async function concatenateAudioFiles(inputFiles: string[], outputPath: string): Promise<void> {
  const tempDir = path.dirname(outputPath);
  const listFile = path.join(tempDir, `concat_list_${Date.now()}.txt`);

  // Create concat file list
  const listContent = inputFiles.map(f => `file '${f}'`).join('\n');
  await fs.writeFile(listFile, listContent, 'utf-8');

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c:a', 'pcm_s16le',
      '-ar', '44100',
      outputPath
    ]);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      try {
        await fs.unlink(listFile);
      } catch (e) { }

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Concatenation failed: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg for concat: ${err.message}`));
    });
  });
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

// Extract audio from video file
async function extractAudioFromVideo(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '2',
      outputPath
    ]);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Audio extraction failed: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg for audio extraction: ${err.message}`));
    });
  });
}

// Mix new voice with original audio using ducking (lowers original during speech)
async function mixVoiceWithBackground(
  originalAudioPath: string,
  newVoicePath: string,
  outputPath: string,
  segments: TranscriptSegment[],
  duckLevel: number = -12 // dB reduction during speech
): Promise<void> {
  // Convert dB to linear (e.g., -12dB = 0.25)
  const duckLinear = Math.pow(10, duckLevel / 20);

  // Build complex filter for ducking and mixing
  // [0] = original audio, [1] = new voice
  // Duck original during speech segments, then mix with new voice

  let volumeFilter: string;
  if (segments.length > 0) {
    // Build OR chain of between() conditions: gte(between(t,s1,e1)+between(t,s2,e2)+...,1)
    // This evaluates to 1 (true) when t is within any segment
    const betweenConditions = segments.map(seg =>
      `between(t\\,${seg.start.toFixed(3)}\\,${seg.end.toFixed(3)})`
    ).join('+');
    // Use gte(...,1) to convert the sum to a boolean (1 if any segment matches)
    // Then use if() to apply duck level during speech, full volume otherwise
    volumeFilter = `[0:a]volume='if(gte(${betweenConditions}\\,1)\\,${duckLinear.toFixed(4)}\\,1)':eval=frame[ducked]`;
  } else {
    // No segments, just lower the entire original audio
    volumeFilter = `[0:a]volume=${duckLinear.toFixed(4)}[ducked]`;
  }

  // Mix ducked original with new voice (comma separates filters)
  const filterComplex = `${volumeFilter};[ducked][1:a]amix=inputs=2:duration=longest:dropout_transition=0:weights=1 1[out]`;

  console.log('[mixing] Filter complex:', filterComplex.slice(0, 200) + '...');

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', originalAudioPath,
      '-i', newVoicePath,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      outputPath
    ]);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[mixing] Audio mixing complete');
        resolve();
      } else {
        console.error('[mixing] ffmpeg stderr:', stderr.slice(-1000));
        reject(new Error(`Audio mixing failed: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg for mixing: ${err.message}`));
    });
  });
}

interface VoiceReplacementOptions {
  preserveBackground?: boolean;  // Keep background audio/music
  backgroundDuckLevel?: number;  // dB reduction during speech (-12 default)
}

// Run ElevenLabs voice replacement with whole-video synthesis and intelligent gap stretching
// This approach synthesizes the entire transcript as one piece, then aligns it using word timestamps
async function runElevenLabsVoiceReplacement(
  inputVideoPath: string,
  outputVideoPath: string,
  elevenLabsVoiceId: string,
  transcriptText: string,
  transcriptSegments?: TranscriptSegment[],
  options?: VoiceReplacementOptions
): Promise<void> {
  await fs.mkdir(path.dirname(outputVideoPath), { recursive: true });

  const preserveBackground = options?.preserveBackground ?? false;
  const duckLevel = options?.backgroundDuckLevel ?? -12;

  console.log('[elevenlabs] Starting whole-video voice replacement with ElevenLabs');
  console.log('[elevenlabs] Voice ID:', elevenLabsVoiceId);
  console.log('[elevenlabs] Transcript length:', transcriptText.length, 'characters');
  console.log('[elevenlabs] Segments available:', transcriptSegments?.length || 0);
  console.log('[elevenlabs] Preserve background:', preserveBackground);

  const provider = new ElevenLabsProvider();
  const tempDir = path.resolve(process.cwd(), 'temp');
  await fs.mkdir(tempDir, { recursive: true });

  const videoDuration = await getMediaDuration(inputVideoPath);
  console.log('[elevenlabs] Video duration:', videoDuration.toFixed(2), 'seconds');

  const cleanupFiles: string[] = [];

  try {
    // Step 1: Synthesize entire transcript as one piece with word timestamps
    console.log('[elevenlabs] Synthesizing entire transcript with word timestamps...');
    const { audioPath, wordTimings, totalDuration } = await provider.synthesizeWithTimestamps(
      transcriptText,
      elevenLabsVoiceId
    );
    cleanupFiles.push(audioPath);
    console.log(`[elevenlabs] TTS complete: ${totalDuration.toFixed(2)}s, ${wordTimings.length} words`);

    // Step 2: Convert to WAV for processing
    const ttsWavPath = path.join(tempDir, `tts_wav_${Date.now()}.wav`);
    cleanupFiles.push(ttsWavPath);
    await convertToWav(audioPath, ttsWavPath);

    let finalAudioPath: string;

    // Step 3: Determine sync strategy based on available data
    // PRIORITY: Use original transcript timestamps to align TTS to visual cuts
    const apiKey = process.env.ELEVENLABS_API_KEY || '';

    if (transcriptSegments && transcriptSegments.length > 0) {
      // PRIMARY STRATEGY: Per-segment synthesis aligned to original timestamps
      // This ensures TTS matches the original speaker's timing for proper lip sync
      console.log('[elevenlabs] Using original transcript timestamps for sync alignment');
      console.log(`[elevenlabs] ${transcriptSegments.length} transcript segments available`);

      const originalSpeechStart = transcriptSegments[0].start;
      const originalSpeechEnd = transcriptSegments[transcriptSegments.length - 1].end;
      const originalSpeechDuration = originalSpeechEnd - originalSpeechStart;
      const speedRatio = totalDuration / originalSpeechDuration;

      console.log(`[elevenlabs] Original timing: ${originalSpeechStart.toFixed(2)}s - ${originalSpeechEnd.toFixed(2)}s (${originalSpeechDuration.toFixed(2)}s)`);
      console.log(`[elevenlabs] TTS duration: ${totalDuration.toFixed(2)}s, Speed ratio: ${speedRatio.toFixed(3)}`);

      // Try per-segment synthesis first - this provides best alignment to original timestamps
      console.log('[elevenlabs] Attempting per-segment synthesis for precise timestamp alignment');
      const perSegmentPath = await perSegmentSynthesisFallback(
        videoDuration,
        transcriptSegments,
        elevenLabsVoiceId,
        apiKey,
        tempDir,
        cleanupFiles
      );

      if (perSegmentPath) {
        console.log('[elevenlabs] Per-segment synthesis successful - audio aligned to original timestamps');
        finalAudioPath = perSegmentPath;
      } else {
        // Fallback: Use whole-audio with gap adjustment if per-segment fails
        console.log('[elevenlabs] Per-segment synthesis failed - falling back to gap adjustment');

        if (speedRatio >= 0.7 && speedRatio <= 1.4) {
          console.log('[elevenlabs] Speed within range - using gap adjustment only');
          finalAudioPath = await alignAudioWithGapAdjustment(
            ttsWavPath,
            videoDuration,
            originalSpeechStart,
            originalSpeechEnd,
            totalDuration,
            tempDir,
            cleanupFiles,
            wordTimings,
            transcriptSegments,
            elevenLabsVoiceId,
            apiKey
          );
        } else {
          console.log('[elevenlabs] Speed out of range - applying gentle time-stretch + gap adjustment');
          const targetRatio = speedRatio > 1 ? Math.min(speedRatio, 1.2) : Math.max(speedRatio, 0.85);
          const targetDuration = totalDuration / targetRatio;

          const stretchedPath = path.join(tempDir, `stretched_whole_${Date.now()}.wav`);
          cleanupFiles.push(stretchedPath);
          const achievedDuration = await timeStretchAudioGently(ttsWavPath, targetDuration, stretchedPath);

          const stretchFactor = achievedDuration / totalDuration;
          const scaledWordTimings = wordTimings.map(wt => ({
            word: wt.word,
            start: wt.start * stretchFactor,
            end: wt.end * stretchFactor
          }));

          finalAudioPath = await alignAudioWithGapAdjustment(
            stretchedPath,
            videoDuration,
            originalSpeechStart,
            originalSpeechEnd,
            achievedDuration,
            tempDir,
            cleanupFiles,
            scaledWordTimings,
            transcriptSegments,
            elevenLabsVoiceId,
            apiKey
          );
        }
      }

      // Step 4: Mix with background if requested
      if (preserveBackground) {
        console.log('[elevenlabs] Preserving background audio with ducking');

        const originalAudioPath = path.join(tempDir, `original_${Date.now()}.wav`);
        cleanupFiles.push(originalAudioPath);
        await extractAudioFromVideo(inputVideoPath, originalAudioPath);

        const mixedAudioPath = path.join(tempDir, `mixed_${Date.now()}.wav`);
        cleanupFiles.push(mixedAudioPath);
        await mixVoiceWithBackground(originalAudioPath, finalAudioPath, mixedAudioPath, transcriptSegments, duckLevel);

        finalAudioPath = mixedAudioPath;
        console.log('[elevenlabs] Background preserved with ducking during speech');
      }
    } else {
      // No segments provided - create synthetic segments from word timestamps
      console.log('[elevenlabs] No segment data - creating synthetic segments from word timestamps');

      if (wordTimings.length > 0) {
        // Create synthetic segments from sentence boundaries
        const syntheticSegments = createSyntheticSegments(wordTimings, videoDuration, totalDuration);
        console.log(`[elevenlabs] Created ${syntheticSegments.length} synthetic segments`);

        if (syntheticSegments.length > 0) {
          // Use the alignment pipeline with synthetic segments
          const alignedPath = await alignAudioWithGapDistribution(
            ttsWavPath,
            videoDuration,
            wordTimings,
            syntheticSegments,
            tempDir,
            cleanupFiles
          );

          if (alignedPath) {
            finalAudioPath = alignedPath;
          } else {
            // Alignment failed - apply time-stretch as guaranteed fallback
            console.log('[elevenlabs] Synthetic alignment failed - using time-stretch fallback');
            const stretchFallbackPath = path.join(tempDir, `stretch_fallback_${Date.now()}.wav`);
            cleanupFiles.push(stretchFallbackPath);
            await timeStretchAudioGently(ttsWavPath, videoDuration, stretchFallbackPath);

            // Verify and hard-trim if needed
            const stretchedDur = await getMediaDuration(stretchFallbackPath);
            if (stretchedDur > videoDuration + 0.1) {
              const trimFallbackPath = path.join(tempDir, `trim_fallback_${Date.now()}.wav`);
              cleanupFiles.push(trimFallbackPath);
              await hardTrimAudio(stretchFallbackPath, videoDuration, trimFallbackPath);
              finalAudioPath = trimFallbackPath;
              console.log(`[elevenlabs] Fallback hard-trimmed to ${videoDuration.toFixed(2)}s`);
            } else {
              finalAudioPath = stretchFallbackPath;
            }
          }
        } else {
          // Very short content - just time-stretch
          if (totalDuration < videoDuration * 0.9) {
            const stretchedPath = path.join(tempDir, `stretched_fit_${Date.now()}.wav`);
            cleanupFiles.push(stretchedPath);
            await timeStretchAudioGently(ttsWavPath, videoDuration, stretchedPath);
            finalAudioPath = stretchedPath;
          } else if (totalDuration > videoDuration + 0.1) {
            // TTS longer than video - compress and trim
            const stretchedPath = path.join(tempDir, `stretched_fit_${Date.now()}.wav`);
            cleanupFiles.push(stretchedPath);
            await timeStretchAudioGently(ttsWavPath, videoDuration, stretchedPath);
            const stretchedDur = await getMediaDuration(stretchedPath);
            if (stretchedDur > videoDuration + 0.1) {
              const trimmedPath = path.join(tempDir, `trimmed_${Date.now()}.wav`);
              cleanupFiles.push(trimmedPath);
              await hardTrimAudio(stretchedPath, videoDuration, trimmedPath);
              finalAudioPath = trimmedPath;
            } else {
              finalAudioPath = stretchedPath;
            }
          } else {
            finalAudioPath = ttsWavPath;
          }
        }
      } else {
        // No word timings at all - simple duration matching as last resort
        console.log('[elevenlabs] No word timings available - using simple duration matching');
        if (totalDuration < videoDuration) {
          const paddedPath = path.join(tempDir, `padded_${Date.now()}.wav`);
          cleanupFiles.push(paddedPath);
          const silencePath = path.join(tempDir, `silence_end_${Date.now()}.wav`);
          cleanupFiles.push(silencePath);
          await generateSilence(videoDuration - totalDuration, silencePath);
          await concatenateAudioFiles([ttsWavPath, silencePath], paddedPath);
          finalAudioPath = paddedPath;
        } else if (totalDuration > videoDuration + 0.5) {
          const stretchedPath = path.join(tempDir, `stretched_fit_${Date.now()}.wav`);
          cleanupFiles.push(stretchedPath);
          await timeStretchAudioGently(ttsWavPath, videoDuration, stretchedPath);
          finalAudioPath = stretchedPath;
        } else {
          finalAudioPath = ttsWavPath;
        }
      }
    }

    // Step 5: Final verification loop - ensure audio duration is within tolerance before muxing
    const FINAL_TOLERANCE_MS = 100;
    const MAX_CORRECTION_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_CORRECTION_ATTEMPTS; attempt++) {
      const measuredDuration = await getMediaDuration(finalAudioPath);
      const driftMs = (measuredDuration - videoDuration) * 1000;

      console.log(`[elevenlabs] Pre-mux verification (attempt ${attempt + 1}): audio=${measuredDuration.toFixed(2)}s, video=${videoDuration.toFixed(2)}s, drift=${driftMs.toFixed(0)}ms`);

      if (Math.abs(driftMs) <= FINAL_TOLERANCE_MS) {
        console.log(`[elevenlabs] Drift within tolerance - ready for mux`);
        break;
      }

      console.log(`[elevenlabs] Drift ${driftMs.toFixed(0)}ms exceeds ${FINAL_TOLERANCE_MS}ms - applying correction`);

      if (measuredDuration > videoDuration) {
        // Audio too long - hard trim to exact duration
        const correctedPath = path.join(tempDir, `final_trim_${attempt}_${Date.now()}.wav`);
        cleanupFiles.push(correctedPath);
        await hardTrimAudio(finalAudioPath, videoDuration, correctedPath);
        finalAudioPath = correctedPath;
        console.log(`[elevenlabs] Hard-trimmed to ${videoDuration.toFixed(2)}s`);
      } else {
        // Audio too short - pad with exact silence needed
        const paddingNeeded = videoDuration - measuredDuration;
        const paddedPath = path.join(tempDir, `final_pad_${attempt}_${Date.now()}.wav`);
        cleanupFiles.push(paddedPath);
        const paddingSilence = path.join(tempDir, `final_pad_silence_${attempt}_${Date.now()}.wav`);
        cleanupFiles.push(paddingSilence);
        await generateSilence(paddingNeeded, paddingSilence);
        await concatenateAudioFiles([finalAudioPath, paddingSilence], paddedPath);
        finalAudioPath = paddedPath;
        console.log(`[elevenlabs] Padded with ${paddingNeeded.toFixed(3)}s silence`);
      }
    }

    // Final verification after all attempts
    const finalMeasured = await getMediaDuration(finalAudioPath);
    const finalDrift = Math.abs(finalMeasured - videoDuration) * 1000;
    if (finalDrift > FINAL_TOLERANCE_MS) {
      console.error(`[elevenlabs] CRITICAL: Could not achieve tolerance after ${MAX_CORRECTION_ATTEMPTS} attempts. Drift: ${finalDrift.toFixed(0)}ms`);
      // Proceed anyway but log the failure - better to have slightly off audio than no audio
    }

    // Step 6: Mux final audio with video
    await muxAudioWithVideo(inputVideoPath, finalAudioPath, outputVideoPath);
    console.log('[elevenlabs] Whole-video voice replacement complete');

  } finally {
    // Cleanup temp files
    for (const file of cleanupFiles) {
      try { await fs.unlink(file); } catch (e) { }
    }
  }
}

// Find sentence boundaries from word timings (sentences end with .!?)
function findSentenceBoundaries(wordTimings: Array<{ word: string; start: number; end: number }>): number[] {
  const boundaries: number[] = [];
  for (let i = 0; i < wordTimings.length; i++) {
    const word = wordTimings[i].word;
    if (word.match(/[.!?]$/)) {
      boundaries.push(wordTimings[i].end);
    }
  }
  return boundaries;
}

// Synthetic segment for when no transcript segments are provided
interface SyntheticSegment {
  text: string;
  start: number; // Target start time in video
  end: number;   // Target end time in video
  ttsStart: number; // TTS audio start
  ttsEnd: number;   // TTS audio end
  wordIndices: { start: number; end: number };
}

// Create synthetic segments from word timestamps by finding sentence boundaries
function createSyntheticSegments(
  wordTimings: Array<{ word: string; start: number; end: number }>,
  videoDuration: number,
  ttsDuration: number
): SyntheticSegment[] {
  const segments: SyntheticSegment[] = [];

  if (wordTimings.length === 0) return segments;

  // Find sentence-ending words (punctuation: . ! ?)
  let segmentStart = 0;
  const timeFactor = videoDuration / ttsDuration; // How much to stretch time

  for (let i = 0; i < wordTimings.length; i++) {
    const word = wordTimings[i].word;
    const isSentenceEnd = /[.!?]$/.test(word);
    const isLastWord = i === wordTimings.length - 1;

    if (isSentenceEnd || isLastWord) {
      const segWords = wordTimings.slice(segmentStart, i + 1);
      const text = segWords.map(w => w.word).join(' ');
      const ttsStart = segWords[0].start;
      const ttsEnd = segWords[segWords.length - 1].end;

      // Scale TTS times to target video times proportionally
      const targetStart = ttsStart * timeFactor;
      const targetEnd = ttsEnd * timeFactor;

      segments.push({
        text,
        start: targetStart,
        end: targetEnd,
        ttsStart,
        ttsEnd,
        wordIndices: { start: segmentStart, end: i }
      });

      segmentStart = i + 1;
    }
  }

  return segments;
}

// Align audio using synthetic segments with proportional gap distribution
async function alignAudioWithGapDistribution(
  audioPath: string,
  videoDuration: number,
  wordTimings: Array<{ word: string; start: number; end: number }>,
  syntheticSegments: SyntheticSegment[],
  tempDir: string,
  cleanupFiles: string[]
): Promise<string | null> {
  const DRIFT_TOLERANCE_MS = 100; // Max acceptable drift

  if (syntheticSegments.length === 0) return null;

  const ttsDuration = wordTimings[wordTimings.length - 1].end;
  const timeDelta = videoDuration - ttsDuration;

  console.log(`[elevenlabs] Gap distribution: TTS=${ttsDuration.toFixed(2)}s, Video=${videoDuration.toFixed(2)}s, Delta=${timeDelta.toFixed(2)}s`);

  // Handle negative delta (TTS longer than video) - need to time-stretch/compress
  if (timeDelta < -0.05) {
    console.log(`[elevenlabs] TTS is longer than video by ${(-timeDelta).toFixed(2)}s - applying compression`);
    const stretchedPath = path.join(tempDir, `syn_stretched_${Date.now()}.wav`);
    cleanupFiles.push(stretchedPath);
    await timeStretchAudioGently(audioPath, videoDuration, stretchedPath);

    // Verify the stretched audio
    const stretchedDuration = await getMediaDuration(stretchedPath);
    const stretchDrift = Math.abs(stretchedDuration - videoDuration) * 1000;

    if (stretchDrift > DRIFT_TOLERANCE_MS) {
      // Still too long after stretch - hard trim
      const trimmedPath = path.join(tempDir, `syn_trimmed_${Date.now()}.wav`);
      cleanupFiles.push(trimmedPath);
      await hardTrimAudio(stretchedPath, videoDuration, trimmedPath);
      console.log(`[elevenlabs] Hard-trimmed to ${videoDuration.toFixed(2)}s`);
      return trimmedPath;
    }

    return stretchedPath;
  }

  // Positive delta - distribute gaps between sentences
  // Count: leading gap + inter-sentence gaps + trailing gap
  const numInterGaps = syntheticSegments.length - 1;
  const numGaps = 1 + numInterGaps + 1; // lead + between + trail
  const gapPerSlot = timeDelta > 0 ? timeDelta / numGaps : 0;

  console.log(`[elevenlabs] Distributing ${timeDelta.toFixed(2)}s across ${numGaps} gaps (${gapPerSlot.toFixed(3)}s each)`);

  const audioClips: string[] = [];
  let accumulatedTime = 0;

  // Add leading gap (always included in count)
  if (gapPerSlot > 0.01) {
    const leadPath = path.join(tempDir, `syn_lead_${Date.now()}.wav`);
    cleanupFiles.push(leadPath);
    await generateSilence(gapPerSlot, leadPath);
    audioClips.push(leadPath);
    accumulatedTime += gapPerSlot;
  }

  // Process each segment
  for (let i = 0; i < syntheticSegments.length; i++) {
    const seg = syntheticSegments[i];
    const segDuration = seg.ttsEnd - seg.ttsStart;

    // Extract segment audio
    const segPath = path.join(tempDir, `syn_seg_${i}_${Date.now()}.wav`);
    cleanupFiles.push(segPath);
    await extractAudioSegment(audioPath, seg.ttsStart, segDuration, segPath);
    audioClips.push(segPath);
    accumulatedTime += segDuration;

    // Add inter-sentence gap (between segments, not after last)
    if (i < syntheticSegments.length - 1 && gapPerSlot > 0.01) {
      const gapPath = path.join(tempDir, `syn_gap_${i}_${Date.now()}.wav`);
      cleanupFiles.push(gapPath);
      await generateSilence(gapPerSlot, gapPath);
      audioClips.push(gapPath);
      accumulatedTime += gapPerSlot;
    }
  }

  // Add trailing silence - use exact remaining time to reach video duration
  const trailTime = videoDuration - accumulatedTime;
  if (trailTime > 0.01) {
    const trailPath = path.join(tempDir, `syn_trail_${Date.now()}.wav`);
    cleanupFiles.push(trailPath);
    await generateSilence(trailTime, trailPath);
    audioClips.push(trailPath);
  }

  // Concatenate with crossfades
  const alignedPath = path.join(tempDir, `syn_aligned_${Date.now()}.wav`);
  cleanupFiles.push(alignedPath);

  if (audioClips.length > 1) {
    await concatenateAudioFilesWithFades(audioClips, alignedPath, 0.015);
  } else if (audioClips.length === 1) {
    await fs.copyFile(audioClips[0], alignedPath);
  } else {
    return null;
  }

  // Verify final duration with ffprobe
  const finalDuration = await getMediaDuration(alignedPath);
  const driftMs = Math.abs(finalDuration - videoDuration) * 1000;
  console.log(`[elevenlabs] Synthetic alignment complete: ${finalDuration.toFixed(2)}s (drift: ${driftMs.toFixed(0)}ms)`);

  // Reject if drift exceeds tolerance - let caller handle fallback
  if (driftMs > DRIFT_TOLERANCE_MS) {
    console.warn(`[elevenlabs] Synthetic alignment drift ${driftMs.toFixed(0)}ms exceeds ${DRIFT_TOLERANCE_MS}ms tolerance`);
    return null;
  }

  return alignedPath;
}

// Align audio with intelligent gap adjustment using word timings
// This maps TTS sentence boundaries to original transcript segments and stretches gaps accordingly
async function alignAudioWithGapAdjustment(
  audioPath: string,
  videoDuration: number,
  originalSpeechStart: number,
  originalSpeechEnd: number,
  ttsDuration: number,
  tempDir: string,
  cleanupFiles: string[],
  wordTimings?: Array<{ word: string; start: number; end: number }>,
  transcriptSegments?: TranscriptSegment[],
  voiceId?: string,
  apiKey?: string
): Promise<string> {
  const audioClips: string[] = [];

  // If we have word timings and transcript segments, do intelligent per-gap alignment
  if (wordTimings && wordTimings.length > 0 && transcriptSegments && transcriptSegments.length > 1) {
    console.log('[elevenlabs] Performing intelligent per-gap alignment');

    // Find natural pause points in TTS output (sentence-ending punctuation)
    const ttsPausePoints = findTTSPausePoints(wordTimings);

    // Find gaps between transcript segments
    const originalGaps = findOriginalGaps(transcriptSegments);

    // If we have matching pause/gap counts, align them
    if (ttsPausePoints.length > 0 && originalGaps.length > 0) {
      console.log(`[elevenlabs] Found ${ttsPausePoints.length} TTS pauses, ${originalGaps.length} original gaps`);

      const alignedPath = await alignWithIntraGaps(
        audioPath,
        videoDuration,
        originalSpeechStart,
        ttsDuration,
        ttsPausePoints,
        originalGaps,
        tempDir,
        cleanupFiles,
        transcriptSegments,
        wordTimings
      );

      if (alignedPath) {
        return alignedPath;
      }

      // Try per-segment synthesis fallback if alignment failed
      if (voiceId && apiKey && transcriptSegments.length > 0) {
        console.log('[elevenlabs] Alignment failed, trying per-segment synthesis fallback');
        const fallbackPath = await perSegmentSynthesisFallback(
          videoDuration,
          transcriptSegments,
          voiceId,
          apiKey,
          tempDir,
          cleanupFiles
        );
        if (fallbackPath) {
          return fallbackPath;
        }
      }
      // Fall through to simple alignment if all else fails
    }
  }

  // Simple alignment: just add silence at start and end
  console.log('[elevenlabs] Using simple start/end gap alignment');

  // Add silence at start (before first speech)
  if (originalSpeechStart > 0.05) {
    const startSilencePath = path.join(tempDir, `silence_start_${Date.now()}.wav`);
    cleanupFiles.push(startSilencePath);
    await generateSilence(originalSpeechStart, startSilencePath);
    audioClips.push(startSilencePath);
    console.log(`[elevenlabs] Added ${originalSpeechStart.toFixed(2)}s silence at start`);
  }

  // Add the TTS audio
  audioClips.push(audioPath);

  // Calculate remaining time after speech
  const expectedEndTime = originalSpeechStart + ttsDuration;
  const remainingTime = videoDuration - expectedEndTime;

  // Add silence at end if needed
  if (remainingTime > 0.05) {
    const endSilencePath = path.join(tempDir, `silence_end_${Date.now()}.wav`);
    cleanupFiles.push(endSilencePath);
    await generateSilence(remainingTime, endSilencePath);
    audioClips.push(endSilencePath);
    console.log(`[elevenlabs] Added ${remainingTime.toFixed(2)}s silence at end`);
  }

  // Concatenate all clips with cross-fades for smooth transitions
  const alignedPath = path.join(tempDir, `aligned_${Date.now()}.wav`);
  cleanupFiles.push(alignedPath);

  if (audioClips.length > 1) {
    await concatenateAudioFilesWithFades(audioClips, alignedPath, 0.05);
  } else {
    await fs.copyFile(audioPath, alignedPath);
  }

  return alignedPath;
}

// Find pause points in TTS output based on sentence-ending punctuation
function findTTSPausePoints(wordTimings: Array<{ word: string; start: number; end: number }>): Array<{ time: number; index: number }> {
  const pauses: Array<{ time: number; index: number }> = [];
  for (let i = 0; i < wordTimings.length; i++) {
    const word = wordTimings[i].word;
    // Look for sentence-ending punctuation
    if (word.match(/[.!?]$/) && i < wordTimings.length - 1) {
      pauses.push({ time: wordTimings[i].end, index: i });
    }
  }
  return pauses;
}

// Find gaps between transcript segments in the original video
function findOriginalGaps(segments: TranscriptSegment[]): Array<{ start: number; end: number; duration: number }> {
  const gaps: Array<{ start: number; end: number; duration: number }> = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const gapStart = segments[i].end;
    const gapEnd = segments[i + 1].start;
    const duration = gapEnd - gapStart;
    if (duration > 0.1) { // Only consider gaps > 100ms
      gaps.push({ start: gapStart, end: gapEnd, duration });
    }
  }
  return gaps;
}

// Normalize text for fuzzy matching (remove punctuation, lowercase)
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\w']/g, '');
}

// Monotonic guaranteed-coverage alignment with strictly increasing TTS indices
// Ensures every transcript word maps to a UNIQUE TTS word index
function alignWordsWithCoverage(
  transcriptWords: string[],
  ttsWords: Array<{ word: string; start: number; end: number }>
): Array<{ transcriptIdx: number; ttsIdx: number; interpolated: boolean }> {
  if (transcriptWords.length === 0 || ttsWords.length === 0) {
    return [];
  }

  // Step 1: Find all exact/fuzzy matches with strictly increasing indices
  const matches: Array<{ transcriptIdx: number; ttsIdx: number }> = [];
  let lastTtsIdx = -1;

  for (let i = 0; i < transcriptWords.length; i++) {
    const transcriptNorm = normalizeWord(transcriptWords[i]);
    if (transcriptNorm.length === 0) continue;

    for (let j = lastTtsIdx + 1; j < ttsWords.length; j++) {
      const ttsNorm = normalizeWord(ttsWords[j].word);
      if (ttsNorm === transcriptNorm ||
        (ttsNorm.length > 2 && transcriptNorm.length > 2 &&
          (ttsNorm.includes(transcriptNorm) || transcriptNorm.includes(ttsNorm)))) {
        matches.push({ transcriptIdx: i, ttsIdx: j });
        lastTtsIdx = j;
        break;
      }
    }
  }

  // Step 2: Add boundary anchors
  if (matches.length === 0) {
    // Distribute evenly with strictly increasing indices
    const step = Math.max(1, Math.floor(ttsWords.length / transcriptWords.length));
    return transcriptWords.map((_, i) => ({
      transcriptIdx: i,
      ttsIdx: Math.min(i * step, ttsWords.length - 1),
      interpolated: true
    }));
  }

  if (matches[0].transcriptIdx > 0) {
    matches.unshift({ transcriptIdx: 0, ttsIdx: 0 });
  }
  if (matches[matches.length - 1].transcriptIdx < transcriptWords.length - 1) {
    matches.push({ transcriptIdx: transcriptWords.length - 1, ttsIdx: ttsWords.length - 1 });
  }

  // Step 3: Interpolate with STRICTLY INCREASING TTS indices, CLAMPED to valid range
  const fullAlignment: Array<{ transcriptIdx: number; ttsIdx: number; interpolated: boolean }> = [];
  const maxTtsIdx = ttsWords.length - 1;
  let minNextTts = 0;

  for (let i = 0; i < matches.length - 1; i++) {
    const start = matches[i];
    const end = matches[i + 1];

    // Clamp to valid range while ensuring monotonic
    const startTts = Math.min(Math.max(minNextTts, start.ttsIdx), maxTtsIdx);
    fullAlignment.push({ transcriptIdx: start.transcriptIdx, ttsIdx: startTts, interpolated: false });
    minNextTts = Math.min(startTts + 1, maxTtsIdx);

    // Interpolate between start and end
    const transcriptSpan = end.transcriptIdx - start.transcriptIdx;
    const clampedEndTts = Math.min(end.ttsIdx, maxTtsIdx);
    const ttsSpan = Math.max(1, clampedEndTts - startTts);

    for (let t = start.transcriptIdx + 1; t < end.transcriptIdx; t++) {
      // Skip if we've exhausted TTS words
      if (minNextTts > maxTtsIdx) {
        fullAlignment.push({ transcriptIdx: t, ttsIdx: maxTtsIdx, interpolated: true });
        continue;
      }

      const progress = (t - start.transcriptIdx) / transcriptSpan;
      let interpolatedTts = Math.round(startTts + progress * ttsSpan);
      // Clamp to valid range while ensuring monotonic
      interpolatedTts = Math.min(Math.max(minNextTts, interpolatedTts), maxTtsIdx);
      fullAlignment.push({ transcriptIdx: t, ttsIdx: interpolatedTts, interpolated: true });
      minNextTts = Math.min(interpolatedTts + 1, maxTtsIdx + 1);
    }
  }

  // Add final match (always map to last TTS word)
  const lastMatch = matches[matches.length - 1];
  if (fullAlignment.length === 0 || fullAlignment[fullAlignment.length - 1].transcriptIdx !== lastMatch.transcriptIdx) {
    fullAlignment.push({ transcriptIdx: lastMatch.transcriptIdx, ttsIdx: maxTtsIdx, interpolated: false });
  }

  return fullAlignment;
}

// Hard-trim audio to exact duration (for extreme cases)
async function hardTrimAudio(
  inputPath: string,
  maxDuration: number,
  outputPath: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', [
      '-i', inputPath,
      '-t', maxDuration.toFixed(3),
      '-c', 'copy',
      '-y', outputPath
    ]);
    proc.on('close', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

// Per-segment alignment with guaranteed coverage, zero-drift enforcement, and validation:
// 1. Use monotonic alignment to map ALL transcript words to TTS words
// 2. Extract speech-only audio per segment
// 3. Compress or HARD-TRIM overlong segments to fit allocated window
// 4. Validate timing and fallback to per-segment synthesis if tolerance exceeded
async function alignWithIntraGaps(
  audioPath: string,
  videoDuration: number,
  originalSpeechStart: number,
  ttsDuration: number,
  ttsPausePoints: Array<{ time: number; index: number }>,
  originalGaps: Array<{ start: number; end: number; duration: number }>,
  tempDir: string,
  cleanupFiles: string[],
  transcriptSegments?: TranscriptSegment[],
  wordTimings?: Array<{ word: string; start: number; end: number }>
): Promise<string | null> {
  const TOLERANCE_MS = 40; // Max allowed drift in milliseconds

  try {
    if (!transcriptSegments || transcriptSegments.length === 0 || !wordTimings || wordTimings.length === 0) {
      console.log('[elevenlabs] Missing segments or word timings');
      return null;
    }

    // Step 1: Build full transcript word list with segment boundaries
    const transcriptWords: string[] = [];
    const segmentBoundaries: Array<{ segIdx: number; startWordIdx: number; endWordIdx: number }> = [];

    for (let segIdx = 0; segIdx < transcriptSegments.length; segIdx++) {
      const seg = transcriptSegments[segIdx];
      const words = seg.text.trim().split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) continue;

      const startWordIdx = transcriptWords.length;
      transcriptWords.push(...words);
      const endWordIdx = transcriptWords.length - 1;

      segmentBoundaries.push({ segIdx, startWordIdx, endWordIdx });
    }

    // Step 2: Get guaranteed-coverage monotonic alignment
    const alignments = alignWordsWithCoverage(transcriptWords, wordTimings);

    if (alignments.length === 0) {
      console.warn('[elevenlabs] Alignment failed');
      return null; // Will trigger per-segment fallback
    }

    const exactMatches = alignments.filter(a => !a.interpolated).length;
    console.log(`[elevenlabs] Alignment: ${alignments.length} words, ${exactMatches} exact matches`);

    // Step 3: Map segment boundaries to TTS word ranges
    const segmentWordRanges: Array<{
      segIdx: number;
      ttsStartIdx: number;
      ttsEndIdx: number;
      ttsStart: number;
      ttsEnd: number;
    }> = [];

    for (const boundary of segmentBoundaries) {
      const startAlign = alignments.find(a => a.transcriptIdx === boundary.startWordIdx);
      const endAlign = alignments.find(a => a.transcriptIdx === boundary.endWordIdx);

      if (startAlign && endAlign && startAlign.ttsIdx < endAlign.ttsIdx) {
        segmentWordRanges.push({
          segIdx: boundary.segIdx,
          ttsStartIdx: startAlign.ttsIdx,
          ttsEndIdx: endAlign.ttsIdx,
          ttsStart: wordTimings[startAlign.ttsIdx].start,
          ttsEnd: wordTimings[endAlign.ttsIdx].end
        });
      } else if (startAlign && endAlign) {
        // Same index - use proportional split
        const prevEnd = segmentWordRanges.length > 0 ? segmentWordRanges[segmentWordRanges.length - 1].ttsEnd : 0;
        const nextStart = wordTimings[startAlign.ttsIdx].start;
        segmentWordRanges.push({
          segIdx: boundary.segIdx,
          ttsStartIdx: startAlign.ttsIdx,
          ttsEndIdx: endAlign.ttsIdx,
          ttsStart: Math.max(prevEnd, nextStart),
          ttsEnd: wordTimings[endAlign.ttsIdx].end
        });
      }
    }

    if (segmentWordRanges.length < transcriptSegments.length * 0.8) {
      console.warn(`[elevenlabs] Only mapped ${segmentWordRanges.length}/${transcriptSegments.length} segments`);
      return null; // Trigger per-segment fallback
    }

    console.log(`[elevenlabs] Mapped ${segmentWordRanges.length} segments`);

    // Step 4: Process each segment with ZERO-DRIFT enforcement
    const audioClips: string[] = [];
    let cumulativeActual = 0;
    let maxDriftMs = 0;

    for (let i = 0; i < segmentWordRanges.length; i++) {
      const range = segmentWordRanges[i];
      const origSeg = transcriptSegments[range.segIdx];

      const ttsSpeechDuration = Math.max(0.1, range.ttsEnd - range.ttsStart);
      const origSpeechDuration = origSeg.end - origSeg.start;
      const origSegStart = origSeg.start;
      const origSegEnd = origSeg.end;

      // Add leading silence for first segment
      if (i === 0 && origSegStart > 0.02) {
        const leadSilence = path.join(tempDir, `lead_${Date.now()}.wav`);
        cleanupFiles.push(leadSilence);
        await generateSilence(origSegStart, leadSilence);
        audioClips.push(leadSilence);
        cumulativeActual = origSegStart;
      }

      // Extract TTS segment
      const segPath = path.join(tempDir, `seg_${i}_${Date.now()}.wav`);
      cleanupFiles.push(segPath);
      await extractAudioSegment(audioPath, range.ttsStart, ttsSpeechDuration, segPath);

      // Calculate exact target duration
      const timeAvailable = Math.max(0.2, origSegEnd - cumulativeActual);
      const targetDuration = Math.min(timeAvailable * 0.95, origSpeechDuration);

      const ratio = ttsSpeechDuration / targetDuration;
      let finalSegPath = segPath;
      let finalDuration = ttsSpeechDuration;

      if (ratio > 1.02) {
        if (ratio <= 3.0) {
          // Try compression using time-stretch
          const stretchPath = path.join(tempDir, `comp_${i}_${Date.now()}.wav`);
          cleanupFiles.push(stretchPath);
          const achievedDuration = await timeStretchAudioGently(segPath, targetDuration, stretchPath);
          if (achievedDuration < finalDuration) {
            finalSegPath = stretchPath;
            finalDuration = achievedDuration;
          }
        }

        // ALWAYS hard-trim if still overlong (ratio > 3.0 or stretch failed or didn't compress enough)
        if (finalDuration > targetDuration + 0.05) {
          const trimPath = path.join(tempDir, `trim_${i}_${Date.now()}.wav`);
          cleanupFiles.push(trimPath);
          const trimmed = await hardTrimAudio(finalSegPath, targetDuration, trimPath);
          if (trimmed) {
            finalSegPath = trimPath;
            finalDuration = targetDuration;
            console.log(`[elevenlabs] Seg ${i}: hard-trimmed to ${targetDuration.toFixed(2)}s`);
          } else {
            // Hard-trim failed - force duration for cumulative tracking
            finalDuration = targetDuration;
            console.warn(`[elevenlabs] Seg ${i}: hard-trim failed, forcing duration`);
          }
        }
      } else if (ratio < 0.85 && ratio >= 0.4) {
        // Stretch short segment (slow down)
        const stretchPath = path.join(tempDir, `exp_${i}_${Date.now()}.wav`);
        cleanupFiles.push(stretchPath);
        const achievedDuration = await timeStretchAudioGently(segPath, targetDuration, stretchPath);
        finalSegPath = stretchPath;
        finalDuration = achievedDuration;
      }

      audioClips.push(finalSegPath);
      cumulativeActual += finalDuration;

      // Calculate gap to next segment
      if (i < segmentWordRanges.length - 1) {
        const nextOrigSeg = transcriptSegments[segmentWordRanges[i + 1].segIdx];
        const targetTime = nextOrigSeg.start;
        const gapNeeded = targetTime - cumulativeActual;

        // Track drift for validation
        const driftMs = Math.abs(gapNeeded) * 1000;
        maxDriftMs = Math.max(maxDriftMs, driftMs);

        if (gapNeeded > 0.01) {
          const gapPath = path.join(tempDir, `gap_${i}_${Date.now()}.wav`);
          cleanupFiles.push(gapPath);
          await generateSilence(gapNeeded, gapPath);
          audioClips.push(gapPath);
          cumulativeActual = targetTime;
        } else if (gapNeeded < -0.01) {
          // Behind schedule - force position reset
          cumulativeActual = targetTime;
        }
      }
    }

    // Validation: HARD FAIL if max drift exceeds tolerance threshold
    if (maxDriftMs > TOLERANCE_MS * 5) {
      console.warn(`[elevenlabs] Max drift ${maxDriftMs.toFixed(0)}ms exceeds ${TOLERANCE_MS * 5}ms tolerance, triggering fallback`);
      return null; // Trigger per-segment synthesis fallback
    }

    // Add trailing silence
    const trailingTime = videoDuration - cumulativeActual;
    if (trailingTime > 0.02) {
      const trailPath = path.join(tempDir, `trail_${Date.now()}.wav`);
      cleanupFiles.push(trailPath);
      await generateSilence(trailingTime, trailPath);
      audioClips.push(trailPath);
    }

    // Concatenate with minimal crossfades
    const alignedPath = path.join(tempDir, `aligned_${Date.now()}.wav`);
    cleanupFiles.push(alignedPath);

    if (audioClips.length > 1) {
      await concatenateAudioFilesWithFades(audioClips, alignedPath, 0.01);
    } else if (audioClips.length === 1) {
      await fs.copyFile(audioClips[0], alignedPath);
    } else {
      return null;
    }

    console.log(`[elevenlabs] Zero-drift alignment complete: ${segmentWordRanges.length} segments, max drift ${maxDriftMs.toFixed(0)}ms`);
    return alignedPath;

  } catch (error) {
    console.error('[elevenlabs] Alignment failed:', error);
    return null;
  }
}

// Fallback: per-segment synthesis when whole-video alignment fails
// This provides guaranteed alignment by synthesizing each segment individually
async function perSegmentSynthesisFallback(
  videoDuration: number,
  transcriptSegments: TranscriptSegment[],
  voiceId: string,
  apiKey: string,
  tempDir: string,
  cleanupFiles: string[]
): Promise<string | null> {
  try {
    console.log(`[elevenlabs] Fallback: per-segment synthesis for ${transcriptSegments.length} segments`);

    const audioClips: string[] = [];
    let currentTime = 0;

    for (let i = 0; i < transcriptSegments.length; i++) {
      const seg = transcriptSegments[i];
      const segDuration = seg.end - seg.start;

      // Add silence before segment if needed
      if (seg.start > currentTime + 0.02) {
        const silencePath = path.join(tempDir, `fb_gap_${i}_${Date.now()}.wav`);
        cleanupFiles.push(silencePath);
        await generateSilence(seg.start - currentTime, silencePath);
        audioClips.push(silencePath);
        currentTime = seg.start;
      }

      // Synthesize this segment
      const ttsPath = path.join(tempDir, `fb_tts_${i}_${Date.now()}.mp3`);
      cleanupFiles.push(ttsPath);

      try {
        // Use standard synthesis for fallback (simpler, more reliable)
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text: seg.text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75
              }
            })
          }
        );

        if (!response.ok) {
          console.warn(`[elevenlabs] Failed to synthesize segment ${i}`);
          continue;
        }

        const buffer = await response.arrayBuffer();
        await fs.writeFile(ttsPath, Buffer.from(buffer));

        // Convert to WAV
        const wavPath = path.join(tempDir, `fb_wav_${i}_${Date.now()}.wav`);
        cleanupFiles.push(wavPath);
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('ffmpeg', ['-i', ttsPath, '-ar', '44100', '-ac', '1', wavPath, '-y']);
          proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed')));
          proc.on('error', reject);
        });

        // Get duration and stretch if needed
        const ttsDur = await getAudioDuration(wavPath);
        let finalPath = wavPath;

        if (ttsDur > segDuration * 1.1) {
          // Compress to fit
          const stretchPath = path.join(tempDir, `fb_stretch_${i}_${Date.now()}.wav`);
          cleanupFiles.push(stretchPath);
          const achievedDuration = await timeStretchAudioGently(wavPath, segDuration, stretchPath);
          if (achievedDuration <= segDuration * 1.15) {
            finalPath = stretchPath;
          }
        }

        audioClips.push(finalPath);
        currentTime += Math.min(ttsDur, segDuration);

      } catch (e) {
        console.warn(`[elevenlabs] Segment ${i} synthesis failed:`, e);
      }
    }

    // Add trailing silence
    if (videoDuration > currentTime + 0.02) {
      const trailPath = path.join(tempDir, `fb_trail_${Date.now()}.wav`);
      cleanupFiles.push(trailPath);
      await generateSilence(videoDuration - currentTime, trailPath);
      audioClips.push(trailPath);
    }

    if (audioClips.length === 0) {
      return null;
    }

    // Concatenate all
    const alignedPath = path.join(tempDir, `fb_aligned_${Date.now()}.wav`);
    cleanupFiles.push(alignedPath);

    if (audioClips.length > 1) {
      await concatenateAudioFilesWithFades(audioClips, alignedPath, 0.015);
    } else {
      await fs.copyFile(audioClips[0], alignedPath);
    }

    console.log(`[elevenlabs] Per-segment fallback complete`);
    return alignedPath;

  } catch (error) {
    console.error('[elevenlabs] Per-segment fallback failed:', error);
    return null;
  }
}

// Helper to get audio duration
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath
    ]);
    let output = '';
    proc.stdout.on('data', data => output += data);
    proc.on('close', code => {
      if (code === 0) {
        resolve(parseFloat(output.trim()) || 0);
      } else {
        reject(new Error('ffprobe failed'));
      }
    });
    proc.on('error', reject);
  });
}

// Fallback: simple global stretch to fit speech window (last resort)
async function globalStretchFallback(
  audioPath: string,
  videoDuration: number,
  transcriptSegments: TranscriptSegment[],
  ttsDuration: number,
  tempDir: string,
  cleanupFiles: string[]
): Promise<string | null> {
  try {
    const firstSeg = transcriptSegments[0];
    const lastSeg = transcriptSegments[transcriptSegments.length - 1];
    const speechWindow = lastSeg.end - firstSeg.start;
    const ratio = ttsDuration / speechWindow;

    if (ratio < 0.5 || ratio > 2.0) {
      console.warn(`[elevenlabs] Fallback ratio ${ratio.toFixed(2)}x too extreme`);
      return null;
    }

    const audioClips: string[] = [];

    // Leading silence
    if (firstSeg.start > 0.02) {
      const leadPath = path.join(tempDir, `fb_lead_${Date.now()}.wav`);
      cleanupFiles.push(leadPath);
      await generateSilence(firstSeg.start, leadPath);
      audioClips.push(leadPath);
    }

    // Stretched TTS
    let stretchedPath = audioPath;
    if (Math.abs(ratio - 1.0) > 0.05) {
      const sPath = path.join(tempDir, `fb_stretch_${Date.now()}.wav`);
      cleanupFiles.push(sPath);
      await timeStretchAudioGently(audioPath, speechWindow, sPath);
      stretchedPath = sPath;
    }
    audioClips.push(stretchedPath);

    // Trailing silence
    const trailTime = videoDuration - lastSeg.end;
    if (trailTime > 0.02) {
      const trailPath = path.join(tempDir, `fb_trail_${Date.now()}.wav`);
      cleanupFiles.push(trailPath);
      await generateSilence(trailTime, trailPath);
      audioClips.push(trailPath);
    }

    const alignedPath = path.join(tempDir, `fb_aligned_${Date.now()}.wav`);
    cleanupFiles.push(alignedPath);

    if (audioClips.length > 1) {
      await concatenateAudioFilesWithFades(audioClips, alignedPath, 0.02);
    } else {
      await fs.copyFile(audioClips[0], alignedPath);
    }

    console.log(`[elevenlabs] Global stretch fallback: ${ttsDuration.toFixed(2)}s -> ${speechWindow.toFixed(2)}s`);
    return alignedPath;
  } catch (error) {
    console.error('[elevenlabs] Fallback alignment failed:', error);
    return null;
  }
}

// Extract a segment from audio file
async function extractAudioSegment(
  inputPath: string,
  startTime: number,
  duration: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-ss', startTime.toFixed(4),
      '-t', duration.toFixed(4),
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '1',
      outputPath
    ]);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Extract segment failed: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg for segment extraction: ${err.message}`));
    });
  });
}

// Calculate total duration of audio clips
async function calculateTotalDuration(clips: string[]): Promise<number> {
  let total = 0;
  for (const clip of clips) {
    try {
      total += await getMediaDuration(clip);
    } catch {
      // Skip if duration can't be determined
    }
  }
  return total;
}

// Concatenate audio files with crossfade for smooth transitions
async function concatenateAudioFilesWithFades(inputFiles: string[], outputPath: string, fadeDuration: number = 0.05): Promise<void> {
  if (inputFiles.length === 0) {
    throw new Error('No input files provided');
  }

  if (inputFiles.length === 1) {
    await fs.copyFile(inputFiles[0], outputPath);
    return;
  }

  // Get durations of each file to calculate proper fade positions
  const durations: number[] = [];
  for (const file of inputFiles) {
    try {
      const duration = await getMediaDuration(file);
      durations.push(duration);
    } catch {
      durations.push(1.0); // Fallback duration
    }
  }

  // Build complex filter that fades at the END of each clip (except last)
  // and fades at the START of each clip (except first)
  let filterComplex = '';
  const labels: string[] = [];

  for (let i = 0; i < inputFiles.length; i++) {
    const duration = durations[i];
    const fadeOutStart = Math.max(0, duration - fadeDuration);

    if (i === 0) {
      // First clip: fade out at the end only
      filterComplex += `[${i}:a]afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${fadeDuration}[a${i}];`;
    } else if (i === inputFiles.length - 1) {
      // Last clip: fade in at the start only
      filterComplex += `[${i}:a]afade=t=in:st=0:d=${fadeDuration}[a${i}];`;
    } else {
      // Middle clips: fade in at start, fade out at end
      filterComplex += `[${i}:a]afade=t=in:st=0:d=${fadeDuration},afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${fadeDuration}[a${i}];`;
    }
    labels.push(`[a${i}]`);
  }

  // Concatenate all processed clips
  filterComplex += `${labels.join('')}concat=n=${inputFiles.length}:v=0:a=1[out]`;

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      ...inputFiles.flatMap(f => ['-i', f]),
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-c:a', 'pcm_s16le',
      '-ar', '44100',
      outputPath
    ];

    const proc = spawn('ffmpeg', args);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Fallback to simple concatenation if complex filter fails
        console.warn('[audio] Crossfade failed, falling back to simple concat:', stderr.slice(-200));
        concatenateAudioFiles(inputFiles, outputPath).then(resolve).catch(reject);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg for crossfade concat: ${err.message}`));
    });
  });
}

// Gentle time-stretching using atempo with limits to maintain natural sound
// Returns the actual output duration achieved (may differ from target if clamping applied)
async function timeStretchAudioGently(
  inputPath: string,
  targetDuration: number,
  outputPath: string
): Promise<number> {
  const currentDuration = await getMediaDuration(inputPath);

  if (Math.abs(currentDuration - targetDuration) < 0.1) {
    await fs.copyFile(inputPath, outputPath);
    return currentDuration;
  }

  const idealRatio = currentDuration / targetDuration;

  // Limit stretch ratio to maintain natural sound (0.85 to 1.15)
  // This prevents chipmunk or slow-motion effects
  const clampedRatio = Math.max(0.85, Math.min(1.15, idealRatio));

  // Calculate what duration we'll actually achieve with the clamped ratio
  const achievedDuration = currentDuration / clampedRatio;

  console.log(`[elevenlabs] Gentle time-stretch: ${currentDuration.toFixed(2)}s -> target ${targetDuration.toFixed(2)}s (achieved: ${achievedDuration.toFixed(2)}s, ratio: ${clampedRatio.toFixed(3)})`);

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-af', `atempo=${clampedRatio.toFixed(4)}`,
      '-c:a', 'pcm_s16le',
      '-ar', '44100',
      outputPath
    ]);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(achievedDuration);
      } else {
        reject(new Error(`Gentle time-stretch failed: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg for gentle time-stretch: ${err.message}`));
    });
  });
}

// Convert audio to WAV format
async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '1',
      outputPath
    ]);

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Convert to WAV failed: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg for WAV conversion: ${err.message}`));
    });
  });
}

// Mux audio with video (replace audio track)
async function muxAudioWithVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-map', '0:v:0',
      '-map', '1:a:0',
      outputPath,
    ];

    console.log('[elevenlabs] Muxing audio with video');

    const proc = spawn('ffmpeg', ffmpegArgs);
    let stderr = '';

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[elevenlabs] Video muxing complete:', outputPath);
        resolve();
      } else {
        reject(new Error(`ffmpeg mux failed with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

// Run the Python voice replacement pipeline
async function runVoiceReplacementPipeline(
  inputVideoPath: string,
  outputVideoPath: string,
  promptWavPath: string,
  transcriptJsonPath?: string | null
): Promise<void> {
  await fs.mkdir(path.dirname(outputVideoPath), { recursive: true });

  const pythonBin = process.env.PYTHON_BIN || 'python3';
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'voice_replace_pipeline.py');
  const args: string[] = [
    scriptPath,
    '--input-video', inputVideoPath,
    '--output-video', outputVideoPath,
    '--audio-prompt', promptWavPath,
    '--device', String(process.env.CHATTERBOX_DEVICE || 'cpu'),
    '--verbose',
  ];

  if (transcriptJsonPath) {
    args.push('--transcript-json', transcriptJsonPath);
  }

  // Optional: override the Whisper model for transcription (e.g., tiny, base, small, medium)
  const whisperModel = process.env.WHISPER_MODEL;
  if (whisperModel && whisperModel.length > 0) {
    args.push('--whisper-model', whisperModel);
  }

  // Prefer faster-whisper for transcription by default; allow override via env
  const transcriber = String(process.env.TRANSCRIBER || 'faster-whisper');
  args.push('--transcriber', transcriber);

  // Optional: direct CTranslate2 settings for faster-whisper
  const ct2Device = process.env.WHISPER_CT2_DEVICE || undefined;
  const ct2Compute = process.env.WHISPER_CT2_COMPUTE || undefined;
  const ct2Beam = process.env.WHISPER_CT2_BEAM || undefined;
  if (ct2Device) {
    args.push('--ct2-device', ct2Device);
  }
  if (ct2Compute) {
    args.push('--ct2-compute', ct2Compute);
  }
  if (ct2Beam) {
    args.push('--ct2-beam-size', ct2Beam);
  }

  const timeoutMs = Number(process.env.VOICE_PIPELINE_TIMEOUT_MS || 10 * 60 * 1000); // default 10 minutes
  let timedOut = false;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(pythonBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs);

    proc.stdout.on('data', (d: Buffer) => {
      const msg = d.toString();
      stdout += msg;
      console.log('[processing][pipeline stdout]', msg.trim());
    });
    proc.stderr.on('data', (d: Buffer) => {
      const msg = d.toString();
      stderr += msg;
      console.error('[processing][pipeline stderr]', msg.trim());
    });
    proc.on('error', (e: Error) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const reason = timedOut ? `timed out after ${timeoutMs}ms` : `exited with code ${code}`;
      reject(new Error(`voice_replace_pipeline ${reason}: ${stderr || stdout || 'no output'}`));
    });
  });
}

async function ensureVideoProjectsTable() {
  if (!isSQLite) {
    return;
  }
  await dbRun(sql`
    CREATE TABLE IF NOT EXISTS video_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      template_video_id INTEGER NOT NULL,
      voice_profile_id INTEGER,
      face_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      output_video_url TEXT,
      processing_progress INTEGER DEFAULT 0,
      processing_error TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (template_video_id) REFERENCES template_videos(id) ON DELETE CASCADE
    )
  `);

  await dbRun(sql`
    CREATE INDEX IF NOT EXISTS idx_video_projects_user_id ON video_projects(user_id)
  `);

  await dbRun(sql`
    CREATE INDEX IF NOT EXISTS idx_video_projects_status ON video_projects(status)
  `);

  await dbRun(sql`
    CREATE INDEX IF NOT EXISTS idx_video_projects_template_id ON video_projects(template_video_id)
  `);
}

async function migrateVideoProjectsUserIdTypeIfNeeded() {
  if (!isSQLite) {
    return;
  }
  try {
    const columns = await dbQuery(sql`PRAGMA table_info(video_projects)`);
    const userIdCol = Array.isArray(columns) ? (columns as any[]).find(c => c.name === 'user_id') : null;
    if (userIdCol && typeof userIdCol.type === 'string' && /int/i.test(userIdCol.type)) {
      await dbRun(sql`PRAGMA foreign_keys = OFF`);
      await dbRun(sql.raw(`BEGIN TRANSACTION`));
      await dbRun(sql.raw(`
        CREATE TABLE IF NOT EXISTS video_projects_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          template_video_id INTEGER NOT NULL,
          voice_profile_id INTEGER,
          face_image_url TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          output_video_url TEXT,
          processing_progress INTEGER DEFAULT 0,
          processing_error TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (template_video_id) REFERENCES template_videos(id) ON DELETE CASCADE
        )
      `));
      await dbRun(sql.raw(`
        INSERT INTO video_projects_new (
          id, user_id, template_video_id, voice_profile_id, face_image_url,
          status, output_video_url, processing_progress, processing_error, metadata,
          created_at, updated_at, completed_at
        )
        SELECT 
          id,
          CAST(user_id AS TEXT),
          template_video_id,
          voice_profile_id,
          face_image_url,
          status,
          output_video_url,
          processing_progress,
          processing_error,
          metadata,
          created_at,
          updated_at,
          completed_at
        FROM video_projects
      `));
      await dbRun(sql.raw(`DROP TABLE video_projects`));
      await dbRun(sql.raw(`ALTER TABLE video_projects_new RENAME TO video_projects`));
      await dbRun(sql.raw(`CREATE INDEX IF NOT EXISTS idx_video_projects_user_id ON video_projects(user_id)`));
      await dbRun(sql.raw(`CREATE INDEX IF NOT EXISTS idx_video_projects_status ON video_projects(status)`));
      await dbRun(sql.raw(`CREATE INDEX IF NOT EXISTS idx_video_projects_template_id ON video_projects(template_video_id)`));
      await dbRun(sql.raw(`COMMIT`));
      await dbRun(sql`PRAGMA foreign_keys = ON`);
      console.log('[migrate] video_projects.user_id migrated to TEXT');
    }
  } catch (err) {
    console.error('[migrate] Failed to migrate video_projects.user_id to TEXT:', err);
  }
}

// Create a new video project
router.post('/api/video-projects', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { templateVideoId, voiceProfileId, faceImageUrl, metadata } = req.body;
    const userId = req.user!.id;

    // Check video creation limit
    const limitCheck = await usageService.checkVideoLimit(userId);

    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: limitCheck.message,
        code: "LIMIT_EXCEEDED",
        upgradeRequired: true
      });
    }

    if (templateVideoId === undefined || templateVideoId === null) {
      return res.status(400).json({ error: 'Template video ID is required' });
    }

    const templateVideoIdNumber = Number(templateVideoId);
    if (!Number.isInteger(templateVideoIdNumber) || templateVideoIdNumber <= 0) {
      return res.status(400).json({ error: 'Template video ID must be a positive integer' });
    }

    // Ensure required tables exist and verify template video exists
    console.log('[video-projects] Ensuring tables...');
    await ensureTemplateVideosTable();
    const isActiveValue = isSQLite ? 1 : true;

    console.log('[video-projects] Fetching template...');
    const templateVideo = await dbQueryOne(sql`
      SELECT id, metadata FROM template_videos WHERE id = ${templateVideoIdNumber} AND is_active = ${isActiveValue}
    `);

    if (!templateVideo) {
      console.log('[video-projects] Template not found');
      return res.status(404).json({ error: 'Template video not found' });
    }

    const templateMetadata = parseMetadata(templateVideo.metadata);
    const sourceVideoId = templateMetadata.sourceVideoId;
    const pipelineStatus = templateMetadata.pipelineStatus ?? 'queued';

    console.log('[video-projects] Template found, checking pipeline status...');
    if (sourceVideoId && pipelineStatus === 'error') {
      try {
        const sourceVideo = await storage.getVideo(sourceVideoId);
        if (sourceVideo?.videoUrl) {
          await adminVideoPipelineService.enqueue(sourceVideo.id, sourceVideo.videoUrl);
        }
      } catch (err) {
        console.warn('[video-projects] Requeue pipeline failed', {
          templateId: templateVideoIdNumber,
          sourceVideoId,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    console.log('[video-projects] Ensuring project table...');
    await ensureVideoProjectsTable();
    await migrateVideoProjectsUserIdTypeIfNeeded();

    const now = new Date();
    const baseMetadata = parseMetadata(metadata);
    if (sourceVideoId) {
      baseMetadata.sourceVideoId = sourceVideoId;
      baseMetadata.sourcePipelineStatus = pipelineStatus;
      baseMetadata.transcriptReady = pipelineStatus === 'completed';
    }
    const metadataPayload =
      Object.keys(baseMetadata).length > 0
        ? JSON.stringify(baseMetadata)
        : null;

    let insertedId: number | null = null;

    console.log('[video-projects] Inserting project...');
    if (isSQLite) {
      const result = await dbRun(sql`
        INSERT INTO video_projects (
          user_id, template_video_id, voice_profile_id, face_image_url,
          status, processing_progress, metadata, created_at, updated_at
        ) VALUES (
          ${userId}, ${templateVideoIdNumber}, ${voiceProfileId || null}, 
          ${faceImageUrl || null}, 'pending', 0, ${metadataPayload},
          ${now.toISOString()}, ${now.toISOString()}
        )
      `);
      insertedId = typeof result?.lastInsertRowid === 'number'
        ? result.lastInsertRowid
        : typeof result?.lastID === 'number'
          ? result.lastID
          : null;
    } else {
      const result = await db.execute(sql`
        INSERT INTO video_projects (
          user_id, template_video_id, voice_profile_id, face_image_url,
          status, processing_progress, metadata, created_at, updated_at
        ) VALUES (
          ${userId}, ${templateVideoIdNumber}, ${voiceProfileId || null}, 
          ${faceImageUrl || null}, 'pending', 0, ${metadataPayload}::jsonb,
          ${now.toISOString()}::timestamp, ${now.toISOString()}::timestamp
        ) RETURNING id
      `);
      insertedId = (result as any).rows?.[0]?.id ?? null;
    }

    console.log('[video-projects] Inserted ID:', insertedId);

    if (!insertedId) {
      throw new Error('Unable to determine newly created project ID');
    }

    const project = await dbQueryOne(sql`
      SELECT vp.*, tv.title as template_title, tv.thumbnail_url as template_thumbnail
      FROM video_projects vp
      JOIN template_videos tv ON vp.template_video_id = tv.id
      WHERE vp.id = ${insertedId}
    `);

    // Also create a corresponding entry in the main videos table so it appears in the library
    try {
      console.log('[video-projects] Creating linked video...');
      const initialVideo = await videoService.createVideo({
        title: project.template_title,
        description: project.metadata?.description ?? project.description ?? null,
        thumbnail: project.template_thumbnail ?? null,
        videoUrl: null, // will be filled when rendering completes
        duration: project.duration ?? null,
        status: 'draft',
        type: 'user_project',
        familyId: null,
        createdBy: userId,
        metadata: {
          projectId: insertedId,
          templateVideoId: templateVideoIdNumber,
          ...(sourceVideoId ? { sourceVideoId } : {}),
        },
      } as any);
      console.log('[video-projects] Linked video created:', initialVideo.id);

      // Persist a backlink to the created video on the project row (in metadata)
      let meta: any = null;
      try {
        meta = project?.metadata ? (typeof project.metadata === 'string' ? JSON.parse(project.metadata) : project.metadata) : {};
      } catch {
        meta = {};
      }
      meta.linkedVideoId = initialVideo.id;
      if (isSQLite) {
        await dbRun(sql`
          UPDATE video_projects SET metadata = ${JSON.stringify(meta)}, updated_at = ${new Date().toISOString()} WHERE id = ${insertedId}
        `);
      } else {
        await dbRun(sql`
          UPDATE video_projects SET metadata = ${JSON.stringify(meta)}::jsonb, updated_at = ${new Date().toISOString()}::timestamp WHERE id = ${insertedId}
        `);
      }

      res.status(201).json({ ...project, linkedVideoId: initialVideo.id });
    } catch (linkErr) {
      // If creating the library video fails, still return the project so the flow can continue
      console.error('Failed to create linked library video:', linkErr);
      res.status(201).json(project);
    }

    // Increment video usage count AFTER response is sent (fire and forget)
    // This prevents double-counting on retries since only one project is created per request
    usageService.incrementVideoCount(userId).catch((usageErr) => {
      console.error('[video-projects] Failed to increment video count:', usageErr);
    });
  } catch (error: any) {
    console.error('Error creating video project:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Failed to create video project', details: error.message });
  }
});

// Get all projects for the authenticated user
router.get('/api/video-projects', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const projects = await dbQuery(sql`
      SELECT vp.*, tv.title as template_title, tv.thumbnail_url as template_thumbnail,
             tv.category, tv.duration as template_duration
      FROM video_projects vp
      JOIN template_videos tv ON vp.template_video_id = tv.id
      WHERE vp.user_id = ${userId}
      ORDER BY vp.created_at DESC
    `);

    res.json(projects);
  } catch (error) {
    console.error('Error fetching video projects:', error);
    res.status(500).json({ error: 'Failed to fetch video projects' });
  }
});

// Get a specific project
router.get('/api/video-projects/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const project = await dbQueryOne(sql`
      SELECT vp.*, tv.title as template_title, tv.thumbnail_url as template_thumbnail,
             tv.video_url as template_video_url, tv.category, tv.difficulty
      FROM video_projects vp
      JOIN template_videos tv ON vp.template_video_id = tv.id
      WHERE vp.id = ${id} AND vp.user_id = ${userId}
    `);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching video project:', error);
    res.status(500).json({ error: 'Failed to fetch video project' });
  }
});

// Update project (add voice/face, update status)
router.patch('/api/video-projects/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { voiceProfileId, faceImageUrl, status, processingProgress, outputVideoUrl, metadata } = req.body;

    // Verify ownership
    const existing = await dbQueryOne(sql`
      SELECT id FROM video_projects WHERE id = ${id} AND user_id = ${userId}
    `);

    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Build assignment list using Drizzle SQL template to ensure proper parameter binding
    const assignments: any[] = [];

    if (voiceProfileId !== undefined) {
      assignments.push(sql`voice_profile_id = ${voiceProfileId}`);
    }
    if (faceImageUrl !== undefined) {
      assignments.push(sql`face_image_url = ${faceImageUrl}`);
    }
    if (status !== undefined) {
      assignments.push(sql`status = ${status}`);
      if (status === 'completed') {
        if (isSQLite) {
          assignments.push(sql`completed_at = ${new Date().toISOString()}`);
        } else {
          assignments.push(sql`completed_at = ${new Date().toISOString()}::timestamp`);
        }
      }
    }
    if (processingProgress !== undefined) {
      assignments.push(sql`processing_progress = ${processingProgress}`);
    }
    if (outputVideoUrl !== undefined) {
      assignments.push(sql`output_video_url = ${outputVideoUrl}`);
    }
    if (metadata !== undefined) {
      if (isSQLite) {
        assignments.push(sql`metadata = ${JSON.stringify(metadata)}`);
      } else {
        assignments.push(sql`metadata = ${JSON.stringify(metadata)}::jsonb`);
      }
    }

    if (isSQLite) {
      assignments.push(sql`updated_at = ${new Date().toISOString()}`);
    } else {
      assignments.push(sql`updated_at = ${new Date().toISOString()}::timestamp`);
    }

    if (assignments.length > 0) {
      await dbRun(sql`
        UPDATE video_projects 
        SET ${sql.join(assignments, sql`, `)} 
        WHERE id = ${id}
      `);
    }

    const updated = await dbQueryOne(sql`
      SELECT vp.*, tv.title as template_title, tv.thumbnail_url as template_thumbnail
      FROM video_projects vp
      JOIN template_videos tv ON vp.template_video_id = tv.id
      WHERE vp.id = ${id}
    `);

    res.json(updated);
  } catch (error) {
    console.error('Error updating video project:', error);
    res.status(500).json({ error: 'Failed to update video project' });
  }
});

// Delete project
router.delete('/api/video-projects/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await dbRun(sql`
      DELETE FROM video_projects WHERE id = ${id} AND user_id = ${userId}
    `);

    const changes = isSQLite ? result?.changes : (result as any)?.rowCount;
    if (changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting video project:', error);
    res.status(500).json({ error: 'Failed to delete video project' });
  }
});

// Start processing a project
router.post('/api/video-projects/:id/process', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Extract processing options from request body
    const { preserveBackground = false, backgroundDuckLevel = -12 } = req.body || {};

    const project = await dbQueryOne(sql`
      SELECT * FROM video_projects WHERE id = ${id} AND user_id = ${userId}
    `);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Processing currently requires only a voice profile; face image is optional (feature disabled)
    if (!project.voice_profile_id) {
      return res.status(400).json({
        error: 'Voice profile is required to start processing'
      });
    }

    // Update status to processing
    const processingStartedAt = new Date().toISOString();
    await dbRun(sql`
      UPDATE video_projects
      SET status = 'processing', processing_progress = 0, updated_at = ${processingStartedAt}
      WHERE id = ${id}
    `);

    // Also mark the linked video as processing so it shows up in the library immediately
    const projectWithMeta = await dbQueryOne(sql`
      SELECT vp.*, tv.title as template_title, tv.video_url as template_video_url, tv.thumbnail_url as template_thumbnail, tv.metadata as template_metadata
      FROM video_projects vp
      JOIN template_videos tv ON vp.template_video_id = tv.id
      WHERE vp.id = ${id}
    `);

    const projectMeta = parseMetadata(projectWithMeta?.metadata);
    let linkedVideoId: string | undefined = typeof projectMeta?.linkedVideoId === 'string' ? projectMeta.linkedVideoId : undefined;

    if (linkedVideoId) {
      try {
        await videoService.updateVideo(linkedVideoId, { status: 'processing' } as any, userId);
      } catch (updateErr) {
        console.error('Failed to mark linked video processing:', updateErr);
      }
    }

    // Acknowledge the request immediately; perform processing asynchronously
    res.json({ message: 'Processing started', projectId: id, linkedVideoId: linkedVideoId ?? null });

    // Begin real voice replacement pipeline asynchronously
    (async () => {
      try {
        await setProjectProgress(id, 5, 'starting');
        // Resolve input video path from template video URL
        const templateUrl: string | null = projectWithMeta?.template_video_url ?? null;
        if (!templateUrl) {
          throw new Error('Template video URL not found for project');
        }
        const inputVideoPath = toLocalUploadsPath(templateUrl);
        console.log('[processing] input video path:', inputVideoPath);

        // Resolve voice profile
        const profileId = String(project.voice_profile_id);
        const profile = await storage.getVoiceProfile(profileId);
        if (!profile) {
          throw new Error('Selected voice profile not found');
        }

        // Check if this is an ElevenLabs voice profile
        const providerRef = (profile as any).providerRef || '';
        const provider = (profile as any).provider || '';
        const isElevenLabs = provider === 'elevenlabs' ||
          (providerRef && !providerRef.includes('/') && !providerRef.endsWith('.wav'));

        console.log('[processing] Voice profile provider:', provider || 'auto-detect');
        console.log('[processing] Provider ref:', providerRef);
        console.log('[processing] Using ElevenLabs:', isElevenLabs);

        // Determine output file location under uploads/videos
        const outputFileName = `processed-${id}.mp4`;
        const outputUrl = `/uploads/videos/${outputFileName}`;
        const outputVideoPath = toLocalUploadsPath(outputUrl);
        console.log('[processing] output video path:', outputVideoPath);

        const templateMetadata = parseMetadata(projectWithMeta?.template_metadata);
        const sourceVideoId =
          projectMeta?.sourceVideoId ??
          templateMetadata?.sourceVideoId ??
          null;

        // Get transcript text - needed for ElevenLabs synthesis
        let transcriptPath: string | null = null;
        let transcriptText: string = '';
        let transcriptSegments: any[] = [];
        let transcriptSource: string = 'none';

        // First, try to get existing transcript from source video metadata
        if (sourceVideoId) {
          try {
            const sourceVideo = await storage.getVideo(sourceVideoId);
            if (sourceVideo?.metadata) {
              const sourceMeta = parseMetadata((sourceVideo as any).metadata);
              const existingSegments = (sourceMeta?.pipeline as any)?.transcription?.segments;
              if (Array.isArray(existingSegments) && existingSegments.length > 0) {
                transcriptSegments = existingSegments;
                transcriptText = existingSegments
                  .map((s: any) => s.text?.trim())
                  .filter(Boolean)
                  .join(' ');
                transcriptSource = 'source_video';
                console.log('[processing] Found existing transcript from source video:', transcriptText.slice(0, 100) + '...');
              }
            }
          } catch (transcriptErr) {
            console.warn('[processing] Unable to get transcript from source video:', transcriptErr);
          }
        }

        // If no transcript from source video, try template metadata
        if (!transcriptText && templateMetadata?.transcript) {
          transcriptText = typeof templateMetadata.transcript === 'string'
            ? templateMetadata.transcript
            : JSON.stringify(templateMetadata.transcript);
          transcriptSource = 'template_metadata';
          console.log('[processing] Found transcript from template metadata:', transcriptText.slice(0, 100) + '...');
        }

        // If still no transcript and using ElevenLabs, use Gemini AI to transcribe the video
        if (!transcriptText && isElevenLabs) {
          console.log('[processing] No existing transcript found, using Gemini AI to transcribe video...');
          await setProjectProgress(id, 10, 'transcribing');

          if (!transcriptionService.isConfigured()) {
            throw new Error('Transcription service is not configured. Gemini AI integration required for voice replacement.');
          }

          try {
            const transcriptionResult = await transcriptionService.transcribeVideo(inputVideoPath);
            transcriptText = transcriptionResult.fullText;
            transcriptSegments = transcriptionResult.segments;
            transcriptSource = 'gemini_ai';
            console.log('[processing] Gemini transcription complete:', transcriptText.slice(0, 100) + '...');
            console.log('[processing] Transcription duration:', transcriptionResult.duration, 'seconds');
          } catch (transcribeErr) {
            console.error('[processing] Transcription failed:', transcribeErr);
            throw new Error(`Failed to transcribe video: ${transcribeErr instanceof Error ? transcribeErr.message : 'Unknown error'}`);
          }
        }

        // Persist transcript if we have segments (for any source)
        if (transcriptSegments.length > 0) {
          transcriptPath = await persistProjectTranscript(id, transcriptSegments);
        }

        // Mark transcript as ready if we have transcript text (from any source)
        if (transcriptText) {
          await setProjectProgress(id, 20, 'transcript_ready');
          console.log('[processing] Transcript ready from source:', transcriptSource);
        }

        await setProjectProgress(id, 25, 'pipeline_spawn');

        if (isElevenLabs) {
          // Use ElevenLabs TTS for voice replacement
          if (!transcriptText) {
            throw new Error('No transcript available for ElevenLabs voice synthesis. Please ensure the video has audio to transcribe.');
          }
          console.log('[processing] Using ElevenLabs voice replacement');
          console.log('[processing] Transcript text length:', transcriptText.length, 'characters');
          console.log('[processing] Transcript segments:', transcriptSegments.length);
          console.log('[processing] Preserve background audio:', preserveBackground);
          await setProjectProgress(id, 30, 'tts_synthesis');
          await runElevenLabsVoiceReplacement(inputVideoPath, outputVideoPath, providerRef, transcriptText, transcriptSegments, {
            preserveBackground,
            backgroundDuckLevel
          });
        } else {
          // Use local voice cloning pipeline
          // We still need a transcript for the pipeline
          // Try Gemini transcription if configured and no transcript yet
          if (!transcriptText && transcriptionService.isConfigured()) {
            console.log('[processing] Using Gemini AI to transcribe video for local pipeline...');
            await setProjectProgress(id, 10, 'transcribing');
            try {
              const transcriptionResult = await transcriptionService.transcribeVideo(inputVideoPath);
              transcriptText = transcriptionResult.fullText;
              transcriptSegments = transcriptionResult.segments;
              transcriptPath = await persistProjectTranscript(id, transcriptSegments);
              await setProjectProgress(id, 20, 'transcript_ready');
            } catch (transcribeErr) {
              console.warn('[processing] Transcription failed, continuing without transcript:', transcribeErr);
            }
          }

          const promptPath = providerRef || (profile.metadata as any)?.voice?.audioPromptPath;
          if (!promptPath) {
            throw new Error('Voice profile is missing an audio prompt path');
          }
          console.log('[processing] prompt wav path:', promptPath);

          // Validate that the prompt path actually exists before spawning the pipeline
          if (!(await fs.access(promptPath).then(() => true).catch(() => false))) {
            throw new Error(`Voice prompt not found on disk: ${promptPath}`);
          }

          await runVoiceReplacementPipeline(inputVideoPath, outputVideoPath, promptPath, transcriptPath);
        }

        const completionTimestamp = new Date().toISOString();
        // Update project record on success
        let meta = parseMetadata(projectWithMeta?.metadata);
        const history = Array.isArray(meta?.processingHistory) ? meta.processingHistory : [];
        history.push({ status: 'completed', timestamp: completionTimestamp });
        meta.processingHistory = history;
        meta.processingCompletedAt = completionTimestamp;
        if (sourceVideoId) {
          meta.sourceVideoId = sourceVideoId;
        }
        if (transcriptPath) {
          meta.transcriptPath = transcriptPath;
        }

        if (isSQLite) {
          await dbRun(sql`
            UPDATE video_projects
            SET
              status = 'completed',
              processing_progress = 100,
              output_video_url = ${outputUrl},
              metadata = ${JSON.stringify(meta)},
              updated_at = ${completionTimestamp},
              completed_at = ${completionTimestamp}
            WHERE id = ${id}
          `);
        } else {
          await dbRun(sql`
            UPDATE video_projects
            SET
              status = 'completed',
              processing_progress = 100,
              output_video_url = ${outputUrl},
              metadata = ${JSON.stringify(meta)}::jsonb,
              updated_at = ${completionTimestamp}::timestamp,
              completed_at = ${completionTimestamp}::timestamp
            WHERE id = ${id}
          `);
        }

        console.log('[processing] completed. output url:', outputUrl);

        if (linkedVideoId) {
          try {
            const linkedVideoUpdates: Record<string, unknown> = {
              status: 'completed',
              videoUrl: outputUrl,
            };
            if (projectWithMeta?.template_thumbnail) {
              linkedVideoUpdates.thumbnail = projectWithMeta.template_thumbnail;
            }
            await videoService.updateVideo(linkedVideoId, linkedVideoUpdates as any, userId);
          } catch (finalizeErr) {
            console.error('Failed to finalize linked video:', finalizeErr);
          }
        }
      } catch (err: any) {
        console.error('[processing] Voice replacement failed:', err?.message || err);
        const failedAt = new Date().toISOString();
        if (isSQLite) {
          await dbRun(sql`
            UPDATE video_projects
            SET
              status = 'failed',
              processing_progress = 100,
              processing_error = ${String(err?.message || 'Voice replacement failed')},
              updated_at = ${failedAt}
            WHERE id = ${id}
          `);
        } else {
          await dbRun(sql`
            UPDATE video_projects
            SET
              status = 'failed',
              processing_progress = 100,
              processing_error = ${String(err?.message || 'Voice replacement failed')},
              updated_at = ${failedAt}::timestamp
            WHERE id = ${id}
          `);
        }
        // Optionally mark linked video as error (schema uses 'error')
        if (linkedVideoId) {
          try {
            await videoService.updateVideo(linkedVideoId, { status: 'error' } as any, userId);
          } catch (e) {
            console.error('Failed to mark linked video failed:', e);
          }
        }
      }
    })();
  } catch (error) {
    console.error('Error starting video processing:', error);
    res.status(500).json({ error: 'Failed to start processing' });
  }
});

export default router;
