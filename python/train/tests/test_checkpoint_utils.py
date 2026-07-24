"""checkpoint 导出单元测试。"""

import json
import tempfile
import unittest
from pathlib import Path

from checkpoint_utils import export_lora_checkpoint, read_adapter_base_model


class TestCheckpointUtils(unittest.TestCase):
    def test_export_and_read_base(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "sft_run"
            src.mkdir()
            adapter_cfg = {
                "base_model_name_or_path": "Qwen/Qwen2.5-7B-Instruct",
                "r": 64,
                "lora_alpha": 128,
            }
            (src / "adapter_config.json").write_text(
                json.dumps(adapter_cfg), encoding="utf-8",
            )
            (src / "adapter_model.safetensors").write_bytes(b"fake")

            dest = Path(tmp) / "checkpoint-sft-final"
            export_lora_checkpoint(src, dest, manifest_extra={"stage": "sft"})

            self.assertTrue((dest / "adapter_config.json").is_file())
            self.assertTrue((dest / "pipeline_checkpoint_manifest.json").is_file())
            base = read_adapter_base_model(dest)
            self.assertEqual(base, "Qwen/Qwen2.5-7B-Instruct")


if __name__ == "__main__":
    unittest.main()
