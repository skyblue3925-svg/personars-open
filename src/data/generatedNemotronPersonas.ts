import { buildNemotronIndexMetadata, expandNemotronRecord, toPersonaSeed, type NemotronPersonaRecord } from '../lib/nemotronPersona';
import type { PersonaSeed } from '../types/research';

const fixtureRecords: NemotronPersonaRecord[] = [
  {
    uuid: 'fixture-001',
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
  },
  {
    uuid: 'fixture-002',
    professional_persona: '부산의 청소년 상담기관에서 일하며 수면, 가족 갈등, 진로 고민을 상담한다.',
    sports_persona: '주말에는 지역 체육관에서 청소년 농구 프로그램을 돕는다.',
    arts_persona: '청소년 문화센터 공연 프로그램을 관찰하고 참여자를 지원한다.',
    travel_persona: '지역 이동 여건이 청소년 프로그램 참여에 주는 영향을 자주 본다.',
    culinary_persona: '상담 일정 때문에 끼니를 거르는 청소년 사례를 접한다.',
    family_persona: '맞벌이 가정과 한부모 가정 청소년의 생활 리듬 차이를 상담에서 자주 본다.',
    persona: '부산 거주 30대 상담사로 청소년의 생활 습관과 정서 변화를 가까이에서 관찰한다.',
    cultural_background: '도시 지역 복지기관과 학교를 오가며 다양한 가정 배경을 접한다.',
    skills_and_expertise: '청소년 상담, 복지 연계, 정서 지원',
    skills_and_expertise_list: '상담, 복지',
    hobbies_and_interests: '독서, 농구',
    hobbies_and_interests_list: '독서, 농구',
    career_goals_and_ambitions: '청소년이 도움을 요청하기 쉬운 상담 환경을 만들고 싶어 한다.',
    sex: '남성',
    age: 36,
    marital_status: '미혼',
    military_status: '필',
    family_type: '1인 가구',
    housing_type: '오피스텔',
    education_level: '대졸',
    bachelors_field: '사회복지',
    occupation: '상담사',
    district: '해운대구',
    province: '부산광역시',
    country: '대한민국',
  },
];

const metadata = buildNemotronIndexMetadata({
  sourceRecordCount: fixtureRecords.length,
  expandedPersonaCount: fixtureRecords.length * 7,
  isComplete: false,
  generatedAt: '2026-04-29T00:00:00.000Z',
});

export type GeneratedNemotronPersonaPacket = {
  metadata: typeof metadata;
  personas: PersonaSeed[];
};

export const generatedNemotronPersonaPacket: GeneratedNemotronPersonaPacket = {
  metadata,
  personas: fixtureRecords.flatMap((record) => expandNemotronRecord(record).map((entry) => toPersonaSeed(entry, metadata))),
};
