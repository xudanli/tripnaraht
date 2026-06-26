import type { TripSilentVote } from '@prisma/client';
import type {
  SilentVoteOption,
  SilentVoteRecord,
  SilentVoteStatus,
} from '../types/silent-vote.types';
import { SILENT_VOTE_STATUSES } from '../types/silent-vote.types';

export function parseSilentVoteOptions(raw: unknown): SilentVoteOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      label: String(item.label ?? ''),
      planId: item.planId != null ? String(item.planId) : undefined,
      summaryRef: item.summaryRef != null ? String(item.summaryRef) : undefined,
    }))
    .filter((o) => o.id && o.label);
}

export function isSilentVoteStatus(value: string): value is SilentVoteStatus {
  return (SILENT_VOTE_STATUSES as readonly string[]).includes(value);
}

export function mapSilentVoteRow(row: TripSilentVote): SilentVoteRecord {
  const status = isSilentVoteStatus(row.status) ? row.status : 'draft';
  return {
    id: row.id,
    tripId: row.tripId,
    createdBy: row.createdBy,
    title: row.title,
    question: row.question,
    status,
    options: parseSilentVoteOptions(row.options),
    closesAt: row.closesAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
