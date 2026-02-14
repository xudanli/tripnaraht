"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASE_MODEL_OPTIONS = exports.MODEL_TYPE_OPTIONS = void 0;
exports.MODEL_TYPE_OPTIONS = [
    { value: 'SFT', label: 'SFT (Supervised Fine-Tuning)', description: '监督微调，适用于基础任务学习' },
    { value: 'RLHF', label: 'RLHF (RL from Human Feedback)', description: '人类反馈强化学习，提升对齐能力' },
    { value: 'RL', label: 'RL (Reinforcement Learning)', description: '纯强化学习，基于奖励信号优化' },
    { value: 'DPO', label: 'DPO (Direct Preference Optimization)', description: '直接偏好优化，简化RLHF流程' },
    { value: 'PPO', label: 'PPO (Proximal Policy Optimization)', description: '近端策略优化，稳定训练' },
];
exports.BASE_MODEL_OPTIONS = [
    { value: 'claude-3-opus', label: 'Claude 3 Opus', provider: 'Anthropic' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', provider: 'Anthropic' },
    { value: 'claude-3-haiku', label: 'Claude 3 Haiku', provider: 'Anthropic' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'OpenAI' },
    { value: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI' },
    { value: 'llama-3-70b', label: 'Llama 3 70B', provider: 'Meta' },
    { value: 'llama-3-8b', label: 'Llama 3 8B', provider: 'Meta' },
    { value: 'mistral-large', label: 'Mistral Large', provider: 'Mistral' },
    { value: 'mistral-medium', label: 'Mistral Medium', provider: 'Mistral' },
    { value: 'qwen-72b', label: 'Qwen 72B', provider: 'Alibaba' },
    { value: 'deepseek-v2', label: 'DeepSeek V2', provider: 'DeepSeek' },
    { value: 'custom', label: '自定义模型', provider: 'Custom' },
];
//# sourceMappingURL=training-platform.interface.js.map