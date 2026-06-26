import type { Gate1TrustCard, Gate1TrustSurface } from '../types/gate1-trust-surface.types';
import { sanitizeTrustSurfaceForParticipant } from './gate1-trust-surface.participant.util';

const baseCard = (overrides: Partial<Gate1TrustCard>): Gate1TrustCard => ({
  cardId: 'c1',
  subjectType: 'CANDIDATE',
  subjectId: 'id1',
  title: '方案 A',
  confidence: { level: 'HIGH', score: 0.8, rationale: '脱敏约束满足度 80%' },
  alternatives: [],
  dataSources: [
    { id: 's1', label: '脱敏约束', kind: 'SANITIZED_CONSTRAINT' },
    { id: 's2', label: '顾问', kind: 'ADVISOR' },
  ],
  machineAesthetic: {
    humanAssisted: true,
    humanMinutes: 45,
    disclaimer: 'internal',
  },
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

describe('sanitizeTrustSurfaceForParticipant', () => {
  it('drops advisor decision cards and internal fields', () => {
    const surface: Gate1TrustSurface = {
      projectId: 'p1',
      schemaVersion: 1,
      cards: [
        baseCard({ subjectType: 'CANDIDATE' }),
        baseCard({ cardId: 'd1', subjectType: 'DECISION', title: '顾问决策' }),
        baseCard({ cardId: 'p1', subjectType: 'PLAN_B', title: 'Plan B' }),
      ],
      summary: { totalCards: 3, highConfidenceCount: 2, humanAssistedCount: 2 },
    };
    const out = sanitizeTrustSurfaceForParticipant(surface);
    expect(out.cards).toHaveLength(2);
    expect(out.cards.every((c) => c.subjectType !== 'DECISION')).toBe(true);
    expect(out.cards[0].machineAesthetic.humanMinutes).toBeNull();
    expect(out.cards[0].dataSources.some((s) => s.kind === 'ADVISOR')).toBe(false);
    expect(out.cards[0].confidence.rationale).toContain('团队约束');
  });
});
