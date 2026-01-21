"""
Reward-Worker: 奖励计算 Worker

职责:
- 接收轨迹数据
- 计算奖励分数
- 返回奖励结果
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
class RewardWorker:
    """
    Reward-Worker: 计算奖励分数
    """
    
    def __init__(self, worker_id: str = "default"):
        self.worker_id = worker_id
        logger.info(f"[RewardWorker-{worker_id}] 初始化完成")
    
    def compute_reward(
        self,
        trajectory_ref: Any,  # Ray ObjectRef
        reward_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        计算奖励分数
        
        Args:
            trajectory_ref: Ray ObjectRef 指向轨迹数据
            reward_config: 奖励计算配置
            
        Returns:
            奖励结果，包含分数和元数据
        """
        logger.info(f"[RewardWorker-{self.worker_id}] 收到奖励计算请求")
        
        try:
            # 从 Ray Object Store 获取轨迹数据
            if isinstance(trajectory_ref, ray.ObjectRef):
                trajectory = ray.get(trajectory_ref)
            else:
                # 如果直接传入轨迹数据（用于测试）
                trajectory = trajectory_ref
            
            trajectory_id = trajectory.get("trajectory_id", "unknown")
            steps = trajectory.get("steps", [])
            
            if not steps:
                return {
                    "success": False,
                    "error": "轨迹数据为空"
                }
            
            # 计算奖励分数
            # 这里使用简单的启发式规则，实际应该使用 LLM Judge 或 Reward Model
            total_reward = 0.0
            reward_breakdown = []
            
            for step in steps:
                # 基础奖励：动作执行成功
                base_reward = 0.1
                
                # 质量奖励：基于动作类型
                action = step.get("action", {})
                action_type = action.get("action", "")
                quality_reward = 0.0
                
                if action_type == "generate_itinerary":
                    quality_reward = 0.3
                elif action_type == "verify_plan":
                    quality_reward = 0.2
                elif action_type == "adjust_plan":
                    quality_reward = 0.15
                
                # 状态奖励：基于状态质量
                next_state = step.get("next_state", {})
                state_reward = 0.1 if next_state else 0.0
                
                step_reward = base_reward + quality_reward + state_reward
                total_reward += step_reward
                
                reward_breakdown.append({
                    "step": step.get("step", 0),
                    "base_reward": base_reward,
                    "quality_reward": quality_reward,
                    "state_reward": state_reward,
                    "total": step_reward
                })
            
            # 归一化到 [0, 1]
            normalized_reward = min(total_reward, 1.0)
            
            result = {
                "success": True,
                "trajectory_id": trajectory_id,
                "reward": normalized_reward,
                "raw_reward": total_reward,
                "reward_breakdown": reward_breakdown,
                "metadata": {
                    "worker_id": self.worker_id,
                    "num_steps": len(steps),
                    "reward_config": reward_config or {}
                }
            }
            
            logger.info(f"[RewardWorker-{self.worker_id}] 奖励计算完成: {trajectory_id}, reward={normalized_reward:.3f}")
            
            return result
            
        except Exception as e:
            logger.error(f"[RewardWorker-{self.worker_id}] 奖励计算失败: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    def health_check(self) -> Dict[str, Any]:
        """健康检查"""
        return {
            "status": "healthy",
            "worker_id": self.worker_id,
            "type": "reward"
        }


# 创建 Reward-Worker 实例（用于测试）
if __name__ == "__main__":
    import asyncio
    
    async def test():
        # 创建 Worker
        reward_worker = RewardWorker.remote(worker_id="test-reward-1")
        
        # 测试轨迹数据
        test_trajectory = {
            "trajectory_id": "test-traj-001",
            "steps": [
                {
                    "step": 0,
                    "state": {"user_request": "Plan a trip"},
                    "action": {"action": "generate_itinerary"},
                    "reward": 0.0,
                    "next_state": {"plan_generated": True}
                }
            ]
        }
        
        # 计算奖励
        result = await reward_worker.compute_reward.remote(test_trajectory)
        print(f"奖励结果: {result}")
        
        # 健康检查
        health = await reward_worker.health_check.remote()
        print(f"健康状态: {health}")
    
    asyncio.run(test())
