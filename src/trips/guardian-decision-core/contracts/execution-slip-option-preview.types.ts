/**
 * Consumer-facing preview blocks for Execution Slip repair options.
 */

export interface ExecutionSlipScheduleContext {
  projectedEta?: string;
  /** Local clock label, e.g. 17:18 */
  projectedEtaLabel?: string;
  nextLastEntryAt?: string;
  /** Local clock label, e.g. 16:00 */
  nextLastEntryAtLabel?: string;
  slipMinutes?: number;
  travelDurationMinutes?: number;
  timezone?: string;
}

export interface ExecutionSlipChangePreviewItem {
  activityId?: string;
  title: string;
  lastEntryAt?: string;
  lastEntryAtLabel?: string;
}

export interface ExecutionSlipChangePreview {
  remove?: ExecutionSlipChangePreviewItem;
  add?: ExecutionSlipChangePreviewItem;
  shortenMinutes?: number;
}

export interface ExecutionSlipOptionCopy {
  title: string;
  summary: string;
  preserves: string[];
  sacrifices: string[];
  changePreview?: ExecutionSlipChangePreview;
}

export interface ExecutionSlipOptionContext {
  currentActivityId: string;
  currentActivityTitle: string;
  nextActivityId: string;
  nextActivityTitle: string;
  substituteActivityId?: string;
  substituteActivityTitle?: string;
  substituteLastEntryAt?: string;
  substituteLastEntryAtLabel?: string;
  scheduleContext: ExecutionSlipScheduleContext;
  shortenMinutes?: number;
  timezone: string;
}

export interface ExecutionSlipRepairOptionPreview {
  scheduleContext?: ExecutionSlipScheduleContext;
  changePreview?: ExecutionSlipChangePreview;
  preserves?: string[];
  sacrifices?: string[];
}
