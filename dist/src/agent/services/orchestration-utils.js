"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleLruCache = exports.Deadline = void 0;
exports.withTimeout = withTimeout;
exports.runBounded = runBounded;
class Deadline {
    constructor(totalMs) {
        this.totalMs = totalMs;
        this.startedAt = Date.now();
    }
    elapsedMs() {
        return Date.now() - this.startedAt;
    }
    remainingMs() {
        return Math.max(0, this.totalMs - this.elapsedMs());
    }
    clampTimeoutMs(desiredMs, minMs = 250) {
        return Math.max(minMs, Math.min(desiredMs, this.remainingMs()));
    }
    isExpired() {
        return this.remainingMs() <= 0;
    }
}
exports.Deadline = Deadline;
async function withTimeout(p, ms, label) {
    if (ms <= 0)
        throw new Error(`TIMEOUT: ${label}`);
    let t;
    const timeout = new Promise((_, rej) => {
        t = setTimeout(() => rej(new Error(`TIMEOUT: ${label}`)), ms);
    });
    try {
        return await Promise.race([p, timeout]);
    }
    finally {
        if (t)
            clearTimeout(t);
    }
}
async function runBounded(tasks, concurrency) {
    const results = new Array(tasks.length);
    let i = 0;
    async function worker() {
        while (true) {
            const idx = i++;
            if (idx >= tasks.length)
                return;
            results[idx] = await tasks[idx]();
        }
    }
    const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
    await Promise.all(workers);
    return results;
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
exports.SimpleLruCache = SimpleLruCache;
//# sourceMappingURL=orchestration-utils.js.map