import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Gate1ParticipantReminderService } from '../services/gate1-participant-reminder.service';

@Injectable()
export class Gate1ParticipantReminderScheduler {
  private readonly logger = new Logger(Gate1ParticipantReminderScheduler.name);

  constructor(private readonly reminders: Gate1ParticipantReminderService) {}

  /** 每 6 小时检查偏好未完成提醒（PRD §17：48h 后、最多 2 次） */
  @Cron('0 */6 * * *', {
    name: 'gate1-preference-reminders',
    timeZone: 'UTC',
  })
  async runPreferenceReminders(): Promise<void> {
    if (process.env.GATE1_CRON_ENABLED === 'false') {
      return;
    }

    try {
      const result = await this.reminders.runAll();
      const total = result.preference.sent + result.proposalFeedback.sent;
      if (total > 0) {
        this.logger.log(
          `Reminders: preference=${result.preference.sent}, proposal=${result.proposalFeedback.sent}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Preference reminder job failed: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
