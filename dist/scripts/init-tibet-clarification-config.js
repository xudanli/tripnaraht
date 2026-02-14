"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const tibet_clarification_config_1 = require("../src/trips/nl-clarification/config/tibet-clarification.config");
const prisma = new client_1.PrismaClient();
async function main() {
    var _a;
    console.log('初始化西藏澄清配置...');
    try {
        const config = await prisma.destinationClarificationConfig.upsert({
            where: { destinationCode: 'XZ' },
            update: {
                destinationName: tibet_clarification_config_1.TIBET_CONFIG_TEMPLATE.destinationName,
                enabled: true,
                config: tibet_clarification_config_1.TIBET_CONFIG_TEMPLATE,
                metadata: tibet_clarification_config_1.TIBET_CONFIG_TEMPLATE.metadata,
                updatedAt: new Date(),
                updatedBy: 'system',
            },
            create: {
                destinationCode: 'XZ',
                destinationName: tibet_clarification_config_1.TIBET_CONFIG_TEMPLATE.destinationName,
                enabled: true,
                config: tibet_clarification_config_1.TIBET_CONFIG_TEMPLATE,
                metadata: tibet_clarification_config_1.TIBET_CONFIG_TEMPLATE.metadata,
                createdBy: 'system',
            },
        });
        console.log('✅ 西藏配置已创建/更新:', config.id);
        console.log('   目的地代码:', config.destinationCode);
        console.log('   目的地名称:', config.destinationName);
        console.log('   启用状态:', config.enabled);
        console.log('   澄清轮次:', tibet_clarification_config_1.TIBET_CONFIG_TEMPLATE.clarificationRounds.length);
        console.log('   Gate 预检查:', ((_a = tibet_clarification_config_1.TIBET_CONFIG_TEMPLATE.gatePrechecks) === null || _a === void 0 ? void 0 : _a.length) || 0);
        console.log('   ⚠️  风险等级: 极高（Layer 1 红线警告 - 高原反应可能致命）');
        console.log('   风险知识库: 包含4种高原反应风险（AMS、HACE、HAPE、严重反应）');
    }
    catch (error) {
        console.error('❌ 初始化失败:', error.message);
        if (error.stack) {
            console.error('堆栈:', error.stack);
        }
        throw error;
    }
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=init-tibet-clarification-config.js.map