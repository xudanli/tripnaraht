import { Injectable, Logger } from '@nestjs/common';
import type { AuditIssue, ContrastiveDelta, EvolvableSkill } from '../interfaces/skill-evolver.types';
import { bumpSkillVersion } from '../utils/markdown-skill.util';
import { SkillEvolverLlmHelper } from './skill-evolver-llm.helper';

@Injectable()
export class SkillEditorService {
  private readonly logger = new Logger(SkillEditorService.name);

  constructor(private readonly llm: SkillEvolverLlmHelper) {}

  async edit(skill: EvolvableSkill, delta: ContrastiveDelta): Promise<EvolvableSkill> {
    const prompt = `你是技术文档编辑。修订以下 Markdown 技能正文（不含 frontmatter）。

--- 当前正文 ---
${skill.body}

--- 应增加的规则 ---
${delta.skillAdditions.map((a) => `- ${a}`).join('\n') || '(无)'}

--- 应修改的规则 ---
${delta.skillModifications.map((m) => `- ${m}`).join('\n') || '(无)'}

--- 应删除的规则 ---
${delta.skillDeletions.map((d) => `- ${d}`).join('\n') || '(无)'}

--- 应强调（加 ⚠️ 或「注意」区块，不改核心逻辑）---
${delta.emphasisItems.concat(delta.executionLapses).map((e) => `- ${e}`).join('\n') || '(无)'}

要求：保持 Markdown 结构；不破坏正确逻辑；只输出修订后的正文（不要 frontmatter）。`;

    const newBody = await this.llm.text(prompt, this.applyDeltaHeuristic(skill.body, delta));
    const bumped = bumpSkillVersion({ ...skill, body: newBody }, newBody);
    this.logger.log(`[SkillEditor] proposed ${skill.skillId} v${skill.version} -> v${bumped.version}`);
    return bumped;
  }

  async fixAuditIssues(skill: EvolvableSkill, issues: AuditIssue[]): Promise<EvolvableSkill> {
    const prompt = `修复技能正文中的审计问题，输出完整正文（无 frontmatter）。

问题：
${issues.map((i) => `- [${i.ruleId}/${i.severity}] ${i.description}`).join('\n')}

当前正文：
${skill.body}`;

    const newBody = await this.llm.text(prompt, skill.body);
    return bumpSkillVersion(skill, newBody);
  }

  private applyDeltaHeuristic(body: string, delta: ContrastiveDelta): string {
    const parts = [body];
    if (delta.skillAdditions.length) {
      parts.push('\n## 进化补充规则\n', ...delta.skillAdditions.map((a) => `- ${a}`));
    }
    if (delta.emphasisItems.length || delta.executionLapses.length) {
      parts.push('\n## ⚠️ 执行注意\n');
      for (const e of [...delta.emphasisItems, ...delta.executionLapses]) {
        parts.push(`- ${e}`);
      }
    }
    return parts.join('\n');
  }
}
