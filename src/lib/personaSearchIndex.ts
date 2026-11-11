import type { PersonaSeed } from '../types/research';

export type PersonaSearchManifest = {
  source: 'nemotron';
  sourceRecordCount: number;
  expandedPersonaCount: number;
  isComplete: boolean;
  generatedAt: string;
  shardStrategy: 'personaType/province/ageGroup/sex' | 'province/ageGroup/sex source rows' | 'province/district/ageGroup/sex source rows';
  shards: string[];
};

export type PersonaSearchSourceRow = {
  uuid: string;
  professional_persona: string;
  sports_persona: string;
  arts_persona: string;
  travel_persona: string;
  culinary_persona: string;
  family_persona: string;
  persona: string;
  cultural_background?: string;
  skills_and_expertise?: string;
  career_goals_and_ambitions?: string;
  hobbies_and_interests?: string;
  sex?: string;
  age: number;
  marital_status?: string;
  family_type?: string;
  housing_type?: string;
  education_level?: string;
  occupation?: string;
  district?: string;
  province?: string;
};

const PERSONA_TYPES = [
  'professional_persona',
  'sports_persona',
  'arts_persona',
  'travel_persona',
  'culinary_persona',
  'family_persona',
  'persona',
] as const;

type SearchFilterValue = string | string[];

export type PersonaSearchRequest = {
  ageGroup?: SearchFilterValue;
  sex?: SearchFilterValue;
  province?: SearchFilterValue;
  district?: SearchFilterValue;
  educationLevel?: SearchFilterValue;
  familyType?: SearchFilterValue;
  personaType?: SearchFilterValue;
  occupationKeyword?: string;
  limit?: number;
};

export type PersonaSearchResult = {
  sourceRecordCount: number;
  expandedPersonaCount: number;
  isComplete: boolean;
  matchedCount: number;
  returnedCount: number;
  personas: PersonaSeed[];
  searchedShardCount: number;
  failedShardCount: number;
};

export type SearchPersonaShardsOptions = {
  manifest: PersonaSearchManifest;
  request: PersonaSearchRequest;
  loadShard: (key: string) => Promise<PersonaSeed[]>;
};

export function buildPersonaShardKey(persona: PersonaSeed): string {
  return [
    cleanPart(persona.source?.personaType),
    cleanPart(persona.source?.province),
    cleanPart(persona.ageGroup),
    cleanPart(normalizeSex(persona.source?.sex)),
  ].join('|');
}

export function shardFileName(key: string): string {
  return `${encodeURIComponent(key)}.json`;
}

export function buildPersonaRecordShardKey(row: PersonaSearchSourceRow): string {
  return [cleanPart(row.province), cleanPart(row.district), cleanPart(ageGroupFor(row.age)), cleanPart(normalizeSex(row.sex))].join('|');
}

export function findMatchingShardKeys(manifest: PersonaSearchManifest, request: PersonaSearchRequest): string[] {
  return manifest.shards.filter((key) => {
    const parts = parseShardKey(key);
    return (
      matchesValue(parts.personaType, request.personaType) &&
      matchesProvince(parts.province, request.province) &&
      matchesValue(parts.ageGroup, request.ageGroup) &&
      matchesSex(parts.sex, request.sex)
    );
  });
}

export async function searchPersonaShards({ manifest, request, loadShard }: SearchPersonaShardsOptions): Promise<PersonaSearchResult> {
  const limit = normalizeLimit(request.limit);
  const keys = findMatchingShardKeys(manifest, request);
  const candidates: PersonaSeed[] = [];
  let failedShardCount = 0;

  for (const key of keys) {
    try {
      candidates.push(...(await loadShard(key)));
    } catch {
      failedShardCount += 1;
    }
  }

  const matched = candidates.filter((persona) => matchesExactFilters(persona, request));

  return {
    sourceRecordCount: manifest.sourceRecordCount,
    expandedPersonaCount: manifest.expandedPersonaCount,
    isComplete: manifest.isComplete,
    matchedCount: matched.length,
    returnedCount: Math.min(limit, matched.length),
    personas: matched.slice(0, limit),
    searchedShardCount: keys.length,
    failedShardCount,
  };
}

export async function searchPersonaRecordShards({
  manifest,
  request,
  loadShard,
}: {
  manifest: PersonaSearchManifest;
  request: PersonaSearchRequest;
  loadShard: (key: string) => Promise<PersonaSearchSourceRow[]>;
}): Promise<PersonaSearchResult> {
  const limit = normalizeLimit(request.limit);
  const keys = findMatchingRecordShardKeys(manifest, request);
  const rows: PersonaSearchSourceRow[] = [];
  let failedShardCount = 0;

  for (const key of keys) {
    try {
      rows.push(...(await loadShard(key)));
    } catch {
      failedShardCount += 1;
    }
  }

  const personas: PersonaSeed[] = [];
  let matchedCount = 0;
  for (const row of rows) {
    if (!matchesRowFilters(row, request)) continue;
    for (const personaType of personaTypesFor(request.personaType)) {
      matchedCount += 1;
      if (personas.length < limit) personas.push(rowToPersonaSeed(row, personaType, manifest));
    }
  }

  return {
    sourceRecordCount: manifest.sourceRecordCount,
    expandedPersonaCount: manifest.expandedPersonaCount,
    isComplete: manifest.isComplete,
    matchedCount,
    returnedCount: personas.length,
    personas,
    searchedShardCount: keys.length,
    failedShardCount,
  };
}

function matchesExactFilters(persona: PersonaSeed, request: PersonaSearchRequest): boolean {
  const source = persona.source;
  return (
    matchesValue(persona.ageGroup, request.ageGroup) &&
    matchesSex(source?.sex, request.sex) &&
    matchesProvince(source?.province || persona.region, request.province) &&
    matchesValue(source?.educationLevel, request.educationLevel) &&
    matchesValue(source?.familyType, request.familyType) &&
    matchesValue(source?.personaType, request.personaType) &&
    matchesText(persona.occupation, request.occupationKeyword)
  );
}

function findMatchingRecordShardKeys(manifest: PersonaSearchManifest, request: PersonaSearchRequest): string[] {
  return manifest.shards.filter((key) => {
    const parts = key.split('|');
    const isDistrictShard = manifest.shardStrategy === 'province/district/ageGroup/sex source rows';
    const province = parts[0] ?? 'unknown';
    const district = isDistrictShard ? (parts[1] ?? 'unknown') : undefined;
    const ageGroup = isDistrictShard ? (parts[2] ?? 'unknown') : (parts[1] ?? 'unknown');
    const sex = isDistrictShard ? (parts[3] ?? 'unknown') : (parts[2] ?? 'unknown');
    return (
      matchesProvince(province, request.province) &&
      matchesValue(district, request.district) &&
      matchesValue(ageGroup, request.ageGroup) &&
      matchesSex(sex, request.sex)
    );
  });
}

function matchesRowFilters(row: PersonaSearchSourceRow, request: PersonaSearchRequest): boolean {
  return (
    matchesValue(ageGroupFor(row.age), request.ageGroup) &&
    matchesSex(row.sex, request.sex) &&
    matchesProvince(row.province, request.province) &&
    matchesValue(row.district, request.district) &&
    matchesValue(row.education_level, request.educationLevel) &&
    matchesValue(row.family_type, request.familyType) &&
    matchesText(row.occupation, request.occupationKeyword)
  );
}

function personaTypesFor(personaType: SearchFilterValue | undefined): Array<(typeof PERSONA_TYPES)[number]> {
  const requested = requestedValues(personaType);
  if (requested.length > 0) {
    const matched = requested.filter((value): value is (typeof PERSONA_TYPES)[number] =>
      PERSONA_TYPES.includes(value as (typeof PERSONA_TYPES)[number]),
    );
    if (matched.length > 0) return matched;
  }
  return [...PERSONA_TYPES];
}

function rowToPersonaSeed(
  row: PersonaSearchSourceRow,
  personaType: (typeof PERSONA_TYPES)[number],
  manifest: PersonaSearchManifest,
): PersonaSeed {
  const province = row.province?.trim() || '지역 미상';
  const sourceDistrict = row.district?.trim();
  const district = displayDistrict(province, sourceDistrict);
  const region = district ? `${province} ${district}` : province;
  const sourceOccupation = row.occupation?.trim() || '직업 미상';
  const occupation = displayOccupation(row.age, sourceOccupation);
  const ageGroup = ageGroupFor(row.age);
  const text = row[personaType] ?? '';

  return {
    id: `nemotron-${row.uuid}-${personaType}`,
    label: `${region} ${ageGroup} ${occupation}`,
    ageGroup,
    region,
    occupation,
    background: text,
    perspective: row.cultural_background || text,
    voice: `${occupation}의 생활 경험을 바탕으로 조심스럽게 설명하는 말투`,
    livedExperiences: compact([row.skills_and_expertise ? `경험과 전문성: ${row.skills_and_expertise}` : '']),
    concerns: compact([row.career_goals_and_ambitions || '', row.family_type ? `가족 형태: ${row.family_type}` : '']),
    tensions: compact([row.education_level ? `교육 수준: ${row.education_level}` : '', row.housing_type ? `주거 조건: ${row.housing_type}` : '']),
    source: {
      kind: 'nemotron',
      sourceUuid: row.uuid,
      personaType,
      sex: normalizeSex(row.sex),
      age: row.age,
      province,
      district: sourceDistrict,
      occupation: sourceOccupation,
      educationLevel: row.education_level,
      familyType: row.family_type,
      housingType: row.housing_type,
      maritalStatus: row.marital_status,
      isCompleteIndex: manifest.isComplete,
      sourceRecordCount: manifest.sourceRecordCount,
      expandedPersonaCount: manifest.expandedPersonaCount,
    },
  };
}

function displayDistrict(province: string, district: string | undefined): string | undefined {
  if (!district) return undefined;
  const prefix = `${province}-`;
  if (district.startsWith(prefix)) return district.slice(prefix.length).trim() || district;
  return district;
}

function displayOccupation(age: number | undefined, occupation: string): string {
  if (typeof age === 'number' && age < 20 && isUnemployedOccupation(occupation)) return 'youth';
  return occupation;
}

function isUnemployedOccupation(occupation: string): boolean {
  const normalized = occupation.trim().toLowerCase();
  return normalized === 'unemployed' || normalized === '무직';
}

function parseShardKey(key: string) {
  const [personaType = 'unknown', province = 'unknown', ageGroup = 'unknown', sex = 'unknown'] = key.split('|');
  return { personaType, province, ageGroup, sex };
}

function cleanPart(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed || 'unknown';
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(100, Math.floor(value ?? 30)));
}

function matchesValue(actual: string | undefined, requested: SearchFilterValue | undefined): boolean {
  const values = requestedValues(requested);
  if (values.length === 0) return true;
  return values.some((value) => cleanPart(actual) === value);
}

function matchesText(actual: string | undefined, requested: string | undefined): boolean {
  if (!requested?.trim()) return true;
  return (actual ?? '').includes(requested.trim());
}

function matchesSex(actual: string | undefined, requested: SearchFilterValue | undefined): boolean {
  const values = requestedValues(requested);
  if (values.length === 0) return true;
  const normalizedActual = normalizeSex(actual);
  return values.some((value) => normalizedActual === normalizeSex(value));
}

function matchesProvince(actual: string | undefined, requested: SearchFilterValue | undefined): boolean {
  const values = requestedValues(requested);
  if (values.length === 0) return true;
  const normalizedActual = normalizeProvince(actual);
  return values.some((value) => {
    const normalizedRequested = normalizeProvince(value);
    return normalizedActual === normalizedRequested || normalizedActual.includes(normalizedRequested) || normalizedRequested.includes(normalizedActual);
  });
}

function requestedValues(value: SearchFilterValue | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map((item) => item.trim()).filter(Boolean);
}

function normalizeSex(value: string | undefined): string {
  if (value === '여자') return '여성';
  if (value === '남자') return '남성';
  return value?.trim() ?? '';
}

function normalizeProvince(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/특별시|광역시|특별자치시|특별자치도|자치도|도/g, '');
}

function ageGroupFor(age: number | undefined): string {
  return age ? `${Math.floor(age / 10) * 10}대` : '연령 미상';
}

function compact(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
