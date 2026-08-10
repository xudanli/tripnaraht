import type { TripPlan } from '../decision/plan-model';
import {
  assignFuelArcsAlongCorridor,
  buildDriveCorridorSegments,
  projectFuelPoiOntoCorridor,
  projectPointOntoSegment,
} from './project-fuel-poi-onto-corridor';

describe('project-fuel-poi-onto-corridor', () => {
  const plan = {
    days: [
      {
        date: '2026-07-20',
        timeSlots: [
          {
            id: 'leg_selfoss_vik',
            travelLegFromPrev: {
              mode: 'drive',
              distanceKm: 180,
              durationMin: 150,
              from: { lat: 63.933, lng: -21.0 },
              to: { lat: 63.419, lng: -19.006 },
            },
          },
        ],
      },
    ],
  } as TripPlan;

  it('builds corridor segments in distanceKm space', () => {
    const segs = buildDriveCorridorSegments(plan);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.arcStartKm).toBe(0);
    expect(segs[0]!.arcEndKm).toBe(180);
  });

  it('projects midpoint of chord near arc midpoint', () => {
    const segs = buildDriveCorridorSegments(plan);
    const mid = {
      lat: (63.933 + 63.419) / 2,
      lng: (-21.0 + -19.006) / 2,
    };
    const hit = projectFuelPoiOntoCorridor(mid, segs, 30);
    expect(hit).toBeDefined();
    expect(hit!.arcKmAlongRoute).toBeGreaterThan(60);
    expect(hit!.arcKmAlongRoute).toBeLessThan(120);
    expect(hit!.detourKm).toBeLessThan(5);
  });

  it('rejects stations far from corridor', () => {
    const segs = buildDriveCorridorSegments(plan);
    // Akureyri — far north of south-coast corridor
    const hit = projectFuelPoiOntoCorridor(
      { lat: 65.683, lng: -18.106 },
      segs,
      30,
    );
    expect(hit).toBeUndefined();
  });

  it('assigns arcs onto poi index for stations near the leg', () => {
    const pois = assignFuelArcsAlongCorridor(plan, [
      {
        id: 'orkan_vik',
        category: 'FUEL',
        lat: 63.4188,
        lng: -19.005,
      },
      {
        id: 'far_akureyri',
        category: 'FUEL',
        lat: 65.683,
        lng: -18.106,
      },
    ]);
    const vik = pois.find((p) => p.id === 'orkan_vik');
    const far = pois.find((p) => p.id === 'far_akureyri');
    expect(vik?.arcKmAlongRoute).toBeDefined();
    expect(vik!.arcKmAlongRoute!).toBeGreaterThan(150);
    expect(far?.arcKmAlongRoute).toBeUndefined();
  });

  it('clamps projection t to segment endpoints', () => {
    const { t } = projectPointOntoSegment(
      { lat: 63.933, lng: -21.0 },
      { lat: 63.933, lng: -21.0 },
      { lat: 63.419, lng: -19.006 },
    );
    expect(t).toBe(0);
  });
});
