import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Mock environment variables for testing
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/famflix_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-key-for-testing-only';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-key-for-testing-only';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1'; // Use database 1 for tests

// Global test setup
beforeAll(async () => {
  // Setup test database
  console.log('Setting up test environment...');
});

afterAll(async () => {
  // Cleanup test database
  console.log('Cleaning up test environment...');
});

beforeEach(async () => {
  // Reset database state before each test
});

afterEach(async () => {
  // Cleanup after each test
});

// Mock external services
global.fetch = vi.fn();

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
