/**
 * Product BFF for Iceland Self-Drive Situation client projection.
 */

import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DecisionCaseService } from '../../decision-cases/services/decision-case.service';
import type { IcelandSelfDriveSituationClientV1 } from '../../packs/knowledge/demo/iceland-self-drive-situation.client';

@Injectable()
export class IcelandSelfDriveSituationProductService {
  constructor(
    @Optional() private readonly decisionCases?: DecisionCaseService,
  ) {}

  async get(tripId: string): Promise<IcelandSelfDriveSituationClientV1> {
    if (!this.decisionCases) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Decision cases not available',
      });
    }
    const client =
      await this.decisionCases.getIcelandSelfDriveSituationClient(tripId);
    if (!client) {
      const isIsd = await this.decisionCases.isIcelandSelfDriveTrip(tripId);
      throw new NotFoundException({
        code: isIsd ? 'NOT_FOUND' : 'NOT_ICELAND_SELF_DRIVE',
        message: isIsd
          ? 'Iceland self-drive situation not yet projected for this trip'
          : 'Trip is not an iceland_self_drive product trip',
      });
    }
    return client;
  }

  async getOptional(
    tripId: string,
  ): Promise<IcelandSelfDriveSituationClientV1 | undefined> {
    if (!this.decisionCases) return undefined;
    return this.decisionCases.getIcelandSelfDriveSituationClient(tripId);
  }
}
