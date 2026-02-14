"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenCalculator = void 0;
class TokenCalculator {
    static estimateTokens(text) {
        if (!text) {
            return 0;
        }
        const str = String(text);
        const chineseChars = (str.match(/[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf]/g) || []).length;
        const otherChars = str.length - chineseChars;
        const chineseTokens = Math.ceil(chineseChars / 1.5);
        const otherTokens = Math.ceil(otherChars / 4);
        return chineseTokens + otherTokens;
    }
    static estimateJsonTokens(obj) {
        if (obj === null || obj === undefined) {
            return 0;
        }
        try {
            const jsonString = JSON.stringify(obj);
            return this.estimateTokens(jsonString);
        }
        catch (error) {
            return this.estimateTokens(String(obj));
        }
    }
    static estimateMessagesTokens(messages) {
        if (!messages || !Array.isArray(messages)) {
            return 0;
        }
        let total = 0;
        const messageOverhead = 4;
        for (const message of messages) {
            total += messageOverhead;
            if (message.role) {
                total += this.estimateTokens(message.role);
            }
            if (message.content) {
                total += this.estimateTokens(message.content);
            }
        }
        return total;
    }
    static estimateStateTokens(state) {
        if (!state) {
            return 0;
        }
        let total = 0;
        total += this.estimateTokens(state.user_input);
        if (state.trip) {
            total += this.estimateJsonTokens(state.trip);
        }
        if (state.memory) {
            total += this.estimateJsonTokens(state.memory);
        }
        if (state.compute) {
            total += this.estimateJsonTokens(state.compute);
        }
        if (state.result) {
            total += this.estimateJsonTokens(state.result);
        }
        return total;
    }
    static estimateTotalTokens(requestText, responseText, additionalData) {
        let total = 0;
        total += this.estimateTokens(requestText);
        total += this.estimateTokens(responseText);
        if (additionalData) {
            total += this.estimateJsonTokens(additionalData);
        }
        const apiOverhead = 10;
        total += apiOverhead;
        return total;
    }
}
exports.TokenCalculator = TokenCalculator;
//# sourceMappingURL=token-calculator.util.js.map