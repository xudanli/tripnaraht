import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { IdentityGovernanceDomainEvent } from '../../identity-governance/services/identity-governance-event.service';
import { Gate1ProjectFitBridgeService } from '../services/gate1-project-fit-bridge.service';

@Injectable()
export class Gate1IdentityEventListener {
  private readonly logger = new Logger(Gate1IdentityEventListener.name);

  constructor(private readonly bridge: Gate1ProjectFitBridgeService) {}

  @OnEvent('identity-governance.application.joined')
  async onApplicationJoined(event: IdentityGovernanceDomainEvent) {
    await this.handleEnrollment(event);
  }

  @OnEvent('identity-governance.application.user_confirmed')
  async onApplicationUserConfirmed(event: IdentityGovernanceDomainEvent) {
    await this.handleEnrollment(event);
  }

  @OnEvent('identity-governance.application.approved')
  async onApplicationApproved(event: IdentityGovernanceDomainEvent) {
    const userId = event.payload?.applicantUserId as string | undefined;
    const listingTitle = (event.payload?.listingTitle as string | undefined) ?? '旅行项目';
    if (!userId) return;
    await this.bridge.notifyApplicationApproved(event.targetId, userId, listingTitle);
  }

  private async handleEnrollment(event: IdentityGovernanceDomainEvent) {
    try {
      const result = await this.bridge.enrollFromTrustedApplication(event.targetId);
      if (!result.enrolled && result.reason !== 'NO_GATE1_PROJECT') {
        this.logger.debug(
          `Portal enrollment skipped for application ${event.targetId}: ${result.reason}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Portal enrollment failed for application ${event.targetId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
