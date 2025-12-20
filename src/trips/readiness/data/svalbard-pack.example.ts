// src/trips/readiness/data/svalbard-pack.example.ts

/**
 * Svalbard (Longyearbyen) Readiness Pack - 示例数据
 * 
 * 这是用户提供的斯瓦尔巴 Pack 示例
 * 可以作为模板扩展到其他目的地
 */

import { ReadinessPack } from '../types/readiness-pack.types';

export const svalbardPack: ReadinessPack = {
  packId: 'pack.no.svalbard.longyearbyen',
  destinationId: 'NO-SVALBARD-LYB',
  displayName: 'Svalbard (Longyearbyen) Travel Readiness',
  version: '1.0.0',
  lastReviewedAt: '2025-12-20T00:00:00Z',
  geo: {
    countryCode: 'NO',
    region: 'Svalbard',
    city: 'Longyearbyen',
    lat: 78.2232,
    lng: 15.6469,
  },
  supportedSeasons: ['polar_night', 'polar_day', 'shoulder'],
  sources: [
    {
      sourceId: 'src.governor.svalbard',
      authority: 'Governor of Svalbard',
      type: 'html',
      title: 'Safety/Travel information',
      canonicalUrl: '',
    },
    {
      sourceId: 'src.visit.svalbard',
      authority: 'Visit Svalbard',
      type: 'html',
      title: 'Safety & Travel advice',
      canonicalUrl: '',
    },
    {
      sourceId: 'src.udi.norway',
      authority: 'Norwegian Directorate of Immigration (UDI)',
      type: 'html',
      title: 'Schengen/Norway entry rules',
      canonicalUrl: '',
    },
  ],
  hazards: [
    {
      type: 'wildlife',
      severity: 'high',
      summary: 'Polar bear risk outside settlements.',
      mitigations: [
        'Avoid independent wilderness travel; join certified guided tours.',
        'Follow local safety requirements for deterrence/protection when leaving settlements.',
      ],
    },
    {
      type: 'weather_extreme',
      severity: 'high',
      summary: 'Rapid weather changes, strong wind, severe cold depending on season.',
      mitigations: [
        'Layered clothing with wind/waterproof shell.',
        'Build buffer days; expect tour cancellations due to weather.',
      ],
    },
    {
      type: 'logistics_remote',
      severity: 'high',
      summary: 'Remote location; limited services; medical evacuation can be costly.',
      mitigations: [
        'Buy travel insurance that covers rescue/evacuation.',
        'Plan backups for transport disruptions.',
      ],
    },
  ],
  checklists: [
    {
      id: 'chk.sval.entry',
      category: 'entry_transit',
      appliesToSeasons: ['all'],
      items: [
        'Check if you need a Schengen visa for transit via mainland Norway (Oslo/Tromsø).',
        'Carry passport and allow time for border/ID checks (Svalbard travel can involve checks).',
        'Keep flight/hotel confirmations accessible.',
      ],
    },
    {
      id: 'chk.sval.safety',
      category: 'safety_hazards',
      appliesToSeasons: ['all'],
      items: [
        'Do not leave settlements without an appropriate safety plan (polar bear risk).',
        'Prefer guided activities for wilderness travel.',
        'Know emergency contacts and keep phone charged.',
      ],
    },
    {
      id: 'chk.sval.insurance',
      category: 'health_insurance',
      appliesToSeasons: ['all'],
      items: [
        'Insurance covers medical evacuation/rescue (incl. helicopter) and repatriation.',
        'Policy covers planned activities (snowmobile/boat tours/hiking).',
        'Bring policy number and emergency hotline.',
      ],
    },
    {
      id: 'chk.sval.gear.winter',
      category: 'gear_packing',
      appliesToSeasons: ['polar_night', 'shoulder'],
      items: [
        'Windproof/waterproof outer layer + warm mid-layer (fleece/wool) + thermal base layer',
        'Insulated waterproof boots + wool socks',
        'Warm hat + balaclava/face cover + insulated gloves/mittens',
        'Headlamp; reflective accessories',
      ],
    },
    {
      id: 'chk.sval.gear.summer',
      category: 'gear_packing',
      appliesToSeasons: ['polar_day', 'shoulder'],
      items: [
        'Windproof outer layer (still needed in summer) + layered clothing',
        'Waterproof shoes; gloves (wind chill can be strong)',
        'Sunglasses/eye protection (bright conditions)',
        'Binoculars/camera protection from wind and salt spray (boat tours)',
      ],
    },
  ],
  rules: [
    {
      id: 'rule.sval.entry.transit-norway',
      category: 'entry_transit',
      severity: 'high',
      when: { eq: { path: 'itinerary.transitsMainlandNorway', value: true } },
      then: {
        level: 'must',
        message:
          'Confirm mainland Norway transit/entry requirements (Schengen rules may apply even if Svalbard itself is special).',
        tasks: [
          {
            title: 'Check Norway/Schengen entry requirements for your nationality',
            dueOffsetDays: -30,
            tags: ['visa'],
          },
        ],
        askUser: ['What is your nationality and where will you transit (Oslo/Tromsø)?'],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.entry.double-entry-risk',
      category: 'entry_transit',
      severity: 'high',
      when: {
        all: [
          { eq: { path: 'itinerary.transitsMainlandNorway', value: true } },
          { eq: { path: 'traveler.nationalityRequiresSchengen', value: true } },
        ],
      },
      then: {
        level: 'must',
        message:
          'If you need a Schengen visa, plan for return transit as well (often treated as re-entry). Prefer a visa that safely covers both directions.',
        tasks: [
          {
            title: 'Apply for Schengen visa with sufficient entries (if required)',
            dueOffsetDays: -45,
            tags: ['visa'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.safety.no-solo-wilderness',
      category: 'safety_hazards',
      severity: 'high',
      when: {
        containsAny: {
          path: 'itinerary.activities',
          values: ['hiking', 'camping', 'backcountry', 'wildlife'],
        },
      },
      then: {
        level: 'must',
        message:
          'Avoid independent wilderness travel. Use certified guided tours for activities outside settlements due to polar bear risk.',
        tasks: [
          {
            title: 'Book guided tours for wilderness activities',
            dueOffsetDays: -21,
            tags: ['booking', 'safety'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.safety.polar-bear-measures',
      category: 'safety_hazards',
      severity: 'high',
      when: {
        containsAny: {
          path: 'itinerary.activities',
          values: ['hiking', 'camping', 'backcountry'],
        },
      },
      then: {
        level: 'must',
        message:
          'If leaving settlements, follow local safety requirements for polar-bear deterrence/protection. If unsure, do not go without a guide.',
        askUser: [
          'Will you leave Longyearbyen settlement areas on your own, or only with guides?',
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.insurance.evac-required',
      category: 'health_insurance',
      severity: 'high',
      when: {
        containsAny: {
          path: 'itinerary.activities',
          values: ['snowmobile', 'dog_sled', 'boat_tour', 'hiking', 'ice_cave'],
        },
      },
      then: {
        level: 'must',
        message:
          'Buy travel insurance that covers rescue/medical evacuation and your planned Arctic activities.',
        tasks: [
          {
            title: 'Purchase insurance covering rescue/evacuation + planned activities',
            dueOffsetDays: -14,
            tags: ['insurance'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.logistics.book-early',
      category: 'activities_bookings',
      severity: 'medium',
      when: { exists: 'trip.startDate' },
      then: {
        level: 'should',
        message:
          'Longyearbyen inventory is limited. Book accommodation and key tours early, especially in peak periods.',
        tasks: [
          {
            title: 'Book accommodation in Longyearbyen',
            dueOffsetDays: -30,
            tags: ['booking'],
          },
          {
            title: 'Reserve top activities (boat/snowmobile/dog sled)',
            dueOffsetDays: -30,
            tags: ['booking'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.weather.buffer-days',
      category: 'logistics',
      severity: 'medium',
      when: { eq: { path: 'itinerary.isTightSchedule', value: true } },
      then: {
        level: 'should',
        message:
          'Build buffer time: weather may cancel flights/tours. Avoid a zero-buffer plan.',
        tasks: [
          {
            title: 'Add buffer day or flexible connections',
            dueOffsetDays: -7,
            tags: ['planning'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.gear.layering',
      category: 'gear_packing',
      severity: 'high',
      when: {
        any: [
          { eq: { path: 'itinerary.season', value: 'polar_night' } },
          { eq: { path: 'itinerary.season', value: 'shoulder' } },
        ],
      },
      then: {
        level: 'must',
        message:
          'Pack layered clothing with wind/waterproof shell; prioritize hands/feet/face warmth.',
        tasks: [
          {
            title: 'Prepare Arctic layering system and insulated boots',
            dueOffsetDays: -10,
            tags: ['gear'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.gear.headlamp',
      category: 'gear_packing',
      severity: 'high',
      appliesTo: { seasons: ['polar_night'] },
      when: { eq: { path: 'itinerary.season', value: 'polar_night' } },
      then: {
        level: 'must',
        message:
          'Polar night: bring a reliable headlamp and spare batteries/power bank.',
        tasks: [
          {
            title: 'Pack headlamp + spare batteries + power bank',
            dueOffsetDays: -7,
            tags: ['gear'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.gear.reflective',
      category: 'gear_packing',
      severity: 'medium',
      appliesTo: { seasons: ['polar_night'] },
      when: { eq: { path: 'itinerary.season', value: 'polar_night' } },
      then: {
        level: 'should',
        message:
          'Polar night: reflective accessories improve visibility during dark conditions.',
        tasks: [
          {
            title: 'Add reflective band/vest',
            dueOffsetDays: -7,
            tags: ['gear'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.gear.sunglasses',
      category: 'gear_packing',
      severity: 'medium',
      appliesTo: { seasons: ['polar_day'] },
      when: { eq: { path: 'itinerary.season', value: 'polar_day' } },
      then: {
        level: 'should',
        message:
          'Polar day: bring sunglasses/eye protection due to continuous bright light and glare.',
        tasks: [
          {
            title: 'Pack sunglasses/eye protection',
            dueOffsetDays: -7,
            tags: ['gear'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.logistics.money-cost',
      category: 'logistics',
      severity: 'medium',
      when: { eq: { path: 'traveler.budgetLevel', value: 'low' } },
      then: {
        level: 'should',
        message:
          'Svalbard is expensive (lodging/tours/food). Increase budget buffer or reduce high-cost activities.',
        tasks: [
          {
            title: 'Add 20–30% budget buffer for Svalbard',
            dueOffsetDays: -14,
            tags: ['budget'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.activities.operator-safety',
      category: 'activities_bookings',
      severity: 'high',
      when: {
        containsAny: {
          path: 'itinerary.activities',
          values: ['snowmobile', 'dog_sled', 'boat_tour', 'ice_cave'],
        },
      },
      then: {
        level: 'must',
        message:
          'Choose reputable operators with safety briefings and proper gear (Arctic conditions are unforgiving).',
        tasks: [
          {
            title: 'Verify operator safety briefing/gear inclusion before booking',
            dueOffsetDays: -21,
            tags: ['booking', 'safety'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.health.medical-gap',
      category: 'health_insurance',
      severity: 'medium',
      when: { exists: 'traveler.preexistingConditions' },
      then: {
        level: 'should',
        message:
          'Remote medical access: confirm coverage for pre-existing conditions and carry essential meds.',
        tasks: [
          {
            title: 'Prepare medication list + carry meds in hand luggage',
            dueOffsetDays: -3,
            tags: ['health'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.logistics.offline-plan',
      category: 'logistics',
      severity: 'medium',
      when: { eq: { path: 'traveler.relianceOnPhone', value: true } },
      then: {
        level: 'should',
        message:
          'Prepare offline backups: offline maps, booking confirmations, emergency contacts.',
        tasks: [
          {
            title: 'Download offline maps + store key confirmations offline',
            dueOffsetDays: -2,
            tags: ['logistics'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.safety.emergency-contacts',
      category: 'safety_hazards',
      severity: 'medium',
      when: { exists: 'trip.startDate' },
      then: {
        level: 'should',
        message:
          'Before departure, save local emergency contacts and follow local safety guidance.',
        tasks: [
          {
            title: 'Save local emergency numbers and guidance links',
            dueOffsetDays: -2,
            tags: ['safety'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.activities.season-fit',
      category: 'activities_bookings',
      severity: 'medium',
      when: { exists: 'itinerary.season' },
      then: {
        level: 'should',
        message:
          'Match activities to season: polar night favors aurora/snow; polar day favors hikes/boat wildlife trips.',
        askUser: [
          'Are you visiting for aurora (winter) or for boat/wildlife/hikes (summer)?',
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.entry.id-docs',
      category: 'entry_transit',
      severity: 'medium',
      when: { exists: 'trip.startDate' },
      then: {
        level: 'should',
        message:
          'Carry passport and keep ID documents accessible during travel days (checks can occur).',
        tasks: [
          {
            title: 'Prepare passport + copies (offline)',
            dueOffsetDays: -3,
            tags: ['docs'],
          },
        ],
      },
      evidence: [],
    },
    {
      id: 'rule.sval.gear.camera-protection',
      category: 'gear_packing',
      severity: 'low',
      when: {
        containsAny: {
          path: 'itinerary.activities',
          values: ['boat_tour', 'wildlife', 'photography'],
        },
      },
      then: {
        level: 'optional',
        message: 'For wind/salt spray: pack camera protection (dry bag, lens cloth).',
      },
      evidence: [],
    },
    {
      id: 'rule.sval.logistics.transport-disruption',
      category: 'logistics',
      severity: 'medium',
      when: { eq: { path: 'itinerary.hasTightConnections', value: true } },
      then: {
        level: 'should',
        message:
          'Avoid tight connections; Arctic weather can disrupt flights. Prefer flexible tickets or longer layovers.',
        tasks: [
          {
            title: 'Adjust connections to include buffer',
            dueOffsetDays: -14,
            tags: ['transport'],
          },
        ],
      },
      evidence: [],
    },
  ],
};

