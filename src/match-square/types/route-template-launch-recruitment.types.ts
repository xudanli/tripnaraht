/** PRD 3.11 链路 A — 路线模板 → 搭子广场招募 */

export const ROUTE_TEMPLATE_LAUNCH_SNAPSHOT_VERSION = 'route_template_launch_v1' as const;

export interface RouteTemplateLaunchSnapshot {
  version: typeof ROUTE_TEMPLATE_LAUNCH_SNAPSHOT_VERSION;
  routeTemplateId: number;
  routeTemplateUuid: string;
  catalogId: string;
  routeDirectionName: string;
  durationDays: number;
  titleZh: string;
  launchedAt: string;
}

export interface RouteTemplateBindingView {
  routeTemplateId: number;
  routeTemplateUuid: string;
  catalogId: string;
  routeDirectionName: string;
  durationDays: number;
  titleZh: string;
  launchedAt: string;
}

export interface LaunchRecruitmentFromTemplateInput {
  startDate: string;
  endDate: string;
  slotsNeeded: number;
  planningStyle: 'full_managed' | 'co_planning' | 'casual_play';
  departureLabel?: string;
  budgetMinCents?: number;
  budgetMaxCents?: number;
  captainMessage?: string;
  preferenceNotes?: string;
  tripMoodTag?: 'relax' | 'adventure' | 'healing' | 'social';
  travelMode?: 'self_drive' | 'public_transit' | 'mixed' | 'other';
}

export interface LaunchRecruitmentFromTemplateResultView {
  recruitmentPostId: string;
  matchSquarePath: string;
  routeTemplate: {
    id: number;
    uuid: string;
    catalogId: string;
    titleZh: string;
  };
  routeTemplateMatch: import('./route-template-intent.types').RouteTemplateIntentMatchPlan;
  post: import('./match-square.types').RecruitmentPostDetailView;
}
