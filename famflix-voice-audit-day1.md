# FamFlix Voice Cloning Stack - Technical Audit

## Voice Cloning Stack Summary

### Model Used:
**ElevenLabs** (Primary and only provider): Cloud API using `eleven_v3` (v3 alpha) model - the most advanced and expressive TTS model with support for emotional audio tags

### Where It Runs:
- **ElevenLabs**: Cloud API at `api.elevenlabs.io`

### Processing Flow:

1. **Browser Recording**: Audio captured via 8-phase recording wizard with browser noise suppression (noiseSuppression, echoCancellation, autoGainControl)
2. **Audio Upload**: Files validated (minimum 3 seconds duration)
3. **Preprocessing**: Converted to 24kHz mono WAV format via FFmpeg
4. **Quality Analysis**: RMS energy, SNR estimation, speech detection
5. **Voice Clone Creation**: Audio samples sent to ElevenLabs for Instant Voice Cloning (IVC)
6. **Profile Storage**: Voice profile stored with ElevenLabs voice ID reference

### Tech Stack:
- **Backend**: Node.js/TypeScript with Express
- **Audio Processing**: FFmpeg for format conversion and analysis
- **ORM**: Drizzle ORM with PostgreSQL
- **TTS Provider**: ElevenLabs API (cloud-based)
- **No queue system** for voice cloning (direct HTTP calls)

## Key Metrics

### Model Loading:
- N/A - ElevenLabs is a cloud API, no local model loading

### Memory Usage:
- Server-side: Minimal (~50MB for audio processing buffers)
- Client-side: Web Audio API handles recording in-browser

### API Endpoint Structure:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voice-profiles` | POST | Create voice clone from audio samples |
| `/api/voice-profiles/:id` | GET | Get voice profile details |
| `/api/voice-profiles/:id` | DELETE | Delete voice profile |
| `/api/voice-profiles/test` | POST | Test voice with custom text |

### File Formats:
- **Input**: WAV, MP3, OGG, M4A (any browser-supported format)
- **Processing**: 24kHz mono 16-bit PCM WAV
- **Output**: MP3 (from ElevenLabs synthesis)

## Voice Recording Wizard

The recording wizard collects ~2 minutes of audio across 8 phases:

1. **Introduction** - Natural greeting
2. **Emotional Range** - Happy, excited, calm expressions
3. **Questions** - Interrogative intonation patterns
4. **Commands** - Assertive speech patterns
5. **Storytelling** - Narrative pacing and emphasis
6. **Numbers & Dates** - Precise articulation
7. **Tongue Twisters** - Phoneme coverage
8. **Free Speech** - Natural conversation

### Audio Quality Requirements:
- Minimum 10 seconds total audio
- Signal-to-noise ratio > 15dB preferred
- Speech detection validation
- Real-time quality indicators during recording

## ElevenLabs Integration Details

### Voice Cloning:
- Uses Instant Voice Cloning (IVC) API
- Requires minimum 30 seconds of audio (we collect ~2 minutes)
- Supports 29+ languages with `eleven_multilingual_v2`

### Synthesis:
- Text-to-speech via `/v1/text-to-speech/{voice_id}`
- Streaming support for real-time playback
- Model settings: stability, similarity_boost, style configurable

### Rate Limits & Quotas:
- Depend on subscription tier
- Voice clone limit varies by plan
- Characters per month limit applies

## Code References

### Key Files:
- `server/tts/index.ts` - TTS provider factory
- `server/tts/providers/elevenlabs.ts` - ElevenLabs API integration
- `server/services/voiceService.ts` - Voice cloning orchestration
- `server/routes-simple.ts` - Voice API endpoints
- `client/src/components/VoiceCloning/VoiceRecordingWizard.tsx` - Recording UI
- `client/src/lib/audioAnalyzer.ts` - Client-side audio quality analysis

### Database Tables:
- `voice_profiles` - Stores voice clone metadata and ElevenLabs voice IDs
- `voice_generations` - Tracks TTS synthesis history

## Recent Improvements (Voice Cloning Accuracy)

1. **AudioAnalyzer utility** - Spectral analysis, silence detection, noise assessment
2. **Real-time quality indicators** - Visual feedback during recording
3. **Audio post-processing** - Normalization and format standardization
4. **Voice test feature** - Preview cloned voice before use
5. **8-phase recording wizard** - Comprehensive phoneme and emotion coverage
