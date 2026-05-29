import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SkillEvolverCoreModule } from './skill-evolver-core.module';

/** CLI / scripts 薄入口：仅 SkillEvolver 核心 + Config（不拉起 LlmModule 全依赖树） */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SkillEvolverCoreModule],
})
export class SkillEvolverCliModule {}
