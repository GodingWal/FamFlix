export interface TTSInput {
  text: string;
  voiceRef: string;
  modelId?: string;
  storyId?: string;
  sectionId?: string;
  metadata?: Record<string, unknown>;
}

export interface TTSResult {
  key: string;
  url: string;
  durationSec?: number;
  checksum?: string;
  transcript?: string;
}

export interface ITTSProvider {
  synthesize(input: TTSInput): Promise<TTSResult>;
}
