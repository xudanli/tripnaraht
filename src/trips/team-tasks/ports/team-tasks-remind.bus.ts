/**
 * Team Tasks remind bus — avoid TripsModule ↔ MobileModule cycle.
 * MobilePushNotificationService subscribes onModuleInit.
 */

export type TeamTasksRemindPayload = {
  tripId: string;
  fromMemberId: string;
  memberIds: string[];
  message: string;
  sendAppPush: boolean;
};

type Listener = (payload: TeamTasksRemindPayload) => void;

const listeners = new Set<Listener>();

export const teamTasksRemindBus = {
  onRemind(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit(payload: TeamTasksRemindPayload): void {
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // ignore subscriber errors
      }
    }
  },
};
