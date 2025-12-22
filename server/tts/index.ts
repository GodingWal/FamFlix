import { config } from "../config";
import type { ITTSProvider } from "./TTSProvider";
import { ElevenLabsProvider } from "./providers/elevenlabs";

const providers: Partial<Record<string, ITTSProvider>> = {};

providers.ELEVENLABS = new ElevenLabsProvider();

export function getTTSProvider(provider?: string): ITTSProvider {
  const key = provider ?? config.TTS_PROVIDER;
  const instance = providers[key];

  if (!instance) {
    throw new Error(`TTS provider '${key}' is not configured`);
  }

  return instance;
}

export function hasTTSProvider(provider: string): boolean {
  return Boolean(providers[provider]);
}

export function getElevenLabsProvider(): ElevenLabsProvider {
  return providers.ELEVENLABS as ElevenLabsProvider;
}
