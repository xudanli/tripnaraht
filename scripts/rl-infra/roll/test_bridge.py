"""
测试 ROLL Bridge Service
"""
import asyncio
import httpx
import json

BRIDGE_URL = "http://localhost:8001"


async def test_health():
    """测试健康检查"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BRIDGE_URL}/health")
        print(f"Health Check: {response.status_code}")
        print(json.dumps(response.json(), indent=2))


async def test_actor_worker():
    """测试 Actor-Worker"""
    async with httpx.AsyncClient() as client:
        request = {
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
        
        response = await client.post(
            f"{BRIDGE_URL}/api/actor/generate-trajectory",
            json=request
        )
        print(f"\nActor-Worker Test: {response.status_code}")
        print(json.dumps(response.json(), indent=2))
        return response.json()


async def test_reward_worker(trajectory):
    """测试 Reward-Worker"""
    async with httpx.AsyncClient() as client:
        request = {
            "trajectory": trajectory.get("trajectory"),
            "reward_config": {}
        }
        
        response = await client.post(
            f"{BRIDGE_URL}/api/reward/compute",
            json=request
        )
        print(f"\nReward-Worker Test: {response.status_code}")
        print(json.dumps(response.json(), indent=2))


async def test_policy_worker():
    """测试 Policy-Worker"""
    async with httpx.AsyncClient() as client:
        request = {
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
        
        response = await client.post(
            f"{BRIDGE_URL}/api/policy/predict",
            json=request
        )
        print(f"\nPolicy-Worker Test: {response.status_code}")
        print(json.dumps(response.json(), indent=2))


async def test_workers_status():
    """测试 Workers 状态"""
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BRIDGE_URL}/api/workers/status")
        print(f"\nWorkers Status: {response.status_code}")
        print(json.dumps(response.json(), indent=2))


async def main():
    """运行所有测试"""
    print("=" * 60)
    print("ROLL Bridge Service 测试")
    print("=" * 60)
    
    # 健康检查
    await test_health()
    
    # Workers 状态
    await test_workers_status()
    
    # Actor-Worker
    trajectory_result = await test_actor_worker()
    
    # Reward-Worker
    if trajectory_result.get("success"):
        await test_reward_worker(trajectory_result)
    
    # Policy-Worker
    await test_policy_worker()
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
