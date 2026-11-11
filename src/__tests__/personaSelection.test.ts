import { expect, test } from 'vitest';
import { generatedNemotronPersonaPacket } from '../data/generatedNemotronPersonas';
import { fallbackPersonas } from '../data/personas';
import type { PersonaSeed } from '../types/research';
import { buildPersonaCandidates, filterPersonaCandidates, selectInterviewPersonas } from '../lib/personaSelection';
import { createResearchDraft } from '../lib/researchDraft';

test('builds topic-aware persona candidates with relevance and filter tags', () => {
  const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
  const candidates = buildPersonaCandidates(draft, fallbackPersonas);

  expect(candidates.length).toBeGreaterThan(3);
  expect(candidates[0].character.relevance).toBe('direct');
  expect(candidates[0].tags).toContain('직접 관련');
  expect(candidates[0].tags).toContain('청소년');
});

test('filters generated Nemotron candidates by structured demographic fields', () => {
  const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
  const candidates = buildPersonaCandidates(draft, generatedNemotronPersonaPacket.personas);
  const filtered = filterPersonaCandidates(candidates, {
    age: 'all',
    relevance: 'all',
    role: 'all',
    sex: '여성',
    province: '서울특별시',
    occupationKeyword: '교사',
    educationLevel: '대졸',
    familyType: '부부와 미혼 자녀',
    personaType: 'family_persona',
  });

  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.every((candidate) => candidate.persona.source?.sex === '여성')).toBe(true);
  expect(filtered.every((candidate) => candidate.persona.source?.province === '서울특별시')).toBe(true);
  expect(filtered.every((candidate) => candidate.persona.source?.personaType === 'family_persona')).toBe(true);
});

test('filters candidates with OR semantics inside multi-select fields', () => {
  const draft = createResearchDraft('local commute');
  const personas: PersonaSeed[] = [
    buildStructuredPersona('p-a', 'Seoul', 'female', 'college', 'spouse', 'family_persona'),
    buildStructuredPersona('p-b', 'Busan', 'male', 'high school', 'single', 'professional_persona'),
    buildStructuredPersona('p-c', 'Daegu', 'female', 'college', 'spouse', 'sports_persona'),
  ];
  const candidates = buildPersonaCandidates(draft, personas);
  const filtered = filterPersonaCandidates(candidates, {
    age: ['all'],
    relevance: ['all'],
    role: ['all'],
    province: ['Seoul', 'Busan'],
    sex: ['female', 'male'],
    educationLevel: ['college', 'high school'],
    personaType: ['family_persona', 'professional_persona'],
  });

  expect(filtered.map((candidate) => candidate.persona.id).sort()).toEqual(['p-a', 'p-b']);
});

test('scores adult stakeholders for youth topics without treating them as direct minors', () => {
  const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
  const candidates = buildPersonaCandidates(draft, generatedNemotronPersonaPacket.personas);
  const familyStakeholder = candidates.find((candidate) => candidate.persona.source?.personaType === 'family_persona');

  expect(familyStakeholder?.tags).toContain('관련 어른');
  expect(familyStakeholder?.tags).not.toContain('청소년 당사자');
});

test('filters persona candidates by age group and relevance', () => {
  const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
  const candidates = buildPersonaCandidates(draft, fallbackPersonas);
  const filtered = filterPersonaCandidates(candidates, { age: '청소년', relevance: 'direct', role: 'all' });

  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.every((candidate) => candidate.tags.includes('청소년'))).toBe(true);
  expect(filtered.every((candidate) => candidate.character.relevance === 'direct')).toBe(true);
});

test('selects interview personas in the student chosen order', () => {
  const selected = selectInterviewPersonas(fallbackPersonas, ['p-004', 'p-001']);

  expect(selected.map((persona) => persona.id)).toEqual(['p-004', 'p-001']);
});

test('frames appearance and media topics around youth media pressure instead of generic care burden', () => {
  const draft = createResearchDraft('외모지상주의와 미디어의 관계. 청소년을 중심으로.');
  const candidates = buildPersonaCandidates(draft, fallbackPersonas);
  const parent = candidates.find((candidate) => candidate.persona.id === 'p-005');

  expect(draft.question).toContain('청소년');
  expect(draft.question).not.toContain('학생들');
  expect(parent?.character.topicFrame.places).toContain('온라인 공간');
  expect(parent?.character.topicFrame.pressures).toContain('외모 평가');
  expect(parent?.character.concreteScenes[0].setting).toContain('미디어');
  expect(parent?.character.concreteScenes[0].pressure).toContain('외모 평가');
});

test('classifies minor family persona rows as direct subjects before family guardians', () => {
  const draft = createResearchDraft('teen smartphone sleep');
  const adultFamily = buildStructuredPersona('adult-family', 'Seoul', 'female', 'college', 'spouse', 'family_persona');
  const minorFamily: PersonaSeed = {
    ...buildStructuredPersona('minor-family', 'Seoul', 'female', 'middle school', 'parents', 'family_persona'),
    ageGroup: '10s',
    source: {
      kind: 'nemotron',
      province: 'Seoul',
      sex: 'female',
      age: 16,
      educationLevel: 'middle school',
      familyType: 'parents',
      personaType: 'family_persona',
    },
  };
  const candidates = buildPersonaCandidates(draft, [adultFamily, minorFamily]);
  const adult = candidates.find((candidate) => candidate.persona.id === 'adult-family');
  const minor = candidates.find((candidate) => candidate.persona.id === 'minor-family');

  expect(adult).toBeDefined();
  expect(minor).toBeDefined();
  expect(minor?.role).not.toBe(adult?.role);
});

test('keeps regional context out of the role filter while preserving it as a candidate tag', () => {
  const draft = createResearchDraft('지역 교통 접근성');
  const regionalResident = buildStructuredPersona('regional-resident', 'Busan', 'female', 'college', 'single', 'persona');
  regionalResident.region = 'Busan';
  regionalResident.background = '지역 주민으로 이동과 생활 편의 문제를 자주 겪는다.';
  const [candidate] = buildPersonaCandidates(draft, [regionalResident]);

  expect(candidate.role).toBe('당사자');
  expect(candidate.tags).toContain('지역 생활');
});

function buildStructuredPersona(
  id: string,
  province: string,
  sex: string,
  educationLevel: string,
  familyType: string,
  personaType: string,
): PersonaSeed {
  return {
    id,
    label: `${province} candidate`,
    ageGroup: '30s',
    region: province,
    occupation: 'worker',
    background: 'background',
    perspective: 'perspective',
    voice: 'voice',
    livedExperiences: [],
    concerns: [],
    tensions: [],
    source: {
      kind: 'nemotron',
      province,
      sex,
      age: 35,
      educationLevel,
      familyType,
      personaType,
    },
  };
}
