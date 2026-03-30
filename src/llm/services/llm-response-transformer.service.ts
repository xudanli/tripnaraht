// src/llm/services/llm-response-transformer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PlannerResponseBlockDto, PlannerResponseBlockType } from '../../trips/dto/create-trip-from-nl-response.dto';
import { ClarificationQuestion, ClarificationQuestionType } from '../../agent/interfaces/clarification.interface';

/**
 * LLM响应转换服务
 * 
 * 职责：
 * 1. 验证和转换LLM输出的结构化响应
 * 2. 确保数据符合Schema和业务逻辑
 * 3. 提供降级方案（失败时降级到文本模式）
 */
@Injectable()
export class LlmResponseTransformerService {
  private readonly logger = new Logger(LlmResponseTransformerService.name);

  /**
   * 将LLM输出转换为结构化响应
   * 
   * @param llmOutput LLM原始输出
   * @param fallbackText 降级时的文本回复
   * @param retryCount 重试次数（内部使用）
   * @returns 结构化响应（包含plannerResponseBlocks和clarificationQuestions）
   */
  async transformToStructuredResponse(
    llmOutput: any,
    fallbackText?: string,
    retryCount: number = 0
  ): Promise<{
    plannerResponseBlocks?: PlannerResponseBlockDto[];
    clarificationQuestions?: ClarificationQuestion[];
    plannerReply?: string;
  }> {
    const MAX_RETRIES = 2;
    
    try {
      // 检查responseBlocks是否存在
      if (!llmOutput.responseBlocks) {
        // 如果没有responseBlocks字段，抛出错误（让调用者决定如何处理）
        throw new Error('responseBlocks must be an array');
      }
      if (!Array.isArray(llmOutput.responseBlocks)) {
        // 如果responseBlocks不是数组，抛出错误
        throw new Error('responseBlocks must be an array');
      }
      
      // 1. 验证和转换responseBlocks
      const blocks = this.validateAndTransformBlocks(llmOutput.responseBlocks);
      
      // 2. 验证和转换clarificationQuestions
      const questions = this.validateAndTransformQuestions(
        llmOutput.clarificationQuestions || []
      );
      
      // 2.1 最终验证：确保没有空卡片或重复卡片
      // finalizeQuestions已经在validateAndTransformQuestions内部调用，这里再次确保
      const finalizedQuestions = questions.length > 0 ? this.finalizeQuestions(questions) : questions;
      
      // 3. 验证questionId匹配（question_card的questionId必须在clarificationQuestions中存在）
      this.validateQuestionIdMatching(blocks, finalizedQuestions);
      
      // 4. 生成向后兼容的文本回复
      const textReply = this.generateTextReply(blocks, llmOutput.reply || fallbackText);
      
      this.logger.debug(`Successfully transformed structured response: ${blocks.length} blocks, ${finalizedQuestions.length} questions (filtered from ${questions.length})`);
      
      return {
        plannerResponseBlocks: blocks,
        clarificationQuestions: finalizedQuestions,
        plannerReply: textReply,
      };
    } catch (error: any) {
      // 如果是验证错误且未达到最大重试次数，尝试自动修复
      if (retryCount < MAX_RETRIES && this.isRecoverableError(error)) {
        this.logger.debug(`Attempting to recover from error (retry ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
        
        // 尝试自动修复
        const fixedOutput = this.attemptAutoFix(llmOutput, error);
        if (fixedOutput) {
          return this.transformToStructuredResponse(fixedOutput, fallbackText, retryCount + 1);
        }
      }
      
      // 如果错误不应该被自动修复，直接抛出（让调用者处理）
      if (!this.isRecoverableError(error)) {
        throw error;
      }
      
      // 降级方案：如果结构化失败，使用文本回复
      this.logger.warn(`Structured response transformation failed after ${retryCount} retries: ${error.message}`, error.stack);
      return {
        plannerReply: fallbackText || llmOutput.reply || '让我来帮您规划这趟旅程吧！',
        clarificationQuestions: this.fallbackQuestions(llmOutput),
      };
    }
  }

  /**
   * 判断错误是否可恢复（可以尝试自动修复）
   * 
   * 注意：某些错误不应该被自动修复，应该直接抛出（如空数组、缺失responseBlocks等）
   */
  private isRecoverableError(error: Error): boolean {
    // 这些错误不应该被自动修复，应该直接抛出
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
    
    // 这些错误可以尝试自动修复
    const recoverablePatterns = [
      'Duplicate questionId',
      'non-existent questionId',
    ];
    
    return recoverablePatterns.some(pattern => error.message.includes(pattern));
  }

  /**
   * 尝试自动修复LLM输出
   */
  private attemptAutoFix(llmOutput: any, error: Error): any | null {
    try {
      const fixed = JSON.parse(JSON.stringify(llmOutput)); // 深拷贝
      
      // 修复缺失的questionId（如果question_card引用了不存在的questionId）
      if (error.message.includes('non-existent questionId')) {
        const questionIdMatch = error.message.match(/questionId: (\w+)/);
        if (questionIdMatch && fixed.responseBlocks) {
          const missingQuestionId = questionIdMatch[1];
          const questionCardBlocks = fixed.responseBlocks.filter((b: any) => 
            b.type === 'question_card' && b.questionId === missingQuestionId
          );
          
          // 如果找不到匹配的问题，移除这些question_card
          if (questionCardBlocks.length > 0) {
            fixed.responseBlocks = fixed.responseBlocks.filter((b: any) => 
              !(b.type === 'question_card' && b.questionId === missingQuestionId)
            );
            this.logger.debug(`Auto-fixed: removed ${questionCardBlocks.length} question_card blocks with non-existent questionId`);
          }
        }
      }
      
      // 修复重复的questionId
      if (error.message.includes('Duplicate questionId')) {
        const questionIdMatch = error.message.match(/Duplicate questionId: (\w+)/);
        if (questionIdMatch && fixed.clarificationQuestions) {
          const duplicateId = questionIdMatch[1];
          let foundFirst = false;
          fixed.clarificationQuestions = fixed.clarificationQuestions.map((q: any, index: number) => {
            if (q.id === duplicateId) {
              if (foundFirst) {
                // 为重复的questionId添加后缀
                const newId = `${duplicateId}_${index}`;
                this.logger.debug(`Auto-fixed: renamed duplicate questionId ${duplicateId} to ${newId}`);
                return { ...q, id: newId };
              } else {
                foundFirst = true;
                return q;
              }
            }
            return q;
          });
        }
      }
      
      return fixed;
    } catch (fixError: any) {
      this.logger.warn(`Auto-fix failed: ${fixError.message}`);
      return null;
    }
  }

  /**
   * 验证和转换responseBlocks
   * 
   * @param blocks LLM输出的blocks数组
   * @returns 验证后的blocks数组
   * @throws Error 如果验证失败
   */
  private validateAndTransformBlocks(blocks: any[]): PlannerResponseBlockDto[] {
    if (!Array.isArray(blocks)) {
      throw new Error('responseBlocks must be an array');
    }

    if (blocks.length === 0) {
      throw new Error('responseBlocks must be a non-empty array');
    }

    // 限制最大数量，避免过长响应（已在Schema中限制，这里作为双重保险）
    const MAX_BLOCKS = 20;
    let processedBlocks = blocks;
    if (blocks.length > MAX_BLOCKS) {
      this.logger.warn(`responseBlocks length (${blocks.length}) exceeds maximum (${MAX_BLOCKS}), truncating`);
      processedBlocks = blocks.slice(0, MAX_BLOCKS);
    }

    const transformedBlocks: PlannerResponseBlockDto[] = [];
    
    for (let i = 0; i < processedBlocks.length; i++) {
      const block = processedBlocks[i];
      
      // 验证必需字段
      if (!block.type) {
        throw new Error(`Block ${i} missing required field: type`);
      }

      // 验证type是否为有效值
      const validTypes: PlannerResponseBlockType[] = [
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

      // 根据类型验证字段
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

      // 生成缺失的id（使用更简洁的格式）
      const transformedBlock: PlannerResponseBlockDto = {
        ...block,
        id: block.id || `block_${i}_${Date.now()}`,
      };

      // 清理undefined字段（避免JSON序列化问题）
      const cleanedBlock: any = {};
      Object.keys(transformedBlock).forEach(key => {
        const value = transformedBlock[key as keyof PlannerResponseBlockDto];
        if (value !== undefined && value !== null) {
          cleanedBlock[key] = value;
        }
      });
      
      transformedBlocks.push(cleanedBlock as PlannerResponseBlockDto);
    }

    return transformedBlocks;
  }

  /**
   * 验证和转换clarificationQuestions
   * 
   * @param questions LLM输出的questions数组
   * @returns 验证后的questions数组
   * @throws Error 如果验证失败
   */
  private validateAndTransformQuestions(questions: any[]): ClarificationQuestion[] {
    if (!Array.isArray(questions)) {
      return [];
    }

    // 限制最大数量，避免过长响应
    const MAX_QUESTIONS = 10;
    let processedQuestions = questions;
    if (questions.length > MAX_QUESTIONS) {
      this.logger.warn(`clarificationQuestions length (${questions.length}) exceeds maximum (${MAX_QUESTIONS}), truncating`);
      processedQuestions = questions.slice(0, MAX_QUESTIONS);
    }

    const transformedQuestions: ClarificationQuestion[] = [];
    const questionIds = new Set<string>();

    for (let i = 0; i < processedQuestions.length; i++) {
      const question = processedQuestions[i];

      // 验证必需字段
      if (!question.id || typeof question.id !== 'string') {
        throw new Error(`Question ${i} missing or invalid required field: id`);
      }
      // 兼容question和text字段（LLM可能返回text，但接口使用question）
      // 优先使用question字段，如果没有则使用text字段
      const questionText = (question.question || question.text) as string | undefined;
      if (!questionText || typeof questionText !== 'string') {
        throw new Error(`Question ${i} missing or invalid required field: question/text`);
      }
      
      // 验证question文本不为空（去除首尾空格后检查）
      const trimmedQuestionText = questionText.trim();
      if (!trimmedQuestionText) {
        this.logger.warn(`Question ${question.id} has empty text after trimming, skipping`);
        continue; // 跳过空文本的问题
      }
      
      // 验证questionId唯一性（在trimmed之后检查）
      const trimmedId = question.id.trim();
      if (questionIds.has(trimmedId)) {
        // 在转换阶段，重复的ID仍然抛出错误（用于测试和早期检测）
        // finalizeQuestions会在最终阶段再次过滤重复项
        throw new Error(`Duplicate questionId: ${trimmedId}`);
      }
      questionIds.add(trimmedId);
      if (!question.type || typeof question.type !== 'string') {
        throw new Error(`Question ${i} missing or invalid required field: type`);
      }
      if (question.required === undefined || typeof question.required !== 'boolean') {
        throw new Error(`Question ${i} missing or invalid required field: required`);
      }


      // 验证type是否为有效值（兼容boolean类型，映射为single_choice）
      const validTypes = ['text', 'single_choice', 'multi_choice', 'date', 'number', 'boolean'];
      if (!validTypes.includes(question.type)) {
        throw new Error(`Question ${question.id} has invalid type: ${question.type}`);
      }

      // 转换type字段（兼容ClarificationQuestion接口）
      // boolean类型映射为single_choice，options为['是', '否']
      let questionType: ClarificationQuestionType;
      if (question.type === 'boolean') {
        questionType = 'single_choice';
        question.options = question.options || ['是', '否'];
      } else {
        questionType = question.type as ClarificationQuestionType;
      }

      // 验证type和options的匹配
      if ((questionType === 'single_choice' || questionType === 'multi_choice')) {
        if (!question.options || !Array.isArray(question.options) || question.options.length === 0) {
          throw new Error(`Question ${question.id} (${questionType}) missing or empty required field: options`);
        }
      }

      // 🆕 HCI优化：处理选项值（标准化处理，去除首尾空格）
      let processedOptions = question.options;
      if (processedOptions && Array.isArray(processedOptions)) {
        processedOptions = processedOptions.map((opt: any) => {
          if (typeof opt === 'string') {
            return opt.trim(); // 标准化选项值
          }
          // 如果是对象格式，标准化value和label
          return {
            ...opt,
            value: (opt.value || opt.label || opt).toString().trim(),
            label: (opt.label || opt.value || opt).toString().trim(),
          };
        });
      }

      // 🆕 HCI优化：处理条件输入字段（支持 snake_case 兼容、single_choice/multiple_choice）
      // 🆕 产品优化：补充偏好问题不得多一层「请选择您感兴趣的方面」，直接展示节奏/美食/住宿等输入项
      let processedConditionalInputs = question.conditionalInputs;
      const isSupplementPref = /补充偏好|supplement_preferences|supplementPreferences/i.test(question.id || '') ||
        /补充.*偏好|补充.*信息/i.test((question.question || question.text || '').toString());
      if (isSupplementPref && processedConditionalInputs?.length) {
        const hasMetaCategoryStep = processedConditionalInputs.some((inp: any) => {
          const lb = (inp.label || '').toString();
          const opts = Array.isArray(inp.options) ? inp.options : [];
          const optStrs = opts.map((o: any) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? '')).toString());
          return /选择的?方面|感兴趣的方面|您想补充/i.test(lb) ||
            optStrs.some((s: string) => /旅行节奏偏好|特色活动兴趣|住宿类型倾向|美食偏好/.test(s));
        });
        if (hasMetaCategoryStep) {
          const triggerVal = (processedConditionalInputs[0]?.triggerValue || '补充偏好信息').toString().trim();
          processedConditionalInputs = this.getDirectPreferenceConditionalInputs(triggerVal);
          this.logger.debug('已替换补充偏好中间步，改为直接展示节奏/美食/住宿等输入项');
        }
      }
      if (processedConditionalInputs && Array.isArray(processedConditionalInputs)) {
        processedConditionalInputs = processedConditionalInputs.map((input: any) => {
          // 兼容 snake_case：trigger_value, input_type, param_key
          const raw = { ...input, ...(input.trigger_value !== undefined && { triggerValue: input.trigger_value }), ...(input.input_type !== undefined && { inputType: input.input_type }), ...(input.param_key !== undefined && { paramKey: input.param_key }) };
          let inputType = (raw.inputType || raw.input_type || 'text').toString().trim();
          if (inputType === 'multiple_choice') inputType = 'multi_choice'; // 统一为 multi_choice
          // 标准化 options（single_choice / multi_choice 时）
          let optOptions = raw.options;
          if (optOptions && Array.isArray(optOptions)) {
            optOptions = optOptions.map((o: any) => (typeof o === 'string' ? o.trim() : { value: (o.value || o.label || o).toString().trim(), label: (o.label || o.value || o).toString().trim() }));
          }
          return {
            triggerValue: (raw.triggerValue || raw.trigger_value || '').toString().trim(),
            inputType,
            label: (raw.label || '').toString().trim() || undefined,
            options: optOptions,
            placeholder: (raw.placeholder || '').toString().trim() || undefined,
            hint: (raw.hint || '').toString().trim() || undefined,
            required: raw.required !== undefined ? !!raw.required : true,
            validation: raw.validation,
            paramKey: (raw.paramKey || raw.param_key || '').toString().trim() || undefined,
          };
        });
      }

      transformedQuestions.push({
        id: trimmedId, // 使用清理后的id
        question: trimmedQuestionText, // 使用清理后的questionText
        type: questionType,
        options: processedOptions, // 🆕 使用标准化后的选项
        required: isSupplementPref ? false : question.required, // 补充偏好保持可选
        placeholder: question.placeholder,
        hint: question.hint,
        default: question.default,
        validation: question.validation,
        // 🆕 HCI优化：保留条件输入字段
        conditionalInputs: processedConditionalInputs,
      } as ClarificationQuestion);
    }

    // 最终验证：确保没有空卡片或重复卡片
    return this.finalizeQuestions(transformedQuestions);
  }

  /**
   * 补充偏好直接输入项（无「请选择您感兴趣的方面」中间步）
   * 全部 required: false，保持可选性
   */
  private getDirectPreferenceConditionalInputs(triggerValue: string): any[] {
    return [
      { triggerValue, inputType: 'single_choice', label: '请选择旅行节奏', paramKey: 'pace', options: ['紧凑', '悠闲', '适中'], required: false },
      { triggerValue, inputType: 'multi_choice', label: '请选择美食偏好', paramKey: 'cuisine', options: ['中餐', '西餐', '海鲜', '当地特色', '无特别要求'], required: false },
      { triggerValue, inputType: 'multi_choice', label: '请选择住宿风格', paramKey: 'accommodation_style', options: ['经济型', '舒适型', '精品酒店', '民宿', '青旅'], required: false },
      { triggerValue, inputType: 'single_choice', label: '请选择徒步强度', paramKey: 'hiking_intensity', options: ['轻松', '中等', '高强度', '不涉及徒步'], required: false },
      { triggerValue, inputType: 'text', label: '其他偏好描述', placeholder: '例如：户外徒步、观星、节奏悠闲、偏好美食', hint: '您的偏好将帮助筛选活动和住宿，让行程更个性化。', paramKey: 'other', required: false },
    ];
  }

  /**
   * 最终验证和清理clarificationQuestions
   * 确保每个问题都有有效的id和text，并去除重复项（包括相似文本）
   * 
   * @param questions 已转换的问题数组
   * @returns 清理后的问题数组
   */
  private finalizeQuestions(questions: ClarificationQuestion[]): ClarificationQuestion[] {
    const finalizedQuestions: ClarificationQuestion[] = [];
    const seenIds = new Set<string>();
    const seenTexts = new Set<string>();
    const normalizedTexts = new Set<string>(); // 用于检测相似文本

    for (const question of questions) {
      // 验证id存在且唯一
      if (!question.id || typeof question.id !== 'string' || question.id.trim() === '') {
        this.logger.warn(`Skipping question with invalid or empty id: ${JSON.stringify(question)}`);
        continue;
      }

      // 验证question文本存在且不为空
      const questionText = question.question || (question as any).text;
      if (!questionText || typeof questionText !== 'string' || questionText.trim() === '') {
        this.logger.warn(`Skipping question ${question.id} with empty text`);
        continue;
      }

      const trimmedId = question.id.trim();
      const trimmedText = questionText.trim();

      // 检查id重复
      if (seenIds.has(trimmedId)) {
        this.logger.warn(`Skipping duplicate question id: ${trimmedId}`);
        continue;
      }

      // 检查文本重复（精确匹配）
      if (seenTexts.has(trimmedText)) {
        this.logger.warn(`Skipping duplicate question text (exact match): ${trimmedText.substring(0, 50)}...`);
        continue;
      }

      // 🆕 检查相似文本（标准化后比较）
      const normalizedText = this.normalizeQuestionText(trimmedText);
      if (normalizedTexts.has(normalizedText)) {
        this.logger.warn(`Skipping duplicate question text (similar): "${trimmedText.substring(0, 50)}..." (normalized: "${normalizedText.substring(0, 50)}...")`);
        continue;
      }

      seenIds.add(trimmedId);
      seenTexts.add(trimmedText);
      normalizedTexts.add(normalizedText);

      // 确保question字段使用清理后的文本
      finalizedQuestions.push({
        ...question,
        id: trimmedId,
        question: trimmedText,
      });
    }

    if (finalizedQuestions.length === 0 && questions.length > 0) {
      this.logger.warn(`All questions were filtered out during finalization. Original count: ${questions.length}`);
    } else if (finalizedQuestions.length < questions.length) {
      this.logger.debug(`Filtered ${questions.length - finalizedQuestions.length} duplicate questions. Final count: ${finalizedQuestions.length}`);
    }

    return finalizedQuestions;
  }

  /**
   * 标准化问题文本（用于相似度检测）
   * 去除标点符号、统一空格、转换为小写（中文不转换）
   * 
   * @param text 原始文本
   * @returns 标准化后的文本
   */
  private normalizeQuestionText(text: string): string {
    let normalized = text
      // 去除所有标点符号（包括中文和英文标点）
      .replace(/[，。！？；：、,\.!?;:]/g, '')
      // 统一空格（多个空格合并为一个）
      .replace(/\s+/g, ' ')
      // 去除首尾空格
      .trim()
      // 转换为小写（仅对英文，中文不受影响）
      .toLowerCase();
    // 🆕 同类问题归一化去重，但区分不同维度（补充偏好 vs 补充安全），避免误删
    if (/补充.*安全|补充安全/.test(normalized)) {
      normalized = '是否需要补充安全信息';
    } else if (/补充.*偏好|补充偏好/.test(normalized)) {
      normalized = '是否需要补充偏好信息';
    }
    return normalized;
  }

  /**
   * 验证questionId匹配（question_card的questionId必须在clarificationQuestions中存在）
   * 
   * @param blocks responseBlocks数组
   * @param questions clarificationQuestions数组
   * @throws Error 如果questionId不匹配
   */
  private validateQuestionIdMatching(
    blocks: PlannerResponseBlockDto[],
    questions: ClarificationQuestion[]
  ): void {
    const questionIds = new Set(questions.map(q => q.id));
    
    for (const block of blocks) {
      if (block.type === 'question_card' && block.questionId) {
        if (!questionIds.has(block.questionId)) {
          throw new Error(`Question card references non-existent questionId: ${block.questionId}`);
        }
      }
    }
  }

  /**
   * 生成向后兼容的文本回复
   * 
   * @param blocks responseBlocks数组
   * @param fallback 降级文本（如果有）
   * @returns 文本回复
   */
  private generateTextReply(
    blocks: PlannerResponseBlockDto[],
    fallback?: string
  ): string {
    if (fallback) return fallback;

    const textParts: string[] = [];
    
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
            } else {
              block.items.forEach(item => {
                textParts.push(`• ${item}`);
              });
            }
          }
          break;
        
        case 'summary_card':
          if (block.summary) {
            const summaryParts: string[] = [];
            if (block.summary.destination) summaryParts.push(`目的地：${block.summary.destination}`);
            if (block.summary.duration) summaryParts.push(`天数：${block.summary.duration}`);
            if (block.summary.travelers) summaryParts.push(`旅行者：${block.summary.travelers}`);
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
        
        // question_card、budget_summary、itinerary_overview 不转换为文本
        // 这些类型主要用于前端展示，不需要文本回复
      }
    }

    return textParts.join('\n\n') || '让我来帮您规划这趟旅程吧！';
  }

  /**
   * 降级方案：从suggestedQuestions生成简单的问题列表
   * 
   * @param llmOutput LLM原始输出
   * @returns 降级的问题列表
   */
  private fallbackQuestions(llmOutput: any): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];
    
    // 从suggestedQuestions生成简单的问题列表
    if (llmOutput.suggestedQuestions && Array.isArray(llmOutput.suggestedQuestions)) {
      llmOutput.suggestedQuestions.forEach((q: string, index: number) => {
        questions.push({
          id: `fallback_q_${index}_${Date.now()}`,
          question: q,
          type: 'text',
          required: false,
        });
      });
    }

    // 从clarificationQuestions（字符串数组）生成问题列表
    if (llmOutput.clarificationQuestions && Array.isArray(llmOutput.clarificationQuestions)) {
      llmOutput.clarificationQuestions.forEach((q: string, index: number) => {
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
}
