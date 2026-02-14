"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FallbackGuard = exports.ModeLock = exports.CircuitBreaker = void 0;
exports.createDeadline = createDeadline;
exports.withTimeout = withTimeout;
exports.normalizeError = normalizeError;
function createDeadline(totalMs) {
    const startTs = Date.now();
    return {
        startTs,
        totalMs,
        remainingMs: () => Math.max(0, totalMs - (Date.now() - startTs)),
        elapsedMs: () => Date.now() - startTs,
        isExpired: () => Date.now() - startTs >= totalMs,
        clamp: (ms, minMs = 50) => Math.max(minMs, Math.min(ms, Math.max(0, totalMs - (Date.now() - startTs)))),
    };
}
async function withTimeout(p, ms, label) {
    if (ms <= 0)
        throw new Error(`TIMEOUT:${label}`);
    let t;
    const timeout = new Promise((_, rej) => {
        t = setTimeout(() => rej(new Error(`TIMEOUT:${label}`)), ms);
    });
    try {
        return await Promise.race([p, timeout]);
    }
    finally {
        if (t)
            clearTimeout(t);
    }
}
class SimpleLruCache {
    constructor(maxSize, ttlMs) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.map = new Map();
    }
    get(key) {
        const hit = this.map.get(key);
        if (!hit)
            return undefined;
        if (Date.now() - hit.at > this.ttlMs) {
            this.map.delete(key);
            return undefined;
        }
        this.map.delete(key);
        this.map.set(key, { v: hit.v, at: Date.now() });
        return hit.v;
    }
    set(key, value) {
        if (this.map.has(key))
            this.map.delete(key);
        this.map.set(key, { v: value, at: Date.now() });
        while (this.map.size > this.maxSize) {
            const oldest = this.map.keys().next().value;
            if (!oldest)
                break;
            this.map.delete(oldest);
        }
    }
}
class CircuitBreaker {
    constructor(failThreshold, openMs) {
        this.failThreshold = failThreshold;
        this.openMs = openMs;
        this.state = { state: "CLOSED", failures: 0 };
    }
    snapshot() {
        return { ...this.state };
    }
    canPass() {
        var _a;
        if (this.state.state === "CLOSED")
            return true;
        if (this.state.state === "OPEN") {
            const openedAt = (_a = this.state.openedAt) !== null && _a !== void 0 ? _a : Date.now();
            if (Date.now() - openedAt >= this.openMs) {
                this.state = { state: "HALF_OPEN", failures: this.state.failures, openedAt };
                return true;
            }
            return false;
        }
        return true;
    }
    onSuccess() {
        this.state = { state: "CLOSED", failures: 0 };
    }
    onFailure(err) {
        var _a;
        const msg = (err === null || err === void 0 ? void 0 : err.message) ? String(err.message) : String(err);
        const failures = ((_a = this.state.failures) !== null && _a !== void 0 ? _a : 0) + 1;
        if (this.state.state === "HALF_OPEN") {
            this.state = { state: "OPEN", failures, openedAt: Date.now(), lastError: msg };
            return;
        }
        if (failures >= this.failThreshold) {
            this.state = { state: "OPEN", failures, openedAt: Date.now(), lastError: msg };
        }
        else {
            this.state = { state: "CLOSED", failures, lastError: msg };
        }
    }
}
exports.CircuitBreaker = CircuitBreaker;
class ModeLock {
    constructor() {
        this.cache = new SimpleLruCache(512, 10 * 60 * 1000);
    }
    keyFor(ctx) {
        if (ctx.tripId)
            return `trip:${ctx.tripId}`;
        if (ctx.userId)
            return `user:${ctx.userId}`;
        return `req:${ctx.requestHash}`;
    }
    get(ctx) {
        return this.cache.get(this.keyFor(ctx));
    }
    set(ctx, mode) {
        this.cache.set(this.keyFor(ctx), mode);
    }
}
exports.ModeLock = ModeLock;
function normalizeError(e) {
    const msg = (e === null || e === void 0 ? void 0 : e.message) ? String(e.message) : String(e);
    const isTimeout = msg.startsWith("TIMEOUT:") || msg.startsWith("TIMEOUT/");
    if (isTimeout) {
        return {
            status: "TIMEOUT",
            errorType: "TIMEOUT",
            message: "请求超时，请缩小范围或稍后重试。",
            isTimeout: true,
        };
    }
    return {
        status: "FAILED",
        errorType: "INTERNAL_ERROR",
        message: msg || "内部错误",
        isTimeout: false,
    };
}
class FallbackGuard {
    constructor() {
        this.used = false;
    }
    tryUse() {
        if (this.used)
            return false;
        this.used = true;
        return true;
    }
    usedAlready() {
        return this.used;
    }
}
exports.FallbackGuard = FallbackGuard;
//# sourceMappingURL=orchestration-stability.util.js.map