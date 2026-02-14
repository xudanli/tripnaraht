import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Reminder, ReminderType } from './shared/execution-state.types';
export interface ExecRemindInput extends SkillInput {
    tripId: string;
    currentDate: string;
    reminderTypes?: ReminderType[];
    advanceHours?: number;
}
export interface ExecRemindOutput extends SkillOutput {
    reminders: Reminder[];
}
export declare class ExecRemindSkill implements Skill<ExecRemindInput, ExecRemindOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: ExecRemindInput): Promise<ExecRemindOutput>;
}
