# FamFlix Launch Checklist
**Target: 30 days from 2026-02-20 → 2026-03-20**

---

## Legend
- [ ] Not started
- [~] In progress
- [x] Complete

---

## 1. Core Feature Completion

### Video Processing Pipeline
- [ ] Implement face replacement integration (DeepFaceLab / alternative)
- [ ] Implement voice-to-video synchronization (lip-sync)
- [ ] Complete final video rendering and merging pipeline
- [ ] Wire up WebSocket progress tracking for video jobs
- [ ] End-to-end test: template selection → personalization → processed output

### Story Mode
- [ ] Complete song template integration (schema exists, logic missing)
- [ ] Story sharing / publishing workflow
- [ ] Story editor polish (chapter reordering, preview)

### Voice Cloning
- [ ] Confirm Chatterbox/F5-TTS stability under concurrent load
- [ ] Test voice clone quality across all 5 wizard prompts
- [ ] GPU tunnel service integration and documentation

---

## 2. Security & Auth

- [ ] Audit all routes for missing `requireAuth` middleware (especially admin routes — see `routes.ts:1349` TODO)
- [ ] Enable email verification flow end-to-end (verify tokens land, links work)
- [ ] Confirm password reset emails send and tokens expire correctly
- [ ] CSRF tokens tested on all POST/PUT/DELETE endpoints
- [ ] Rate limiter load test (auth: 5/15min, upload: 10/hr, api: 100/15min)
- [ ] Rotate all placeholder secrets before production deploy (`JWT_SECRET`, `SESSION_SECRET`, etc.)
- [ ] Remove or restrict any dev/debug endpoints in production

---

## 3. Payments & Subscriptions

- [ ] Create Stripe products and price IDs for free / premium / pro plans
- [ ] Set `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in production env
- [ ] Register Stripe webhook endpoint in Stripe dashboard (point to `/api/billing/webhook`)
- [ ] Test full checkout flow: free → premium upgrade → successful webhook → plan updated in DB
- [ ] Test subscription cancellation flow and downgrade limits
- [ ] Test monthly usage reset job
- [ ] Add billing portal link for users to manage/cancel subscription
- [ ] Verify plan limits enforced: video count, story count, voice clone count

---

## 4. Infrastructure & Deployment

- [ ] Choose and provision production hosting (e.g. Railway, Render, AWS, Fly.io)
- [ ] Provision managed PostgreSQL (e.g. Neon, RDS, Supabase)
- [ ] Provision managed Redis (e.g. Upstash, Redis Cloud)
- [ ] Set up S3-compatible object storage bucket with proper IAM policy
- [ ] Configure environment variables in production (all 83 `.env.example` vars)
- [ ] Run `db:push` / migrations against production database
- [ ] Implement actual deploy steps in CI/CD (`deploy-staging` and `deploy-production` jobs are currently placeholders)
- [ ] Set up custom domain + SSL certificate
- [ ] Configure Nginx (or load balancer) for reverse proxy, gzip, static asset caching
- [ ] Test Docker image in production profile with nginx
- [ ] Confirm health check endpoint (`/health`) returns 200 and is wired to uptime monitoring

---

## 5. Monitoring & Error Tracking

- [ ] Create Sentry project and get DSN
- [ ] Wire Sentry into `ErrorBoundary.tsx` (two `// TODO` placeholders at lines 36 and 99)
- [ ] Wire Sentry into backend uncaught exception handler
- [ ] Set up uptime monitoring (e.g. Better Uptime, UptimeRobot) on `/health`
- [ ] Set up log aggregation (Papertrail, Logtail, Datadog, etc.)
- [ ] Configure alerting for error spikes and job queue failures

---

## 6. Testing

- [ ] Bring unit test coverage to 80% threshold (branches, functions, lines, statements)
- [ ] Write integration tests for billing webhook handlers
- [ ] Write integration tests for voice cloning job queue
- [ ] Write integration tests for video processing pipeline
- [ ] Add at least smoke-level E2E tests (Playwright): register → login → create story → subscribe
- [ ] Implement performance/load tests in CI (Artillery or k6 — currently a placeholder job)
- [ ] Confirm all tests pass in CI against PostgreSQL matrix

---

## 7. Legal & Compliance

- [ ] Write and publish Privacy Policy (GDPR / COPPA compliant — this is a kids/family platform)
- [ ] Write and publish Terms of Service
- [ ] Add cookie consent banner if targeting EU users
- [ ] Review AI-generated content licensing (OpenAI, voice cloning output)
- [ ] Confirm Stripe data handling meets PCI-DSS requirements (no raw card data stored)
- [ ] Review COPPA compliance for any features accessible by children

---

## 8. User Experience & Polish

- [ ] Finalize landing / marketing page (pricing page, feature highlights)
- [ ] Add onboarding flow for new users (tooltips, empty states, first-run guide)
- [ ] Watermark on free-plan video exports implemented and visible
- [ ] Ad placement for free plan implemented (or placeholder confirmed)
- [ ] Confirm email transactional templates (welcome, password reset, verification) are styled
- [ ] Mobile responsiveness audit across all key pages
- [ ] Accessibility audit (keyboard nav, ARIA labels, color contrast)
- [ ] 404 and error pages styled and helpful
- [ ] Loading states and skeleton screens on slow operations (video processing, voice jobs)

---

## 9. Admin & Operations

- [ ] Admin dashboard accessible only to `role: admin` users
- [ ] Admin: upload video templates pipeline documented and tested
- [ ] Admin: audio extraction → diarization → transcript pipeline works end-to-end
- [ ] Admin: user management (view, ban, change plan)
- [ ] Admin: usage metrics / analytics view
- [ ] Seed at least 3–5 quality video templates for launch
- [ ] Runbook written: how to deploy, roll back, restart workers

---

## 10. Documentation

- [ ] Expand `README.md` from stub to full project overview + quick start
- [ ] Document all required environment variables (beyond `.env.example` comments)
- [ ] Document GPU setup for ML services (Chatterbox, RVC)
- [ ] Document Stripe webhook setup steps
- [ ] Internal API documentation (or OpenAPI spec)

---

## Priority Summary

| Priority | Area | Blockers launch? |
|----------|------|-----------------|
| P0 | Security audit + secrets rotation | Yes |
| P0 | Stripe products + webhook live | Yes |
| P0 | Production infrastructure provisioned | Yes |
| P0 | Database migrations run | Yes |
| P0 | Core video/story pipeline working | Yes |
| P1 | Sentry + uptime monitoring | Strongly recommended |
| P1 | Privacy Policy + Terms of Service | Yes (legal) |
| P1 | Email flows working | Yes |
| P1 | 80% test coverage + CI deploys | Strongly recommended |
| P2 | E2E tests | No, but reduces risk |
| P2 | Admin seeded with templates | Yes (no content otherwise) |
| P2 | Onboarding polish + mobile audit | No, but affects retention |
| P3 | Full documentation | No |
| P3 | Song templates, advanced story editor | No |
