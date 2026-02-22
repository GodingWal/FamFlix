import nodemailer from "nodemailer";
import { config } from "../config";
import { logger } from "../utils/logger-simple";

interface BaseEmailPayload {
  to: string;
  username?: string | null;
}

interface VerificationEmailPayload extends BaseEmailPayload {
  token: string;
}

interface PasswordResetEmailPayload extends BaseEmailPayload {
  token: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null;
  private readonly isConfigured: boolean;

  constructor() {
    this.isConfigured = Boolean(
      config.SMTP_HOST &&
      config.SMTP_PORT &&
      config.FROM_EMAIL
    );

    if (!this.isConfigured) {
      this.transporter = null;
      logger.warn("Email service is not fully configured. Emails will be logged but not sent.");
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER && config.SMTP_PASS
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined,
    });
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }

  private async sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      logger.info("Email send skipped (service not configured)", { to, subject });
      logger.debug(html);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: config.FROM_EMAIL,
        to,
        subject,
        html,
        text,
      });
      logger.info("Email sent", { to, subject });
    } catch (error) {
      logger.error("Failed to send email", { error, to, subject });
      throw error;
    }
  }

  async sendVerificationEmail({ to, token, username }: VerificationEmailPayload): Promise<void> {
    const verificationUrl = `${config.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;
    const subject = "Verify your VoxTree account";
    const greetingName = username || "there";
    const html = `
      <p>Hi ${greetingName},</p>
      <p>Thanks for signing up for VoxTree! Please verify your email address by clicking the button below:</p>
      <p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 12px 20px; background-color: #2D8B70; color: #ffffff; text-decoration: none; border-radius: 6px;">
          Verify Email
        </a>
      </p>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p><a href="${verificationUrl}">${verificationUrl}</a></p>
      <p>This verification link will expire in 24 hours.</p>
      <p>Welcome to the VoxTree family! 🎬</p>
    `;

    const text = `Hi ${greetingName},\n\nVerify your VoxTree account by visiting: ${verificationUrl}\n\nThis link expires in 24 hours.`;

    await this.sendEmail({ to, subject, html, text });
  }

  async sendPasswordResetEmail({ to, token, username }: PasswordResetEmailPayload): Promise<void> {
    const resetUrl = `${config.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const subject = "Reset your VoxTree password";
    const greetingName = username || "there";
    const html = `
      <p>Hi ${greetingName},</p>
      <p>We received a request to reset your VoxTree password. You can set a new password by clicking the button below:</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 20px; background-color: #2D8B70; color: #ffffff; text-decoration: none; border-radius: 6px;">
          Reset Password
        </a>
      </p>
      <p>If you didn't request a password reset, you can safely ignore this email. The link will expire in 1 hour.</p>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>Stay creative,</p>
      <p>The VoxTree Team</p>
    `;

    const text = `Hi ${greetingName},\n\nReset your VoxTree password by visiting: ${resetUrl}\n\nIf you didn't request this, you can ignore this email. The link expires in 1 hour.`;

    await this.sendEmail({ to, subject, html, text });
  }

  async sendMarketingLeadNotification(payload: {
    name: string;
    email: string;
    familySize: number;
    message: string;
  }): Promise<void> {
    const recipient = config.MARKETING_LEAD_EMAIL ?? config.FROM_EMAIL;

    if (!recipient) {
      logger.warn("Marketing lead notification skipped (no recipient configured)", payload);
      return;
    }

    const subject = `New VoxTree lead from ${payload.name}`;
    const html = `
      <p><strong>Name:</strong> ${payload.name}</p>
      <p><strong>Email:</strong> ${payload.email}</p>
      <p><strong>Family Size:</strong> ${payload.familySize}</p>
      <p><strong>Message:</strong></p>
      <p>${payload.message.replace(/\n/g, '<br />')}</p>
    `;

    const text = `New VoxTree lead
Name: ${payload.name}
Email: ${payload.email}
Family Size: ${payload.familySize}

Message:
${payload.message}`;

    await this.sendEmail({ to: recipient, subject, html, text });
  }
}

export const emailService = new EmailService();
