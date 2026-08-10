import type { MeetingPointKind } from './grounding.types';

export function assessMeetingPoint(input: {
  detectedOperator?: string;
  bookingOperatorName?: string;
  bookingMeetingPointName?: string;
}): { kind: MeetingPointKind; notes: string[] } {
  const notes: string[] = [];
  const detected = normalize(input.detectedOperator);
  const expected = normalize(
    input.bookingOperatorName ?? input.bookingMeetingPointName,
  );

  if (!detected) {
    return { kind: 'UNKNOWN', notes: ['No operator sign detected'] };
  }
  if (!expected) {
    notes.push('No booking meeting point in context');
    return { kind: 'UNKNOWN', notes };
  }

  if (detected === expected || detected.includes(expected) || expected.includes(detected)) {
    notes.push(`Operator/meeting point matches booking (${expected})`);
    return { kind: 'MATCH', notes };
  }

  notes.push(
    `Detected "${input.detectedOperator}" vs booking "${input.bookingOperatorName ?? input.bookingMeetingPointName}"`,
  );
  return { kind: 'MISMATCH', notes };
}

function normalize(s?: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
