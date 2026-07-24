import {
  appendFilledSlotToSnapshot,
  buildFilledSlotRecord,
  listOccupiedSlotIndexes,
  mergeFilledSlotsIntoTeamPuzzle,
  readTeamPuzzleFilledSlots,
  resolveApplicationTargetSlot,
} from './team-puzzle-assignment.engine';
import { TEAM_PUZZLE_FILLED_SNAPSHOT_KEY } from '../types/team-puzzle-assignment.types';
import type { TeamPuzzleSlotView } from '../types/match-square.types';

describe('team-puzzle-assignment.engine', () => {
  it('resolves puzzle-slot id to index', () => {
    expect(
      resolveApplicationTargetSlot({
        targetSlotId: 'puzzle-slot-2',
        memberSlotCount: 4,
      }),
    ).toEqual({ slotIndex: 2, slotId: 'puzzle-slot-2' });
  });

  it('resolves vibe-slot id via slot_definitions order', () => {
    expect(
      resolveApplicationTargetSlot({
        targetSlotId: 'vibe-slot-3',
        memberSlotCount: 3,
        vibeSlotIds: [1, 3, 5],
      }),
    ).toEqual({ slotIndex: 2, slotId: 'vibe-slot-3' });
  });

  it('merges filled slots into open team puzzle slots', () => {
    const slots: TeamPuzzleSlotView[] = [
      { kind: 'filled', slotIndex: 0, roleLabel: '队长', occupantLabel: 'Cap', highlightForViewer: false },
      { kind: 'open', slotIndex: 1, slotId: 'puzzle-slot-1', roleLabel: '摄影师', highlightForViewer: false },
      { kind: 'open', slotIndex: 2, slotId: 'puzzle-slot-2', roleLabel: 'E人', highlightForViewer: false },
    ];

    const merged = mergeFilledSlotsIntoTeamPuzzle(slots, {
      version: 'team_puzzle_filled_v1',
      slots: [
        {
          slotIndex: 1,
          slotId: 'puzzle-slot-1',
          userId: 'u1',
          occupantLabel: 'Alice',
          applicationId: 'app-1',
          roleLabel: '摄影师',
          approvedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(merged[1].kind).toBe('filled');
    expect(merged[1].occupantLabel).toBe('Alice');
    expect(merged[1].occupantUserId).toBe('u1');
    expect(merged[2].kind).toBe('open');
  });

  it('persists filled slots on captain snapshot', () => {
    const snapshot = appendFilledSlotToSnapshot(
      { mbtiType: 'INTJ' },
      buildFilledSlotRecord({
        slotIndex: 1,
        slotId: 'puzzle-slot-1',
        application: {
          id: 'app-1',
          applicantUserId: 'u1',
          applicantCardTitle: 'Alice',
          applicantDisplayName: 'Alice',
        },
      }),
    );

    const filled = readTeamPuzzleFilledSlots(snapshot);
    expect(filled?.slots).toHaveLength(1);
    expect((snapshot as Record<string, unknown>)[TEAM_PUZZLE_FILLED_SNAPSHOT_KEY]).toBeTruthy();
  });

  it('tracks occupied indexes from filled + pending', () => {
    const occupied = listOccupiedSlotIndexes(
      {
        version: 'team_puzzle_filled_v1',
        slots: [
          {
            slotIndex: 1,
            slotId: 'puzzle-slot-1',
            userId: 'u1',
            occupantLabel: 'A',
            applicationId: 'a1',
            roleLabel: 'R1',
            approvedAt: 't',
          },
        ],
      },
      [{ targetSlotIndex: 2 }],
    );
    expect([...occupied].sort()).toEqual([1, 2]);
  });
});
