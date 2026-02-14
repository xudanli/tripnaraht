"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RollCircuitBreakerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollCircuitBreakerService = void 0;
const common_1 = require("@nestjs/common");
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (CircuitState = {}));
let RollCircuitBreakerService = RollCircuitBreakerService_1 = class RollCircuitBreakerService {
    constructor() {
        this.logger = new common_1.Logger(RollCircuitBreakerService_1.name);
        this.config = {
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 60000,
            resetTimeout: 30000,
        };
        this.circuitStates = new Map();
    }
    async execute(operation, operationName) {
        const state = this.getCircuitState(operationName);
        if (state.state === CircuitState.OPEN) {
            if (Date.now() - state.lastStateChangeTime >= this.config.timeout) {
                this.transitionToHalfOpen(operationName);
            }
            else {
                throw new Error(`Circuit breaker is OPEN for ${operationName}. Please retry later.`);
            }
        }
        try {
            const result = await operation();
            this.recordSuccess(operationName);
            return result;
        }
        catch (error) {
            this.recordFailure(operationName);
            throw error;
        }
    }
    getCircuitState(operationName) {
        if (!this.circuitStates.has(operationName)) {
            this.circuitStates.set(operationName, {
                state: CircuitState.CLOSED,
                failureCount: 0,
                successCount: 0,
                lastFailureTime: 0,
                lastStateChangeTime: Date.now(),
            });
        }
        return this.circuitStates.get(operationName);
    }
    recordSuccess(operationName) {
        const state = this.getCircuitState(operationName);
        if (state.state === CircuitState.HALF_OPEN) {
            state.successCount++;
            if (state.successCount >= this.config.successThreshold) {
                this.transitionToClosed(operationName);
            }
        }
        else if (state.state === CircuitState.CLOSED) {
            state.failureCount = 0;
        }
    }
    recordFailure(operationName) {
        const state = this.getCircuitState(operationName);
        state.failureCount++;
        state.lastFailureTime = Date.now();
        if (state.state === CircuitState.HALF_OPEN) {
            this.transitionToOpen(operationName);
        }
        else if (state.state === CircuitState.CLOSED &&
            state.failureCount >= this.config.failureThreshold) {
            this.transitionToOpen(operationName);
        }
    }
    transitionToOpen(operationName) {
        const state = this.getCircuitState(operationName);
        state.state = CircuitState.OPEN;
        state.lastStateChangeTime = Date.now();
        state.successCount = 0;
        this.logger.warn(`[CircuitBreaker] ${operationName} 断路器已打开 (failures: ${state.failureCount})`);
    }
    transitionToHalfOpen(operationName) {
        const state = this.getCircuitState(operationName);
        state.state = CircuitState.HALF_OPEN;
        state.lastStateChangeTime = Date.now();
        state.successCount = 0;
        state.failureCount = 0;
        this.logger.log(`[CircuitBreaker] ${operationName} 断路器进入半开状态`);
    }
    transitionToClosed(operationName) {
        const state = this.getCircuitState(operationName);
        state.state = CircuitState.CLOSED;
        state.lastStateChangeTime = Date.now();
        state.failureCount = 0;
        state.successCount = 0;
        this.logger.log(`[CircuitBreaker] ${operationName} 断路器已关闭（恢复正常）`);
    }
    getState(operationName) {
        const state = this.getCircuitState(operationName);
        return {
            state: state.state,
            failureCount: state.failureCount,
            successCount: state.successCount,
            lastFailureTime: state.lastFailureTime,
        };
    }
    reset(operationName) {
        this.circuitStates.delete(operationName);
        this.logger.log(`[CircuitBreaker] ${operationName} 断路器已重置`);
    }
};
exports.RollCircuitBreakerService = RollCircuitBreakerService;
exports.RollCircuitBreakerService = RollCircuitBreakerService = RollCircuitBreakerService_1 = __decorate([
    (0, common_1.Injectable)()
], RollCircuitBreakerService);
//# sourceMappingURL=roll-circuit-breaker.service.js.map