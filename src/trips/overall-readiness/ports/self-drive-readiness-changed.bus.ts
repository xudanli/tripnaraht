/**
 * 自驾准备度变更总线 — 避免 TripsModule ↔ MobileModule 循环依赖。
 * TripContextChangeNotifierService 在 onModuleInit 订阅。
 */

export type SelfDriveReadinessChangedPayload = {
  tripId: string;
  contextVersion: number;
};

type Listener = (payload: SelfDriveReadinessChangedPayload) => void;

const listeners = new Set<Listener>();

export const selfDriveReadinessChangedBus = {
  onChanged(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit(payload: SelfDriveReadinessChangedPayload): void {
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // ignore subscriber errors
      }
    }
  },
};
