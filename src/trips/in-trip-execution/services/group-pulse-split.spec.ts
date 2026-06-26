import {
  calibratePhysicalFromMood,
  moodScoreToEmotional,
  scoreToThermometerLevel,
  spendingPaceToLevel,
} from '../utils/state-vector.util';

describe('state-vector.util', () => {
  it('maps mood scores to emotional levels', () => {
    expect(moodScoreToEmotional(5)).toBe('joyful');
    expect(moodScoreToEmotional(2)).toBe('irritable');
  });

  it('calibrates physical level with Money DNA', () => {
    expect(calibratePhysicalFromMood(3, 0.8)).toBe('fatigued');
    expect(calibratePhysicalFromMood(1, 0.3)).toBe('exhausted');
  });

  it('maps spending pace ratio to levels', () => {
    expect(spendingPaceToLevel(0.5)).toBe('surplus');
    expect(spendingPaceToLevel(1.2)).toBe('tight');
  });

  it('maps team score to thermometer bands', () => {
    expect(scoreToThermometerLevel(0.8)).toBe('green');
    expect(scoreToThermometerLevel(0.4)).toBe('orange');
  });
});
