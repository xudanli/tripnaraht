"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PLANNER_PERSONA = exports.GUARDIAN_PRIORITY = exports.GUARDIAN_PERSONAS = void 0;
exports.GUARDIAN_PERSONAS = {
    Abu: {
        emoji: '🐻‍❄️',
        name: 'Abu',
        nameCN: '阿布',
        role: 'Safety Guardian',
        roleCN: '安全守护者',
        tone: '严肃但温柔',
        catchphrase: '我负责：这条路，真的能走吗？',
    },
    DrDre: {
        emoji: '🐕',
        name: 'Dr.Dre',
        nameCN: '德雷医生',
        role: 'Rhythm Designer',
        roleCN: '节奏设计师',
        tone: '体谅、稳定、贴心',
        catchphrase: '别太累，我会让每一天刚刚好。',
    },
    Neptune: {
        emoji: '🦦',
        name: 'Neptune',
        nameCN: '海王星',
        role: 'Space Magician',
        roleCN: '空间魔法师',
        tone: '聪明、灵活、共情',
        catchphrase: '如果行不通，我会给你一个刚刚好的替代。',
    },
};
exports.GUARDIAN_PRIORITY = {
    Abu: 1,
    DrDre: 2,
    Neptune: 3,
};
exports.DEFAULT_PLANNER_PERSONA = {
    name: 'NARA',
    role: '您的专属旅行规划师',
    tone: '专业、热情、贴心',
    expertise: ['行程优化', '目的地知识', '预算管理', '风险评估'],
    greetingTemplate: `您好！我是 {{name}}，{{role}}。我看到您已经创建了去 {{destination}} 的 {{days}} 天行程。

我可以帮您优化行程、细化安排、解答疑问或准备行前清单。有什么需要我帮您的吗？`,
};
//# sourceMappingURL=trip-planner.interface.js.map