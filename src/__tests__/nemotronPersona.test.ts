import { expect, test } from 'vitest';
import {
  NEMOTRON_PERSONA_TYPES,
  buildNemotronIndexMetadata,
  expandNemotronRecord,
  toPersonaSeed,
  type NemotronPersonaRecord,
} from '../lib/nemotronPersona';

const record: NemotronPersonaRecord = {
  uuid: 'row-001',
  professional_persona: '서울에서 일하는 중학교 교사로, 학생 생활지도와 학부모 상담을 맡고 있다.',
  sports_persona: '퇴근 후 동네 러닝 모임에 참여하며 청소년 체육 활동에도 관심이 있다.',
  arts_persona: '지역 도서관의 영화 감상 모임에 가끔 참여한다.',
  travel_persona: '방학에는 가족과 짧은 국내 여행을 다니며 지역 교통을 자주 비교한다.',
  culinary_persona: '가족 식사를 준비하며 학교 급식과 집밥의 차이를 자주 생각한다.',
  family_persona: '고등학생 자녀를 둔 보호자로, 스마트폰 사용과 수면 시간을 두고 대화를 자주 나눈다.',
  persona: '서울 거주 40대 교사이자 학부모로 청소년 생활 변화를 가까이에서 본다.',
  cultural_background: '수도권 아파트 단지에서 생활하며 학교와 가정 사이의 변화를 관찰한다.',
  skills_and_expertise: '학생 상담, 학부모 소통, 생활지도',
  skills_and_expertise_list: '상담, 생활지도',
  hobbies_and_interests: '러닝, 영화 감상',
  hobbies_and_interests_list: '러닝, 영화',
  career_goals_and_ambitions: '학생들이 생활 습관을 스스로 조절하도록 돕고 싶어 한다.',
  sex: '여성',
  age: 43,
  marital_status: '기혼',
  military_status: '해당 없음',
  family_type: '부부와 미혼 자녀',
  housing_type: '아파트',
  education_level: '대졸',
  bachelors_field: '교육',
  occupation: '교사',
  district: '강남구',
  province: '서울특별시',
  country: '대한민국',
};

test('expands one Nemotron record into seven persona-level entries', () => {
  const entries = expandNemotronRecord(record);

  expect(entries).toHaveLength(7);
  expect(entries.map((entry) => entry.personaType)).toEqual(NEMOTRON_PERSONA_TYPES);
  expect(entries.every((entry) => entry.sourceUuid === 'row-001')).toBe(true);
  expect(entries.find((entry) => entry.personaType === 'family_persona')?.personaText).toContain('고등학생 자녀');
});

test('maps a Nemotron persona entry to the app PersonaSeed with source metadata', () => {
  const metadata = buildNemotronIndexMetadata({ sourceRecordCount: 1, expandedPersonaCount: 7, isComplete: false });
  const entry = expandNemotronRecord(record).find((item) => item.personaType === 'family_persona');
  if (!entry) throw new Error('family persona entry missing');

  const persona = toPersonaSeed(entry, metadata);

  expect(persona.id).toBe('nemotron-row-001-family_persona');
  expect(persona.label).toContain('서울특별시');
  expect(persona.ageGroup).toBe('40대');
  expect(persona.region).toBe('서울특별시 강남구');
  expect(persona.occupation).toBe('교사');
  expect(persona.background).toContain('고등학생 자녀');
  expect(persona.source?.kind).toBe('nemotron');
  expect(persona.source?.personaType).toBe('family_persona');
  expect(persona.source?.isCompleteIndex).toBe(false);
});

test('marks complete and partial source scans explicitly', () => {
  const partial = buildNemotronIndexMetadata({ sourceRecordCount: 1, expandedPersonaCount: 7, isComplete: false });
  const complete = buildNemotronIndexMetadata({ sourceRecordCount: 1_000_000, expandedPersonaCount: 7_000_000, isComplete: true });

  expect(partial.isComplete).toBe(false);
  expect(partial.label).toContain('부분');
  expect(complete.isComplete).toBe(true);
  expect(complete.label).toContain('전체');
});
