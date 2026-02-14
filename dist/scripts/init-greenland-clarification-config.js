"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const destination_clarification_config_1 = require("../src/trips/nl-clarification/config/destination-clarification.config");
const prisma = new client_1.PrismaClient();
async function main() {
    var _a, _b, _c;
    console.log('初始化格陵兰澄清配置...');
    try {
        const config = await prisma.destinationClarificationConfig.upsert({
            where: { destinationCode: 'GL' },
            update: {
                destinationName: destination_clarification_config_1.GREENLAND_CONFIG_TEMPLATE.destinationName,
                enabled: true,
                config: destination_clarification_config_1.GREENLAND_CONFIG_TEMPLATE,
                metadata: destination_clarification_config_1.GREENLAND_CONFIG_TEMPLATE.metadata,
                updatedAt: new Date(),
                updatedBy: 'system',
            },
            create: {
                destinationCode: 'GL',
                destinationName: destination_clarification_config_1.GREENLAND_CONFIG_TEMPLATE.destinationName,
                enabled: true,
                config: destination_clarification_config_1.GREENLAND_CONFIG_TEMPLATE,
                metadata: destination_clarification_config_1.GREENLAND_CONFIG_TEMPLATE.metadata,
                createdBy: 'system',
            },
        });
        console.log('✅ 格陵兰配置已创建/更新:', config.id);
        console.log('   目的地代码:', config.destinationCode);
        console.log('   目的地名称:', config.destinationName);
        console.log('   启用状态:', config.enabled);
        console.log('   澄清轮次:', destination_clarification_config_1.GREENLAND_CONFIG_TEMPLATE.clarificationRounds.length);
        console.log('   Gate 预检查:', ((_a = destination_clarification_config_1.GREENLAND_CONFIG_TEMPLATE.gatePrechecks) === null || _a === void 0 ? void 0 : _a.length) || 0);
        console.log('   用户画像:', ((_c = (_b = destination_clarification_config_1.GREENLAND_CONFIG_TEMPLATE.userPersonas) === null || _b === void 0 ? void 0 : _b.user_personas) === null || _c === void 0 ? void 0 : _c.length) || 0, '个画像');
    }
    catch (error) {
        console.error('❌ 初始化失败:', error.message);
        throw error;
    }
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=init-greenland-clarification-config.js.map