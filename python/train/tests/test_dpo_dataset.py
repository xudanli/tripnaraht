"""DPO JSONL 解析单元测试（无需 GPU）。"""

import json
import tempfile
import unittest
from pathlib import Path

from dpo_dataset import load_dpo_preference_rows, summarize_dpo_dataset


class TestDpoDataset(unittest.TestCase):
    def _write_jsonl(self, rows):
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
        for row in rows:
            tmp.write(json.dumps(row, ensure_ascii=False) + "\n")
        tmp.close()
        return Path(tmp.name)

    def test_load_and_filter_pair_type(self):
        path = self._write_jsonl([
            {
                "prompt": "p1",
                "chosen": "c1",
                "rejected": "r1",
                "pair_type": "planner_obedience",
                "rejected_source": "true_topology",
                "trajectory_id": "t1",
                "request_id": "req1",
            },
            {
                "prompt": "p2",
                "chosen": "c2",
                "rejected": "r2",
                "pair_type": "debate_narrator",
                "trajectory_id": "t2",
                "request_id": "req2",
            },
        ])
        rows = load_dpo_preference_rows(path, pair_types=["planner_obedience"])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["pair_type"], "planner_obedience")
        self.assertEqual(rows[0]["rejected_source"], "true_topology")
        summary = summarize_dpo_dataset(rows)
        self.assertEqual(summary["by_pair_type"]["planner_obedience"], 1)

    def test_rejected_source_filter(self):
        path = self._write_jsonl([
            {
                "prompt": "p",
                "chosen": "c",
                "rejected": "r_topo",
                "pair_type": "planner_obedience",
                "rejected_source": "true_topology",
            },
            {
                "prompt": "p",
                "chosen": "c",
                "rejected": "r_sur",
                "pair_type": "planner_obedience",
                "rejected_source": "violation_surrogate",
            },
        ])
        rows = load_dpo_preference_rows(path, rejected_sources=["true_topology"])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["rejected"], "r_topo")


if __name__ == "__main__":
    unittest.main()
