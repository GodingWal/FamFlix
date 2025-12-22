import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { healthService } from '../../server/services/healthService';
import { promises as fs } from 'fs';
import { join } from 'path';

// Mock dependencies
vi.mock('../../server/db/connection', () => ({
  checkDatabaseHealth: vi.fn(),
}));

vi.mock('../../server/config', () => ({
  config: {
    UPLOAD_DIR: 'test-uploads',
    OPENAI_API_KEY: 'test-key',
    NODE_ENV: 'test',
  },
}));

const uploadDir = join(process.cwd(), 'test-uploads');

beforeAll(async () => {
  await fs.mkdir(uploadDir, { recursive: true });
});

afterAll(async () => {
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('HealthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('getSimpleHealth', () => {
    it('should return healthy status when database is healthy', async () => {
      const { checkDatabaseHealth } = await import('../../server/db/connection');
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        status: 'healthy',
        responseTime: 50,
      });

      const result = await healthService.getSimpleHealth();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });

    it('should return error status when database is unhealthy', async () => {
      const { checkDatabaseHealth } = await import('../../server/db/connection');
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        status: 'unhealthy',
        responseTime: 5000,
        error: 'Connection failed',
      });

      const result = await healthService.getSimpleHealth();

      expect(result.status).toBe('error');
      expect(result.timestamp).toBeDefined();
    });

    it('should return error status when database check throws', async () => {
      const { checkDatabaseHealth } = await import('../../server/db/connection');
      vi.mocked(checkDatabaseHealth).mockRejectedValue(new Error('Database error'));

      const result = await healthService.getSimpleHealth();

      expect(result.status).toBe('error');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getSystemHealth', () => {
    it('should return comprehensive health check', async () => {
      // Mock database health
      const { checkDatabaseHealth } = await import('../../server/db/connection');
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        status: 'healthy',
        responseTime: 50,
      });

      // Mock external API calls
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
        } as Response);

      const result = await healthService.getSystemHealth();

      expect(result.status).toBe('healthy');
      expect(result.checks).toHaveLength(3); // database, filesystem, openai
      expect(result.system).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should return degraded status when external service fails', async () => {
      // Mock database as healthy
      const { checkDatabaseHealth } = await import('../../server/db/connection');
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        status: 'healthy',
        responseTime: 50,
      });

      // Mock external APIs as failing
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('API Error'));

      const result = await healthService.getSystemHealth();

      expect(result.status).toBe('degraded');
      expect(result.checks.some(check => check.status === 'unhealthy')).toBe(true);
    });

    it('should return unhealthy status when critical services fail', async () => {
      // Mock database as unhealthy
      const { checkDatabaseHealth } = await import('../../server/db/connection');
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        status: 'unhealthy',
        responseTime: 5000,
        error: 'Connection failed',
      });

      const result = await healthService.getSystemHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.find(check => check.service === 'database')?.status).toBe('unhealthy');
    });
  });
});
