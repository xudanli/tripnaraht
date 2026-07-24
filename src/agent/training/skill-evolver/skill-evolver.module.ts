import { Module } from '@nestjs/common';
import { LlmModule } from '../../../llm/llm.module';
import { SkillEvolverController } from './controllers/skill-evolver.controller';
import { SkillEvolverCoreModule } from './skill-evolver-core.module';

/**
 * SkillEvolver Lite — Markdown 文本技能在线进化（不改模型权重）。
 * 设计文档：docs/skill-evolver-lite-design.md
 */
@Module({
  imports: [SkillEvolverCoreModule, LlmModule],
  controllers: [SkillEvolverController],
  exports: [SkillEvolverCoreModule],
})
export class SkillEvolverModule {}
