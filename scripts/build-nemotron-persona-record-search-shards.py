from __future__ import annotations

import argparse
import json
import sys
from collections import OrderedDict
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote

LOCAL_PYDEPS = Path("C:/tmp/persona_pydeps")
if LOCAL_PYDEPS.exists():
    sys.path.insert(0, str(LOCAL_PYDEPS))

PERSONA_FIELDS = [
    "professional_persona",
    "sports_persona",
    "arts_persona",
    "travel_persona",
    "culinary_persona",
    "family_persona",
    "persona",
]
EXPECTED_RECORDS = 1_000_000
EXPECTED_PERSONAS = 7_000_000


def main() -> None:
    parser = argparse.ArgumentParser(description="Build compact source-row Nemotron search shards.")
    parser.add_argument("--input-jsonl", help="Fixture JSONL input path.")
    parser.add_argument("--parquet-root", help="Directory containing Nemotron parquet files.")
    parser.add_argument("--output-dir", required=True, help="Output directory containing manifest.json and shards/*.json.")
    parser.add_argument("--partial", action="store_true", help="Force partial metadata.")
    parser.add_argument("--batch-size", type=int, default=4096, help="Parquet batch size.")
    parser.add_argument("--max-records", type=int, default=0, help="Optional source record limit for smoke tests.")
    parser.add_argument("--max-open-shards", type=int, default=4096, help="Maximum open shard files.")
    args = parser.parse_args()

    if not args.input_jsonl and not args.parquet_root:
        parser.error("Provide --input-jsonl or --parquet-root.")

    output_dir = Path(args.output_dir)
    shard_dir = output_dir / "shards"
    shard_dir.mkdir(parents=True, exist_ok=True)

    writer_cache = JsonArrayShardWriter(shard_dir, args.max_open_shards)
    shard_keys: set[str] = set()
    source_record_count = 0

    try:
        for record in iter_records(args):
            source_record_count += 1
            compact = compact_record(record)
            key = shard_key(compact)
            shard_keys.add(key)
            writer_cache.write(key, json.dumps(compact, ensure_ascii=False, separators=(",", ":")))
            if args.max_records and source_record_count >= args.max_records:
                break
    finally:
        writer_cache.close()

    expanded_persona_count = source_record_count * len(PERSONA_FIELDS)
    is_complete = not args.partial and not args.max_records and source_record_count == EXPECTED_RECORDS and expanded_persona_count == EXPECTED_PERSONAS
    manifest = {
        "source": "nemotron",
        "sourceRecordCount": source_record_count,
        "expandedPersonaCount": expanded_persona_count,
        "isComplete": is_complete,
        "generatedAt": now_iso(),
        "shardStrategy": "province/district/ageGroup/sex source rows",
        "shards": sorted(shard_keys),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Source records scanned: {source_record_count:,}")
    print(f"Persona descriptions represented: {expanded_persona_count:,}")
    print(f"Shard count: {len(shard_keys):,}")
    print(f"Index status: {'complete' if is_complete else 'partial'}")
    print(f"Wrote: {output_dir}")


def iter_records(args: argparse.Namespace) -> Iterable[dict[str, Any]]:
    if args.input_jsonl:
        with Path(args.input_jsonl).open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    yield json.loads(line)
        return

    import pyarrow.parquet as pq

    parquet_paths = sorted(Path(args.parquet_root).rglob("*.parquet"))
    if not parquet_paths:
        raise RuntimeError(f"No parquet files found under {args.parquet_root}")
    for file_index, parquet_path in enumerate(parquet_paths, start=1):
        parquet_file = pq.ParquetFile(parquet_path)
        for batch in parquet_file.iter_batches(batch_size=args.batch_size):
            for record in batch.to_pylist():
                yield record
        print(f"Scanned parquet {file_index}/{len(parquet_paths)}: {parquet_path.name}", flush=True)


class JsonArrayShardWriter:
    def __init__(self, shard_dir: Path, max_open: int) -> None:
        self.shard_dir = shard_dir
        self.max_open = max_open
        self.handles: OrderedDict[str, Any] = OrderedDict()
        self.started_keys: set[str] = set()

    def write(self, key: str, line: str) -> None:
        handle = self._handle(key)
        if key in self.started_keys:
            handle.write(",\n")
        else:
            self.started_keys.add(key)
        handle.write(line)

    def close(self) -> None:
        for handle in self.handles.values():
            handle.write("\n]\n")
            handle.close()
        self.handles.clear()

    def _handle(self, key: str) -> Any:
        if key in self.handles:
            self.handles.move_to_end(key)
            return self.handles[key]
        if len(self.handles) >= self.max_open:
            _, old_handle = self.handles.popitem(last=False)
            old_handle.write("\n]\n")
            old_handle.close()
        path = self.shard_dir / f"{quote(key, safe='')}.json"
        is_new = key not in self.started_keys
        handle = path.open("a", encoding="utf-8")
        if is_new:
            handle.write("[\n")
        else:
            handle.close()
            with path.open("rb+") as binary:
                binary.seek(0, 2)
                size = binary.tell()
                binary.truncate(max(0, size - 3))
            handle = path.open("a", encoding="utf-8")
        self.handles[key] = handle
        return handle


def compact_record(record: dict[str, Any]) -> dict[str, Any]:
    row = {field: clean(record.get(field)) for field in PERSONA_FIELDS}
    row.update(
        {
            "uuid": clean(record.get("uuid")),
            "cultural_background": clean(record.get("cultural_background")),
            "skills_and_expertise": clean(record.get("skills_and_expertise")),
            "career_goals_and_ambitions": clean(record.get("career_goals_and_ambitions")),
            "hobbies_and_interests": clean(record.get("hobbies_and_interests")),
            "sex": normalize_sex(clean(record.get("sex"))),
            "age": int(record.get("age") or 0),
            "marital_status": clean(record.get("marital_status")),
            "family_type": clean(record.get("family_type")),
            "housing_type": clean(record.get("housing_type")),
            "education_level": clean(record.get("education_level")),
            "occupation": clean(record.get("occupation")) or "직업 미상",
            "district": clean(record.get("district")),
            "province": clean(record.get("province")) or "지역 미상",
        }
    )
    return row


def shard_key(row: dict[str, Any]) -> str:
    return "|".join(
        [
            row.get("province") or "unknown",
            row.get("district") or "unknown",
            age_group(row.get("age")),
            row.get("sex") or "unknown",
        ]
    )


def age_group(age: Any) -> str:
    numeric = int(age or 0)
    return f"{(numeric // 10) * 10}대" if numeric else "연령 미상"


def clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_sex(value: str) -> str:
    if value == "여자":
        return "여성"
    if value == "남자":
        return "남성"
    return value


def now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    main()
