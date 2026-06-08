import { BadRequestException } from '@nestjs/common';
import { normalizePlanningStyleInput } from './planning-style.util';

describe('normalizePlanningStyleInput', () => {
  it('accepts camelCase planningStyle', () => {
    expect(normalizePlanningStyleInput({ planningStyle: 'full_managed' })).toBe('full_managed');
  });

  it('accepts snake_case planning_style', () => {
    expect(normalizePlanningStyleInput({ planning_style: 'casual_play' })).toBe('casual_play');
  });

  it('throws when missing on create', () => {
    expect(() => normalizePlanningStyleInput({})).toThrow(BadRequestException);
  });
});
