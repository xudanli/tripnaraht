"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisModule = void 0;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("./redis.service");
const common_2 = require("@nestjs/common");
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
    process.env.MCP_MODE === 'true';
const disableRedis = process.env.DISABLE_REDIS === 'true' || isMcpMode;
const logger = new common_2.Logger('RedisModule');
if (disableRedis) {
    logger.warn('🚫 RedisModule loaded in MCP mode - will use in-memory cache only');
}
let redisStore = null;
if (!disableRedis) {
    try {
        redisStore = require('cache-manager-redis-store');
        logger.log('✅ cache-manager-redis-store loaded');
    }
    catch (error) {
        logger.warn('⚠️ cache-manager-redis-store not available, using in-memory cache');
    }
}
else {
    logger.warn('🚫 Skipping cache-manager-redis-store load (MCP mode)');
}
const cacheModuleConfig = disableRedis
    ? (() => {
        logger.warn('Using in-memory cache (MCP mode)');
        return cache_manager_1.CacheModule.register({ ttl: 3600, max: 1000 });
    })()
    : cache_manager_1.CacheModule.registerAsync({
        imports: [config_1.ConfigModule],
        inject: [config_1.ConfigService],
        useFactory: (configService) => {
            const logger = new common_2.Logger('RedisModule');
            const runtimeDisableRedis = configService.get('DISABLE_REDIS') === 'true' ||
                process.env.DISABLE_REDIS === 'true' ||
                isMcpMode ||
                !redisStore;
            if (runtimeDisableRedis) {
                logger.warn('Redis disabled, using in-memory cache (MCP/test mode)');
                return {
                    ttl: configService.get('REDIS_TTL', 3600),
                    max: 1000,
                };
            }
            const redisHost = configService.get('REDIS_HOST', 'localhost');
            const redisPort = configService.get('REDIS_PORT', 6379);
            const redisPassword = configService.get('REDIS_PASSWORD');
            const redisDb = configService.get('REDIS_DB', 0);
            const ttl = configService.get('REDIS_TTL', 3600);
            return {
                store: redisStore.redisStore || redisStore,
                host: redisHost,
                port: redisPort,
                password: redisPassword,
                db: redisDb,
                ttl: ttl,
                max: 1000,
            };
        },
    });
let RedisModule = class RedisModule {
};
exports.RedisModule = RedisModule;
exports.RedisModule = RedisModule = __decorate([
    (0, common_1.Module)({
        imports: [cacheModuleConfig],
        providers: [redis_service_1.RedisService],
        exports: [cache_manager_1.CacheModule, redis_service_1.RedisService],
    })
], RedisModule);
//# sourceMappingURL=redis.module.js.map