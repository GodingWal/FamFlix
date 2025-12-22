import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import axios from "axios";
import FormData from "form-data";

import { config } from "../../config";
import type { ITTSProvider, TTSInput, TTSResult } from "../TTSProvider";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

export class ElevenLabsProvider implements ITTSProvider {
    private readonly apiKey: string;

    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY || "";
        if (!this.apiKey) {
            console.warn("[ElevenLabs] API key not configured. Voice cloning will not work.");
        }
    }

    async createVoiceClone(name: string, audioFiles: string[], description?: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error("ElevenLabs API key is not configured");
        }

        const form = new FormData();
        form.append("name", name);
        if (description) {
            form.append("description", description);
        }
        form.append("remove_background_noise", "true");

        for (const filePath of audioFiles) {
            const absPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.resolve(process.cwd(), filePath);
            
            if (!fs.existsSync(absPath)) {
                throw new Error(`Audio file not found: ${absPath}`);
            }
            form.append("files", fs.createReadStream(absPath));
        }

        try {
            const response = await axios.post(
                `${ELEVENLABS_API_URL}/voices/add`,
                form,
                {
                    headers: {
                        "xi-api-key": this.apiKey,
                        ...form.getHeaders(),
                    },
                    timeout: 120000,
                }
            );

            console.log(`[ElevenLabs] Voice clone created: ${response.data.voice_id}`);
            return response.data.voice_id;
        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.detail?.message || 
                               error.response?.data?.message ||
                               error.message;
                throw new Error(`ElevenLabs voice cloning failed: ${message}`);
            }
            throw error;
        }
    }

    async deleteVoice(voiceId: string): Promise<void> {
        if (!this.apiKey) return;

        try {
            await axios.delete(`${ELEVENLABS_API_URL}/voices/${voiceId}`, {
                headers: { "xi-api-key": this.apiKey },
            });
            console.log(`[ElevenLabs] Voice deleted: ${voiceId}`);
        } catch (error) {
            console.error(`[ElevenLabs] Failed to delete voice ${voiceId}:`, error);
        }
    }

    async synthesize({ text, voiceRef, metadata }: TTSInput): Promise<TTSResult> {
        if (!this.apiKey) {
            throw new Error("ElevenLabs API key is not configured");
        }

        if (!voiceRef) {
            throw new Error("Voice reference (ElevenLabs voice_id) is required");
        }

        // Use ElevenLabs v3 alpha model for highest expressiveness
        const modelId = (metadata?.modelId as string) || "eleven_v3";
        
        const tempDir = path.resolve(process.cwd(), "temp");
        await fsp.mkdir(tempDir, { recursive: true });

        const filename = `elevenlabs-${Date.now()}-${nanoid(6)}.mp3`;
        const outFile = path.join(tempDir, filename);

        try {
            const response = await axios.post(
                `${ELEVENLABS_API_URL}/text-to-speech/${voiceRef}`,
                {
                    text,
                    model_id: modelId,
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.0,
                        use_speaker_boost: true,
                    },
                },
                {
                    headers: {
                        "xi-api-key": this.apiKey,
                        "Content-Type": "application/json",
                        "Accept": "audio/mpeg",
                    },
                    responseType: "arraybuffer",
                    timeout: 60000,
                }
            );

            await fsp.writeFile(outFile, response.data);

            const checksum = createHash("md5").update(response.data).digest("hex");

            console.log(`[ElevenLabs] Speech synthesized: ${filename} (${response.data.length} bytes)`);

            return {
                key: filename,
                url: `/api/audio/${filename}`,
                checksum,
                durationSec: undefined,
                transcript: text,
            };
        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.detail?.message || 
                               error.response?.data?.message ||
                               (typeof error.response?.data === 'string' ? error.response.data : null) ||
                               error.message;
                throw new Error(`ElevenLabs synthesis failed: ${message}`);
            }
            throw error;
        }
    }

    async getVoices(): Promise<Array<{ voice_id: string; name: string }>> {
        if (!this.apiKey) {
            return [];
        }

        try {
            const response = await axios.get(`${ELEVENLABS_API_URL}/voices`, {
                headers: { "xi-api-key": this.apiKey },
            });
            return response.data.voices || [];
        } catch (error) {
            console.error("[ElevenLabs] Failed to get voices:", error);
            return [];
        }
    }

    async synthesizeWithTimestamps(text: string, voiceRef: string, modelId?: string): Promise<{
        audioPath: string;
        wordTimings: Array<{ word: string; start: number; end: number }>;
        totalDuration: number;
    }> {
        if (!this.apiKey) {
            throw new Error("ElevenLabs API key is not configured");
        }

        if (!voiceRef) {
            throw new Error("Voice reference (ElevenLabs voice_id) is required");
        }

        const model = modelId || "eleven_v3";
        const tempDir = path.resolve(process.cwd(), "temp");
        await fsp.mkdir(tempDir, { recursive: true });

        const filename = `elevenlabs-ts-${Date.now()}-${nanoid(6)}.mp3`;
        const outFile = path.join(tempDir, filename);

        try {
            const response = await axios.post(
                `${ELEVENLABS_API_URL}/text-to-speech/${voiceRef}/with-timestamps`,
                {
                    text,
                    model_id: model,
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.0,
                        use_speaker_boost: true,
                    },
                },
                {
                    headers: {
                        "xi-api-key": this.apiKey,
                        "Content-Type": "application/json",
                    },
                    timeout: 180000,
                }
            );

            const audioData = response.data.audio_base64 || response.data.audio;
            const alignment = response.data.alignment;
            
            if (!audioData) {
                console.error("[ElevenLabs] Response keys:", Object.keys(response.data));
                throw new Error("No audio data in response (expected 'audio' or 'audio_base64' field)");
            }

            const audioBuffer = Buffer.from(audioData, "base64");
            await fsp.writeFile(outFile, audioBuffer);

            const wordTimings: Array<{ word: string; start: number; end: number }> = [];

            if (alignment?.characters && alignment?.character_start_times_seconds && alignment?.character_end_times_seconds) {
                const chars = alignment.characters as string[];
                const startTimes = alignment.character_start_times_seconds as number[];
                const endTimes = alignment.character_end_times_seconds as number[];
                
                if (chars.length !== startTimes.length || chars.length !== endTimes.length) {
                    console.warn("[ElevenLabs] Alignment arrays have mismatched lengths, skipping word timing extraction");
                } else {
                    let currentWord = "";
                    let wordStart: number | null = null;

                    for (let i = 0; i < chars.length; i++) {
                        const char = chars[i];
                        if (char !== " " && char !== "\n") {
                            if (wordStart === null) {
                                wordStart = startTimes[i];
                            }
                            currentWord += char;
                        } else {
                            if (currentWord && wordStart !== null) {
                                wordTimings.push({
                                    word: currentWord,
                                    start: wordStart,
                                    end: endTimes[i - 1] || startTimes[i],
                                });
                                currentWord = "";
                                wordStart = null;
                            }
                        }
                    }

                    if (currentWord && wordStart !== null) {
                        wordTimings.push({
                            word: currentWord,
                            start: wordStart,
                            end: endTimes[endTimes.length - 1] || startTimes[startTimes.length - 1],
                        });
                    }
                }
            }

            const totalDuration = wordTimings.length > 0 
                ? wordTimings[wordTimings.length - 1].end 
                : 0;

            console.log(`[ElevenLabs] Synthesized with timestamps: ${filename}, ${wordTimings.length} words, ${totalDuration.toFixed(2)}s`);

            return {
                audioPath: outFile,
                wordTimings,
                totalDuration,
            };
        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.detail?.message || 
                               error.response?.data?.message ||
                               (typeof error.response?.data === 'string' ? error.response.data : null) ||
                               error.message;
                throw new Error(`ElevenLabs synthesis with timestamps failed: ${message}`);
            }
            throw error;
        }
    }

    isConfigured(): boolean {
        return !!this.apiKey;
    }
}

export const elevenLabsProvider = new ElevenLabsProvider();
