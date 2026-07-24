import type { PlanObjectProjectionView } from '../../decision-runtime/plan-objects/contracts/plan-object.types';

export interface TimelinePlanObjectDaySummary {
  dayId: string;
  dayNumber: number;
  date: string;
  objectCount: number;
  objectTypes: string[];
  assessmentCount: number;
  topAssessment?: {
    kind: string;
    severity: string;
    message: string;
  };
}

export interface TimelinePlanObjectsSummary {
  schemaId: 'tripnara.timeline_plan_objects@v1';
  lunchStrategy: string;
  totalObjects: number;
  assessmentCount: number;
  days: TimelinePlanObjectDaySummary[];
}

export function buildTimelinePlanObjectsSummary(
  view: PlanObjectProjectionView,
): TimelinePlanObjectsSummary {
  return {
    schemaId: 'tripnara.timeline_plan_objects@v1',
    lunchStrategy: view.lunchStrategy,
    totalObjects: view.summary.totalObjects,
    assessmentCount: view.summary.assessmentCount,
    days: view.days.map((day) => {
      const warning = day.assessments.find((a) => a.severity === 'WARNING' || a.severity === 'BLOCK');
      return {
        dayId: day.dayId,
        dayNumber: day.dayNumber,
        date: day.date,
        objectCount: day.objects.length,
        objectTypes: [...new Set(day.objects.map((o) => o.type))],
        assessmentCount: day.assessments.length,
        topAssessment: warning
          ? { kind: warning.kind, severity: warning.severity, message: warning.message }
          : undefined,
      };
    }),
  };
}
