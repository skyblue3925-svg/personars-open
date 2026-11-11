import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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

if (!args.input || !args.outputDir) {
  console.error('Usage: node scripts/build-nemotron-persona-search-shards.mjs --input <file.jsonl> --output-dir <dir> [--partial]');
  process.exit(1);
}

const inputPath = resolve(args.input);
const outputDir = resolve(args.outputDir);
const shardDir = join(outputDir, 'shards');
const records = await readJsonl(inputPath);
const shards = new Map();
let expandedPersonaCount = 0;
const isComplete = !args.partial && records.length >= 1_000_000;

for (const record of records) {
  for (const personaType of PERSONA_TYPES) {
    expandedPersonaCount += 1;
    const persona = toPersonaSeed(record, personaType, {
      sourceRecordCount: records.length,
      expandedPersonaCount: records.length * PERSONA_TYPES.length,
      isComplete,
    });
    const key = buildPersonaShardKey(persona);
    const bucket = shards.get(key) || [];
    bucket.push(persona);
    shards.set(key, bucket);
  }
}

await mkdir(shardDir, { recursive: true });

for (const [key, personas] of shards) {
  await writeFile(join(shardDir, `${encodeURIComponent(key)}.json`), `${JSON.stringify(personas, null, 2)}\n`, 'utf8');
}

const manifest = {
  source: 'nemotron',
  sourceRecordCount: records.length,
  expandedPersonaCount,
  isComplete,
  generatedAt: new Date().toISOString(),
  shardStrategy: 'personaType/province/ageGroup/sex',
  shards: Array.from(shards.keys()).sort((a, b) => a.localeCompare(b, 'ko-KR')),
};

await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${expandedPersonaCount} persona records into ${shards.size} shards at ${outputDir}`);

function parseArgs(argv) {
  const parsed = { partial: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--partial') {
      parsed.partial = true;
    } else if (item === '--input' || item === '--output-dir') {
      parsed[item === '--output-dir' ? 'outputDir' : 'input'] = argv[index + 1];
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

function toPersonaSeed(record, personaType, metadata) {
  const province = clean(record.province) || '지역 미상';
  const district = clean(record.district);
  const region = district ? `${province} ${district}` : province;
  const occupation = clean(record.occupation) || '직업 미상';
  const age = Number(record.age) || 0;
  const ageGroup = age ? `${Math.floor(age / 10) * 10}대` : '연령 미상';
  const text = clean(record[personaType]);

  return {
    id: `nemotron-${record.uuid}-${personaType}`,
    label: `${region} ${ageGroup} ${occupation}`,
    ageGroup,
    region,
    occupation,
    background: text,
    perspective: clean(record.cultural_background) || text,
    voice: `${occupation}의 생활 경험을 바탕으로 조심스럽게 설명하는 말투`,
    livedExperiences: compact([
      text,
      record.skills_and_expertise ? `경험과 전문성: ${record.skills_and_expertise}` : '',
      record.hobbies_and_interests ? `관심사: ${record.hobbies_and_interests}` : '',
    ]),
    concerns: compact([clean(record.career_goals_and_ambitions), record.family_type ? `가족 형태: ${record.family_type}` : '']),
    tensions: compact([record.education_level ? `교육 수준과 생활 조건의 차이: ${record.education_level}` : '', record.housing_type ? `주거 조건: ${record.housing_type}` : '']),
    source: {
      kind: 'nemotron',
      sourceUuid: clean(record.uuid),
      personaType,
      sex: normalizeSex(clean(record.sex)),
      age,
      province,
      district,
      occupation,
      educationLevel: clean(record.education_level),
      familyType: clean(record.family_type),
      housingType: clean(record.housing_type),
      maritalStatus: clean(record.marital_status),
      isCompleteIndex: metadata.isComplete,
      sourceRecordCount: metadata.sourceRecordCount,
      expandedPersonaCount: metadata.expandedPersonaCount,
    },
  };
}

function buildPersonaShardKey(persona) {
  return [
    cleanPart(persona.source?.personaType),
    cleanPart(persona.source?.province),
    cleanPart(persona.ageGroup),
    cleanPart(normalizeSex(persona.source?.sex)),
  ].join('|');
}

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function cleanPart(value) {
  return clean(value) || 'unknown';
}

function compact(values) {
  return values.map((value) => clean(value)).filter(Boolean);
}

function normalizeSex(value) {
  if (value === '여자') return '여성';
  if (value === '남자') return '남성';
  return clean(value);
}
