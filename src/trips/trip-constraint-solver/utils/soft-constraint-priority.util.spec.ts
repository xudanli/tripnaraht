import {
  intensityFromPriority,
  normalizeSoftPriorityPatch,
  priorityFromIntensity,
  priorityToSoftPriorityTier,
} from './soft-constraint-priority.util';

describe('soft-constraint-priority.util', () => {
  it('maps priority tiers to intensity SSOT', () => {
    expect(intensityFromPriority(8)).toBe(85);
    expect(intensityFromPriority(5)).toBe(50);
    expect(intensityFromPriority(3)).toBe(25);
  });

  it('priorityToSoftPriorityTier aligns with frontend', () => {
    expect(priorityToSoftPriorityTier(8)).toBe('HIGH');
    expect(priorityToSoftPriorityTier(5)).toBe('MEDIUM');
    expect(priorityToSoftPriorityTier(3)).toBe('LOW');
  });

  it('normalizeSoftPriorityPatch syncs priority and intensity', () => {
    const { priority, value } = normalizeSoftPriorityPatch({
      priority: 8,
      value: { templateId: 'minimize_hotel_changes' },
    });
    expect(priority).toBe(8);
    expect(value.intensity).toBe(85);
  });

  it('derives priority from intensity when priority omitted', () => {
    expect(priorityFromIntensity(85)).toBe(8);
    expect(
      normalizeSoftPriorityPatch({ value: { intensity: 50 } }).priority,
    ).toBe(5);
  });
});
