/**
 * Team Tasks change bus — WS broadcast without Trips ↔ Mobile cycle.
 */

export type TeamTasksChangedPayload = {
  tripId: string;
  contextVersion?: number;
};

type Listener = (payload: TeamTasksChangedPayload) => void;

const listeners = new Set<Listener>();

export const teamTasksChangedBus = {
  onChanged(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit(payload: TeamTasksChangedPayload): void {
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // ignore
      }
    }
  },
};
