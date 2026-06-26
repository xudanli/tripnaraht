import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IdentityAuditLogService } from './audit-log.service';

export type IdentityGovernanceDomainEvent = {
  type: string;
  actorId?: string;
  targetType: string;
  targetId: string;
  payload?: Record<string, unknown>;
};

@Injectable()
export class IdentityGovernanceEventService {
  private readonly logger = new Logger(IdentityGovernanceEventService.name);

  constructor(
    private readonly auditLog: IdentityAuditLogService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  async emit(event: IdentityGovernanceDomainEvent): Promise<void> {
    await this.auditLog.record({
      actorId: event.actorId,
      action: `DOMAIN:${event.type}`,
      targetType: event.targetType,
      targetId: event.targetId,
      after: event.payload,
      metadata: { domainEvent: true },
    });

    if (this.eventEmitter) {
      this.eventEmitter.emit(`identity-governance.${event.type}`, event);
    } else {
      this.logger.debug(`Domain event (local): ${event.type} → ${event.targetType}:${event.targetId}`);
    }
  }
}
