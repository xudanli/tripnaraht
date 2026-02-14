"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FusionResilienceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FusionResilienceService = void 0;
const common_1 = require("@nestjs/common");
const fusion_error_interface_1 = require("../interfaces/fusion-error.interface");
let FusionResilienceService = FusionResilienceService_1 = class FusionResilienceService {
    constructor() {
        this.logger = new common_1.Logger(FusionResilienceService_1.name);
        this.circuitBreakers = new Map();
        this.CIRCUIT_BREAKER_THRESHOLD = 5;
        this.CIRCUIT_BREAKER_TIMEOUT = 30000;
    }
    async executeWithErrorHandling(operation, operationName, recoveryConfig) {
        const config = {
            maxRetries: (recoveryConfig === null || recoveryConfig === void 0 ? void 0 : recoveryConfig.maxRetries) || 3,
            retryDelay: (recoveryConfig === null || recoveryConfig === void 0 ? void 0 : recoveryConfig.retryDelay) || 1000,
            fallbackStrategy: (recoveryConfig === null || recoveryConfig === void 0 ? void 0 : recoveryConfig.fallbackStrategy) || 'RELIABILITY_WEIGHTED',
            skipOnError: (recoveryConfig === null || recoveryConfig === void 0 ? void 0 : recoveryConfig.skipOnError) || false,
        };
        if (!this.canExecute(operationName)) {
            throw new fusion_error_interface_1.FusionError(`Circuit breaker is OPEN for ${operationName}`, 'RESOURCE_EXHAUSTED', undefined, false);
        }
        let lastError;
        let retryCount = 0;
        while (retryCount <= config.maxRetries) {
            try {
                const result = await operation();
                this.onSuccess(operationName);
                return result;
            }
            catch (error) {
                lastError = error;
                const fusionError = this.classifyError(error, operationName);
                this.onFailure(operationName, fusionError);
                if (!fusionError.retryable || retryCount >= config.maxRetries) {
                    if (config.skipOnError) {
                        this.logger.warn(`Skipping operation ${operationName} due to error: ${fusionError.message}`);
                        throw fusionError;
                    }
                    throw fusionError;
                }
                const delay = this.calculateRetryDelay(retryCount, config.retryDelay);
                this.logger.warn(`Retrying ${operationName} (attempt ${retryCount + 1}/${config.maxRetries}) after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retryCount++;
            }
        }
        throw lastError || new fusion_error_interface_1.FusionError('Operation failed after retries', 'UNKNOWN_ERROR');
    }
    classifyError(error, operationName) {
        const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || String(error);
        const errorCode = (error === null || error === void 0 ? void 0 : error.code) || '';
        if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
            return new fusion_error_interface_1.FusionError(`Timeout error in ${operationName}: ${errorMessage}`, 'TIMEOUT_ERROR', undefined, true, error);
        }
        if (errorMessage.includes('resource') || errorMessage.includes('exhausted') || errorMessage.includes('limit')) {
            return new fusion_error_interface_1.FusionError(`Resource exhausted in ${operationName}: ${errorMessage}`, 'RESOURCE_EXHAUSTED', undefined, true, error);
        }
        if (errorMessage.includes('data source') || errorMessage.includes('source')) {
            return new fusion_error_interface_1.FusionError(`Data source error in ${operationName}: ${errorMessage}`, 'DATA_SOURCE_ERROR', undefined, true, error);
        }
        if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
            return new fusion_error_interface_1.FusionError(`Validation error in ${operationName}: ${errorMessage}`, 'VALIDATION_ERROR', undefined, false, error);
        }
        return new fusion_error_interface_1.FusionError(`Unknown error in ${operationName}: ${errorMessage}`, 'UNKNOWN_ERROR', undefined, true, error);
    }
    calculateRetryDelay(retryCount, baseDelay) {
        const exponentialDelay = baseDelay * Math.pow(2, retryCount);
        const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
        return Math.min(exponentialDelay + jitter, 10000);
    }
    canExecute(operationName) {
        const breaker = this.circuitBreakers.get(operationName);
        if (!breaker) {
            return true;
        }
        if (breaker.state === 'CLOSED') {
            return true;
        }
        if (breaker.state === 'OPEN') {
            if (breaker.lastFailureTime && Date.now() - breaker.lastFailureTime >= this.CIRCUIT_BREAKER_TIMEOUT) {
                breaker.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }
        return true;
    }
    onSuccess(operationName) {
        const breaker = this.circuitBreakers.get(operationName);
        if (breaker) {
            breaker.state = 'CLOSED';
            breaker.failures = 0;
        }
    }
    onFailure(operationName, error) {
        let breaker = this.circuitBreakers.get(operationName);
        if (!breaker) {
            breaker = {
                failures: 0,
                state: 'CLOSED',
            };
            this.circuitBreakers.set(operationName, breaker);
        }
        breaker.failures++;
        breaker.lastFailureTime = Date.now();
        if (breaker.state === 'HALF_OPEN') {
            breaker.state = 'OPEN';
            this.logger.error(`Circuit breaker OPENED for ${operationName} after HALF_OPEN failure`);
        }
        else if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
            breaker.state = 'OPEN';
            this.logger.error(`Circuit breaker OPENED for ${operationName} after ${breaker.failures} failures`);
        }
    }
    getCircuitBreakerState(operationName) {
        return this.circuitBreakers.get(operationName) || null;
    }
};
exports.FusionResilienceService = FusionResilienceService;
exports.FusionResilienceService = FusionResilienceService = FusionResilienceService_1 = __decorate([
    (0, common_1.Injectable)()
], FusionResilienceService);
//# sourceMappingURL=fusion-resilience.service.js.map