import type { SkillExecutionRecorderService } from './skill-execution-recorder.service';

let recorder: SkillExecutionRecorderService | undefined;

export function setSkillExecutionRecorder(service: SkillExecutionRecorderService): void {
  recorder = service;
}

export function getSkillExecutionRecorder(): SkillExecutionRecorderService | undefined {
  return recorder;
}
