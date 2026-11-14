import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import handler from '../../api/persona-search';
import type { PersonaSearchManifest } from '../lib/personaSearchIndex';
import type { PersonaSeed } from '../types/research';

process.env.ALLOWED_ORIGINS = 'https://example.test';

declare const process: {
  env: Record<string, string | undefined>;
};

let indexDir = '';

beforeEach(async () => {
  indexDir = join(tmpdir(), `persona-search-api-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(indexDir, 'shards'), { recursive: true });
  process.env.PERSONA_SEARCH_INDEX_DIR = indexDir;
});

afterEach(async () => {
  delete process.env.PERSONA_SEARCH_INDEX_DIR;
  await rm(indexDir, { recursive: true, force: true });
});

test('persona search api rejects unsupported methods', async () => {
  const response = await invokeApi(undefined, 'GET');

  expect(response.statusCode).toBe(405);
  expect(response.body.error).toBe('method_not_allowed');
});

test('persona search api rejects invalid request bodies', async () => {
  const response = await invokeApi({ limit: 1000 });

  expect(response.statusCode).toBe(400);
  expect(response.body.error).toBe('invalid_request');
});

test('persona search api reports unavailable when no manifest exists', async () => {
  const response = await invokeApi({ province: '서울', limit: 10 });

  expect(response.statusCode).toBe(503);
  expect(response.body.error).toBe('persona_search_unavailable');
});

test('persona search api returns filtered candidates from fixture shards', async () => {
  await writeFixtureIndex(indexDir);

  const response = await invokeApi({
    province: '서울',
    sex: '여자',
    ageGroup: '40대',
    personaType: 'family_persona',
    occupationKeyword: '교사',
    limit: 30,
  });

  expect(response.statusCode).toBe(200);
  expect(response.body.expandedPersonaCount).toBe(7_000_000);
  expect(response.body.matchedCount).toBe(1);
  expect(response.body.returnedCount).toBe(1);
  expect(response.body.personas[0].label).toContain('서울특별시');
});

test('persona search api expands compact source-row shards', async () => {
  await writeFixtureRowIndex(indexDir);

  const response = await invokeApi({
    province: '서울',
    sex: '여성',
    ageGroup: '40대',
    personaType: 'family_persona',
    occupationKeyword: '교사',
    limit: 30,
  });

  expect(response.statusCode).toBe(200);
  expect(response.body.matchedCount).toBe(1);
  expect(response.body.personas[0].id).toBe('nemotron-api-row-1-family_persona');
  expect(response.body.personas[0].background).toContain('고등학생 자녀');
});

async function invokeApi(body: unknown, method = 'POST') {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let payload: unknown;

  await handler(
    {
      method,
      body,
      headers: { origin: 'https://example.test' },
    },
    {
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      },
      status: (status: number) => {
        statusCode = status;
        return {
          json: (value: unknown) => {
            payload = value;
          },
        };
      },
      json: (value: unknown) => {
        payload = value;
      },
    },
  );

  return { statusCode, headers, body: payload as Record<string, any> };
}

async function writeFixtureIndex(root: string) {
  const key = 'family_persona|서울특별시|40대|여성';
  const manifest: PersonaSearchManifest = {
    source: 'nemotron',
    sourceRecordCount: 1_000_000,
    expandedPersonaCount: 7_000_000,
    isComplete: true,
    generatedAt: '2026-04-30T00:00:00.000Z',
    shardStrategy: 'personaType/province/ageGroup/sex',
    shards: [key],
  };
  const persona: PersonaSeed = {
    id: 'nemotron-api-1-family_persona',
    label: '서울특별시 강남구 40대 교사',
    ageGroup: '40대',
    region: '서울특별시 강남구',
    occupation: '교사',
    background: '고등학생 자녀를 둔 보호자',
    perspective: '청소년 생활 변화를 가까이에서 본다.',
    voice: '조심스럽게 설명한다.',
    livedExperiences: ['스마트폰 사용과 수면 시간을 두고 대화한다.'],
    concerns: ['가족 형태: 부부와 미혼 자녀'],
    tensions: ['교육 수준과 생활 조건의 차이: 대졸'],
    source: {
      kind: 'nemotron',
      sourceUuid: 'api-1',
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

  await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(join(root, 'shards', `${encodeURIComponent(key)}.json`), `${JSON.stringify([persona], null, 2)}\n`, 'utf8');
}

async function writeFixtureRowIndex(root: string) {
  const key = '서울특별시|강남구|40대|여성';
  const manifest: PersonaSearchManifest = {
    source: 'nemotron',
    sourceRecordCount: 1_000_000,
    expandedPersonaCount: 7_000_000,
    isComplete: true,
    generatedAt: '2026-04-30T00:00:00.000Z',
    shardStrategy: 'province/district/ageGroup/sex source rows',
    shards: [key],
  };
  const row = {
    uuid: 'api-row-1',
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
  };

  await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(join(root, 'shards', `${encodeURIComponent(key)}.json`), `${JSON.stringify([row], null, 2)}\n`, 'utf8');
}
