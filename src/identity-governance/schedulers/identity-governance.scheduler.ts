import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QualificationService } from '../services/qualification.service';
import { ProjectFitAssessmentService } from '../services/project-fit-assessment.service';
import { EndorsementService } from '../services/endorsement.service';

@Injectable()
export class IdentityGovernanceScheduler {
  private readonly logger = new Logger(IdentityGovernanceScheduler.name);

  constructor(
    private readonly qualification: QualificationService,
    private readonly fitAssessment: ProjectFitAssessmentService,
    private readonly endorsement: EndorsementService,
  ) {}

  /**
   * 每日 04:00 UTC 将已过期的 VERIFIED 资质标记为 EXPIRED。
   * 可通过 IDENTITY_GOVERNANCE_CRON_ENABLED=false 禁用。
   */
  @Cron('0 4 * * *', {
    name: 'identity-governance-qualification-expiry',
    timeZone: 'UTC',
  })
  async expireQualifications(): Promise<void> {
    if (process.env.IDENTITY_GOVERNANCE_CRON_ENABLED === 'false') {
      this.logger.debug('Identity governance cron disabled');
      return;
    }

    try {
      const count = await this.qualification.expireOutdated();
      if (count > 0) {
        this.logger.log(`Marked ${count} qualifications as EXPIRED`);
      }
    } catch (error) {
      this.logger.error(
        `Qualification expiry job failed: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * 每日 04:30 UTC 将已过期的 Project Fit 评估标记为 EXPIRED。
   */
  @Cron('30 4 * * *', {
    name: 'identity-governance-fit-assessment-expiry',
    timeZone: 'UTC',
  })
  async expireFitAssessments(): Promise<void> {
    if (process.env.IDENTITY_GOVERNANCE_CRON_ENABLED === 'false') {
      return;
    }

    try {
      const count = await this.fitAssessment.expireOutdated();
      if (count > 0) {
        this.logger.log(`Marked ${count} fit assessments as EXPIRED`);
      }
    } catch (error) {
      this.logger.error(
        `Fit assessment expiry job failed: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** 每日 05:00 UTC 将已过期的 ACTIVE 背书标记为 EXPIRED */
  @Cron('0 5 * * *', {
    name: 'identity-governance-endorsement-expiry',
    timeZone: 'UTC',
  })
  async expireEndorsements(): Promise<void> {
    if (process.env.IDENTITY_GOVERNANCE_CRON_ENABLED === 'false') {
      return;
    }

    try {
      const count = await this.endorsement.expireOutdated();
      if (count > 0) {
        this.logger.log(`Marked ${count} endorsements as EXPIRED`);
      }
    } catch (error) {
      this.logger.error(
        `Endorsement expiry job failed: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
