export {
  DecisionEventType,
  DecisionEventBus,
  DecisionEventEmitter,
} from './decision-events';

export type {
  BaseEvent,
  DecisionEvent,
  DecisionStartedEvent,
  DecisionCompletedEvent,
  DecisionFailedEvent,
  DSOSnapshotEvent,
  FeedbackReceivedEvent,
  LearningTriggeredEvent,
  WeightsUpdatedEvent,
  ConvergenceChangedEvent,
  PolicyInferredEvent,
  ConstraintViolatedEvent,
  CircuitStateChangedEvent,
  LyapunovComputedEvent,
  EventListener,
  EventSubscription,
} from './decision-events';

export {
  EventSourcingService,
  InMemoryEventStore,
  AggregateRoot,
  DecisionAggregate,
} from './event-sourcing.service';

export type {
  StoredEvent,
  EventMetadata,
  Snapshot,
  EventStreamFilter,
  ReplayOptions,
  EventStoreStats,
  EventStore,
  DecisionAggregateState,
} from './event-sourcing.service';
