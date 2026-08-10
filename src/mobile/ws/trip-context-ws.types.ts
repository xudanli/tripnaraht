export type TripContextChangedSection =
  | 'execution'
  | 'team'
  | 'risks'
  | 'decisions'
  | 'itinerary'
  | 'notifications'
  | 'events'
  | 'navigation'
  | 'intercom'
  /** Spatial / Active Plan 变更（客户端应重拉 spatial-route） */
  | 'plan'
  | 'worldFacts'
  | 'readiness'
  /** 今日自驾状态 / 确认（客户端应重拉 daily-drive-status） */
  | 'daily_drive'
  /** 行中执行首页 / Runbook / Verified Proposal（客户端应重拉 in-trip-home） */
  | 'in_trip_home'
  /** 执行总览 Dashboard 投影（客户端应按 section 重拉 overview-dashboard） */
  | 'overview_dashboard'
  /** 成员状态报告 / 快速操作（客户端应重拉 open reports / team 关注条） */
  | 'member_status'
  /** 待调整队列有新项（仅硬窗受影响时） */
  | 'adjustment_queue'
  /** 团队任务板变更（客户端应重拉 team-tasks） */
  | 'teamTasks';

export interface TripContextChangedEvent {
  type: 'trip_context_changed';
  tripId: string;
  contextVersion: number;
  changedSections: TripContextChangedSection[];
  planVersion?: number;
  serverTime: string;
}

export interface IntercomMessageEvent {
  type: 'intercom_message';
  tripId: string;
  contextVersion: number;
  message: {
    id: string;
    clientId?: string;
    tripId: string;
    senderId: string;
    senderName: string;
    senderAvatarUrl?: string | null;
    kind: 'voice' | 'text' | 'status' | 'system';
    audioUrl?: string;
    durationSeconds?: number;
    transcript?: string;
    body?: string;
    statusType?: 'arrived' | 'wait_here' | 'need_rest' | 'separated';
    sentAt: string;
    distanceLabel?: string;
    deliveryStatus: 'sent' | 'delivered' | 'local_pending' | 'failed';
    transport: 'cloud' | 'bluetooth' | 'bluetooth_relay';
    isOwn: boolean;
  };
  serverTime: string;
}

export type TripContextWsClientMessage =
  | { type: 'subscribe'; tripId: string; token?: string }
  | { type: 'unsubscribe'; tripId: string }
  | { type: 'ping' };

export type TripContextWsServerMessage =
  | TripContextChangedEvent
  | IntercomMessageEvent
  | { type: 'subscribed'; tripId: string; serverTime: string }
  | { type: 'unsubscribed'; tripId: string; serverTime: string }
  | { type: 'pong'; serverTime: string }
  | { type: 'error'; code: string; message: string };
