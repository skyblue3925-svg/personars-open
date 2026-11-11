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

PERSONA_TYPES = [
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
    parser = argparse.ArgumentParser(description="Build static Nemotron persona search shards from JSONL or Parquet.")
    parser.add_argument("--input-jsonl", help="Fixture JSONL input path.")
    parser.add_argument("--parquet-root", help="Directory containing Nemotron parquet files.")
    parser.add_argument("--output-dir", required=True, help="Output directory containing manifest.json and shards/*.json.")
    parser.add_argument("--partial", action="store_true", help="Force partial metadata.")
    parser.add_argument("--batch-size", type=int, default=4096, help="Parquet batch size.")
    parser.add_argument("--max-records", type=int, default=0, help="Optional source record limit for smoke tests.")
    parser.add_argument("--max-open-shards", type=int, default=128, help="Maximum open shard staging files.")
    args = parser.parse_args()

    if not args.input_jsonl and not args.parquet_root:
        parser.error("Provide --input-jsonl or --parquet-root.")

    output_dir = Path(args.output_dir)
    shard_dir = output_dir / "shards"
    shard_dir.mkdir(parents=True, exist_ok=True)

    writer_cache = ShardWriterCache(shard_dir, args.max_open_shards)
    shard_keys: set[str] = set()
    source_record_count = 0
    expanded_persona_count = 0

    try:
        for record in iter_records(args):
            source_record_count += 1
            for persona_type in PERSONA_TYPES:
                expanded_persona_count += 1
                persona = to_persona_seed(record, persona_type)
                key = shard_key(persona)
                shard_keys.add(key)
                writer_cache.write(key, json.dumps(persona, ensure_ascii=False, separators=(",", ":")))
            if args.max_records and source_record_count >= args.max_records:
                break
    finally:
        writer_cache.close()

    is_complete = (
        not args.partial
        and not args.max_records
        and source_record_count == EXPECTED_RECORDS
        and expanded_persona_count == EXPECTED_PERSONAS
    )
    manifest = {
        "source": "nemotron",
        "sourceRecordCount": source_record_count,
        "expandedPersonaCount": expanded_persona_count,
        "isComplete": is_complete,
        "generatedAt": now_iso(),
        "shardStrategy": "personaType/province/ageGroup/sex",
        "shards": sorted(shard_keys),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Source records scanned: {source_record_count:,}")
    print(f"Persona descriptions expanded: {expanded_persona_count:,}")
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


class ShardWriterCache:
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
            # Reopen an existing JSON array by replacing the previous closing bracket.
            handle.close()
            with path.open("rb+") as binary:
                binary.seek(0, 2)
                size = binary.tell()
                trim = 3 if size >= 3 else 0
                binary.truncate(size - trim)
            handle = path.open("a", encoding="utf-8")
        self.handles[key] = handle
        return handle


def to_persona_seed(record: dict[str, Any], persona_type: str) -> dict[str, Any]:
    province = clean(record.get("province")) or "지역 미상"
    district = clean(record.get("district"))
    region = f"{province} {district}" if district else province
    occupation = clean(record.get("occupation")) or "직업 미상"
    age = int(record.get("age") or 0)
    age_group = f"{(age // 10) * 10}대" if age else "연령 미상"
    text = clean(record.get(persona_type))
    source_uuid = clean(record.get("uuid"))

    return {
        "id": f"nemotron-{source_uuid}-{persona_type}",
        "label": f"{region} {age_group} {occupation}",
        "ageGroup": age_group,
        "region": region,
        "occupation": occupation,
        "background": text,
        "perspective": clean(record.get("cultural_background")) or text,
        "voice": f"{occupation}의 생활 경험을 바탕으로 조심스럽게 설명하는 말투",
        "livedExperiences": compact([prefix("경험과 전문성", record.get("skills_and_expertise"))]),
        "concerns": compact(
            [
                clean(record.get("career_goals_and_ambitions")),
                prefix("가족 형태", record.get("family_type")),
            ]
        ),
        "tensions": compact(
            [
                prefix("교육 수준", record.get("education_level")),
                prefix("주거 조건", record.get("housing_type")),
            ]
        ),
        "source": {
            "kind": "nemotron",
            "sourceUuid": source_uuid,
            "personaType": persona_type,
            "sex": normalize_sex(clean(record.get("sex"))),
            "age": age,
            "province": province,
            "district": district,
            "occupation": occupation,
            "educationLevel": clean(record.get("education_level")),
            "familyType": clean(record.get("family_type")),
            "housingType": clean(record.get("housing_type")),
            "maritalStatus": clean(record.get("marital_status")),
            "isCompleteIndex": False,
        },
    }


def shard_key(persona: dict[str, Any]) -> str:
    source = persona["source"]
    return "|".join(
        [
            source.get("personaType") or "unknown",
            source.get("province") or "unknown",
            persona.get("ageGroup") or "unknown",
            source.get("sex") or "unknown",
        ]
    )


def clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def prefix(label: str, value: Any) -> str:
    text = clean(value)
    return f"{label}: {text}" if text else ""


def compact(values: list[str]) -> list[str]:
    return [value for value in values if value]


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
