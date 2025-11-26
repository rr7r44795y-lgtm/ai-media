import { ScheduleRecord } from '../types.js';

const legalNotice =
  'All content is provided by the user. The user is solely responsible for accuracy, legality, copyright compliance, and platform policies.';

type PlatformText = string | { title?: string; description?: string } | null | undefined;

const renderPlatformCopy = (label: string, body: PlatformText): string => {
  if (!body) return `${label}: Not provided.`;
  if (typeof body === 'string') return `${label}: ${body}`;
  const { title, description } = body;
  return `${label}: ${title || 'Untitled'}\n${description || ''}`.trim();
};

export function buildFallbackText(schedule: ScheduleRecord, signedUrls: string[], error: string): string {
  const linkBlock = signedUrls.length ? `Download Links:\n${signedUrls.join('\n')}` : 'No media links available.';
  const sections = [
    renderPlatformCopy('Instagram (IG)', schedule.platform_text as PlatformText),
    renderPlatformCopy('Facebook', schedule.platform_text as PlatformText),
    renderPlatformCopy('LinkedIn', schedule.platform_text as PlatformText),
    renderPlatformCopy('YouTube Draft', schedule.platform_text as PlatformText),
  ].join('\n\n');

  return [
    `Manual publish required for schedule ${schedule.id}`,
    `Platform: ${schedule.platform}`,
    `Scheduled At: ${schedule.scheduled_time}`,
    `Last Error: ${error}`,
    linkBlock,
    '--- Platform Copies ---',
    sections,
    `Legal: ${legalNotice}`,
  ].join('\n\n');
}

export function buildFallbackHtml(schedule: ScheduleRecord, signedUrls: string[], error: string): string {
  const listItems = signedUrls
    .map((url) => `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></li>`)
    .join('');
  const youtube = schedule.platform_text as { title?: string; description?: string } | null;
  const renderText = (label: string, body: PlatformText) => {
    if (!body) return `<p><strong>${label}:</strong> Not provided.</p>`;
    if (typeof body === 'string') {
      return `<p><strong>${label}:</strong> ${body.replace(/\n/g, '<br/>')}</p>`;
    }
    return `<div><p><strong>${label}:</strong></p><p><em>Title:</em> ${body.title || 'Untitled'}</p><p><em>Description:</em><br/>${
      body.description?.replace(/\n/g, '<br/>') || ''
    }</p></div>`;
  };

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a;">
      <h2>Manual publish required</h2>
      <p>Schedule <strong>${schedule.id}</strong> for <strong>${schedule.platform}</strong> could not be auto-published.</p>
      <p><strong>Scheduled At:</strong> ${schedule.scheduled_time}</p>
      <p><strong>Last Error:</strong> ${error}</p>
      <h3>Download links</h3>
      <ul>${listItems || '<li>No media links available</li>'}</ul>
      <h3>Platform Copies</h3>
      ${renderText('Instagram (IG)', schedule.platform_text as PlatformText)}
      ${renderText('Facebook', schedule.platform_text as PlatformText)}
      ${renderText('LinkedIn', schedule.platform_text as PlatformText)}
      ${renderText('YouTube Draft', youtube)}
      <p style="margin-top:16px; font-size:12px; color:#475569;">${legalNotice}</p>
    </div>
  `;
}
