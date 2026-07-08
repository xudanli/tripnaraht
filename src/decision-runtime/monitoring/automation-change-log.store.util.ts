/**
 * Trip.metadata — append-only log of automatic plan mutations (supports undo UX).
 */

import { randomUUID } from 'crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';

export const AUTOMATION_CHANGE_LOG_SCHEMA_ID = 'tripnara.automation_change_log@v1';
export const AUTOMATION_CHANGE_LOG_METADATA_KEY = 'automationChangeLog';

export type AutomationChangeLogStatus = 'APPLIED' | 'ROLLED_BACK';

export interface AutomationChangeLogEntry {
  logId: string;
  resolutionId?: string;
  problemId: string;
  appliedAt: string;
  changeSummary: string;
  status: AutomationChangeLogStatus;
  matchedActionKeys?: string[];
  selectedActionId: string;
  undoActionId?: string;
  affectedDayNumbers?: number[];
  itemsChanged?: number;
  automatic: boolean;
  reversible: boolean;
  rolledBackAt?: string;
  rolledBackByUserId?: string;
}

export interface AutomationChangeLogState {
  schemaId: typeof AUTOMATION_CHANGE_LOG_SCHEMA_ID;
  entries: AutomationChangeLogEntry[];
}

export function readAutomationChangeLog(metadata: unknown): AutomationChangeLogEntry[] {
  const root = (metadata ?? {}) as Record<string, unknown>;
  const raw = root[AUTOMATION_CHANGE_LOG_METADATA_KEY] as AutomationChangeLogState | undefined;
  return [...(raw?.entries ?? [])];
}

export function buildAutomationChangeLogId(): string {
  return `acl_${randomUUID().slice(0, 12)}`;
}

export async function appendAutomationChangeLogEntry(
  prisma: PrismaService,
  tripId: string,
  entry: AutomationChangeLogEntry,
): Promise<AutomationChangeLogEntry> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
  const entries = readAutomationChangeLog(meta);

  const next: AutomationChangeLogState = {
    schemaId: AUTOMATION_CHANGE_LOG_SCHEMA_ID,
    entries: [entry, ...entries].slice(0, 50),
  };

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      metadata: toInputJsonValue({
        ...meta,
        [AUTOMATION_CHANGE_LOG_METADATA_KEY]: next,
      }),
    },
  });

  return entry;
}

export async function markAutomationChangeLogRolledBack(
  prisma: PrismaService,
  tripId: string,
  logId: string,
  userId: string,
): Promise<AutomationChangeLogEntry | undefined> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
  const entries = readAutomationChangeLog(meta);
  const index = entries.findIndex((e) => e.logId === logId);
  if (index < 0) return undefined;

  const updated: AutomationChangeLogEntry = {
    ...entries[index],
    status: 'ROLLED_BACK',
    rolledBackAt: new Date().toISOString(),
    rolledBackByUserId: userId,
  };
  entries[index] = updated;

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      metadata: toInputJsonValue({
        ...meta,
        [AUTOMATION_CHANGE_LOG_METADATA_KEY]: {
          schemaId: AUTOMATION_CHANGE_LOG_SCHEMA_ID,
          entries,
        },
      }),
    },
  });

  return updated;
}

export function findAutomationChangeLogEntry(
  metadata: unknown,
  logId: string,
): AutomationChangeLogEntry | undefined {
  return readAutomationChangeLog(metadata).find((e) => e.logId === logId);
}
