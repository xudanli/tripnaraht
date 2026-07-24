import { DateTime } from 'luxon';
import type { IntercomMessageDto } from '../types/in-trip-comms.types';

export function buildCommsSummaryBullets(
  messages: IntercomMessageDto[],
  maxBullets: number,
  nameByUserId: Map<string, string>,
): { bullets: string[]; sourceMessageIds: string[] } {
  const candidates = messages.filter(
    (m) => m.body && m.body.trim().length > 0 && m.type !== 'system',
  );

  const picked =
    candidates.length <= maxBullets
      ? candidates
      : evenlySample(candidates, maxBullets);

  const bullets: string[] = [];
  const sourceMessageIds: string[] = [];

  for (const msg of picked) {
    if (!msg.id) continue;
    const time = DateTime.fromISO(msg.serverCreatedAt ?? msg.createdAt).toFormat('HH:mm');
    const who = nameByUserId.get(msg.senderId) ?? msg.senderDisplayName ?? msg.senderId.slice(0, 8);
    const body =
      msg.type === 'location_pin' && msg.location?.label
        ? `📍 ${msg.location.label}`
        : truncate(msg.body.replace(/\s+/g, ' ').trim(), 80);
    bullets.push(`${time} ${who}：${body}`);
    sourceMessageIds.push(msg.id);
  }

  return { bullets, sourceMessageIds };
}

function evenlySample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = (items.length - 1) / Math.max(1, count - 1);
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(items[Math.round(i * step)]);
  }
  return out;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
