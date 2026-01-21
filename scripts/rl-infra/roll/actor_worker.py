"""
Actor-Worker: 轨迹生成 Worker

职责:
- 接收 TypeScript 请求
- 生成轨迹数据 (s, a, r, s')
- 存储到 Ray Object Store
"""
import ray
import logging
from typing import Dict, Any, Optional
from config import RAY_ADDRESS, RAY_NAMESPACE, LOG_LEVEL

logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger(__name__)

# 初始化 Ray
try:
    ray.init(address=RAY_ADDRESS, namespace=RAY_NAMESPACE, ignore_reinit_error=True)
except Exception as e:
    logger.warning(f"Ray 初始化失败，使用本地模式: {e}")
    ray.init(ignore_reinit_error=True)


@ray.remote
class ActorWorker:
    """
    Actor-Worker: 生成轨迹数据
    """
    
    def __init__(self, worker_id: str = "default"):
        self.worker_id = worker_id
        logger.info(f"[ActorWorker-{worker_id}] 初始化完成")
    
    def generate_trajectory(
        self,
        request: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        生成轨迹数据
        
        Args:
            request: 包含用户请求、状态等信息
            
        Returns:
            轨迹数据，包含 (s, a, r, s') 序列
        """
        logger.info(f"[ActorWorker-{self.worker_id}] 收到轨迹生成请求: {request.get('request_id')}")
        
        try:
            # 提取请求信息
            request_id = request.get("request_id", "unknown")
            user_request = request.get("user_request", "")
            state = request.get("state", {})
            action = request.get("action", "")
            params = request.get("params", {})
            
            # 生成轨迹步骤
            steps = []
            
            # Step 1: 初始状态
            initial_state = {
                "user_request": user_request,
                "state": state,
                "timestamp": request.get("timestamp")
            }
            
            # Step 2: 动作执行
            action_result = {
                "action": action,
                "params": params,
                "timestamp": request.get("timestamp")
            }
            
            # Step 3: 奖励（临时设为0，由 Reward-Worker 计算）
            reward = 0.0
            
            # Step 4: 下一状态
            next_state = {
                **state,
                "action_executed": action,
                "params_applied": params
            }
            
            # 构建轨迹
            trajectory = {
                "request_id": request_id,
                "trajectory_id": f"traj_{request_id}_{self.worker_id}",
                "steps": [
                    {
                        "step": 0,
                        "state": initial_state,
                        "action": action_result,
                        "reward": reward,
                        "next_state": next_state
                    }
                ],
                "metadata": {
                    "worker_id": self.worker_id,
                    "generated_at": request.get("timestamp")
                }
            }
            
            # 存储到 Ray Object Store
            trajectory_ref = ray.put(trajectory)
            
            logger.info(f"[ActorWorker-{self.worker_id}] 轨迹生成完成: {trajectory['trajectory_id']}")
            
            return {
                "success": True,
                "trajectory_id": trajectory["trajectory_id"],
                "trajectory_ref": trajectory_ref,  # Ray ObjectRef
                "trajectory": trajectory  # 也返回完整数据（用于调试）
            }
            
        except Exception as e:
            logger.error(f"[ActorWorker-{self.worker_id}] 轨迹生成失败: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    def health_check(self) -> Dict[str, Any]:
        """健康检查"""
        return {
            "status": "healthy",
            "worker_id": self.worker_id,
            "type": "actor"
        }


# 创建 Actor-Worker 实例（用于测试）
if __name__ == "__main__":
    import asyncio
    
    async def test():
        # 创建 Worker
        actor = ActorWorker.remote(worker_id="test-actor-1")
        
        # 测试请求
        test_request = {
            "request_id": "test-001",
            "user_request": "Plan a trip to Iceland",
            "state": {
                "origin": "Reykjavik",
                "destination": "Akureyri"
            },
            "action": "generate_itinerary",
            "params": {
                "duration": 7,
                "budget": 5000
            },
            "timestamp": "2026-01-21T10:00:00Z"
        }
        
        # 生成轨迹
        result = await actor.generate_trajectory.remote(test_request)
        print(f"结果: {result}")
        
        # 健康检查
        health = await actor.health_check.remote()
        print(f"健康状态: {health}")
    
    asyncio.run(test())
