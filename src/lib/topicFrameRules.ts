import type { TopicCategory } from '../types/research';

export type FrameRule = {
  terms: string[];
  values: string[];
};

export const SMARTPHONE_SLEEP_TERMS = ['스마트폰', '휴대폰', '핸드폰', '알림', '수면', '잠', '취침'];
export const SCHOOL_MEAL_TERMS = ['급식', '점심', '식사', '배식', '영양', '식단', '집중력'];
export const YOUTH_WORK_TERMS = ['아르바이트', '알바', '근무', '노동', '임금', '학업 스트레스'];
export const CLIMATE_ANXIETY_TERMS = ['기후', '환경', '불안', '미래', '재난', '폭염'];
export const REGIONAL_ACCESS_TERMS = ['지역', '격차', '교통', '수도권', '지방', '접근성'];
export const EDUCATION_SUPPORT_TERMS = ['학교', '학업', '교육', '멘토', '진로', '학생'];
export const DIGITAL_ACCESS_TERMS = ['온라인', '디지털', '데이터', 'AI', '기술', '서비스'];

export const GROUP_RULES: FrameRule[] = [
  { terms: ['청소년', '학생', '학교', '급식', '학교폭력'], values: ['학생'] },
  { terms: ['청년', '취업', '구직', '주거'], values: ['청년'] },
  { terms: ['노인', '고령', '은퇴'], values: ['노인'] },
  { terms: ['가족', '돌봄', '부양'], values: ['가족'] },
  { terms: ['학부모', '자녀'], values: ['학부모'] },
  { terms: ['노동', '근무', '아르바이트', '알바'], values: ['노동자'] },
  { terms: ['지역', '주민', '교통'], values: ['지역 주민'] },
];

export const PLACE_RULES: FrameRule[] = [
  { terms: ['학교', '급식', '수업', '학업', '학교폭력'], values: ['학교'] },
  { terms: ['집', '주거', '가족', '돌봄', '수면'], values: ['집'] },
  { terms: ['통학', '교통', '지역'], values: ['통학길', '지역사회'] },
  { terms: ['온라인', '스마트폰', '디지털', '혐오'], values: ['온라인 공간'] },
  { terms: ['노동', '근무', '아르바이트', '알바'], values: ['일터'] },
  { terms: ['돌봄', '복지', '의료'], values: ['돌봄 현장'] },
];

export const PRESSURE_RULES: FrameRule[] = [
  { terms: ['돈', '비용', '주거', '임금', '취업', '생활비'], values: ['돈'] },
  { terms: ['시간', '통학', '근무', '돌봄'], values: ['시간'] },
  { terms: ['친구', '관계', '학교폭력', '신고', '혐오'], values: ['관계 안전'] },
  { terms: ['안전', '폭력', '위험', '범죄'], values: ['안전'] },
  { terms: ['낙인', '차별', '혐오', '장애', '이주'], values: ['낙인'] },
  { terms: ['접근성', '교통', '지역', '장애', '디지털'], values: ['접근성'] },
  { terms: ['학업', '입시', '집중력', '진로'], values: ['학업'] },
  { terms: ['미래', '기후', '취업'], values: ['미래'] },
  { terms: ['건강', '수면', '돌봄', '의료', '정신건강'], values: ['건강'] },
];

export const TENSION_RULES: FrameRule[] = [
  { terms: ['학교폭력', '신고', '목격'], values: ['침묵/신고'] },
  { terms: ['주거', '취업', '돈'], values: ['당장 버티기/미래 준비'] },
  { terms: ['돌봄', '가족'], values: ['가족 책임/사회 지원'] },
  { terms: ['기후', '미래'], values: ['개인 실천/구조 변화'] },
  { terms: ['디지털', '스마트폰', '온라인'], values: ['편리함/위험'] },
  { terms: ['규제', '자유'], values: ['자유/규제'] },
  { terms: ['비용', '정책'], values: ['비용/효과'] },
];

export const BOUNDARY_RULES: FrameRule[] = [
  { terms: ['학교폭력', '폭력', '신고'], values: ['가해자나 피해자를 실제 사건처럼 특정하거나 법적 판단을 단정할 수 없음'] },
  { terms: ['주거', '부동산', '임대료'], values: ['실제 부동산 가격, 계약 법률 판단, 특정 지역 시세를 단정할 수 없음'] },
  { terms: ['돌봄', '노인', '의료', '건강'], values: ['의학적 진단, 돌봄 등급, 가족의 실제 책임 소재를 단정할 수 없음'] },
  { terms: ['노동', '아르바이트', '임금'], values: ['노동법 위반 여부나 실제 임금 체불 사실을 단정할 수 없음'] },
  { terms: ['정신건강', '우울', '불안'], values: ['의학적 진단이나 치료 필요 여부를 판단할 수 없음'] },
  { terms: ['기후'], values: ['기후 과학 수치나 국제 정책 효과를 단정할 수 없음'] },
];

export function categoryTerms(category: TopicCategory): string[] {
  if (category === 'smartphone-sleep') return SMARTPHONE_SLEEP_TERMS;
  if (category === 'school-meal') return SCHOOL_MEAL_TERMS;
  if (category === 'youth-work') return YOUTH_WORK_TERMS;
  if (category === 'climate-anxiety') return CLIMATE_ANXIETY_TERMS;
  if (category === 'regional-access') return REGIONAL_ACCESS_TERMS;
  if (category === 'education-support') return EDUCATION_SUPPORT_TERMS;
  if (category === 'digital-access') return DIGITAL_ACCESS_TERMS;
  if (category === 'media-body-image') return ['외모', '외모지상주의', '미디어', 'sns', '온라인', '이미지', '평가'];
  return [];
}

export function matchesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.toLowerCase().includes(term.toLowerCase()));
}

export function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
