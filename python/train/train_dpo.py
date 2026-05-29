#!/usr/bin/env python3
"""
TripNARA DPO 微调（基于 TRL DPOTrainer + LoRA）。

读取 Nest 导出的 tripnara_dpo_preferences.jsonl（或 config 中的 dpo_jsonl_path）。

用法:
    python train_dpo.py --config config/tripnara_dpo.yaml
    TRAINING_DPO_DATASET_PATH=./data/.../dpo_preferences_x.jsonl python train_dpo.py --config ...
"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import torch
import yaml
from peft import LoraConfig, PeftModel, TaskType, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)

from dpo_dataset import load_dpo_preferences_jsonl, summarize_dpo_dataset

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class TripNARADPOTrainer:
    def __init__(self, config_path: str):
        self.config = self._load_config(config_path)
        self.model = None
        self.tokenizer = None
        self.train_dataset = None

    def _load_config(self, config_path: str) -> Dict[str, Any]:
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}

        if "_base_" in config:
            base_path = Path(config_path).parent / config["_base_"]
            with open(base_path, "r", encoding="utf-8") as f:
                base_config = yaml.safe_load(f) or {}
            base_config.update(config)
            config = base_config
            del config["_base_"]

        return config

    def _resolve_dpo_path(self) -> Path:
        env_path = os.environ.get("TRAINING_DPO_DATASET_PATH", "").strip()
        cfg_path = (
            self.config.get("dpo_jsonl_path")
            or self.config.get("dpo_dataset_path")
            or ""
        )
        dataset_dir = Path(self.config.get("dataset_dir", "/app/data"))
        default_registered = dataset_dir / "tripnara_dpo_preferences.jsonl"

        for candidate in (env_path, cfg_path, str(default_registered)):
            if candidate and Path(candidate).is_file():
                return Path(candidate).resolve()

        raise FileNotFoundError(
            "DPO dataset not found. Set TRAINING_DPO_DATASET_PATH, "
            "config dpo_jsonl_path, or register pack via /datasets/register-decision-pack",
        )

    def _resolve_sft_adapter_path(self) -> Optional[Path]:
        for key in (
            "sft_adapter_path",
            "checkpoint_sft_final",
            "model_name_or_path",
        ):
            raw = self.config.get(key)
            if raw and (Path(raw) / "adapter_config.json").is_file():
                return Path(raw).resolve()
        return None

    def setup_model(self):
        sft_adapter = self._resolve_sft_adapter_path()
        continue_sft = self.config.get("continue_sft_adapter", False)

        bnb_config = None
        if self.config.get("quantization_bit") == 4:
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
            )

        model_kwargs: Dict[str, Any] = {
            "trust_remote_code": self.config.get("trust_remote_code", True),
            "torch_dtype": torch.bfloat16 if self.config.get("bf16") else torch.float16,
        }
        if bnb_config:
            model_kwargs["quantization_config"] = bnb_config
        if self.config.get("flash_attn"):
            model_kwargs["attn_implementation"] = "flash_attention_2"

        if sft_adapter and (continue_sft or self.config.get("stage") == "dpo"):
            from checkpoint_utils import read_adapter_base_model

            base_name = (
                self.config.get("base_model_name_or_path")
                or read_adapter_base_model(sft_adapter)
            )
            logger.info(
                "DPO on SFT adapter: base=%s adapter=%s",
                base_name,
                sft_adapter,
            )
            base_model = AutoModelForCausalLM.from_pretrained(base_name, **model_kwargs)
            if bnb_config:
                base_model = prepare_model_for_kbit_training(
                    base_model, use_gradient_checkpointing=True,
                )
            self.model = PeftModel.from_pretrained(
                base_model,
                str(sft_adapter),
                is_trainable=True,
            )
            self.tokenizer = AutoTokenizer.from_pretrained(
                base_name,
                trust_remote_code=True,
                padding_side="left",
            )
        else:
            logger.info("Loading model: %s", self.config["model_name_or_path"])
            self.model = AutoModelForCausalLM.from_pretrained(
                self.config["model_name_or_path"],
                **model_kwargs,
            )
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.config["model_name_or_path"],
                trust_remote_code=True,
                padding_side="left",
            )
            if bnb_config:
                self.model = prepare_model_for_kbit_training(
                    self.model, use_gradient_checkpointing=True,
                )

            target = self.config.get("lora_target", "all")
            if target == "all":
                target_modules = [
                    "q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj",
                ]
            else:
                target_modules = target.split(",")

            lora_config = LoraConfig(
                task_type=TaskType.CAUSAL_LM,
                r=self.config.get("lora_rank", 64),
                lora_alpha=self.config.get("lora_alpha", 128),
                lora_dropout=self.config.get("lora_dropout", 0.05),
                target_modules=target_modules,
                bias="none",
            )
            self.model = get_peft_model(self.model, lora_config)

        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.model.print_trainable_parameters()

    def load_dataset(self):
        dpo_path = self._resolve_dpo_path()
        logger.info("Loading DPO preferences from %s", dpo_path)

        pair_types = self.config.get("dpo_pair_types")
        rejected_sources = self.config.get("dpo_rejected_sources")
        max_samples = self.config.get("dpo_max_samples")

        self.train_dataset = load_dpo_preferences_jsonl(
            dpo_path,
            pair_types=pair_types,
            rejected_sources=rejected_sources,
            max_samples=max_samples,
        )
        summary = summarize_dpo_dataset(self.train_dataset)
        logger.info("DPO dataset summary: %s", summary)
        self._dataset_summary = summary

    def train(self, resume_from_checkpoint: Optional[str] = None):
        try:
            from trl import DPOConfig, DPOTrainer
        except ImportError as e:
            raise ImportError(
                "trl is required for DPO training. pip install trl>=0.9.0",
            ) from e

        import mlflow

        if self.config.get("report_to") == "mlflow":
            mlflow_uri = os.environ.get("MLFLOW_TRACKING_URI", "http://localhost:5000")
            mlflow.set_tracking_uri(mlflow_uri)
            mlflow.set_experiment(
                self.config.get("mlflow_experiment", "tripnara-dpo-finetune"),
            )

        training_args = DPOConfig(
            output_dir=self.config.get("output_dir", "/app/outputs"),
            logging_dir=self.config.get("logging_dir", "/app/logs"),
            num_train_epochs=self.config.get("num_train_epochs", 2),
            per_device_train_batch_size=self.config.get(
                "per_device_train_batch_size", 1,
            ),
            gradient_accumulation_steps=self.config.get(
                "gradient_accumulation_steps", 8,
            ),
            learning_rate=self.config.get("learning_rate", 5e-6),
            lr_scheduler_type=self.config.get("lr_scheduler_type", "cosine"),
            warmup_ratio=self.config.get("warmup_ratio", 0.05),
            max_grad_norm=self.config.get("max_grad_norm", 1.0),
            bf16=self.config.get("bf16", True),
            fp16=self.config.get("fp16", False),
            save_steps=self.config.get("save_steps", 100),
            save_total_limit=self.config.get("save_total_limit", 3),
            logging_steps=self.config.get("logging_steps", 10),
            report_to=self.config.get("report_to", "mlflow"),
            beta=self.config.get("dpo_beta", 0.1),
            max_length=self.config.get("cutoff_len", 4096),
            max_prompt_length=self.config.get("max_prompt_length", 2048),
            remove_unused_columns=False,
        )

        trainer = DPOTrainer(
            model=self.model,
            ref_model=None,
            args=training_args,
            train_dataset=self.train_dataset,
            processing_class=self.tokenizer,
        )

        with mlflow.start_run(
            run_name=f"tripnara-dpo-{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        ):
            mlflow.log_params({
                "model": self.config["model_name_or_path"],
                "lora_rank": self.config.get("lora_rank", 64),
                "dpo_beta": self.config.get("dpo_beta", 0.1),
                "dpo_samples": len(self.train_dataset),
            })
            if getattr(self, "_dataset_summary", None):
                mlflow.log_dict(self._dataset_summary, "dpo_dataset_summary.json")

            result = trainer.train(resume_from_checkpoint=resume_from_checkpoint)
            trainer.save_model()
            self._export_pipeline_checkpoint(training_args.output_dir)
            logger.info("DPO training complete: %s", result)
            return result

    def _export_pipeline_checkpoint(self, output_dir: str) -> None:
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
            manifest_extra={"stage": "dpo"},
        )
        logger.info("Exported pipeline checkpoint: %s", dest)


def main():
    parser = argparse.ArgumentParser(description="TripNARA DPO Fine-tuning")
    parser.add_argument("--config", type=str, default="config/tripnara_dpo.yaml")
    parser.add_argument("--resume_from_checkpoint", type=str, default=None)
    args = parser.parse_args()

    trainer = TripNARADPOTrainer(args.config)
    trainer.setup_model()
    trainer.load_dataset()
    trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)


if __name__ == "__main__":
    main()
