"""Validate this execution-plan bundle only. Does NOT run or certify AgentRouter."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent
original = json.loads((root / "acceptance/original-T001-T081.json").read_text(encoding="utf-8"))
additional = json.loads((root / "acceptance/J3-additional.json").read_text(encoding="utf-8"))
assert [r["test_id"] for r in original["tests"]] == [f"T{i:03d}" for i in range(1, 82)]
assert len({r["test_id"] for r in additional["tests"]}) == 52
for group in (original, additional):
    assert group["artifact_type"] == "PLAN_NOT_TEST_RESULT"
    assert all(r["status"] == "NOT_RUN" for r in group["tests"])
for file in root.rglob("*.json"):
    json.loads(file.read_text(encoding="utf-8"))
manifest = root / "MANIFEST.sha256"
assert manifest.is_file(), "Missing manifest"
for line in manifest.read_text(encoding="utf-8").splitlines():
    digest, name = line.split("  ", 1)
    file = (root / name).resolve()
    assert root in file.parents, "Manifest path escapes bundle"
    assert file.is_file(), f"Missing file: {name}"
    assert hashlib.sha256(file.read_bytes()).hexdigest() == digest, f"Hash mismatch: {name}"
print("Execution-plan bundle integrity: PASS")
print("Original tests: 81; additional tests: 52; product tests executed here: 0")
print("This validates plan files, not product readiness, account access, or V1.0 certification.")
