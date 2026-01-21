"""
Policy-Worker: 策略推理 Worker

职责:
- 加载策略模型
- 执行策略推理
- 返回动作建议 (ALLOW/REJECT/ADJUST/CLARIFY)
"""
import ray
import logging
from typing import Dict, Any, Optional
from config import RAY_ADDRESS, RAY_NAMESPACE, LOG_LEVEL, MODEL_PATH

logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger(__name__)

# 初始化 Ray
try:
    ray.init(address=RAY_ADDRESS, namespace=RAY_NAMESPACE, ignore_reinit_error=True)
except Exception as e:
    logger.warning(f"Ray 初始化失败，使用本地模式: {e}")
    ray.init(ignore_reinit_error=True)


@ray.remote
class PolicyWorker:
    """
    Policy-Worker: 策略推理
    """
    
    def __init__(self, worker_id: str = "default", model_path: Optional[str] = None):
        self.worker_id = worker_id
        self.model_path = model_path or MODEL_PATH
        self.model = None
        
        # TODO: 加载实际模型
        # if self.model_path:
        #     self.model = self._load_model(self.model_path)
        
        logger.info(f"[PolicyWorker-{worker_id}] 初始化完成 (model_path={self.model_path})")
    
    def predict(
        self,
        state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        策略推理
        
        Args:
            state: 状态信息
                - user_request: 用户请求
                - origin: 起点
                - destination: 终点
                - constraints: 约束条件
                - preferences: 偏好设置
        
        Returns:
            策略动作:
                - action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY'
                - confidence: 置信度 [0, 1]
                - reasoning: 推理过程
                - adjusted_params: 调整后的参数（如果 action='ADJUST'）
        """
        logger.info(f"[PolicyWorker-{self.worker_id}] 收到策略推理请求")
        
        try:
            user_request = state.get("user_request", "")
            origin = state.get("origin")
            destination = state.get("destination")
            constraints = state.get("constraints", {})
            preferences = state.get("preferences", {})
            
            # 策略推理逻辑
            # TODO: 使用实际模型进行推理
            # 当前使用启发式规则
            
            # 规则 1: 检查必要信息
            if not user_request:
                return {
                    "success": True,
                    "action": "CLARIFY",
                    "confidence": 0.9,
                    "reasoning": "用户请求为空，需要澄清",
                }
            
            # 规则 2: 检查起点和终点
            if not origin or not destination:
                return {
                    "success": True,
                    "action": "CLARIFY",
                    "confidence": 0.8,
                    "reasoning": "缺少起点或终点信息",
                }
            
            # 规则 3: 检查约束条件
            budget = constraints.get("budget")
            if budget is not None and budget < 0:
                return {
                    "success": True,
                    "action": "REJECT",
                    "confidence": 0.95,
                    "reasoning": "预算不能为负数",
                }
            
            # 规则 4: 检查高风险目的地（示例）
            high_risk_destinations = ["Antarctica", "North Pole"]
            if destination in high_risk_destinations:
                return {
                    "success": True,
                    "action": "ADJUST",
                    "confidence": 0.85,
                    "reasoning": f"目的地 {destination} 存在高风险，建议调整",
                    "adjusted_params": {
                        "destination": "Reykjavik",  # 示例：建议替代目的地
                        "risk_warning": True,
                    },
                }
            
            # 规则 5: 检查预算合理性
            if budget is not None and budget < 1000:
                return {
                    "success": True,
                    "action": "ADJUST",
                    "confidence": 0.7,
                    "reasoning": "预算较低，建议调整行程或增加预算",
                    "adjusted_params": {
                        "budget": max(budget, 2000),
                        "duration": constraints.get("duration", 7) - 1,  # 减少天数
                    },
                }
            
            # 默认：允许
            return {
                "success": True,
                "action": "ALLOW",
                "confidence": 0.8,
                "reasoning": "请求符合策略要求",
            }
            
        except Exception as e:
            logger.error(f"[PolicyWorker-{self.worker_id}] 策略推理失败: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }
    
    def _load_model(self, model_path: str):
        """
        加载策略模型
        
        TODO: 实现实际模型加载
        """
        # 示例：加载 PyTorch 模型
        # import torch
        # model = torch.load(model_path)
        # return model
        
        logger.warn(f"[PolicyWorker-{self.worker_id}] 模型加载未实现: {model_path}")
        return None
    
    def health_check(self) -> Dict[str, Any]:
        """健康检查"""
        return {
            "status": "healthy",
            "worker_id": self.worker_id,
            "type": "policy",
            "model_loaded": self.model is not None,
        }


# 创建 Policy-Worker 实例（用于测试）
if __name__ == "__main__":
    import asyncio
    
    async def test():
        # 创建 Worker
        policy_worker = PolicyWorker.remote(worker_id="test-policy-1")
        
        # 测试请求 1: 正常请求
        test_state_1 = {
            "user_request": "Plan a trip to Iceland",
            "origin": "Reykjavik",
            "destination": "Akureyri",
            "constraints": {
                "budget": 5000,
                "duration": 7
            },
            "preferences": {
                "pace": "moderate"
            }
        }
        
        result1 = await policy_worker.predict.remote(test_state_1)
        print(f"测试 1 (正常请求): {result1}")
        
        # 测试请求 2: 缺少信息
        test_state_2 = {
            "user_request": "Plan a trip",
            "origin": None,
            "destination": None,
        }
        
        result2 = await policy_worker.predict.remote(test_state_2)
        print(f"测试 2 (缺少信息): {result2}")
        
        # 测试请求 3: 高风险目的地
        test_state_3 = {
            "user_request": "Plan a trip to Antarctica",
            "origin": "Reykjavik",
            "destination": "Antarctica",
            "constraints": {"budget": 10000}
        }
        
        result3 = await policy_worker.predict.remote(test_state_3)
        print(f"测试 3 (高风险目的地): {result3}")
        
        # 健康检查
        health = await policy_worker.health_check.remote()
        print(f"健康状态: {health}")
    
    asyncio.run(test())
