# FamFlix

FamFlix is a family-focused video personalization platform that lets families create personalized videos and stories with AI-powered voice cloning. Upload a video template, clone a family member's voice, and get back a custom video where that voice narrates the story.

---

## Features

- **Video Personalization** – Select from curated video templates and personalize them with your family's voices and faces.
- **Voice Cloning** – Record a few voice samples and generate a cloned voice using Chatterbox/F5-TTS or ElevenLabs.
- **Story Mode** – Create AI-assisted family stories with automatic narration in cloned voices.
- **Subscription Plans** – Free, Premium ($20/mo), and Pro ($40/mo) tiers with per-plan usage limits.
- **Admin Dashboard** – Upload and manage video templates, view user analytics, run audio diarization/transcription.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Drizzle ORM) or SQLite (dev) |
| Job Queue | BullMQ + Redis |
| Payments | Stripe (subscriptions + webhooks) |
| ML/TTS | Chatterbox / F5-TTS (self-hosted GPU), ElevenLabs (cloud) |
| Auth | JWT (access + refresh tokens, httpOnly cookies) |
| Monitoring | Sentry (client + server), structured JSON logging |
| CI/CD | GitHub Actions |

---

## Quick Start (Local Development)

### Prerequisites

- Node.js >= 20
- PostgreSQL 15+ (or SQLite for zero-config dev)
- Redis (optional – required for job queues)
- Git

### 1. Clone and install

```bash
git clone https://github.com/GodingWal/FamFlix.git
cd FamFlix
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in the required variables (see [Environment Variables](#environment-variables) below).
For a minimal local run the only required values are `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `SESSION_SECRET`.

### 3. Set up the database

```bash
npm run db:push        # applies schema to the database
```

### 4. Run in development mode

```bash
npm run dev
```

The app is served at `http://localhost:5000` (API + Vite dev server).

---

## Environment Variables

All variables are validated at startup via Zod. A full list is in `.env.example`.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/famflix` |
| `JWT_SECRET` | >= 32-character secret for access tokens |
| `JWT_REFRESH_SECRET` | >= 32-character secret for refresh tokens |
| `SESSION_SECRET` | >= 32-character secret for session signing |

### Payments (required for billing)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (client-side) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from your Stripe webhook endpoint (`whsec_...`) |

### Monitoring (optional but recommended)

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry DSN for server-side error tracking |
| `VITE_SENTRY_DSN` | Sentry DSN for client-side error tracking |

### AI / TTS

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for story generation |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for cloud TTS |
| `GPU_SERVER_URL` | URL of the self-hosted GPU server (default: `http://localhost:8080`) |

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run db:push` | Apply database schema |
| `npm run db:migrate` | Run pending migrations |
| `npm run lint` | ESLint check |

---

## Project Structure

```
FamFlix/
├── client/src/          # React frontend
│   ├── components/      # Shared UI components (including ErrorBoundary)
│   ├── pages/           # Page-level components
│   ├── hooks/           # Custom React hooks
│   └── lib/             # API client, utilities
├── server/              # Express backend
│   ├── config/          # Zod-validated environment config
│   ├── middleware/       # Auth, rate limiting, CSRF, security headers
│   ├── routes/          # Express routers (admin, stories, templates, etc.)
│   ├── services/        # Business logic (billing, voice, video, email)
│   ├── queues/          # BullMQ job queues
│   └── workers/         # Queue worker processes
├── shared/              # Shared types, Drizzle schema, subscription plans
├── test/                # Vitest unit & integration tests
└── LAUNCH-CHECKLIST.md  # 30-day launch tracker (target: 2026-03-20)
```

---

## Stripe Webhook Setup

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli).
2. Forward webhooks locally during development:
   ```bash
   stripe listen --forward-to localhost:5000/api/billing/webhook
   ```
3. In the Stripe Dashboard (Developers > Webhooks), register:
   - **Endpoint URL**: `https://your-domain.com/api/billing/webhook`
   - **Events to listen for**:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
4. Copy the webhook signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

---

## Running with Docker

```bash
npm run docker:build
npm run docker:run
```

Or use Docker Compose for the full stack (app + PostgreSQL + Redis):

```bash
docker-compose up
```

---

## Deployment

See [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md) for the full deployment checklist. High-level steps:

1. Provision PostgreSQL, Redis, and S3-compatible object storage.
2. Set all environment variables on your hosting platform.
3. Run `npm run db:push` against the production database.
4. Deploy the Docker image or run `npm run build && npm start`.
5. Register the Stripe webhook endpoint (see above).
6. Configure your custom domain with SSL/Nginx reverse proxy.

---

## Contributing

1. Fork the repository and create a feature branch.
2. Run `npm test` and `npm run lint` before opening a PR.
3. Keep PRs focused — one feature or fix per PR.

---

## License

Proprietary – all rights reserved.
