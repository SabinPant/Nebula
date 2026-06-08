/**
 * Email Service
 *
 * Centralized email delivery for the entire server.
 * Uses Nodemailer with SMTP transport configured from environment variables.
 *
 * In development, emails go to Mailhog (localhost:1025) — viewable at localhost:8025.
 * In production, emails go through a real SMTP provider (Resend, SendGrid, etc.).
 * Same code path, different env vars — no runtime branching.
 *
 * Rate limiting is NOT enforced here — callers are responsible for checking
 * Redis rate limits before calling sendMail(). This keeps the email service
 * purely about delivery, not business rules.
 *
 * Never logs: email body, tokens, or sensitive content.
 * Logs: recipient, subject, timestamp (for debugging delivery issues).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: Transporter;
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
  this.from = configService.get<string>('SMTP_FROM') || 'noreply@nebula.com';

  const smtpUser = configService.get<string>('SMTP_USER');
  const smtpPass = configService.get<string>('SMTP_PASS');

  this.transporter = nodemailer.createTransport({
    host: configService.get<string>('SMTP_HOST'),
    port: configService.get<number>('SMTP_PORT'),
    secure: configService.get<number>('SMTP_PORT') === 465,
    ...(smtpUser && smtpPass ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
  });
}

  /**
   * Sends an email.
   *
   * @param to - Recipient email address
   * @param subject - Email subject line
   * @param html - HTML body content
   */
  async sendMail(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
    });

    this.logger.log(`Email sent to ${to} — subject: "${subject}"`);
  }
}