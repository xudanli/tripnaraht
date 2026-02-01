// scripts/test-nl-conversation-apis.ts
// 测试自然语言对话历史记录接口

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_PREFIX = process.env.API_PREFIX || '/api';

// 颜色输出
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
};

function logSection(title: string) {
  console.log('\n' + colors.blue('='.repeat(60)));
  console.log(colors.blue(title));
  console.log(colors.blue('='.repeat(60)));
}

function logTest(name: string) {
  console.log(colors.cyan(`\n🧪 ${name}`));
}

function logSuccess(message: string) {
  console.log(colors.green(`✅ ${message}`));
}

function logError(message: string) {
  console.log(colors.red(`❌ ${message}`));
}

function logInfo(message: string) {
  console.log(`ℹ️  ${message}`);
}

async function apiCall(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: any,
  headers: Record<string, string> = {}
): Promise<any> {
  try {
    const config: any = {
      method,
      url: `${BASE_URL}${API_PREFIX}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 30000,
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      return {
        success: false,
        error: {
          code: `HTTP_${error.response.status}`,
          message: error.response.data?.error?.message || error.message,
          details: error.response.data,
        },
      };
    }
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error.message,
      },
    };
  }
}

async function main() {
  logSection('自然语言对话历史记录接口测试');
  console.log(`\nBase URL: ${BASE_URL}${API_PREFIX}\n`);

  // 检查服务是否运行
  try {
    await axios.get(`${BASE_URL}/health`).catch(() => axios.get(`${BASE_URL}`));
    logSuccess('服务运行中\n');
  } catch (error) {
    logError('服务未运行，请先启动服务: npm run start:dev');
    process.exit(1);
  }

  const testUserId = 'test_user_' + Date.now();
  let sessionId: string | undefined;

  // ==================== 测试 1: 创建会话并发送消息 ====================
  logTest('测试 1: 创建会话并发送消息');
  
  const createResult = await apiCall('POST', '/trips/from-natural-language', {
    text: '我想去格陵兰，7月份，预算5万',
  });
  
  if (createResult.success && createResult.data) {
    sessionId = createResult.data.sessionId;
    logSuccess(`会话已创建: ${sessionId}`);
    logInfo(`响应类型: ${createResult.data.needsClarification ? '需要澄清' : '行程已创建'}`);
    logInfo(`消息数量: ${createResult.data.partialParams ? '有部分参数' : '无参数'}`);
    
    if (createResult.data.clarificationQuestions) {
      logInfo(`澄清问题数量: ${createResult.data.clarificationQuestions.length}`);
    }
  } else {
    logError(`创建会话失败: ${createResult.error?.message}`);
    process.exit(1);
  }

  if (!sessionId) {
    logError('未获取到 sessionId，无法继续测试');
    process.exit(1);
  }

  // ==================== 测试 2: 获取单个会话 ====================
  logTest('测试 2: 获取单个会话');
  
  const getSessionResult = await apiCall('GET', `/trips/nl-conversation/${sessionId}`);
  
  if (getSessionResult.success && getSessionResult.data) {
    const context = getSessionResult.data;
    logSuccess(`会话获取成功`);
    logInfo(`会话ID: ${context.sessionId}`);
    logInfo(`用户ID: ${context.userId}`);
    logInfo(`消息数量: ${context.messages.length}`);
    logInfo(`创建时间: ${context.createdAt}`);
    logInfo(`更新时间: ${context.updatedAt}`);
    logInfo(`过期时间: ${context.expiresAt}`);
    
    if (context.messages.length > 0) {
      const lastMessage = context.messages[context.messages.length - 1];
      logInfo(`最后一条消息: ${lastMessage.role} - ${lastMessage.content.substring(0, 50)}...`);
      if (lastMessage.metadata) {
        logInfo(`消息元数据: ${Object.keys(lastMessage.metadata).join(', ')}`);
      }
    }
    
    if (context.partialParams) {
      logInfo(`部分参数: ${JSON.stringify(context.partialParams)}`);
    }
  } else {
    logError(`获取会话失败: ${getSessionResult.error?.message}`);
  }

  // ==================== 测试 3: 发送第二条消息 ====================
  logTest('测试 3: 发送第二条消息（更新会话）');
  
  const secondMessageResult = await apiCall('POST', '/trips/from-natural-language', {
    text: '我的极地经验是中级',
    sessionId: sessionId,
  });
  
  if (secondMessageResult.success && secondMessageResult.data) {
    logSuccess(`第二条消息已发送`);
    logInfo(`会话ID: ${secondMessageResult.data.sessionId}`);
    
    // 验证会话是否更新
    const updatedContext = await apiCall('GET', `/trips/nl-conversation/${sessionId}`);
    if (updatedContext.success && updatedContext.data) {
      logInfo(`更新后消息数量: ${updatedContext.data.messages.length}`);
      if (updatedContext.data.messages.length >= 2) {
        logSuccess(`会话已正确更新，包含 ${updatedContext.data.messages.length} 条消息`);
      }
    }
  } else {
    logError(`发送第二条消息失败: ${secondMessageResult.error?.message}`);
  }

  // ==================== 测试 4: 更新消息的问题答案 ====================
  logTest('测试 4: 更新消息的问题答案');
  
  // 先获取会话，找到最后一条AI消息
  const contextForUpdate = await apiCall('GET', `/trips/nl-conversation/${sessionId}`);
  if (contextForUpdate.success && contextForUpdate.data) {
    const aiMessages = contextForUpdate.data.messages.filter((m: any) => m.role === 'assistant');
    if (aiMessages.length > 0) {
      const lastAiMessage = aiMessages[aiMessages.length - 1];
      const messageId = lastAiMessage.id;
      
      const updateAnswersResult = await apiCall(
        'PUT',
        `/trips/nl-conversation/${sessionId}/messages/${messageId}`,
        {
          questionAnswers: {
            'gl_experience_level': 'enthusiast',
            'gl_risk_tolerance': 'medium',
            'gl_activity_types': ['boat_tour', 'glacier_hiking'],
          },
        }
      );
      
      if (updateAnswersResult.success && updateAnswersResult.data) {
        logSuccess(`问题答案已更新`);
        logInfo(`更新的答案: ${JSON.stringify(updateAnswersResult.data.questionAnswers || {})}`);
        
        // 验证更新是否成功
        const verifyContext = await apiCall('GET', `/trips/nl-conversation/${sessionId}`);
        if (verifyContext.success && verifyContext.data) {
          const updatedMessage = verifyContext.data.messages.find((m: any) => m.id === messageId);
          if (updatedMessage?.metadata?.questionAnswers) {
            logSuccess(`验证成功：消息的问题答案已更新`);
            logInfo(`答案内容: ${JSON.stringify(updatedMessage.metadata.questionAnswers)}`);
          }
        }
      } else {
        logError(`更新问题答案失败: ${updateAnswersResult.error?.message}`);
      }
    } else {
      logInfo('没有找到AI消息，跳过更新问题答案测试');
    }
  }

  // ==================== 测试 5: 更新会话上下文 ====================
  logTest('测试 5: 更新会话上下文');
  
  const updateContextResult = await apiCall(
    'PUT',
    `/trips/nl-conversation/${sessionId}`,
    {
      sessionId: sessionId,
      partialParams: {
        destination: 'GL',
        destinationName: '格陵兰',
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        totalBudget: 50000,
        experienceLevel: 'enthusiast',
      },
    }
  );
  
  if (updateContextResult.success && updateContextResult.data) {
    logSuccess(`会话上下文已更新`);
    logInfo(`更新的部分参数: ${JSON.stringify(updateContextResult.data.partialParams || {})}`);
  } else {
    logError(`更新会话上下文失败: ${updateContextResult.error?.message}`);
  }

  // ==================== 测试 6: 获取所有会话 ====================
  logTest('测试 6: 获取所有会话');
  
  const getAllSessionsResult = await apiCall('GET', '/trips/nl-conversation');
  
  if (getAllSessionsResult.success && getAllSessionsResult.data) {
    const sessions = getAllSessionsResult.data.sessions || [];
    logSuccess(`获取到 ${sessions.length} 个会话`);
    
    sessions.forEach((session: any, index: number) => {
      console.log(`\n  会话 ${index + 1}:`);
      console.log(`    会话ID: ${session.sessionId}`);
      console.log(`    消息数量: ${session.messages.length}（预览模式：只显示最后一条）`);
      if (session.messages.length > 0) {
        const lastMsg = session.messages[0];
        console.log(`    最后消息: ${lastMsg.role} - ${lastMsg.content.substring(0, 50)}...`);
      }
      console.log(`    更新时间: ${session.updatedAt}`);
    });
  } else {
    logError(`获取所有会话失败: ${getAllSessionsResult.error?.message}`);
  }

  // ==================== 测试 7: 删除会话 ====================
  logTest('测试 7: 删除会话');
  
  const deleteResult = await apiCall('DELETE', `/trips/nl-conversation/${sessionId}`);
  
  if (deleteResult.success) {
    logSuccess(`会话已删除`);
    
    // 验证删除是否成功
    const verifyDelete = await apiCall('GET', `/trips/nl-conversation/${sessionId}`);
    if (!verifyDelete.success || verifyDelete.error?.code === 'NOT_FOUND') {
      logSuccess(`验证成功：会话已正确删除`);
    } else {
      logError(`验证失败：会话仍然存在`);
    }
  } else {
    logError(`删除会话失败: ${deleteResult.error?.message}`);
  }

  // ==================== 测试 8: 测试会话过期（可选） ====================
  logTest('测试 8: 测试会话恢复（未登录用户）');
  
  // 创建新会话
  const newSessionResult = await apiCall('POST', '/trips/from-natural-language', {
    text: '我想去冰岛',
  });
  
  if (newSessionResult.success && newSessionResult.data) {
    const newSessionId = newSessionResult.data.sessionId;
    logSuccess(`新会话已创建: ${newSessionId}`);
    
    // 尝试不使用认证恢复会话（模拟未登录用户）
    const restoreResult = await apiCall('GET', `/trips/nl-conversation/${newSessionId}`);
    if (restoreResult.success && restoreResult.data) {
      logSuccess(`未登录用户恢复会话成功`);
      logInfo(`会话ID: ${restoreResult.data.sessionId}`);
      logInfo(`消息数量: ${restoreResult.data.messages.length}`);
    } else {
      logError(`恢复会话失败: ${restoreResult.error?.message}`);
    }
  }

  logSection('测试完成');
  logSuccess('所有测试已完成');
}

main().catch(console.error);
