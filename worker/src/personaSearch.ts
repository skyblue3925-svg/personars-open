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

export type PersonaSearchR2Bucket = {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
};

export type PersonaSearchManifest = {
  source: 'nemotron';
  sourceRecordCount: number;
  expandedPersonaCount: number;
  isComplete: boolean;
  generatedAt: string;
  shardStrategy: 'province/district/ageGroup/sex source rows';
  shards: string[];
};

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

type PersonaRow = {
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

export async function searchPersonaR2(bucket: PersonaSearchR2Bucket, request: PersonaSearchRequest) {
  const manifest = await readManifest(bucket);
  const keys = findMatchingKeys(manifest, request);
  const limit = normalizeLimit(request.limit);
  const personas: unknown[] = [];
  let matchedCount = 0;
  let failedShardCount = 0;

  for (const key of keys) {
    const object = await readShard(bucket, key);
    if (!object) {
      failedShardCount += 1;
      continue;
    }
    const rows = JSON.parse(await object.text()) as PersonaRow[];
    for (const row of rows) {
      if (!matchesRow(row, request)) continue;
      for (const personaType of personaTypesFor(request.personaType)) {
        matchedCount += 1;
        if (personas.length < limit) personas.push(rowToPersona(row, personaType, manifest));
      }
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

async function readShard(bucket: PersonaSearchR2Bucket, key: string): Promise<{ text(): Promise<string> } | null> {
  const encoded = await bucket.get(`shards/${encodeURIComponent(key)}.json`);
  if (encoded) return encoded;
  return bucket.get(`shards/${key}.json`);
}

export function isValidPersonaSearchRequest(body: unknown): body is PersonaSearchRequest {
  const request = body as PersonaSearchRequest;
  if (!request || typeof request !== 'object') return false;
  if (request.limit !== undefined && (!Number.isFinite(request.limit) || request.limit < 1 || request.limit > 100)) return false;
  return [
    request.ageGroup,
    request.sex,
    request.province,
    request.district,
    request.educationLevel,
    request.familyType,
    request.personaType,
    request.occupationKeyword,
  ].some(hasSearchValue);
}

async function readManifest(bucket: PersonaSearchR2Bucket): Promise<PersonaSearchManifest> {
  const object = await bucket.get('manifest.json');
  if (!object) throw new Error('persona search manifest missing');
  return JSON.parse(await object.text()) as PersonaSearchManifest;
}

function findMatchingKeys(manifest: PersonaSearchManifest, request: PersonaSearchRequest): string[] {
  return manifest.shards.filter((key) => {
    const [province = '', district = '', ageGroup = '', sex = ''] = key.split('|');
    return (
      matchesProvince(province, request.province) &&
      matchesValue(district, request.district) &&
      matchesValue(ageGroup, request.ageGroup) &&
      matchesSex(sex, request.sex)
    );
  });
}

function matchesRow(row: PersonaRow, request: PersonaSearchRequest): boolean {
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

function rowToPersona(row: PersonaRow, personaType: (typeof PERSONA_TYPES)[number], manifest: PersonaSearchManifest) {
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

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(100, Math.floor(value ?? 30)));
}

function matchesValue(actual: string | undefined, requested: SearchFilterValue | undefined): boolean {
  const values = requestedValues(requested);
  if (values.length === 0) return true;
  const normalizedActual = (actual ?? '').trim();
  return values.some((value) => normalizedActual === value);
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

function hasSearchValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0);
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
