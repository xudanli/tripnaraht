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
  | 'readiness';

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
