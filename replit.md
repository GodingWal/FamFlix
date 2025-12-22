# FamFlixW - Replit Environment Setup

## Overview
FamFlixW is a full-stack application for video creation and voice cloning. It enables users to create videos, generate stories, and clone voices using AI-powered services. The project aims to provide a robust platform for content creators, offering features like AI transcription, text-to-speech synthesis with cloned voices, and a flexible subscription model.

## User Preferences
I prefer detailed explanations and iterative development. Ask before making major changes. Do not make changes to the folder `Z`. Do not make changes to the file `Y`.

## System Architecture
The application uses a monorepo structure with a React + Vite + TypeScript frontend and an Express.js + TypeScript backend. It integrates with a PostgreSQL database via Drizzle ORM. The system is designed for both development (SQLite support) and production (PostgreSQL). The backend serves the frontend, running on port 5000. Core features include:
- **UI/UX**: The voice recording wizard has 8 phases for extended voice sample collection (2 minutes total), with real-time audio visualization, noise level indication, and responsive layouts. Admin interfaces include a transcript viewer with timeline and text views.
- **Technical Implementations**:
    - **Database**: PostgreSQL with 17 tables (users, videos, stories, voice_profiles, etc.) and 4 enum types. Drizzle ORM manages schema with migration support.
    - **Voice Cloning**: Guided 5-step wizard with built-in browser noise suppression (noiseSuppression, echoCancellation, autoGainControl) using Web Audio API. Supports ElevenLabs, F5, and RVC providers.
    - **Video Processing Pipeline**: Integrates Gemini AI for transcription and ElevenLabs for speech synthesis. Processes videos through stages: starting, transcribing, transcript_ready, tts_synthesis, completed.
    - **Audio Synchronization**: Whole-video synthesis with ElevenLabs `/with-timestamps` endpoint for word-level timing, monotonic alignment with guaranteed coverage, zero-drift enforcement via time-stretching and hard-trimming, and per-segment synthesis fallback when alignment tolerance is exceeded.
    - **Background Audio Preservation**: Option to duck original audio (-12dB) during speech segments, mixing synthesized voice while preserving background sounds.
    - **Transcript Editing**: Admin functionality for editing video transcripts with robust validation, preserving segment timings, and flagging videos for re-processing.
    - **Subscription Tiers**: Implemented Free, Premium, and Pro plans with usage tracking (videos, stories, voice clones) and monthly reset.
- **System Design Choices**: The application supports both SQLite (file-based) and PostgreSQL, with automatic detection based on the `DATABASE_URL`. Redis is used conditionally for background job processing (e.g., Story Mode). Vite's `allowedHosts: true` is configured for Replit's proxy.

## External Dependencies
- **Database**: PostgreSQL (Replit built-in)
- **ORM**: Drizzle ORM
- **Voice Cloning/TTS Providers**:
    - ElevenLabs API (requires `ELEVENLABS_API_KEY`)
    - F5 (local provider, requires GPU server)
    - RVC (for singing/vocal cloning, requires GPU server)
- **AI Services**:
    - Gemini AI (for video transcription, uses Replit AI Integrations)
    - OpenAI (optional, requires `OPENAI_API_KEY`)
- **Payment Processing**: Stripe (requires `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`)
- **Email**: SMTP (for email configurations)
- **Queues**: Redis (optional, for `FEATURE_STORY_MODE`)
- **Cloud Storage**: S3 (optional, for `FEATURE_STORY_MODE`)
- **Utilities**: FFmpeg (system dependency for audio/video processing)