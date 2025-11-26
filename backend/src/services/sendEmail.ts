import nodemailer from 'nodemailer';
import { ScheduleRecord } from '../types.js';

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
  const html = `
    <h2>Fallback required for schedule ${schedule.id}</h2>
    <p>Status: failed after retries</p>
    <p>Error: ${error}</p>
    <p>Platform: ${schedule.platform}</p>
    <p>Scheduled time: ${schedule.scheduled_time}</p>
    <h3>Content links</h3>
    <ul>${signedLinks.map((l) => `<li><a href="${l}">${l}</a></li>`).join('')}</ul>
    <p>Legal: All content is provided exactly as input by the user. The user is solely responsible for content accuracy, legality, and copyright compliance.</p>
  `;
  const text = `Fallback for schedule ${schedule.id} on ${schedule.platform}\nError: ${error}\nLinks:${signedLinks.join('\n')}`;
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
