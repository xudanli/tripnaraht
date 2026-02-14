"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CircuitBreakerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerService = void 0;
const common_1 = require("@nestjs/common");
let CircuitBreakerService = CircuitBreakerService_1 = class CircuitBreakerService {
    constructor() {
        this.logger = new common_1.Logger(CircuitBreakerService_1.name);
        this.breakers = new Map();
    }
    async execute(name, operation, config = {}) {
        const breaker = this.getOrCreateBreaker(name, config);
        const state = breaker.state;
        if (state === 'OPEN') {
            if (Date.now() - breaker.lastFailureTime < breaker.timeout) {
                throw new Error(`Circuit breaker is OPEN for ${name}`);
            }
            else {
                breaker.state = 'HALF_OPEN';
                breaker.halfOpenAttempts = 0;
            }
        }
        try {
            const result = await operation();
            this.onSuccess(breaker);
            return result;
        }
        catch (error) {
            this.onFailure(breaker, config);
            throw error;
        }
    }
    getOrCreateBreaker(name, config) {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, {
                name,
                state: 'CLOSED',
                failureCount: 0,
                successCount: 0,
                lastFailureTime: 0,
                lastSuccessTime: Date.now(),
                timeout: config.timeout || 60000,
                failureThreshold: config.failureThreshold || 5,
                halfOpenAttempts: 0,
                halfOpenMaxAttempts: config.halfOpenMaxAttempts || 3,
            });
        }
        return this.breakers.get(name);
    }
    onSuccess(breaker) {
        breaker.successCount++;
        breaker.lastSuccessTime = Date.now();
        if (breaker.state === 'HALF_OPEN') {
            breaker.halfOpenAttempts++;
            if (breaker.halfOpenAttempts >= breaker.halfOpenMaxAttempts) {
                breaker.state = 'CLOSED';
                breaker.failureCount = 0;
                this.logger.log(`[CircuitBreaker] ${breaker.name} 恢复为CLOSED状态`);
            }
        }
        else if (breaker.state === 'CLOSED') {
            breaker.failureCount = 0;
        }
    }
    onFailure(breaker, config) {
        breaker.failureCount++;
        breaker.lastFailureTime = Date.now();
        if (breaker.state === 'HALF_OPEN') {
            breaker.state = 'OPEN';
            this.logger.warn(`[CircuitBreaker] ${breaker.name} 从HALF_OPEN转为OPEN状态`);
        }
        else if (breaker.state === 'CLOSED' &&
            breaker.failureCount >= breaker.failureThreshold) {
            breaker.state = 'OPEN';
            this.logger.warn(`[CircuitBreaker] ${breaker.name} 从CLOSED转为OPEN状态 (失败次数: ${breaker.failureCount})`);
        }
    }
    getState(name) {
        var _a;
        return (_a = this.breakers.get(name)) === null || _a === void 0 ? void 0 : _a.state;
    }
    reset(name) {
        const breaker = this.breakers.get(name);
        if (breaker) {
            breaker.state = 'CLOSED';
            breaker.failureCount = 0;
            breaker.successCount = 0;
            this.logger.log(`[CircuitBreaker] ${name} 已重置`);
        }
    }
};
exports.CircuitBreakerService = CircuitBreakerService;
exports.CircuitBreakerService = CircuitBreakerService = CircuitBreakerService_1 = __decorate([
    (0, common_1.Injectable)()
], CircuitBreakerService);
//# sourceMappingURL=circuit-breaker.service.js.map