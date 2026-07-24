/**
 * contextHash — only fields declared on PageAIContract.contextHashFields.
 */

import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type {
  ClientPageState,
  EntityRef,
  PageAIContract,
} from '../contracts/page-insight.types';

export interface ContextHashVersionInputs {
  relevantTripProjectionVersion: string;
  relevantConstraintVersion?: string;
  relevantDecisionWorkspaceVersion?: string;
  relevantWorldStateVersion?: string;
  draftRevision?: number | null;
}

@Injectable()
export class PageInsightContextHashService {
  compute(
    contract: PageAIContract,
    client: ClientPageState,
    versions: ContextHashVersionInputs,
  ): string {
    const parts: string[] = [contract.pageContractVersion];
    const fields = new Set(contract.contextHashFields);

    if (fields.has('pageId')) parts.push(`page:${client.pageId}`);
    if (fields.has('pageMode')) parts.push(`mode:${client.pageMode ?? ''}`);
    if (fields.has('insightScope')) parts.push(`scope:${client.insightScope ?? ''}`);
    if (fields.has('lifecycle')) parts.push(`life:${client.lifecycle}`);
    if (fields.has('selectedEntityRefs')) {
      parts.push(`sel:${canonicalizeRefs(client.selectedRefs ?? [])}`);
    }
    if (fields.has('selectedDayId')) {
      const dayKey =
        client.viewport?.selectedDayId ??
        (client.viewport?.selectedDayIndex != null
          ? `idx:${client.viewport.selectedDayIndex}`
          : '');
      parts.push(`day:${dayKey}`);
    }
    if (fields.has('activeTab')) {
      parts.push(`tab:${client.viewport?.activeTab ?? ''}`);
    }
    if (fields.has('mapBounds')) {
      const b = client.viewport?.mapBounds;
      parts.push(
        b
          ? `map:${b.north},${b.south},${b.east},${b.west}`
          : 'map:',
      );
    }
    if (fields.has('relevantTripProjectionVersion')) {
      parts.push(`trip:${versions.relevantTripProjectionVersion}`);
    }
    if (fields.has('relevantConstraintVersion')) {
      parts.push(`cstr:${versions.relevantConstraintVersion ?? ''}`);
    }
    if (fields.has('relevantDecisionWorkspaceVersion')) {
      parts.push(`dw:${versions.relevantDecisionWorkspaceVersion ?? ''}`);
    }
    if (fields.has('relevantWorldStateVersion')) {
      parts.push(`ws:${versions.relevantWorldStateVersion ?? ''}`);
    }
    if (fields.has('draftRevision')) {
      parts.push(
        `draft:${versions.draftRevision ?? client.draftRevision ?? client.draftRef?.revision ?? ''}`,
      );
    }

    return `ctxh_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)}`;
  }
}

export function canonicalizeRefs(refs: EntityRef[]): string {
  return [...refs]
    .map((r) => `${r.entityType}:${r.entityId}`)
    .sort()
    .join(',');
}
