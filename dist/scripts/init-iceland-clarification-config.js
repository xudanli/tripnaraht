"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const iceland_clarification_config_1 = require("../src/trips/nl-clarification/config/iceland-clarification.config");
const prisma = new client_1.PrismaClient();
async function main() {
    var _a;
    console.log('初始化冰岛澄清配置...');
    try {
        const config = await prisma.destinationClarificationConfig.upsert({
            where: { destinationCode: 'IS' },
            update: {
                destinationName: iceland_clarification_config_1.ICELAND_CONFIG_TEMPLATE.destinationName,
                enabled: true,
                config: iceland_clarification_config_1.ICELAND_CONFIG_TEMPLATE,
                metadata: iceland_clarification_config_1.ICELAND_CONFIG_TEMPLATE.metadata,
                updatedAt: new Date(),
                updatedBy: 'system',
            },
            create: {
                destinationCode: 'IS',
                destinationName: iceland_clarification_config_1.ICELAND_CONFIG_TEMPLATE.destinationName,
                enabled: true,
                config: iceland_clarification_config_1.ICELAND_CONFIG_TEMPLATE,
                metadata: iceland_clarification_config_1.ICELAND_CONFIG_TEMPLATE.metadata,
                createdBy: 'system',
            },
        });
        console.log('✅ 冰岛配置已创建/更新:', config.id);
        console.log('   目的地代码:', config.destinationCode);
        console.log('   目的地名称:', config.destinationName);
        console.log('   启用状态:', config.enabled);
        console.log('   澄清轮次:', iceland_clarification_config_1.ICELAND_CONFIG_TEMPLATE.clarificationRounds.length);
        console.log('   Gate 预检查:', ((_a = iceland_clarification_config_1.ICELAND_CONFIG_TEMPLATE.gatePrechecks) === null || _a === void 0 ? void 0 : _a.length) || 0);
    }
    catch (error) {
        console.error('❌ 初始化失败:', error.message);
        throw error;
    }
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=init-iceland-clarification-config.js.map