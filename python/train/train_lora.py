#!/usr/bin/env python3
"""
TripNARA LoRA 微调训练脚本

支持功能：
- LoRA/QLoRA 微调
- LLaMA-Factory 集成
- MLflow 实验跟踪
- 分布式训练 (DeepSpeed/FSDP)

使用方法：
    python train_lora.py --config config/tripnara_decision.yaml
    python train_lora.py --config config/tripnara_decision.yaml --resume_from_checkpoint latest
"""

import os
import sys
import json
import yaml
import logging
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

import torch
import mlflow
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForSeq2Seq,
    BitsAndBytesConfig,
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training,
    TaskType,
)
from datasets import load_dataset, Dataset

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TripNARATrainer:
    """TripNARA LoRA 微调训练器"""
    
    def __init__(self, config_path: str):
        """初始化训练器
        
        Args:
            config_path: 配置文件路径
        """
        self.config = self._load_config(config_path)
        self.model = None
        self.tokenizer = None
        self.train_dataset = None
        self.eval_dataset = None
        
        # 设置 MLflow
        if self.config.get('report_to') == 'mlflow':
            mlflow_uri = os.environ.get('MLFLOW_TRACKING_URI', 'http://localhost:5000')
            mlflow.set_tracking_uri(mlflow_uri)
            mlflow.set_experiment('tripnara-lora-finetune')
    
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """加载配置文件"""
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        # 处理继承
        if '_base_' in config:
            base_path = Path(config_path).parent / config['_base_']
            with open(base_path, 'r') as f:
                base_config = yaml.safe_load(f)
            base_config.update(config)
            config = base_config
            del config['_base_']
        
        return config
    
    def setup_model(self):
        """设置模型和 tokenizer"""
        logger.info(f"Loading model: {self.config['model_name_or_path']}")
        
        # 量化配置 (QLoRA)
        bnb_config = None
        if self.config.get('quantization_bit') == 4:
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
            )
        
        # 加载模型
        model_kwargs = {
            "trust_remote_code": self.config.get('trust_remote_code', True),
            "torch_dtype": torch.bfloat16 if self.config.get('bf16') else torch.float16,
        }
        
        if bnb_config:
            model_kwargs["quantization_config"] = bnb_config
        
        # 检查是否使用 Flash Attention
        if self.config.get('flash_attn'):
            model_kwargs["attn_implementation"] = "flash_attention_2"
        
        self.model = AutoModelForCausalLM.from_pretrained(
            self.config['model_name_or_path'],
            **model_kwargs
        )
        
        # 加载 tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.config['model_name_or_path'],
            trust_remote_code=True,
            padding_side="right",
        )
        
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        
        # 准备 4-bit 训练
        if bnb_config:
            self.model = prepare_model_for_kbit_training(
                self.model,
                use_gradient_checkpointing=True,
            )
        
        # 配置 LoRA
        lora_config = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            r=self.config.get('lora_rank', 64),
            lora_alpha=self.config.get('lora_alpha', 128),
            lora_dropout=self.config.get('lora_dropout', 0.05),
            target_modules=self._get_target_modules(),
            bias="none",
        )
        
        self.model = get_peft_model(self.model, lora_config)
        self.model.print_trainable_parameters()
        
        logger.info("Model setup complete")
    
    def _get_target_modules(self) -> list:
        """获取 LoRA 目标模块"""
        target = self.config.get('lora_target', 'all')
        
        if target == 'all':
            return [
                "q_proj", "k_proj", "v_proj", "o_proj",
                "gate_proj", "up_proj", "down_proj"
            ]
        else:
            return target.split(',')
    
    def load_dataset(self):
        """加载训练数据集"""
        dataset_dir = Path(self.config.get('dataset_dir', '/app/data'))
        dataset_name = self.config.get('dataset', 'tripnara_decision')
        
        # 支持多种数据格式
        sft_override = self.config.get('sft_jsonl_path') or self.config.get('sft_dataset_path')
        train_file = Path(sft_override) if sft_override else dataset_dir / f"{dataset_name}_train.jsonl"
        eval_file = dataset_dir / f"{dataset_name}_eval.jsonl"
        
        if train_file.exists():
            logger.info(f"Loading dataset from {train_file}")
            self.train_dataset = self._load_jsonl_dataset(train_file)
        else:
            logger.warning(f"Train file not found: {train_file}")
            # 使用示例数据
            self.train_dataset = self._create_demo_dataset()
        
        if eval_file.exists():
            self.eval_dataset = self._load_jsonl_dataset(eval_file)
        else:
            # 从训练集划分
            if len(self.train_dataset) > 100:
                split = self.train_dataset.train_test_split(test_size=0.1)
                self.train_dataset = split['train']
                self.eval_dataset = split['test']
        
        logger.info(f"Train samples: {len(self.train_dataset)}")
        if self.eval_dataset:
            logger.info(f"Eval samples: {len(self.eval_dataset)}")
    
    def _load_jsonl_dataset(self, file_path: Path) -> Dataset:
        """加载 JSONL 格式数据集"""
        data = []
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                item = json.loads(line.strip())
                # 转换为对话格式
                processed = self._process_item(item)
                if processed:
                    data.append(processed)
        
        return Dataset.from_list(data)
    
    def _process_item(self, item: Dict) -> Optional[Dict]:
        """处理单条数据
        
        支持格式:
        1. ShareGPT: {"conversations": [{"from": "human", "value": "..."}, ...]}
        2. Alpaca: {"instruction": "...", "input": "...", "output": "..."}
        3. TripNARA: {"request": {...}, "response": {...}, "decision_trace": {...}}
        """
        try:
            # ShareGPT 格式
            if 'conversations' in item:
                return self._format_sharegpt(item)
            
            # Alpaca 格式
            elif 'instruction' in item:
                return self._format_alpaca(item)
            
            # TripNARA 轨迹格式
            elif 'request' in item and 'response' in item:
                return self._format_tripnara(item)
            
            else:
                logger.warning(f"Unknown data format: {list(item.keys())}")
                return None
                
        except Exception as e:
            logger.warning(f"Failed to process item: {e}")
            return None
    
    def _format_sharegpt(self, item: Dict) -> Dict:
        """格式化 ShareGPT 数据"""
        messages = []
        for conv in item['conversations']:
            role = 'user' if conv['from'] == 'human' else 'assistant'
            messages.append({
                'role': role,
                'content': conv['value']
            })
        
        # 转换为模型输入
        text = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False
        )
        
        return {'text': text}
    
    def _format_alpaca(self, item: Dict) -> Dict:
        """格式化 Alpaca 数据"""
        instruction = item['instruction']
        input_text = item.get('input', '')
        output = item['output']
        
        if input_text:
            user_content = f"{instruction}\n\n{input_text}"
        else:
            user_content = instruction
        
        messages = [
            {'role': 'user', 'content': user_content},
            {'role': 'assistant', 'content': output}
        ]
        
        text = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False
        )
        
        return {'text': text}
    
    def _format_tripnara(self, item: Dict) -> Dict:
        """格式化 TripNARA 轨迹数据"""
        request = item['request']
        response = item['response']
        decision_trace = item.get('decision_trace', {})
        
        # 构建系统提示
        system_prompt = """你是 TripNARA，一个专业的旅行决策助手。你的任务是：
1. 理解用户的旅行需求
2. 识别硬性约束（不可违反）和软性偏好（可权衡）
3. 生成多个方案（Plan A/B/C），每个方案带风险概率
4. 提供清晰的决策理由

请使用三人格策略思考：
- Abu：安全检查，识别风险红线
- Dr.Dre：节奏评估，权衡取舍
- Neptune：空间修复，保持路线哲学"""
        
        # 构建用户请求
        user_content = f"请帮我规划行程：\n"
        if 'origin' in request:
            user_content += f"出发地：{request['origin']}\n"
        if 'destination' in request:
            user_content += f"目的地：{request['destination']}\n"
        if 'start_date' in request:
            user_content += f"出发日期：{request['start_date']}\n"
        if 'days' in request:
            user_content += f"天数：{request['days']}天\n"
        if 'constraints' in request:
            user_content += f"约束条件：{json.dumps(request['constraints'], ensure_ascii=False)}\n"
        if 'preferences' in request:
            user_content += f"偏好：{json.dumps(request['preferences'], ensure_ascii=False)}\n"
        
        # 构建助手回复
        assistant_content = ""
        
        # 添加决策过程
        if decision_trace:
            assistant_content += "## 决策过程\n\n"
            if 'gate_result' in decision_trace:
                assistant_content += f"### Gate 评估\n{json.dumps(decision_trace['gate_result'], ensure_ascii=False, indent=2)}\n\n"
        
        # 添加行程方案
        if 'plan' in response:
            assistant_content += "## 行程方案\n\n"
            assistant_content += json.dumps(response['plan'], ensure_ascii=False, indent=2)
            assistant_content += "\n\n"
        
        # 添加解释
        if 'explanation' in response:
            assistant_content += f"## 决策说明\n\n{response['explanation']}\n"
        
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_content},
            {'role': 'assistant', 'content': assistant_content}
        ]
        
        text = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False
        )
        
        return {'text': text}
    
    def _create_demo_dataset(self) -> Dataset:
        """创建演示数据集"""
        logger.warning("Creating demo dataset for testing")
        
        demo_data = [
            {
                "conversations": [
                    {
                        "from": "human",
                        "value": "我想去冰岛自驾7天，预算2万人民币，有什么建议？"
                    },
                    {
                        "from": "gpt",
                        "value": """## 决策分析

### Abu 安全检查
- ✅ 7天行程合理，不会过于疲劳
- ⚠️ 需要检查季节性封路情况
- ✅ 预算范围可行

### Dr.Dre 节奏评估
建议三个方案：

**Plan A: 环岛精华版（风险 25%）**
- 优势：体验完整，覆盖南北
- 风险：高地可能封路，需4WD

**Plan B: 南部深度版（风险 10%）**
- 优势：路况好，景点密集
- 风险：较低

**Plan C: 西峡湾探险版（风险 35%）**
- 优势：人少景美
- 风险：路况复杂，轮渡依赖

### 推荐
考虑到预算和安全，推荐 **Plan B 南部深度版**。"""
                    }
                ]
            }
        ]
        
        # 处理演示数据
        processed = []
        for item in demo_data:
            p = self._process_item(item)
            if p:
                processed.append(p)
        
        return Dataset.from_list(processed * 10)  # 复制10份用于测试
    
    def tokenize_dataset(self):
        """Tokenize 数据集"""
        cutoff_len = self.config.get('cutoff_len', 4096)
        
        def tokenize_function(examples):
            tokenized = self.tokenizer(
                examples['text'],
                truncation=True,
                max_length=cutoff_len,
                padding=False,
                return_tensors=None,
            )
            tokenized['labels'] = tokenized['input_ids'].copy()
            return tokenized
        
        self.train_dataset = self.train_dataset.map(
            tokenize_function,
            batched=True,
            num_proc=self.config.get('preprocessing_num_workers', 4),
            remove_columns=['text'],
            desc="Tokenizing train dataset",
        )
        
        if self.eval_dataset:
            self.eval_dataset = self.eval_dataset.map(
                tokenize_function,
                batched=True,
                num_proc=self.config.get('preprocessing_num_workers', 4),
                remove_columns=['text'],
                desc="Tokenizing eval dataset",
            )
    
    def train(self, resume_from_checkpoint: Optional[str] = None):
        """执行训练"""
        logger.info("Starting training...")
        
        # 训练参数
        training_args = TrainingArguments(
            output_dir=self.config.get('output_dir', '/app/outputs'),
            logging_dir=self.config.get('logging_dir', '/app/logs'),
            
            # 训练配置
            num_train_epochs=self.config.get('num_train_epochs', 3),
            per_device_train_batch_size=self.config.get('per_device_train_batch_size', 2),
            gradient_accumulation_steps=self.config.get('gradient_accumulation_steps', 8),
            
            # 学习率
            learning_rate=self.config.get('learning_rate', 2e-4),
            lr_scheduler_type=self.config.get('lr_scheduler_type', 'cosine'),
            warmup_ratio=self.config.get('warmup_ratio', 0.1),
            
            # 优化
            optim="adamw_torch",
            max_grad_norm=self.config.get('max_grad_norm', 1.0),
            
            # 精度
            fp16=self.config.get('fp16', False),
            bf16=self.config.get('bf16', True),
            
            # 保存
            save_steps=self.config.get('save_steps', 100),
            save_total_limit=self.config.get('save_total_limit', 3),
            
            # 日志
            logging_steps=self.config.get('logging_steps', 10),
            report_to=self.config.get('report_to', 'mlflow'),
            
            # 评估
            eval_strategy="steps" if self.eval_dataset else "no",
            eval_steps=self.config.get('eval_steps', 50) if self.eval_dataset else None,
            per_device_eval_batch_size=self.config.get('per_device_eval_batch_size', 2),
            
            # 其他
            remove_unused_columns=False,
            dataloader_pin_memory=True,
        )
        
        # 数据收集器
        data_collator = DataCollatorForSeq2Seq(
            tokenizer=self.tokenizer,
            padding=True,
            return_tensors="pt",
        )
        
        # 创建 Trainer
        trainer = Trainer(
            model=self.model,
            args=training_args,
            train_dataset=self.train_dataset,
            eval_dataset=self.eval_dataset,
            data_collator=data_collator,
        )
        
        # 开始训练
        with mlflow.start_run(run_name=f"tripnara-lora-{datetime.now().strftime('%Y%m%d_%H%M%S')}"):
            # 记录配置
            mlflow.log_params({
                "model": self.config['model_name_or_path'],
                "lora_rank": self.config.get('lora_rank', 64),
                "lora_alpha": self.config.get('lora_alpha', 128),
                "learning_rate": self.config.get('learning_rate', 2e-4),
                "epochs": self.config.get('num_train_epochs', 3),
            })
            
            # 训练
            train_result = trainer.train(resume_from_checkpoint=resume_from_checkpoint)
            
            # 保存模型
            trainer.save_model()
            
            # 记录指标
            metrics = train_result.metrics
            trainer.log_metrics("train", metrics)
            trainer.save_metrics("train", metrics)
            
            # 评估
            if self.eval_dataset:
                eval_metrics = trainer.evaluate()
                trainer.log_metrics("eval", eval_metrics)
                trainer.save_metrics("eval", eval_metrics)
            
            logger.info(f"Training complete. Model saved to {training_args.output_dir}")

            self._export_pipeline_checkpoint(training_args.output_dir)
            
            return train_result

    def _export_pipeline_checkpoint(self, output_dir: str) -> None:
        """Pipeline 模式下固化 checkpoint-sft-final。"""
        alias = self.config.get("checkpoint_export_name")
        if not alias:
            return
        from checkpoint_utils import export_lora_checkpoint

        pipeline_root = self.config.get("pipeline_root")
        dest = (
            Path(pipeline_root) / alias
            if pipeline_root
            else Path(output_dir).parent / alias
        )
        export_lora_checkpoint(
            output_dir,
            dest,
            manifest_extra={"stage": self.config.get("stage", "sft")},
        )
        logger.info("Exported pipeline checkpoint: %s", dest)


def main():
    parser = argparse.ArgumentParser(description="TripNARA LoRA Fine-tuning")
    parser.add_argument(
        "--config",
        type=str,
        default="config/tripnara_decision.yaml",
        help="Path to config file"
    )
    parser.add_argument(
        "--resume_from_checkpoint",
        type=str,
        default=None,
        help="Resume from checkpoint (path or 'latest')"
    )
    
    args = parser.parse_args()
    
    # 创建训练器
    trainer = TripNARATrainer(args.config)
    
    # 设置模型
    trainer.setup_model()
    
    # 加载数据
    trainer.load_dataset()
    
    # Tokenize
    trainer.tokenize_dataset()
    
    # 训练
    trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)


if __name__ == "__main__":
    main()
