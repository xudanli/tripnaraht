/**
 * MEM-BLOCKER-PDI-001 — private wish (PDI) isolation fixture.
 */
import {
  buildPrivateWishDigest,
  buildWishConstraintDigest,
} from '../../../agent/memory/utils/trip-intent-digest.util';
import { buildTripIntentContextBlocks } from '../../../agent/memory/utils/trip-intent-context-blocks.util';
import type { TripIntentDigestBundle } from '../../../agent/memory/services/trip-intent-digest.service';

export const PDI_MEMBER_A = 'member-a-owner';
export const PDI_MEMBER_B = 'member-b-peer';
export const PDI_TRIP_ID = 'trip-pdi-blocker-001';

export const PDI_SECRET_TEXT = '我其实有恐高，不想让其他人知道';
export const PDI_SECRET_HINT = '恐高';
export const PDI_FORBIDDEN_SNIPPETS = [PDI_SECRET_TEXT, '不想让其他人知道', PDI_SECRET_HINT];

const wishRows = [
  {
    userId: PDI_MEMBER_A,
    visibility: 'private',
    agentEligible: true,
    structuredHints: { must_avoid: ['恐高', '玻璃栈道'] },
    category: 'activities',
    importance: 5,
    text: PDI_SECRET_TEXT,
  },
  {
    userId: PDI_MEMBER_B,
    visibility: 'signed',
    agentEligible: true,
    structuredHints: { must_do: ['看极光'] },
    category: 'activities',
    importance: 3,
    text: '我想看极光',
  },
];

export function loadTripIntentBundleForUser(userId: string): TripIntentDigestBundle {
  return {
    domainInfluenceDigest: null,
    wishConstraintDigest: buildWishConstraintDigest(wishRows, userId),
    privateWishDigest: buildPrivateWishDigest(wishRows, userId),
    decisionProfilingDigest: null,
    negotiationDigest: null,
  };
}

export function assembleTripIntentContextText(userId: string): string {
  const bundle = loadTripIntentBundleForUser(userId);
  const blocks = buildTripIntentContextBlocks(bundle, PDI_TRIP_ID, userId);
  return JSON.stringify({
    privateWishDigest: bundle.privateWishDigest,
    wishConstraintDigest: bundle.wishConstraintDigest,
    contextBlocks: blocks.map((b) => ({ key: b.key, text: b.text, visibility: b.visibility })),
  });
}
