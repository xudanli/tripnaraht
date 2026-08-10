export type TeamTaskStatus = 'open' | 'claimed' | 'done' | 'cancelled';

export type TeamTaskSourceType =
  | 'manual'
  | 'packing_template'
  | 'readiness'
  | 'ask_ai'
  | 'itinerary_item'
  | (string & {});

export type TeamTaskSource = {
  type: TeamTaskSourceType;
  refId?: string;
  labelZh?: string;
};

export type TeamTask = {
  id: string;
  title: string;
  notes?: string | null;
  status: TeamTaskStatus;
  assigneeMemberId?: string | null;
  assigneeName?: string | null;
  dueAt?: string | null;
  dueLabel?: string | null;
  systemImage?: string | null;
  source?: TeamTaskSource | null;
  createdByMemberId: string;
  updatedAt: string;
  completedAt?: string | null;
};

export type TeamTaskStats = {
  open: number;
  claimed: number;
  done: number;
  mineOpenOrClaimed: number;
};

export type TeamTaskListData = {
  schemaId: 'tripnara.team_tasks.client@v1';
  stats: TeamTaskStats;
  tasks: TeamTask[];
};

export type TeamTaskListScope = 'all' | 'mine' | 'open';

export type PackingTemplateSummary = {
  id: string;
  titleZh: string;
  subtitleZh: string;
  destinationCodes: string[];
  seasonTags: string[];
  itemCount: number;
};

export type PackingTemplateItem = {
  id: string;
  titleZh: string;
  categoryZh: string;
  recommended: boolean;
};

export type PackingTemplateDetail = {
  id: string;
  titleZh: string;
  items: PackingTemplateItem[];
};

export type FromPackingTemplateResult = {
  createdCount: number;
  taskIds: string[];
  skippedDuplicates: number;
};

export type FromReadinessResult = {
  createdCount: number;
  taskIds: string[];
  skippedDuplicates: number;
};

export type RemindTeamTasksResult = {
  notifiedCount: number;
  skippedRecentlyReminded?: number;
};

export type MyPackingListItem = {
  id: string;
  titleZh: string;
  categoryZh?: string | null;
  checked: boolean;
  source?: {
    type: string;
    refId?: string;
    templateId?: string;
  } | null;
  updatedAt: string;
};

export type MyPackingListData = {
  schemaId: 'tripnara.my_packing_list.client@v1';
  stats: { total: number; checked: number };
  items: MyPackingListItem[];
};

export type FromPackingPersonalResult = {
  createdCount: number;
  itemIds: string[];
  skippedDuplicates: number;
};

export type TeamTaskMember = {
  id: string;
  name: string;
};
