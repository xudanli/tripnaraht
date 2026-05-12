import { addMinutesToIsoTime, parseIsoTimeToMinutes } from './weather-slot-delay.util';

describe('weather-slot-delay.util', () => {
  it('addMinutesToIsoTime clamps within single day', () => {
    expect(parseIsoTimeToMinutes('10:00')).toBe(600);
    expect(addMinutesToIsoTime('10:00', 45)).toBe('10:45');
    expect(addMinutesToIsoTime('23:30', 60)).toBe('23:59');
  });
});
