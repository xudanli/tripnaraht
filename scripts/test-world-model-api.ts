#!/usr/bin/env tsx
/**
 * 测试世界模型 API
 * 直接调用 world.buildContext skill 并展示结果
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WorldBuildContextSkill } from '../src/skills/world/world-build-context.skill';

const tripId = process.argv[2] || '9a4dbd2e-e76a-4fd3-bab0-09332fb2581b';

async function main() {
  console.log(`构建 Trip ${tripId} 的世界模型...\n`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const worldBuildContextSkill = app.get(WorldBuildContextSkill);

  try {
    const result = await worldBuildContextSkill.execute({ tripId });

    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
