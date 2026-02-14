"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RedisCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCacheService = void 0;
const common_1 = require("@nestjs/common");
const redis_1 = require("redis");
let RedisCacheService = RedisCacheService_1 = class RedisCacheService {
    constructor() {
        this.logger = new common_1.Logger(RedisCacheService_1.name);
        this.client = null;
        this.isConnected = false;
        this.initialize();
    }
    async initialize() {
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            this.logger.log(`[Redis] 连接到 Redis: ${redisUrl}`);
            this.client = (0, redis_1.createClient)({
                url: redisUrl,
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > 10) {
                            this.logger.error('[Redis] 重连次数过多，停止重连');
                            return new Error('Redis reconnection failed');
                        }
                        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
                        this.logger.warn(`[Redis] 重连中... (第 ${retries} 次，延迟 ${delay}ms)`);
                        return delay;
                    },
                },
            });
            this.client.on('error', (err) => {
                this.logger.error('[Redis] 错误:', err.message);
                this.isConnected = false;
            });
            this.client.on('connect', () => {
                this.logger.log('[Redis] 连接成功');
                this.isConnected = true;
            });
            this.client.on('end', () => {
                this.logger.warn('[Redis] 连接断开');
                this.isConnected = false;
            });
            await this.client.connect();
        }
        catch (error) {
            this.logger.error(`[Redis] 初始化失败: ${error.message}`);
            this.logger.warn('[Redis] 将使用内存缓存降级');
            this.client = null;
            this.isConnected = false;
        }
    }
    async get(key) {
        if (!this.isConnected || !this.client) {
            return null;
        }
        try {
            const value = await this.client.get(key);
            if (!value) {
                return null;
            }
            return JSON.parse(value);
        }
        catch (error) {
            this.logger.error(`[Redis] 获取缓存失败: ${key}`, error.message);
            return null;
        }
    }
    async set(key, value, ttlSeconds = 3600) {
        if (!this.isConnected || !this.client) {
            this.logger.warn(`[Redis] Redis 不可用，跳过缓存: ${key}`);
            return false;
        }
        try {
            const serialized = JSON.stringify(value);
            await this.client.setEx(key, ttlSeconds, serialized);
            return true;
        }
        catch (error) {
            this.logger.error(`[Redis] 设置缓存失败: ${key}`, error.message);
            return false;
        }
    }
    async del(key) {
        if (!this.isConnected || !this.client) {
            return false;
        }
        try {
            await this.client.del(key);
            return true;
        }
        catch (error) {
            this.logger.error(`[Redis] 删除缓存失败: ${key}`, error.message);
            return false;
        }
    }
    async delPattern(pattern) {
        if (!this.isConnected || !this.client) {
            return 0;
        }
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length === 0) {
                return 0;
            }
            await this.client.del(keys);
            return keys.length;
        }
        catch (error) {
            this.logger.error(`[Redis] 批量删除缓存失败: ${pattern}`, error.message);
            return 0;
        }
    }
    async exists(key) {
        if (!this.isConnected || !this.client) {
            return false;
        }
        try {
            const exists = await this.client.exists(key);
            return exists === 1;
        }
        catch (error) {
            this.logger.error(`[Redis] 检查缓存存在性失败: ${key}`, error.message);
            return false;
        }
    }
    async ttl(key) {
        if (!this.isConnected || !this.client) {
            return -2;
        }
        try {
            return await this.client.ttl(key);
        }
        catch (error) {
            this.logger.error(`[Redis] 获取 TTL 失败: ${key}`, error.message);
            return -2;
        }
    }
    async incr(key, increment = 1) {
        if (!this.isConnected || !this.client) {
            return 0;
        }
        try {
            return await this.client.incrBy(key, increment);
        }
        catch (error) {
            this.logger.error(`[Redis] 增加计数器失败: ${key}`, error.message);
            return 0;
        }
    }
    async expire(key, ttlSeconds) {
        if (!this.isConnected || !this.client) {
            return false;
        }
        try {
            await this.client.expire(key, ttlSeconds);
            return true;
        }
        catch (error) {
            this.logger.error(`[Redis] 设置过期时间失败: ${key}`, error.message);
            return false;
        }
    }
    async flushAll() {
        if (!this.isConnected || !this.client) {
            return false;
        }
        try {
            await this.client.flushAll();
            this.logger.warn('[Redis] 已清空所有缓存');
            return true;
        }
        catch (error) {
            this.logger.error('[Redis] 清空缓存失败', error.message);
            return false;
        }
    }
    isReady() {
        return this.isConnected && this.client !== null;
    }
    async ping() {
        if (!this.isConnected || !this.client) {
            return false;
        }
        try {
            const result = await this.client.ping();
            return result === 'PONG';
        }
        catch (error) {
            this.logger.error('[Redis] Ping 失败', error.message);
            return false;
        }
    }
    async info() {
        if (!this.isConnected || !this.client) {
            return null;
        }
        try {
            return await this.client.info();
        }
        catch (error) {
            this.logger.error('[Redis] 获取信息失败', error.message);
            return null;
        }
    }
    async onModuleDestroy() {
        if (this.client) {
            try {
                await this.client.quit();
                this.logger.log('[Redis] 连接已关闭');
            }
            catch (error) {
                this.logger.error('[Redis] 关闭连接失败', error.message);
            }
        }
    }
};
exports.RedisCacheService = RedisCacheService;
exports.RedisCacheService = RedisCacheService = RedisCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RedisCacheService);
//# sourceMappingURL=redis-cache.service.js.map