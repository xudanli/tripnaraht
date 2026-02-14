"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeywordExtractor = void 0;
class KeywordExtractor {
    constructor() {
        this.pricePatterns = [
            /[$€£¥]\s*\d+(\.\d+)?/g,
            /\d+(\.\d+)?\s*[元円ドルユーロ]/g,
            /\b(price|cost|fee|admission|entry|ticket|入場料|料金|価格)\s*[:：]?\s*\d+/gi,
        ];
        this.timePatterns = [
            /\b\d{1,2}:\d{2}\s?[-–—]\s?\d{1,2}:\d{2}\b/g,
            /\b\d{1,2}:\d{2}\s?(AM|PM|am|pm)\s?[-–—]\s?\d{1,2}:\d{2}\s?(AM|PM|am|pm)\b/g,
            /\b\d{1,2}[時:]\d{0,2}\s?[～〜\u2013\u2014-]\s?\d{1,2}[時:]\d{0,2}\b/g,
            /\b(open|closed|hours|営業時間|開店|閉店|open now|closing soon|営業中|閉店中)\b/gi,
        ];
        this.dayPatterns = [
            /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
            /\b(月|火|水|木|金|土|日)[曜日]?\b/g,
        ];
        this.stopWords = new Set([
            'open',
            'closed',
            'hours',
            'now',
            'today',
            'tomorrow',
            'price',
            'cost',
            'fee',
            'free',
            'admission',
            'entry',
            'ticket',
            'available',
            'unavailable',
            'full',
            'empty',
            '营业时间',
            '开放时间',
            '价格',
            '费用',
            '免费',
            '入场',
            '门票',
            '营业中',
            '闭店',
            '営業時間',
            '価格',
            '料金',
            '無料',
            '入場',
            'チケット',
            '営業中',
            '閉店',
        ]);
        this.shopSuffixPattern = /(店|館|屋|restaurant|cafe|coffee|shop|store|bar|pub|bistro|レストラン|カフェ|店舗|屋|館)/i;
        this.menuKeywords = [
            'ramen',
            'sushi',
            'curry',
            '焼肉',
            '拉面',
            '寿司',
            '咖喱',
            '烤肉',
            'pizza',
            'pasta',
            'burger',
            'steak',
            'seafood',
            'pork',
            'beef',
            'chicken',
        ];
    }
    extractCandidateKeywords(lines) {
        const candidates = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length < 2)
                continue;
            if (this.isPriceLine(trimmed))
                continue;
            if (this.isTimeLine(trimmed))
                continue;
            if (this.isDayLine(trimmed))
                continue;
            if (this.isStopWordLine(trimmed))
                continue;
            const score = this.scoreLine(trimmed);
            if (score > 0) {
                candidates.push({ text: trimmed, score });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        const seen = new Set();
        return candidates
            .map((c) => c.text)
            .filter((text) => {
            const normalized = text.toLowerCase();
            if (seen.has(normalized))
                return false;
            seen.add(normalized);
            return true;
        });
    }
    isPriceLine(text) {
        return this.pricePatterns.some((pattern) => pattern.test(text));
    }
    isTimeLine(text) {
        return this.timePatterns.some((pattern) => pattern.test(text));
    }
    isDayLine(text) {
        return this.dayPatterns.some((pattern) => pattern.test(text));
    }
    isStopWordLine(text) {
        const words = text.toLowerCase().split(/\s+/);
        return words.every((word) => {
            const cleaned = word.replace(/[^\w\u4e00-\u9fa5]/g, '');
            return cleaned.length === 0 || this.stopWords.has(cleaned);
        });
    }
    scoreLine(text) {
        let score = 0;
        const lowerText = text.toLowerCase();
        if (this.shopSuffixPattern.test(text)) {
            score += 10;
        }
        if (this.menuKeywords.some((kw) => lowerText.includes(kw.toLowerCase()))) {
            score += 5;
        }
        const length = text.length;
        if (length >= 3 && length <= 30) {
            score += 3;
        }
        else if (length > 50) {
            score -= 5;
        }
        const hasChinesePlaceName = /[\u4e00-\u9fa5]{2,}/.test(text);
        const hasEnglishPlaceName = /\b[A-Z][a-z]+\b/.test(text);
        if (hasChinesePlaceName || hasEnglishPlaceName) {
            score += 2;
        }
        if (/^[\d\s\-–—\(\)（）]+$/.test(text)) {
            score -= 10;
        }
        return score;
    }
    extractCandidateNames(lines, topN = 5) {
        const keywords = this.extractCandidateKeywords(lines);
        return keywords.slice(0, topN);
    }
}
exports.KeywordExtractor = KeywordExtractor;
//# sourceMappingURL=keyword-extractor.util.js.map