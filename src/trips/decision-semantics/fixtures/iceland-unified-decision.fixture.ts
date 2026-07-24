/**
 * Iceland Unified Decision / Travel Context 联调 fixture（固定 UUID）。
 *
 * 文档引用：FE_INTEGRATION_HANDOFF.md、simulate-f208-road-close-fixture.ts
 * 本地写入：`npm run seed:iceland-unified-decision-fixture`
 */
export const ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_ID =
  '3e4a1058-9218-467f-988a-c18008a14385';

/** Exploration scenario — RFC-003 V1: contextId === scenarioId */
export const ICELAND_UNIFIED_DECISION_FIXTURE_SCENARIO_ID =
  'f4e8a1c2-3b5d-4f6e-9a0b-1c2d3e4f5a6b';

/** Day 6 drive segment used by F208 simulate script */
export const ICELAND_UNIFIED_DECISION_FIXTURE_F208_DRIVE_ITEM_ID =
  'acf2d20c-8085-4f6d-b9a6-caa3abfbb481';

export const ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_DAYS = [
  { id: 'd1e2f3a4-b5c6-4789-a012-345678901234', dayIndex: 0 },
  { id: 'd2e3f4a5-b6c7-4890-b123-456789012345', dayIndex: 1 },
  { id: 'd3e4f5a6-b7c8-4901-c234-567890123456', dayIndex: 2 },
  { id: 'd4e5f6a7-b8c9-4012-d345-678901234567', dayIndex: 3 },
  { id: 'd5e6f7a8-b9c0-4123-e456-789012345678', dayIndex: 4 },
  { id: 'd6e7f8a9-b0c1-4234-f567-890123456789', dayIndex: 5 },
  { id: 'd7e8f9a0-b1c2-4345-a678-901234567890', dayIndex: 6 },
] as const;

export const ICELAND_UNIFIED_DECISION_FIXTURE_DEFAULT_OWNER_USER_ID =
  '5872f534-4fdf-483d-9e5a-464d3f36935d';
