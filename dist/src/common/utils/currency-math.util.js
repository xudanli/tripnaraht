"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyMathUtil = void 0;
class CurrencyMathUtil {
    static generateRule(rate, targetCurrency = '元') {
        if (!rate || rate <= 0) {
            return '';
        }
        const inverse = 1 / rate;
        if (this.isCloseTo(inverse, 20, 0.15)) {
            return `直接除以 20`;
        }
        if (this.isCloseTo(inverse, 200, 0.2)) {
            return `直接除以 200`;
        }
        if (rate < 0.01) {
            const perTenThousand = Math.round(rate * 10000);
            if (perTenThousand > 0) {
                return `去掉 4 个零，再乘以 ${perTenThousand}`;
            }
        }
        if (this.isCloseTo(inverse, 5, 0.1)) {
            return `直接除以 5`;
        }
        if (this.isCloseTo(inverse, 4, 0.1)) {
            return `直接除以 4`;
        }
        if (this.isCloseTo(rate, 1, 0.1)) {
            return `当成 1:1 算 (打九折)`;
        }
        if (this.isCloseTo(rate, 0.5, 0.1)) {
            return `直接打对折 (除以 2)`;
        }
        const rounded = Math.round(rate);
        if (Math.abs(rate - rounded) < 0.3) {
            return `直接乘以 ${rounded}`;
        }
        return `乘以 ${rate.toFixed(1)}`;
    }
    static generateQuickTable(rate, amounts = [100, 500, 1000, 5000, 10000]) {
        if (!rate || rate <= 0) {
            return [];
        }
        return amounts.map((local) => ({
            local,
            home: Math.round(local * rate * 100) / 100,
        }));
    }
    static formatTip(rate, currencyCode, currencyName = '', exampleAmount = 1000) {
        if (!rate || rate <= 0) {
            return '';
        }
        const rule = this.generateRule(rate);
        if (!rule) {
            return '';
        }
        const exampleResult = Math.round(exampleAmount * rate * 100) / 100;
        const currencyDisplay = currencyName || currencyCode;
        return `看到价格 ${rule} 即为人民币\n例：${currencyDisplay}${exampleAmount.toLocaleString()} ≈ ${exampleResult} 元`;
    }
    static isCloseTo(value, target, tolerance) {
        if (target === 0) {
            return Math.abs(value) < tolerance;
        }
        const diff = Math.abs(value - target);
        return diff / target <= tolerance;
    }
}
exports.CurrencyMathUtil = CurrencyMathUtil;
//# sourceMappingURL=currency-math.util.js.map