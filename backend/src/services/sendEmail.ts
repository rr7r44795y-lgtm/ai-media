import nodemailer from 'nodemailer';
import { ScheduleRecord } from '../types.js';
import { buildFallbackHtml, buildFallbackText } from '../emails/fallbackEmail.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendFallbackEmail = async (
  userId: string,
  schedule: ScheduleRecord,
  signedLinks: string[],
  error: string
): Promise<void> => {
  if (!process.env.ALERT_EMAIL_TO) return;
  const html = buildFallbackHtml(schedule, signedLinks, error);
  const text = buildFallbackText(schedule, signedLinks, error);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@example.com',
    to: process.env.ALERT_EMAIL_TO,
    subject: 'Manual publish required',
    html,
    text,
    headers: {
      'X-User-ID': userId,
    },
  });
};

export const sendAdminAlert = async (subject: string, message: string): Promise<void> => {
  if (!process.env.ALERT_EMAIL_TO) return;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@example.com',
    to: process.env.ALERT_EMAIL_TO,
    subject,
    text: message,
  });
};
