import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type nodemailer from 'nodemailer';

// Mock dependencies before importing the service
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

vi.mock('../../server/utils/logger-simple', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('EmailService', () => {
  let mockSendMail: ReturnType<typeof vi.fn>;
  let mockTransporter: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-message-id' });
    mockTransporter = {
      sendMail: mockSendMail,
    };

    const nodemailerModule = await import('nodemailer');
    vi.mocked(nodemailerModule.default.createTransport).mockReturnValue(mockTransporter);

    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('Service initialization', () => {
    it('should initialize with proper SMTP configuration', async () => {
      // Set up environment for configured service
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          SMTP_USER: 'test@test.com',
          SMTP_PASS: 'testpass',
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const nodemailerModule = await import('nodemailer');
      const { emailService } = await import('../../server/services/emailService');

      expect(nodemailerModule.default.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@test.com',
          pass: 'testpass',
        },
      });

      expect(emailService.isEnabled()).toBe(true);
    });

    it('should use secure connection for port 465', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 465,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const nodemailerModule = await import('nodemailer');
      await import('../../server/services/emailService');

      const transportConfig = vi.mocked(nodemailerModule.default.createTransport).mock.calls[0][0];
      expect(transportConfig.secure).toBe(true);
    });

    it('should initialize without auth when credentials not provided', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const nodemailerModule = await import('nodemailer');
      await import('../../server/services/emailService');

      const transportConfig = vi.mocked(nodemailerModule.default.createTransport).mock.calls[0][0];
      expect(transportConfig.auth).toBeUndefined();
    });

    it('should mark service as disabled when SMTP not configured', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { logger } = await import('../../server/utils/logger-simple');
      const { emailService } = await import('../../server/services/emailService');

      expect(emailService.isEnabled()).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Email service is not fully configured')
      );
    });
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email with proper content', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendVerificationEmail({
        to: 'user@example.com',
        token: 'test-token-123',
        username: 'TestUser',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const emailArgs = mockSendMail.mock.calls[0][0];

      expect(emailArgs.from).toBe('noreply@famflix.com');
      expect(emailArgs.to).toBe('user@example.com');
      expect(emailArgs.subject).toBe('Verify your FamFlix account');
      expect(emailArgs.html).toContain('TestUser');
      expect(emailArgs.html).toContain('http://localhost:5000/verify-email?token=test-token-123');
      expect(emailArgs.text).toContain('http://localhost:5000/verify-email?token=test-token-123');
    });

    it('should use "there" as greeting when username not provided', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendVerificationEmail({
        to: 'user@example.com',
        token: 'test-token',
      });

      const emailArgs = mockSendMail.mock.calls[0][0];
      expect(emailArgs.html).toContain('Hi there');
    });

    it('should properly encode special characters in token', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendVerificationEmail({
        to: 'user@example.com',
        token: 'token+with/special=chars',
        username: 'TestUser',
      });

      const emailArgs = mockSendMail.mock.calls[0][0];
      expect(emailArgs.html).toContain('token%2Bwith%2Fspecial%3Dchars');
    });

    it('should log but not send when service is not configured', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { logger } = await import('../../server/utils/logger-simple');
      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendVerificationEmail({
        to: 'user@example.com',
        token: 'test-token',
        username: 'TestUser',
      });

      expect(mockSendMail).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Email send skipped'),
        expect.any(Object)
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with proper content', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendPasswordResetEmail({
        to: 'user@example.com',
        token: 'reset-token-456',
        username: 'TestUser',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const emailArgs = mockSendMail.mock.calls[0][0];

      expect(emailArgs.from).toBe('noreply@famflix.com');
      expect(emailArgs.to).toBe('user@example.com');
      expect(emailArgs.subject).toBe('Reset your FamFlix password');
      expect(emailArgs.html).toContain('TestUser');
      expect(emailArgs.html).toContain('http://localhost:5000/reset-password?token=reset-token-456');
      expect(emailArgs.text).toContain('http://localhost:5000/reset-password?token=reset-token-456');
    });

    it('should include security advice in reset email', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendPasswordResetEmail({
        to: 'user@example.com',
        token: 'reset-token',
        username: 'TestUser',
      });

      const emailArgs = mockSendMail.mock.calls[0][0];
      expect(emailArgs.html).toContain("didn't request");
      expect(emailArgs.html).toContain('expire');
      expect(emailArgs.text).toContain("didn't request");
    });

    it('should use "there" as greeting when username is null', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendPasswordResetEmail({
        to: 'user@example.com',
        token: 'reset-token',
        username: null,
      });

      const emailArgs = mockSendMail.mock.calls[0][0];
      expect(emailArgs.html).toContain('Hi there');
    });
  });

  describe('sendMarketingLeadNotification', () => {
    it('should send marketing lead notification to configured email', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          MARKETING_LEAD_EMAIL: 'sales@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendMarketingLeadNotification({
        name: 'John Doe',
        email: 'john@example.com',
        familySize: 5,
        message: 'Interested in your product!',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const emailArgs = mockSendMail.mock.calls[0][0];

      expect(emailArgs.to).toBe('sales@famflix.com');
      expect(emailArgs.subject).toContain('John Doe');
      expect(emailArgs.html).toContain('John Doe');
      expect(emailArgs.html).toContain('john@example.com');
      expect(emailArgs.html).toContain('5');
      expect(emailArgs.html).toContain('Interested in your product!');
    });

    it('should fall back to FROM_EMAIL when MARKETING_LEAD_EMAIL not set', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendMarketingLeadNotification({
        name: 'John Doe',
        email: 'john@example.com',
        familySize: 5,
        message: 'Test message',
      });

      const emailArgs = mockSendMail.mock.calls[0][0];
      expect(emailArgs.to).toBe('noreply@famflix.com');
    });

    it('should handle multi-line messages properly', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendMarketingLeadNotification({
        name: 'John Doe',
        email: 'john@example.com',
        familySize: 5,
        message: 'Line 1\nLine 2\nLine 3',
      });

      const emailArgs = mockSendMail.mock.calls[0][0];
      expect(emailArgs.html).toContain('Line 1<br />Line 2<br />Line 3');
      expect(emailArgs.text).toContain('Line 1\nLine 2\nLine 3');
    });

    it('should skip notification when no recipient is configured', async () => {
      vi.doMock('../../server/config', () => ({
        config: {
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { logger } = await import('../../server/utils/logger-simple');
      const { emailService } = await import('../../server/services/emailService');

      await emailService.sendMarketingLeadNotification({
        name: 'John Doe',
        email: 'john@example.com',
        familySize: 5,
        message: 'Test',
      });

      expect(mockSendMail).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Marketing lead notification skipped'),
        expect.any(Object)
      );
    });
  });

  describe('Error handling', () => {
    it('should throw error and log when email sending fails', async () => {
      const sendError = new Error('SMTP connection failed');
      mockSendMail.mockRejectedValueOnce(sendError);

      vi.doMock('../../server/config', () => ({
        config: {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          FROM_EMAIL: 'noreply@famflix.com',
          CLIENT_URL: 'http://localhost:5000',
        },
      }));

      const { logger } = await import('../../server/utils/logger-simple');
      const { emailService } = await import('../../server/services/emailService');

      await expect(
        emailService.sendVerificationEmail({
          to: 'user@example.com',
          token: 'test-token',
          username: 'TestUser',
        })
      ).rejects.toThrow('SMTP connection failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send email',
        expect.objectContaining({
          error: sendError,
          to: 'user@example.com',
        })
      );
    });
  });
});
