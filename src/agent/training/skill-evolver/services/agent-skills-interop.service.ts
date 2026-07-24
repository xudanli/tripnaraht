import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  exportSkillsToAgentSkillsFormat,
  validateAllRegisteredSkills,
  type ExportAgentSkillsResult,
} from '../utils/agent-skills-export.util';
import type { AgentSkillsValidationIssue } from '../utils/agent-skills-compat.util';
import { SkillRegistryService } from './skill-registry.service';

@Injectable()
export class AgentSkillsInteropService {
  private readonly logger = new Logger(AgentSkillsInteropService.name);

  constructor(
    private readonly registry: SkillRegistryService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  defaultExportRoot(): string {
    const custom = this.configService?.get<string>('SKILL_EVOLVER_AGENT_SKILLS_EXPORT')?.trim();
    if (custom) return path.resolve(custom);
    return path.join(this.registry.getBasePath(), 'agent-skills-export');
  }

  export(skillIds?: string[], exportRoot?: string): ExportAgentSkillsResult {
    const root = exportRoot ?? this.defaultExportRoot();
    const result = exportSkillsToAgentSkillsFormat({
      basePath: this.registry.getBasePath(),
      exportRoot: root,
      skillIds,
    });
    const errors = result.issues.filter((i) => i.severity === 'error');
    this.logger.log(
      `[AgentSkillsInterop] exported ${result.records.length} skills -> ${root} errors=${errors.length}`,
    );
    if (errors.length) {
      throw new Error(
        `Agent Skills export validation failed: ${errors.map((e) => e.message).join('; ')}`,
      );
    }
    return result;
  }

  validate(): { results: { skillId: string; issues: AgentSkillsValidationIssue[] }[]; errorCount: number; warnCount: number } {
    const results = validateAllRegisteredSkills(this.registry.getBasePath());
    let errorCount = 0;
    let warnCount = 0;
    for (const r of results) {
      for (const i of r.issues) {
        if (i.severity === 'error') errorCount++;
        else warnCount++;
      }
    }
    return { results, errorCount, warnCount };
  }

  readManifest(): Record<string, unknown> | null {
    const manifestPath = path.join(this.defaultExportRoot(), 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
  }
}
