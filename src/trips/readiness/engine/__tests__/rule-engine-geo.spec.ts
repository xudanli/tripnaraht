// src/trips/readiness/engine/__tests__/rule-engine-geo.spec.ts

import { RuleEngine } from '../rule-engine';
import { Condition } from '../../types/readiness-pack.types';
import { TripContext } from '../../types/trip-context.types';

describe('RuleEngine - Geo Conditions', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  describe('便捷语法 (geo object)', () => {
    it('应该支持山脉海拔条件', () => {
      const condition: Condition = {
        geo: {
          mountains: {
            mountainElevationAvg: { gte: 3000 }
          }
        }
      };

      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
        geo: {
          mountains: {
            inMountain: true,
            mountainElevationAvg: 3500
          }
        }
      };

      expect(engine.evaluate(condition, context)).toBe(true);
    });

    it('应该支持道路密度条件', () => {
      const condition: Condition = {
        geo: {
          roads: {
            roadDensityScore: { lt: 0.3 }
          }
        }
      };

      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
        geo: {
          roads: {
            roadDensityScore: 0.2
          }
        }
      };

      expect(engine.evaluate(condition, context)).toBe(true);
    });

    it('应该支持 POI 特征条件', () => {
      const condition: Condition = {
        geo: {
          pois: {
            hasEVCharger: false,
            safety: {
              hasHospital: false
            }
          }
        }
      };

      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
        geo: {
          pois: {
            hasEVCharger: false,
            safety: {
              hasHospital: false
            }
          }
        }
      };

      expect(engine.evaluate(condition, context)).toBe(true);
    });

    it('应该支持西藏特有特征条件', () => {
      const condition: Condition = {
        geo: {
          altitude_m: { gte: 4000 },
          fuelDensity: { lt: 0.5 }
        }
      };

      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
        geo: {
          altitude_m: 4500,
          fuelDensity: 0.3
        }
      };

      expect(engine.evaluate(condition, context)).toBe(true);
    });

    it('应该支持组合多个地理特征条件', () => {
      const condition: Condition = {
        all: [
          {
            geo: {
              mountains: {
                inMountain: true,
                mountainElevationAvg: { gte: 3000 }
              }
            }
          },
          {
            geo: {
              roads: {
                roadDensityScore: { lt: 0.3 }
              }
            }
          }
        ]
      };

      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
        geo: {
          mountains: {
            inMountain: true,
            mountainElevationAvg: 3500
          },
          roads: {
            roadDensityScore: 0.2
          }
        }
      };

      expect(engine.evaluate(condition, context)).toBe(true);
    });

    it('如果没有地理特征数据，应该返回 false', () => {
      const condition: Condition = {
        geo: {
          mountains: {
            mountainElevationAvg: { gte: 3000 }
          }
        }
      };

      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: { countries: [] }
        // 没有 geo 字段
      };

      expect(engine.evaluate(condition, context)).toBe(false);
    });

    it('如果地理特征字段不存在，应该返回 false', () => {
      const condition: Condition = {
        geo: {
          mountains: {
            mountainElevationAvg: { gte: 3000 }
          }
        }
      };

      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
        geo: {
          roads: {
            roadDensityScore: 0.5
          }
          // 没有 mountains 字段
        }
      };

      expect(engine.evaluate(condition, context)).toBe(false);
    });
  });

  describe('路径语法 (path-based)', () => {
    it('应该支持路径语法访问地理特征', () => {
      const condition: Condition = {
        gte: { path: 'geo.mountains.mountainElevationAvg', value: 3000 }
      };

      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
        geo: {
          mountains: {
            mountainElevationAvg: 3500
          }
        }
      };

      expect(engine.evaluate(condition, context)).toBe(true);
    });

    it('应该支持混合使用路径语法和便捷语法', () => {
      const condition: Condition = {
        all: [
          {
            geo: {
              mountains: {
                inMountain: true
              }
            }
          },
          {
            gte: { path: 'geo.roads.roadDensityScore', value: 0.3 }
          }
        ]
      };

      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: { countries: [] },
        geo: {
          mountains: {
            inMountain: true
          },
          roads: {
            roadDensityScore: 0.5
          }
        }
      };

      expect(engine.evaluate(condition, context)).toBe(true);
    });
  });
});
