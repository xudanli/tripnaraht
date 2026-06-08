import { classifyPoiExperienceCategory, scoreItineraryExperience } from './experience-align-score.util';
import { projectExperienceFlowFromTraceSignals } from '../../trips/decision/models/experience-flow.model';

describe('experience-align-score.util', () => {
  it('classifies POI experience categories', () => {
    expect(classifyPoiExperienceCategory('斯科加瀑布')).toBe('waterfall');
    expect(classifyPoiExperienceCategory('黑沙滩')).toBe('beach_coast');
    expect(classifyPoiExperienceCategory('蓝湖温泉')).toBe('hotspring_spa');
  });

  it('penalizes consecutive same-category POIs in diversity score', () => {
    const flow = projectExperienceFlowFromTraceSignals({
      narrative_track: 'EXPERIENCE_FIRST',
      frustration_circuit_triggered: false,
      stability_mode_active: true,
    });
    const { score } = scoreItineraryExperience({
      experienceFlow: flow,
      items: [
        { id: '1', type: 'POI', start_window: '09:00', end_window: '11:00', location_ref: { name: '斯科加瀑布' }, evidence_refs: [], verified: false },
        { id: '2', type: 'POI', start_window: '11:30', end_window: '13:00', location_ref: { name: '塞里雅兰瀑布' }, evidence_refs: [], verified: false },
        { id: '3', type: 'POI', start_window: '14:00', end_window: '15:30', location_ref: { name: '黄金瀑布' }, evidence_refs: [], verified: false },
      ],
    });
    expect(score.diversity).toBeLessThan(70);
  });
});
