#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const world_build_context_skill_1 = require("../src/skills/world/world-build-context.skill");
const tripId = process.argv[2] || '9a4dbd2e-e76a-4fd3-bab0-09332fb2581b';
async function main() {
    console.log(`构建 Trip ${tripId} 的世界模型...\n`);
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const worldBuildContextSkill = app.get(world_build_context_skill_1.WorldBuildContextSkill);
    try {
        const result = await worldBuildContextSkill.execute({ tripId });
        console.log(JSON.stringify(result, null, 2));
    }
    catch (error) {
        console.error('错误:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
    finally {
        await app.close();
    }
}
main().catch(console.error);
//# sourceMappingURL=test-world-model-api.js.map