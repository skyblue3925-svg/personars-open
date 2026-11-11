from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download, list_repo_files


REPO_ID = "nvidia/Nemotron-Personas-Korea"
REVISION = "refs/convert/parquet"
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
    parser = argparse.ArgumentParser(description="Build a compact app candidate packet from Nemotron-Personas-Korea.")
    parser.add_argument("--output", required=True, help="Output JSON packet path.")
    parser.add_argument("--cache-dir", default="C:/tmp/nemotron-personas-korea", help="Download/cache directory.")
    parser.add_argument("--max-per-stratum", type=int, default=3, help="Reservoir size per persona_type/province/age_band/sex stratum.")
    parser.add_argument("--batch-size", type=int, default=4096, help="Parquet record batch size.")
    parser.add_argument("--seed", type=int, default=20260429, help="Reservoir sampling seed.")
    args = parser.parse_args()

    random.seed(args.seed)
    parquet_files = download_parquet_files(Path(args.cache_dir))
    reservoir: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    seen_by_stratum: dict[tuple[str, str, str, str], int] = defaultdict(int)
    source_record_count = 0
    expanded_persona_count = 0

    for file_index, parquet_path in enumerate(parquet_files, start=1):
        parquet_file = pq.ParquetFile(parquet_path)
        for batch in parquet_file.iter_batches(batch_size=args.batch_size):
            rows = batch.to_pylist()
            source_record_count += len(rows)
            for record in rows:
                for persona_type in PERSONA_TYPES:
                    expanded_persona_count += 1
                    persona = to_persona_seed(record, persona_type)
                    key = stratum_key(persona)
                    seen_by_stratum[key] += 1
                    bucket = reservoir[key]
                    if len(bucket) < args.max_per_stratum:
                        bucket.append(persona)
                    else:
                        replacement_index = random.randrange(seen_by_stratum[key])
                        if replacement_index < args.max_per_stratum:
                            bucket[replacement_index] = persona
        print(f"Scanned {file_index}/{len(parquet_files)}: {parquet_path.name}")

    personas = [persona for key in sorted(reservoir) for persona in reservoir[key]]
    is_complete = source_record_count == EXPECTED_RECORDS and expanded_persona_count == EXPECTED_PERSONAS
    for persona in personas:
        persona["source"]["isCompleteIndex"] = is_complete
        persona["source"]["sourceRecordCount"] = source_record_count
        persona["source"]["expandedPersonaCount"] = expanded_persona_count
    packet = {
        "metadata": {
            "source": "nemotron",
            "sourceRecordCount": source_record_count,
            "expandedPersonaCount": expanded_persona_count,
            "isComplete": is_complete,
            "label": "Nemotron 전체 색인" if is_complete else "Nemotron 부분 색인",
            "candidateStrategy": "stratified reservoir by persona type, province, age band, and sex",
            "candidateCount": len(personas),
        },
        "personas": personas,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(packet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Source records scanned: {source_record_count:,}")
    print(f"Persona descriptions expanded: {expanded_persona_count:,}")
    print(f"Candidate packet size: {len(personas):,}")
    print(f"Index status: {'complete' if is_complete else 'partial'}")
    print(f"Wrote: {output_path}")


def download_parquet_files(cache_dir: Path) -> list[Path]:
    files = [
        path
        for path in list_repo_files(REPO_ID, repo_type="dataset", revision=REVISION)
        if path.startswith("default/train/") and path.endswith(".parquet")
    ]
    if not files:
        raise RuntimeError("No parquet files found for Nemotron-Personas-Korea.")
    downloaded = []
    for path in sorted(files):
        local_path = hf_hub_download(
            repo_id=REPO_ID,
            repo_type="dataset",
            revision=REVISION,
            filename=path,
            cache_dir=str(cache_dir),
        )
        downloaded.append(Path(local_path))
    return downloaded


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
        "livedExperiences": compact([
            text,
            prefix("경험과 전문성", record.get("skills_and_expertise")),
            prefix("관심사", record.get("hobbies_and_interests")),
        ]),
        "concerns": compact([
            clean(record.get("career_goals_and_ambitions")),
            prefix("가족 형태", record.get("family_type")),
        ]),
        "tensions": compact([
            prefix("교육 수준", record.get("education_level")),
            prefix("주거 조건", record.get("housing_type")),
        ]),
        "source": {
            "kind": "nemotron",
            "sourceUuid": source_uuid,
            "personaType": persona_type,
            "sex": clean(record.get("sex")),
            "age": age,
            "province": province,
            "district": district,
            "occupation": occupation,
            "educationLevel": clean(record.get("education_level")),
            "familyType": clean(record.get("family_type")),
            "housingType": clean(record.get("housing_type")),
            "maritalStatus": clean(record.get("marital_status")),
            "isCompleteIndex": False,
            "sourceRecordCount": None,
            "expandedPersonaCount": None,
        },
    }


def stratum_key(persona: dict[str, Any]) -> tuple[str, str, str, str]:
    source = persona["source"]
    return (
        source.get("personaType") or "unknown",
        source.get("province") or "unknown",
        persona.get("ageGroup") or "unknown",
        source.get("sex") or "unknown",
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


if __name__ == "__main__":
    main()
