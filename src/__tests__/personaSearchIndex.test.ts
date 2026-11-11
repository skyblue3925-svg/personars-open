import { expect, test } from 'vitest';
import type { PersonaSeed } from '../types/research';
import {
  buildPersonaShardKey,
  findMatchingShardKeys,
  searchPersonaShards,
  searchPersonaRecordShards,
  type PersonaSearchManifest,
  type PersonaSearchSourceRow,
} from '../lib/personaSearchIndex';

const seoulTeacher: PersonaSeed = {
  id: 'nemotron-row-1-family_persona',
  label: '서울특별시 강남구 40대 교사',
  ageGroup: '40대',
  region: '서울특별시 강남구',
  occupation: '교사',
  background: '고등학생 자녀를 둔 보호자',
  perspective: '학교와 가정 사이의 변화를 관찰한다.',
  voice: '조심스럽게 설명한다.',
  livedExperiences: ['스마트폰 사용과 수면 시간을 두고 대화한다.'],
  concerns: ['가족 형태: 부부와 미혼 자녀'],
  tensions: ['교육 수준과 생활 조건의 차이: 대졸'],
  source: {
    kind: 'nemotron',
    sourceUuid: 'row-1',
    personaType: 'family_persona',
    sex: '여성',
    age: 43,
    province: '서울특별시',
    district: '강남구',
    occupation: '교사',
    educationLevel: '대졸',
    familyType: '부부와 미혼 자녀',
    isCompleteIndex: true,
    sourceRecordCount: 1_000_000,
    expandedPersonaCount: 7_000_000,
  },
};

const busanCounselor: PersonaSeed = {
  ...seoulTeacher,
  id: 'nemotron-row-2-professional_persona',
  label: '부산광역시 해운대구 30대 상담사',
  ageGroup: '30대',
  region: '부산광역시 해운대구',
  occupation: '상담사',
  source: {
    kind: 'nemotron',
    isCompleteIndex: true,
    sourceRecordCount: 1_000_000,
    expandedPersonaCount: 7_000_000,
    sourceUuid: 'row-2',
    personaType: 'professional_persona',
    sex: '남성',
    age: 36,
    province: '부산광역시',
    district: '해운대구',
    occupation: '상담사',
    familyType: '1인 가구',
  },
};

const manifest: PersonaSearchManifest = {
  source: 'nemotron',
  sourceRecordCount: 1_000_000,
  expandedPersonaCount: 7_000_000,
  isComplete: true,
  generatedAt: '2026-04-30T00:00:00.000Z',
  shardStrategy: 'personaType/province/ageGroup/sex',
  shards: [
    buildPersonaShardKey(seoulTeacher),
    buildPersonaShardKey(busanCounselor),
  ],
};

test('builds deterministic shard keys from coarse persona fields', () => {
  expect(buildPersonaShardKey(seoulTeacher)).toBe('family_persona|서울특별시|40대|여성');
  expect(buildPersonaShardKey({ ...seoulTeacher, source: undefined })).toBe('unknown|unknown|40대|unknown');
});

test('selects only manifest shards compatible with requested coarse filters', () => {
  const keys = findMatchingShardKeys(manifest, {
    province: '서울',
    sex: '여자',
    personaType: 'family_persona',
  });

  expect(keys).toEqual(['family_persona|서울특별시|40대|여성']);
});

test('matches any selected value within the same persona search filter', async () => {
  const result = await searchPersonaShards({
    manifest,
    request: {
      province: ['서울', '부산'],
      sex: ['여자', '남성'],
      personaType: ['family_persona', 'professional_persona'],
      limit: 10,
    },
    loadShard: async (key) => {
      if (key === buildPersonaShardKey(seoulTeacher)) return [seoulTeacher];
      if (key === buildPersonaShardKey(busanCounselor)) return [busanCounselor];
      return [];
    },
  });

  expect(result.matchedCount).toBe(2);
  expect(result.personas.map((persona) => persona.id).sort()).toEqual([
    'nemotron-row-1-family_persona',
    'nemotron-row-2-professional_persona',
  ]);
});

test('loads selected shards and applies exact filters before limiting results', async () => {
  const result = await searchPersonaShards({
    manifest,
    request: {
      province: '서울',
      sex: '여자',
      ageGroup: '40대',
      educationLevel: '대졸',
      familyType: '부부와 미혼 자녀',
      personaType: 'family_persona',
      occupationKeyword: '교사',
      limit: 1,
    },
    loadShard: async (key) => {
      if (key === buildPersonaShardKey(seoulTeacher)) return [seoulTeacher, busanCounselor];
      return [busanCounselor];
    },
  });

  expect(result.matchedCount).toBe(1);
  expect(result.returnedCount).toBe(1);
  expect(result.personas[0].id).toBe('nemotron-row-1-family_persona');
  expect(result.expandedPersonaCount).toBe(7_000_000);
});

test('searches compact source-row shards and expands only requested persona types', async () => {
  const row: PersonaSearchSourceRow = {
    uuid: 'row-source-1',
    professional_persona: '서울에서 일하는 교사',
    sports_persona: '러닝 모임에 참여한다',
    arts_persona: '영화 감상 모임에 참여한다',
    travel_persona: '국내 여행을 다닌다',
    culinary_persona: '가족 식사를 준비한다',
    family_persona: '고등학생 자녀를 둔 보호자',
    persona: '서울 거주 40대 교사',
    cultural_background: '수도권에서 생활한다.',
    skills_and_expertise: '학생 상담',
    career_goals_and_ambitions: '생활 습관 조절을 돕고 싶어 한다.',
    sex: '여자',
    age: 43,
    marital_status: '기혼',
    family_type: '부부와 미혼 자녀',
    housing_type: '아파트',
    education_level: '대졸',
    occupation: '교사',
    district: '강남구',
    province: '서울특별시',
  };
  const rowManifest: PersonaSearchManifest = {
    source: 'nemotron',
    sourceRecordCount: 1_000_000,
    expandedPersonaCount: 7_000_000,
    isComplete: true,
    generatedAt: '2026-04-30T00:00:00.000Z',
    shardStrategy: 'province/district/ageGroup/sex source rows',
    shards: ['서울특별시|강남구|40대|여성'],
  };

  const result = await searchPersonaRecordShards({
    manifest: rowManifest,
    request: {
      province: '서울',
      sex: '여성',
      ageGroup: '40대',
      occupationKeyword: '교사',
      personaType: 'family_persona',
      limit: 10,
    },
    loadShard: async () => [row],
  });

  expect(result.matchedCount).toBe(1);
  expect(result.personas[0].id).toBe('nemotron-row-source-1-family_persona');
  expect(result.personas[0].source?.expandedPersonaCount).toBe(7_000_000);
});

test('formats source-row personas without duplicated province or minor unemployment labels', async () => {
  const row: PersonaSearchSourceRow = {
    uuid: 'teen-source-1',
    professional_persona: 'teen professional profile',
    sports_persona: 'teen sports profile',
    arts_persona: 'teen arts profile',
    travel_persona: 'teen travel profile',
    culinary_persona: 'teen culinary profile',
    family_persona: 'teen family profile',
    persona: 'teen profile',
    sex: 'female',
    age: 16,
    occupation: 'unemployed',
    district: 'Seoul-Seodaemun',
    province: 'Seoul',
  };
  const rowManifest: PersonaSearchManifest = {
    source: 'nemotron',
    sourceRecordCount: 1,
    expandedPersonaCount: 7,
    isComplete: true,
    generatedAt: '2026-04-30T00:00:00.000Z',
    shardStrategy: 'province/district/ageGroup/sex source rows',
    shards: ['Seoul|Seoul-Seodaemun|10?|female'],
  };

  const result = await searchPersonaRecordShards({
    manifest: rowManifest,
    request: {
      province: 'Seoul',
      sex: 'female',
      personaType: 'family_persona',
      limit: 10,
    },
    loadShard: async () => [row],
  });

  expect(result.personas[0].region).toBe('Seoul Seodaemun');
  expect(result.personas[0].label).toBe(`Seoul Seodaemun ${result.personas[0].ageGroup} youth`);
  expect(result.personas[0].occupation).toBe('youth');
  expect(result.personas[0].source?.occupation).toBe('unemployed');
});
