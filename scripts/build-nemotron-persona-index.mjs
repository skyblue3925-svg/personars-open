import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const PERSONA_TYPES = [
  'professional_persona',
  'sports_persona',
  'arts_persona',
  'travel_persona',
  'culinary_persona',
  'family_persona',
  'persona',
];

const args = parseArgs(process.argv.slice(2));

if (!args.input || !args.output) {
  console.error('Usage: node scripts/build-nemotron-persona-index.mjs --input <file.jsonl> --output <packet.json> [--partial]');
  process.exit(1);
}

const inputPath = resolve(args.input);
const outputPath = resolve(args.output);
const records = await readJsonl(inputPath);
const expanded = records.flatMap(expandRecord);
const isComplete = !args.partial && records.length >= 1_000_000 && expanded.length >= 7_000_000;
const metadata = {
  source: 'nemotron',
  sourceRecordCount: records.length,
  expandedPersonaCount: expanded.length,
  isComplete,
  generatedAt: new Date().toISOString(),
  label: isComplete ? 'Nemotron 전체 색인' : 'Nemotron 부분 색인',
};

const packet = {
  metadata,
  personas: expanded.map((entry) => toPersonaSeed(entry, metadata)),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');

console.log(`Wrote ${packet.personas.length} personas from ${records.length} records to ${outputPath}`);
console.log(isComplete ? 'Index status: complete' : 'Index status: partial');

function parseArgs(argv) {
  const parsed = { partial: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--partial') {
      parsed.partial = true;
    } else if (item === '--input' || item === '--output') {
      parsed[item.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

async function readJsonl(path) {
  const lines = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  const rows = [];
  for await (const line of lines) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

function expandRecord(record) {
  return PERSONA_TYPES.map((personaType) => ({
    sourceUuid: record.uuid,
    personaType,
    personaText: record[personaType],
    record,
  }));
}

function toPersonaSeed(entry, metadata) {
  const record = entry.record;
  const province = record.province?.trim() || '지역 미상';
  const district = record.district?.trim();
  const region = district ? `${province} ${district}` : province;
  const occupation = record.occupation?.trim() || '직업 미상';
  const ageGroup = `${Math.floor(Number(record.age) / 10) * 10}대`;

  return {
    id: `nemotron-${record.uuid}-${entry.personaType}`,
    label: `${region} ${ageGroup} ${occupation}`,
    ageGroup,
    region,
    occupation,
    background: entry.personaText,
    perspective: record.cultural_background || entry.personaText,
    voice: `${occupation}의 생활 경험을 바탕으로 조심스럽게 설명하는 말투`,
    livedExperiences: compact([
      entry.personaText,
      record.skills_and_expertise ? `경험과 전문성: ${record.skills_and_expertise}` : '',
      record.hobbies_and_interests ? `관심사: ${record.hobbies_and_interests}` : '',
    ]),
    concerns: compact([record.career_goals_and_ambitions || '', record.family_type ? `가족 형태: ${record.family_type}` : '']),
    tensions: compact([record.education_level ? `교육 수준과 생활 조건의 차이: ${record.education_level}` : '', record.housing_type ? `주거 조건: ${record.housing_type}` : '']),
    source: {
      kind: 'nemotron',
      sourceUuid: record.uuid,
      personaType: entry.personaType,
      sex: record.sex,
      age: Number(record.age),
      province: record.province,
      district: record.district,
      occupation: record.occupation,
      educationLevel: record.education_level,
      familyType: record.family_type,
      housingType: record.housing_type,
      maritalStatus: record.marital_status,
      isCompleteIndex: metadata.isComplete,
      sourceRecordCount: metadata.sourceRecordCount,
      expandedPersonaCount: metadata.expandedPersonaCount,
    },
  };
}

function compact(values) {
  return values.map((value) => value.trim()).filter(Boolean);
}
