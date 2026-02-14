"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LlmResponseTransformerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmResponseTransformerService = void 0;
const common_1 = require("@nestjs/common");
let LlmResponseTransformerService = LlmResponseTransformerService_1 = class LlmResponseTransformerService {
    constructor() {
        this.logger = new common_1.Logger(LlmResponseTransformerService_1.name);
    }
    async transformToStructuredResponse(llmOutput, fallbackText, retryCount = 0) {
        const MAX_RETRIES = 2;
        try {
            if (!llmOutput.responseBlocks) {
                throw new Error('responseBlocks must be an array');
            }
            if (!Array.isArray(llmOutput.responseBlocks)) {
                throw new Error('responseBlocks must be an array');
            }
            const blocks = this.validateAndTransformBlocks(llmOutput.responseBlocks);
            const questions = this.validateAndTransformQuestions(llmOutput.clarificationQuestions || []);
            const finalizedQuestions = questions.length > 0 ? this.finalizeQuestions(questions) : questions;
            this.validateQuestionIdMatching(blocks, finalizedQuestions);
            const textReply = this.generateTextReply(blocks, llmOutput.reply || fallbackText);
            this.logger.debug(`Successfully transformed structured response: ${blocks.length} blocks, ${finalizedQuestions.length} questions (filtered from ${questions.length})`);
            return {
                plannerResponseBlocks: blocks,
                clarificationQuestions: finalizedQuestions,
                plannerReply: textReply,
            };
        }
        catch (error) {
            if (retryCount < MAX_RETRIES && this.isRecoverableError(error)) {
                this.logger.debug(`Attempting to recover from error (retry ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
                const fixedOutput = this.attemptAutoFix(llmOutput, error);
                if (fixedOutput) {
                    return this.transformToStructuredResponse(fixedOutput, fallbackText, retryCount + 1);
                }
            }
            if (!this.isRecoverableError(error)) {
                throw error;
            }
            this.logger.warn(`Structured response transformation failed after ${retryCount} retries: ${error.message}`, error.stack);
            return {
                plannerReply: fallbackText || llmOutput.reply || '让我来帮您规划这趟旅程吧！',
                clarificationQuestions: this.fallbackQuestions(llmOutput),
            };
        }
    }
    isRecoverableError(error) {
        const nonRecoverablePatterns = [
            'must be an array',
            'must be a non-empty array',
            'missing required field: responseBlocks',
            'missing or invalid required field: content',
            'missing required fields: level or text',
            'has invalid level',
            'missing or empty required field: items',
            'missing or empty required field: options',
            'has invalid type',
        ];
        if (nonRecoverablePatterns.some(pattern => error.message.includes(pattern))) {
            return false;
        }
        const recoverablePatterns = [
            'Duplicate questionId',
            'non-existent questionId',
        ];
        return recoverablePatterns.some(pattern => error.message.includes(pattern));
    }
    attemptAutoFix(llmOutput, error) {
        try {
            const fixed = JSON.parse(JSON.stringify(llmOutput));
            if (error.message.includes('non-existent questionId')) {
                const questionIdMatch = error.message.match(/questionId: (\w+)/);
                if (questionIdMatch && fixed.responseBlocks) {
                    const missingQuestionId = questionIdMatch[1];
                    const existingQuestions = fixed.clarificationQuestions || [];
                    const questionCardBlocks = fixed.responseBlocks.filter((b) => b.type === 'question_card' && b.questionId === missingQuestionId);
                    if (questionCardBlocks.length > 0) {
                        fixed.responseBlocks = fixed.responseBlocks.filter((b) => !(b.type === 'question_card' && b.questionId === missingQuestionId));
                        this.logger.debug(`Auto-fixed: removed ${questionCardBlocks.length} question_card blocks with non-existent questionId`);
                    }
                }
            }
            if (error.message.includes('Duplicate questionId')) {
                const questionIdMatch = error.message.match(/Duplicate questionId: (\w+)/);
                if (questionIdMatch && fixed.clarificationQuestions) {
                    const duplicateId = questionIdMatch[1];
                    let foundFirst = false;
                    fixed.clarificationQuestions = fixed.clarificationQuestions.map((q, index) => {
                        if (q.id === duplicateId) {
                            if (foundFirst) {
                                const newId = `${duplicateId}_${index}`;
                                this.logger.debug(`Auto-fixed: renamed duplicate questionId ${duplicateId} to ${newId}`);
                                return { ...q, id: newId };
                            }
                            else {
                                foundFirst = true;
                                return q;
                            }
                        }
                        return q;
                    });
                }
            }
            return fixed;
        }
        catch (fixError) {
            this.logger.warn(`Auto-fix failed: ${fixError.message}`);
            return null;
        }
    }
    validateAndTransformBlocks(blocks) {
        if (!Array.isArray(blocks)) {
            throw new Error('responseBlocks must be an array');
        }
        if (blocks.length === 0) {
            throw new Error('responseBlocks must be a non-empty array');
        }
        const MAX_BLOCKS = 20;
        let processedBlocks = blocks;
        if (blocks.length > MAX_BLOCKS) {
            this.logger.warn(`responseBlocks length (${blocks.length}) exceeds maximum (${MAX_BLOCKS}), truncating`);
            processedBlocks = blocks.slice(0, MAX_BLOCKS);
        }
        const transformedBlocks = [];
        for (let i = 0; i < processedBlocks.length; i++) {
            const block = processedBlocks[i];
            if (!block.type) {
                throw new Error(`Block ${i} missing required field: type`);
            }
            const validTypes = [
                'paragraph',
                'heading',
                'list',
                'summary_card',
                'question_card',
                'highlight',
                'budget_summary',
                'itinerary_overview',
            ];
            if (!validTypes.includes(block.type)) {
                throw new Error(`Block ${i} has invalid type: ${block.type}`);
            }
            switch (block.type) {
                case 'paragraph':
                    if (!block.content || typeof block.content !== 'string') {
                        throw new Error(`Block ${i} (paragraph) missing or invalid required field: content`);
                    }
                    break;
                case 'heading':
                    if (!block.level || !block.text) {
                        throw new Error(`Block ${i} (heading) missing required fields: level or text`);
                    }
                    if (![1, 2, 3].includes(block.level)) {
                        throw new Error(`Block ${i} (heading) has invalid level: ${block.level} (must be 1, 2, or 3)`);
                    }
                    break;
                case 'list':
                    if (!block.items || !Array.isArray(block.items) || block.items.length === 0) {
                        throw new Error(`Block ${i} (list) missing or empty required field: items`);
                    }
                    break;
                case 'summary_card':
                    if (!block.summary || typeof block.summary !== 'object') {
                        throw new Error(`Block ${i} (summary_card) missing required field: summary`);
                    }
                    break;
                case 'question_card':
                    if (!block.questionId || typeof block.questionId !== 'string') {
                        throw new Error(`Block ${i} (question_card) missing or invalid required field: questionId`);
                    }
                    break;
                case 'highlight':
                    if (!block.highlightText || typeof block.highlightText !== 'string') {
                        throw new Error(`Block ${i} (highlight) missing or invalid required field: highlightText`);
                    }
                    if (block.highlightType && !['info', 'warning', 'success'].includes(block.highlightType)) {
                        throw new Error(`Block ${i} (highlight) has invalid highlightType: ${block.highlightType}`);
                    }
                    break;
                case 'budget_summary':
                    if (!block.budget || typeof block.budget !== 'object') {
                        throw new Error(`Block ${i} (budget_summary) missing required field: budget`);
                    }
                    break;
                case 'itinerary_overview':
                    if (!block.itinerary || typeof block.itinerary !== 'object') {
                        throw new Error(`Block ${i} (itinerary_overview) missing required field: itinerary`);
                    }
                    break;
            }
            const transformedBlock = {
                ...block,
                id: block.id || `block_${i}_${Date.now()}`,
            };
            const cleanedBlock = {};
            Object.keys(transformedBlock).forEach(key => {
                const value = transformedBlock[key];
                if (value !== undefined && value !== null) {
                    cleanedBlock[key] = value;
                }
            });
            transformedBlocks.push(cleanedBlock);
        }
        return transformedBlocks;
    }
    validateAndTransformQuestions(questions) {
        if (!Array.isArray(questions)) {
            return [];
        }
        const MAX_QUESTIONS = 10;
        let processedQuestions = questions;
        if (questions.length > MAX_QUESTIONS) {
            this.logger.warn(`clarificationQuestions length (${questions.length}) exceeds maximum (${MAX_QUESTIONS}), truncating`);
            processedQuestions = questions.slice(0, MAX_QUESTIONS);
        }
        const transformedQuestions = [];
        const questionIds = new Set();
        for (let i = 0; i < processedQuestions.length; i++) {
            const question = processedQuestions[i];
            if (!question.id || typeof question.id !== 'string') {
                throw new Error(`Question ${i} missing or invalid required field: id`);
            }
            const questionText = (question.question || question.text);
            if (!questionText || typeof questionText !== 'string') {
                throw new Error(`Question ${i} missing or invalid required field: question/text`);
            }
            const trimmedQuestionText = questionText.trim();
            if (!trimmedQuestionText) {
                this.logger.warn(`Question ${question.id} has empty text after trimming, skipping`);
                continue;
            }
            const trimmedId = question.id.trim();
            if (questionIds.has(trimmedId)) {
                throw new Error(`Duplicate questionId: ${trimmedId}`);
            }
            questionIds.add(trimmedId);
            if (!question.type || typeof question.type !== 'string') {
                throw new Error(`Question ${i} missing or invalid required field: type`);
            }
            if (question.required === undefined || typeof question.required !== 'boolean') {
                throw new Error(`Question ${i} missing or invalid required field: required`);
            }
            const validTypes = ['text', 'single_choice', 'multi_choice', 'date', 'number', 'boolean'];
            if (!validTypes.includes(question.type)) {
                throw new Error(`Question ${question.id} has invalid type: ${question.type}`);
            }
            let questionType;
            if (question.type === 'boolean') {
                questionType = 'single_choice';
                question.options = question.options || ['是', '否'];
            }
            else {
                questionType = question.type;
            }
            if ((questionType === 'single_choice' || questionType === 'multi_choice')) {
                if (!question.options || !Array.isArray(question.options) || question.options.length === 0) {
                    throw new Error(`Question ${question.id} (${questionType}) missing or empty required field: options`);
                }
            }
            let processedOptions = question.options;
            if (processedOptions && Array.isArray(processedOptions)) {
                processedOptions = processedOptions.map((opt) => {
                    if (typeof opt === 'string') {
                        return opt.trim();
                    }
                    return {
                        ...opt,
                        value: (opt.value || opt.label || opt).toString().trim(),
                        label: (opt.label || opt.value || opt).toString().trim(),
                    };
                });
            }
            let processedConditionalInputs = question.conditionalInputs;
            if (processedConditionalInputs && Array.isArray(processedConditionalInputs)) {
                processedConditionalInputs = processedConditionalInputs.map((input) => {
                    var _a, _b, _c, _d;
                    return ({
                        ...input,
                        triggerValue: ((_a = input.triggerValue) === null || _a === void 0 ? void 0 : _a.toString().trim()) || '',
                        inputType: input.inputType,
                        label: (_b = input.label) === null || _b === void 0 ? void 0 : _b.trim(),
                        placeholder: (_c = input.placeholder) === null || _c === void 0 ? void 0 : _c.trim(),
                        required: input.required !== undefined ? input.required : true,
                        validation: input.validation,
                        hint: (_d = input.hint) === null || _d === void 0 ? void 0 : _d.trim(),
                    });
                });
            }
            transformedQuestions.push({
                id: trimmedId,
                question: trimmedQuestionText,
                type: questionType,
                options: processedOptions,
                required: question.required,
                placeholder: question.placeholder,
                hint: question.hint,
                default: question.default,
                validation: question.validation,
                conditionalInputs: processedConditionalInputs,
            });
        }
        return this.finalizeQuestions(transformedQuestions);
    }
    finalizeQuestions(questions) {
        const finalizedQuestions = [];
        const seenIds = new Set();
        const seenTexts = new Set();
        const normalizedTexts = new Set();
        for (const question of questions) {
            if (!question.id || typeof question.id !== 'string' || question.id.trim() === '') {
                this.logger.warn(`Skipping question with invalid or empty id: ${JSON.stringify(question)}`);
                continue;
            }
            const questionText = question.question || question.text;
            if (!questionText || typeof questionText !== 'string' || questionText.trim() === '') {
                this.logger.warn(`Skipping question ${question.id} with empty text`);
                continue;
            }
            const trimmedId = question.id.trim();
            const trimmedText = questionText.trim();
            if (seenIds.has(trimmedId)) {
                this.logger.warn(`Skipping duplicate question id: ${trimmedId}`);
                continue;
            }
            if (seenTexts.has(trimmedText)) {
                this.logger.warn(`Skipping duplicate question text (exact match): ${trimmedText.substring(0, 50)}...`);
                continue;
            }
            const normalizedText = this.normalizeQuestionText(trimmedText);
            if (normalizedTexts.has(normalizedText)) {
                this.logger.warn(`Skipping duplicate question text (similar): "${trimmedText.substring(0, 50)}..." (normalized: "${normalizedText.substring(0, 50)}...")`);
                continue;
            }
            seenIds.add(trimmedId);
            seenTexts.add(trimmedText);
            normalizedTexts.add(normalizedText);
            finalizedQuestions.push({
                ...question,
                id: trimmedId,
                question: trimmedText,
            });
        }
        if (finalizedQuestions.length === 0 && questions.length > 0) {
            this.logger.warn(`All questions were filtered out during finalization. Original count: ${questions.length}`);
        }
        else if (finalizedQuestions.length < questions.length) {
            this.logger.debug(`Filtered ${questions.length - finalizedQuestions.length} duplicate questions. Final count: ${finalizedQuestions.length}`);
        }
        return finalizedQuestions;
    }
    normalizeQuestionText(text) {
        return text
            .replace(/[，。！？；：、,\.!?;:]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }
    validateQuestionIdMatching(blocks, questions) {
        const questionIds = new Set(questions.map(q => q.id));
        for (const block of blocks) {
            if (block.type === 'question_card' && block.questionId) {
                if (!questionIds.has(block.questionId)) {
                    throw new Error(`Question card references non-existent questionId: ${block.questionId}`);
                }
            }
        }
    }
    generateTextReply(blocks, fallback) {
        if (fallback)
            return fallback;
        const textParts = [];
        for (const block of blocks) {
            switch (block.type) {
                case 'paragraph':
                    if (block.content) {
                        textParts.push(block.content);
                    }
                    break;
                case 'heading':
                    if (block.text) {
                        textParts.push(block.text);
                    }
                    break;
                case 'list':
                    if (block.title) {
                        textParts.push(block.title);
                    }
                    if (block.items && block.items.length > 0) {
                        if (block.ordered) {
                            block.items.forEach((item, index) => {
                                textParts.push(`${index + 1}. ${item}`);
                            });
                        }
                        else {
                            block.items.forEach(item => {
                                textParts.push(`• ${item}`);
                            });
                        }
                    }
                    break;
                case 'summary_card':
                    if (block.summary) {
                        const summaryParts = [];
                        if (block.summary.destination)
                            summaryParts.push(`目的地：${block.summary.destination}`);
                        if (block.summary.duration)
                            summaryParts.push(`天数：${block.summary.duration}`);
                        if (block.summary.travelers)
                            summaryParts.push(`旅行者：${block.summary.travelers}`);
                        if (block.summary.budget) {
                            summaryParts.push(`预算：${block.summary.budget.amount} ${block.summary.budget.currency}`);
                        }
                        if (summaryParts.length > 0) {
                            textParts.push(summaryParts.join('，'));
                        }
                    }
                    break;
                case 'highlight':
                    if (block.highlightText) {
                        textParts.push(`⚠️ ${block.highlightText}`);
                    }
                    break;
            }
        }
        return textParts.join('\n\n') || '让我来帮您规划这趟旅程吧！';
    }
    fallbackQuestions(llmOutput) {
        const questions = [];
        if (llmOutput.suggestedQuestions && Array.isArray(llmOutput.suggestedQuestions)) {
            llmOutput.suggestedQuestions.forEach((q, index) => {
                questions.push({
                    id: `fallback_q_${index}_${Date.now()}`,
                    question: q,
                    type: 'text',
                    required: false,
                });
            });
        }
        if (llmOutput.clarificationQuestions && Array.isArray(llmOutput.clarificationQuestions)) {
            llmOutput.clarificationQuestions.forEach((q, index) => {
                if (typeof q === 'string') {
                    questions.push({
                        id: `fallback_clarification_${index}_${Date.now()}`,
                        question: q,
                        type: 'text',
                        required: false,
                    });
                }
            });
        }
        return questions;
    }
};
exports.LlmResponseTransformerService = LlmResponseTransformerService;
exports.LlmResponseTransformerService = LlmResponseTransformerService = LlmResponseTransformerService_1 = __decorate([
    (0, common_1.Injectable)()
], LlmResponseTransformerService);
//# sourceMappingURL=llm-response-transformer.service.js.map