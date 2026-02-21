import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import cookieParser from 'cookie-parser';
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { registerRoutes } from "./routes-simple";
import { setupVite, serveStatic, log } from "./vite";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}

const app = express();

// Basic middleware
// Disable ETag for API JSON to avoid 304 Not Modified on conditional GETs
app.set('etag', false);
app.use(express.json({
  limit: '2gb',
  verify: (req, _res, buf) => {
    if ((req as any).originalUrl === '/api/billing/webhook') {
      (req as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: '2gb' }));
app.use(cookieParser());

// No-cache for API endpoints to always return fresh JSON
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Also explicitly remove conditional headers that might yield 304
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
  }
  next();
});

// Basic logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Serve the OpenAPI spec for API documentation
const __dirname_server = dirname(fileURLToPath(import.meta.url));
app.get('/api/docs/openapi.yaml', (_req: Request, res: Response) => {
  try {
    const spec = readFileSync(join(__dirname_server, 'openapi.yaml'), 'utf-8');
    res.type('text/yaml').send(spec);
  } catch {
    res.status(404).json({ error: 'OpenAPI spec not found' });
  }
});

(async () => {
  // Register API routes FIRST before Vite
  const server = await registerRoutes(app);

  // Setup Vite/Static files AFTER routes
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Error handler LAST
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('Unhandled error:', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    if (status >= 500) {
      Sentry.captureException(err);
    }

    // Don't expose internal errors in production
    const responseMessage = process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal Server Error'
      : message;

    res.status(status).json({
      error: responseMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  });

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    console.log(`🚀 Server started successfully on port ${port}`);
    console.log(`📱 Open your browser to: http://localhost:${port}`);
    console.log(`🎙️ Enhanced Voice Cloning Wizard is ready!`);
  });
})();
