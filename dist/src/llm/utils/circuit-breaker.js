"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = exports.CircuitBreakerState = void 0;
var CircuitBreakerState;
(function (CircuitBreakerState) {
    CircuitBreakerState["CLOSED"] = "CLOSED";
    CircuitBreakerState["OPEN"] = "OPEN";
    CircuitBreakerState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitBreakerState || (exports.CircuitBreakerState = CircuitBreakerState = {}));
class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.options = options;
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.halfOpenSuccessCount = 0;
        const { failureThreshold = 5, resetTimeoutMs = 60000, halfOpenMaxCalls = 2, } = options;
        this.options = {
            failureThreshold,
            resetTimeoutMs,
            halfOpenMaxCalls,
        };
    }
    isOpen() {
        const now = Date.now();
        if (this.state === CircuitBreakerState.OPEN) {
            if (this.lastFailureTime && (now - this.lastFailureTime) >= this.options.resetTimeoutMs) {
                this.state = CircuitBreakerState.HALF_OPEN;
                this.halfOpenSuccessCount = 0;
                return false;
            }
            return true;
        }
        return false;
    }
    recordSuccess() {
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.halfOpenSuccessCount++;
            if (this.halfOpenSuccessCount >= this.options.halfOpenMaxCalls) {
                this.state = CircuitBreakerState.CLOSED;
                this.failureCount = 0;
                this.lastFailureTime = null;
                this.halfOpenSuccessCount = 0;
            }
        }
        else if (this.state === CircuitBreakerState.CLOSED) {
            this.failureCount = 0;
        }
    }
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.state = CircuitBreakerState.OPEN;
            this.halfOpenSuccessCount = 0;
        }
        else if (this.state === CircuitBreakerState.CLOSED) {
            if (this.failureCount >= this.options.failureThreshold) {
                this.state = CircuitBreakerState.OPEN;
            }
        }
    }
    getState() {
        return this.state;
    }
    getFailureCount() {
        return this.failureCount;
    }
    reset() {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.halfOpenSuccessCount = 0;
    }
}
exports.CircuitBreaker = CircuitBreaker;
//# sourceMappingURL=circuit-breaker.js.map