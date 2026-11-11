import { expect, test } from 'vitest';
import worker from '../../worker/src/index';

test('worker persona search reads compact R2 shards and expands requested persona type', async () => {
  const objects = new Map<string, unknown>([
    [
      'manifest.json',
      {
        source: 'nemotron',
        sourceRecordCount: 1_000_000,
        expandedPersonaCount: 7_000_000,
        isComplete: true,
        generatedAt: '2026-04-30T00:00:00.000Z',
        shardStrategy: 'province/district/ageGroup/sex source rows',
        shards: ['서울특별시|강남구|40대|여성'],
      },
    ],
    [
      `shards/${encodeURIComponent('서울특별시|강남구|40대|여성')}.json`,
      [
        {
          uuid: 'r2-row-1',
          professional_persona: '서울에서 일하는 교사',
          sports_persona: '러닝 모임에 참여한다.',
          arts_persona: '영화 감상 모임에 참여한다.',
          travel_persona: '국내 여행을 다닌다.',
          culinary_persona: '가족 식사를 준비한다.',
          family_persona: '고등학생 자녀를 둔 보호자',
          persona: '서울 거주 40대 교사',
          cultural_background: '수도권에서 생활한다.',
          skills_and_expertise: '학생 상담',
          career_goals_and_ambitions: '생활 습관 조절을 돕고 싶어 한다.',
          sex: '여성',
          age: 43,
          marital_status: '기혼',
          family_type: '부부와 미혼 자녀',
          housing_type: '아파트',
          education_level: '대졸',
          occupation: '교사',
          district: '강남구',
          province: '서울특별시',
        },
      ],
    ],
  ]);

  const response = await worker.fetch(
    new Request('https://worker.test/persona-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.test' },
      body: JSON.stringify({
        province: '서울',
        district: '강남구',
        ageGroup: '40대',
        sex: '여자',
        personaType: 'family_persona',
        occupationKeyword: '교사',
        limit: 10,
      }),
    }),
    {
      AI: { run: async () => '' },
      ALLOWED_ORIGINS: 'https://example.test',
      RATE_KV: { get: async () => '0', put: async () => undefined },
      PERSONA_SEARCH: {
        get: async (key: string) => {
          const value = objects.get(key);
          return value ? { text: async () => JSON.stringify(value) } : null;
        },
      },
    } as never,
  );

  const json = (await response.json()) as { matchedCount: number; personas: Array<{ id: string; background: string }> };

  expect(response.status).toBe(200);
  expect(json.matchedCount).toBe(1);
  expect(json.personas[0].id).toBe('nemotron-r2-row-1-family_persona');
  expect(json.personas[0].background).toContain('고등학생 자녀');
});

test('worker persona search reports unavailable without R2 binding', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test/persona-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ province: '서울', limit: 10 }),
    }),
    {
      AI: { run: async () => '' },
      RATE_KV: { get: async () => '0', put: async () => undefined },
    } as never,
  );

  expect(response.status).toBe(503);
});

test('worker persona search falls back to raw R2 shard keys', async () => {
  const objects = new Map<string, unknown>([
    [
      'manifest.json',
      {
        source: 'nemotron',
        sourceRecordCount: 1_000_000,
        expandedPersonaCount: 7_000_000,
        isComplete: true,
        generatedAt: '2026-04-30T00:00:00.000Z',
        shardStrategy: 'province/district/ageGroup/sex source rows',
        shards: ['Seoul|Seoul-Gangnam|40s|female'],
      },
    ],
    [
      'shards/Seoul|Seoul-Gangnam|40s|female.json',
      [
        {
          uuid: 'raw-key-row-1',
          professional_persona: 'teacher',
          sports_persona: 'runner',
          arts_persona: 'reader',
          travel_persona: 'traveler',
          culinary_persona: 'cook',
          family_persona: 'lives with spouse',
          persona: 'Seoul teacher',
          sex: 'female',
          age: 43,
          province: 'Seoul',
          district: 'Seoul-Gangnam',
          occupation: 'teacher',
        },
      ],
    ],
  ]);

  const response = await worker.fetch(
    new Request('https://worker.test/persona-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.test' },
      body: JSON.stringify({
        province: 'Seoul',
        sex: 'female',
        personaType: 'family_persona',
        limit: 10,
      }),
    }),
    {
      AI: { run: async () => '' },
      ALLOWED_ORIGINS: 'https://example.test',
      RATE_KV: { get: async () => '0', put: async () => undefined },
      PERSONA_SEARCH: {
        get: async (key: string) => {
          const value = objects.get(key);
          return value ? { text: async () => JSON.stringify(value) } : null;
        },
      },
    } as never,
  );

  const json = (await response.json()) as { matchedCount: number; failedShardCount: number; personas: Array<{ id: string }> };

  expect(response.status).toBe(200);
  expect(json.failedShardCount).toBe(0);
  expect(json.matchedCount).toBe(1);
  expect(json.personas[0].id).toBe('nemotron-raw-key-row-1-family_persona');
});

test('worker persona search accepts multiple values per filter', async () => {
  const objects = new Map<string, unknown>([
    [
      'manifest.json',
      {
        source: 'nemotron',
        sourceRecordCount: 1_000_000,
        expandedPersonaCount: 7_000_000,
        isComplete: true,
        generatedAt: '2026-04-30T00:00:00.000Z',
        shardStrategy: 'province/district/ageGroup/sex source rows',
        shards: ['Seoul|Seoul-Gangnam|40s|female', 'Busan|Busan-Dong|30s|male'],
      },
    ],
    [
      'shards/Seoul|Seoul-Gangnam|40s|female.json',
      [
        {
          uuid: 'multi-row-1',
          professional_persona: 'teacher',
          sports_persona: 'runner',
          arts_persona: 'reader',
          travel_persona: 'traveler',
          culinary_persona: 'cook',
          family_persona: 'lives with spouse',
          persona: 'Seoul teacher',
          sex: 'female',
          age: 43,
          province: 'Seoul',
          district: 'Seoul-Gangnam',
          education_level: 'college',
          family_type: 'spouse',
          occupation: 'teacher',
        },
      ],
    ],
    [
      'shards/Busan|Busan-Dong|30s|male.json',
      [
        {
          uuid: 'multi-row-2',
          professional_persona: 'counselor',
          sports_persona: 'coach',
          arts_persona: 'artist',
          travel_persona: 'traveler',
          culinary_persona: 'cook',
          family_persona: 'single household',
          persona: 'Busan counselor',
          sex: 'male',
          age: 36,
          province: 'Busan',
          district: 'Busan-Dong',
          education_level: 'high school',
          family_type: 'single',
          occupation: 'counselor',
        },
      ],
    ],
  ]);

  const response = await worker.fetch(
    new Request('https://worker.test/persona-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.test' },
      body: JSON.stringify({
        province: ['Seoul', 'Busan'],
        sex: ['female', 'male'],
        educationLevel: ['college', 'high school'],
        personaType: ['family_persona', 'professional_persona'],
        limit: 10,
      }),
    }),
    {
      AI: { run: async () => '' },
      ALLOWED_ORIGINS: 'https://example.test',
      RATE_KV: { get: async () => '0', put: async () => undefined },
      PERSONA_SEARCH: {
        get: async (key: string) => {
          const value = objects.get(key);
          return value ? { text: async () => JSON.stringify(value) } : null;
        },
      },
    } as never,
  );

  const json = (await response.json()) as { matchedCount: number; searchedShardCount: number; personas: Array<{ id: string }> };

  expect(response.status).toBe(200);
  expect(json.searchedShardCount).toBe(2);
  expect(json.matchedCount).toBe(4);
  expect(json.personas.map((persona) => persona.id).sort()).toEqual([
    'nemotron-multi-row-1-family_persona',
    'nemotron-multi-row-1-professional_persona',
    'nemotron-multi-row-2-family_persona',
    'nemotron-multi-row-2-professional_persona',
  ]);
});

test('worker persona search formats teen rows for display without duplicated district or unemployed occupation', async () => {
  const objects = new Map<string, unknown>([
    [
      'manifest.json',
      {
        source: 'nemotron',
        sourceRecordCount: 1,
        expandedPersonaCount: 7,
        isComplete: true,
        generatedAt: '2026-04-30T00:00:00.000Z',
        shardStrategy: 'province/district/ageGroup/sex source rows',
        shards: ['Seoul|Seoul-Seodaemun|10s|female'],
      },
    ],
    [
      'shards/Seoul|Seoul-Seodaemun|10s|female.json',
      [
        {
          uuid: 'teen-r2-row-1',
          professional_persona: 'teen professional profile',
          sports_persona: 'teen sports profile',
          arts_persona: 'teen arts profile',
          travel_persona: 'teen travel profile',
          culinary_persona: 'teen culinary profile',
          family_persona: 'teen family profile',
          persona: 'teen profile',
          sex: 'female',
          age: 16,
          province: 'Seoul',
          district: 'Seoul-Seodaemun',
          occupation: 'unemployed',
        },
      ],
    ],
  ]);

  const response = await worker.fetch(
    new Request('https://worker.test/persona-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.test' },
      body: JSON.stringify({
        province: 'Seoul',
        sex: 'female',
        personaType: 'family_persona',
        limit: 10,
      }),
    }),
    {
      AI: { run: async () => '' },
      ALLOWED_ORIGINS: 'https://example.test',
      RATE_KV: { get: async () => '0', put: async () => undefined },
      PERSONA_SEARCH: {
        get: async (key: string) => {
          const value = objects.get(key);
          return value ? { text: async () => JSON.stringify(value) } : null;
        },
      },
    } as never,
  );

  const json = (await response.json()) as {
    personas: Array<{ ageGroup: string; label: string; region: string; occupation: string; source: { occupation: string } }>;
  };

  expect(response.status).toBe(200);
  expect(json.personas[0].region).toBe('Seoul Seodaemun');
  expect(json.personas[0].label).toBe(`Seoul Seodaemun ${json.personas[0].ageGroup} youth`);
  expect(json.personas[0].occupation).toBe('youth');
  expect(json.personas[0].source.occupation).toBe('unemployed');
});
