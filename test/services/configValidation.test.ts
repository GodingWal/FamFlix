import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Re-declare the schema inline so we can test it without triggering process.exit
const configSchema = z.object({
  DATABASE_URL: z.string().min(1, "Database URL is required"),
  JWT_SECRET: z.string().min(32, "JWT secret must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT refresh secret must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  SESSION_SECRET: z.string().min(32, "Session secret must be at least 32 characters"),
  SESSION_TIMEOUT: z.string().default("30m"),
  COOKIE_SECURE: z.string().transform(val => val === "true").default("false"),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default("900000"),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default("100"),
  AUTH_RATE_LIMIT_MAX: z.string().transform(Number).default("5"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default("5000"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

describe('Config Validation', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://localhost:5432/voxtree',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    SESSION_SECRET: 'c'.repeat(32),
  };

  it('should accept valid configuration', () => {
    const result = configSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it('should reject missing DATABASE_URL', () => {
    const { DATABASE_URL, ...env } = validEnv;
    const result = configSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('should reject JWT_SECRET shorter than 32 characters', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      JWT_SECRET: 'tooshort',
    });
    expect(result.success).toBe(false);
  });

  it('should reject JWT_REFRESH_SECRET shorter than 32 characters', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      JWT_REFRESH_SECRET: 'tooshort',
    });
    expect(result.success).toBe(false);
  });

  it('should reject SESSION_SECRET shorter than 32 characters', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      SESSION_SECRET: 'tooshort',
    });
    expect(result.success).toBe(false);
  });

  it('should apply default values for optional fields', () => {
    const result = configSchema.parse(validEnv);
    expect(result.JWT_ACCESS_EXPIRES_IN).toBe('15m');
    expect(result.JWT_REFRESH_EXPIRES_IN).toBe('7d');
    expect(result.PORT).toBe(5000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.COOKIE_SECURE).toBe(false);
    expect(result.COOKIE_SAME_SITE).toBe('lax');
    expect(result.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    expect(result.AUTH_RATE_LIMIT_MAX).toBe(5);
  });

  it('should reject invalid NODE_ENV', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'staging',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid LOG_LEVEL', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      LOG_LEVEL: 'verbose',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid COOKIE_SAME_SITE', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      COOKIE_SAME_SITE: 'relaxed',
    });
    expect(result.success).toBe(false);
  });

  it('should transform COOKIE_SECURE string to boolean', () => {
    const result = configSchema.parse({
      ...validEnv,
      COOKIE_SECURE: 'true',
    });
    expect(result.COOKIE_SECURE).toBe(true);
  });

  it('should transform PORT string to number', () => {
    const result = configSchema.parse({
      ...validEnv,
      PORT: '3000',
    });
    expect(result.PORT).toBe(3000);
  });
});
