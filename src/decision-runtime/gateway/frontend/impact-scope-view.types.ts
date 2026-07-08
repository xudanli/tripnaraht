/**
 * FE-facing impact scope — ontology chain (structured; copy via narrative.templateKey).
 */

export type ImpactScopeNodeKind =
  | 'TRIGGER'
  | 'ROUTE'
  | 'PLAN_ITEM'
  | 'DOWNSTREAM'
  | 'CONSEQUENCE';

export type ImpactScopeConsequenceKind =
  | 'DAILY_DRIVING_LOAD'
  | 'CHECKIN_AND_RESERVATION_TIMING';

export type ImpactArrangementKind =
  | 'DRIVE'
  | 'ACTIVITY'
  | 'HOTEL'
  | 'MEAL'
  | 'TRANSIT'
  | 'REST'
  | 'OTHER';

export type ImpactRelationship =
  | 'BELONGS_TO'
  | 'REFERENCES'
  | 'CONNECTS'
  | 'DELAYS'
  | 'BLOCKS'
  | 'AFFECTS';

export type ImpactScopeSubjectKind = 'ROAD' | 'WEATHER' | 'DAY_LOAD' | 'UNKNOWN';

export type ImpactScopeNarrativeTemplateKey =
  | 'impact.road_close.affects_arrangements'
  | 'impact.road_close.affects_day'
  | 'impact.weather.affects_outdoor'
  | 'impact.weather.affects_day'
  | 'impact.daily_load.affects_arrangements'
  | 'impact.daily_load.adjust_pace'
  | 'impact.generic.affects_arrangements'
  | 'impact.generic.affects_day';

export interface ImpactScopeChainNode {
  kind: ImpactScopeNodeKind;
  id: string;
  /** Resolved from plan item / entity ref / event — omit when only consequenceKind applies */
  label?: string;
  dayIndex?: number;
  relationship?: ImpactRelationship;
  consequenceKind?: ImpactScopeConsequenceKind;
  entityRefKind?: string;
}

export interface ImpactScopeArrangementView {
  itemId: string;
  /** POI name, note, or item id — never a synthetic role phrase */
  label: string;
  dayIndex: number;
  arrangementKind: ImpactArrangementKind;
  impactType: 'BLOCKED' | 'DELAYED' | 'AT_RISK';
  isDirect: boolean;
  hasBooking?: boolean;
  placeId?: number;
}

export interface ImpactScopeTriggerView {
  capability: string;
  subjectKind: ImpactScopeSubjectKind;
  /** e.g. F208, region id */
  subjectId?: string;
  /** Raw assertion / event status — FE maps CLOSED → copy */
  status?: string;
  dayIndex?: number;
}

export interface ImpactScopeNarrativeParams {
  capability: string;
  subjectKind: ImpactScopeSubjectKind;
  subjectId?: string;
  status?: string;
  /** 1-based trip day(s) — aligned with problem title / trigger.dayIndex */
  dayIndexes: number[];
  /** Canonical 1-based day for copy (single source of truth with problem title) */
  primaryDayIndex?: number;
  /** @deprecated use primaryDayIndex — plan overload day, 1-based display */
  overloadedDayIndex?: number;
  arrangementLabels: string[];
  arrangementCount: number;
  directCount: number;
  downstreamCount: number;
}

export interface ImpactScopeNarrativeView {
  templateKey: ImpactScopeNarrativeTemplateKey;
  params: ImpactScopeNarrativeParams;
}

export interface ImpactScopeView {
  schemaId: 'tripnara.impact_scope@v1';
  trigger: ImpactScopeTriggerView;
  chain: ImpactScopeChainNode[];
  arrangements: ImpactScopeArrangementView[];
  affectedDayIndexes: number[];
  /** FE i18n — e.g. impact.road_close.affects_arrangements + params */
  narrative: ImpactScopeNarrativeView;
}
