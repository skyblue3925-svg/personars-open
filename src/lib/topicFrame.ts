import type { ConcreteScene, TopicCategory, TopicFrame } from '../types/research';
import {
  BOUNDARY_RULES,
  CLIMATE_ANXIETY_TERMS,
  DIGITAL_ACCESS_TERMS,
  EDUCATION_SUPPORT_TERMS,
  GROUP_RULES,
  PLACE_RULES,
  PRESSURE_RULES,
  REGIONAL_ACCESS_TERMS,
  SCHOOL_MEAL_TERMS,
  SMARTPHONE_SLEEP_TERMS,
  TENSION_RULES,
  YOUTH_WORK_TERMS,
  type FrameRule,
  matchesAny,
  unique,
} from './topicFrameRules';

export function classifyTopic(topic: string): TopicCategory {
  const normalized = topic.toLowerCase();
  const hasAppearance = ['외모', '외모지상주의', '체형', '미용', '꾸밈', '이미지'].some((term) => normalized.includes(term));
  const hasMedia = ['미디어', 'sns', '소셜', '인스타', '틱톡', '유튜브', '온라인', '광고'].some((term) => normalized.includes(term));
  if (hasAppearance && hasMedia) return 'media-body-image';

  const hasSmartphone = ['스마트폰', '휴대폰', '핸드폰', '알림'].some((term) => normalized.includes(term));
  const hasSleep = ['수면', '잠', '취침'].some((term) => normalized.includes(term));
  if (hasSmartphone && hasSleep) return 'smartphone-sleep';
  if (matchesAny(topic, SCHOOL_MEAL_TERMS)) return 'school-meal';
  if (matchesAny(topic, YOUTH_WORK_TERMS)) return 'youth-work';
  if (matchesAny(topic, CLIMATE_ANXIETY_TERMS)) return 'climate-anxiety';
  if (matchesAny(topic, REGIONAL_ACCESS_TERMS)) return 'regional-access';
  if (matchesAny(topic, EDUCATION_SUPPORT_TERMS)) return 'education-support';
  if (matchesAny(topic, DIGITAL_ACCESS_TERMS)) return 'digital-access';
  return 'general';
}

export function analyzeTopicFrame(topic: string): TopicFrame {
  const category = classifyTopic(topic);
  const affectedGroups = unique([
    ...extractMatches(topic, GROUP_RULES),
    ...defaultGroups(category),
    ...inferGroupsFromTopic(topic),
  ]);
  const places = unique([...extractMatches(topic, PLACE_RULES), ...defaultPlaces(category)]);
  const pressures = unique([...extractMatches(topic, PRESSURE_RULES), ...defaultPressures(category)]);
  const tensionAxes = unique([...extractMatches(topic, TENSION_RULES), ...defaultTensions(category)]);
  const boundaries = unique([...extractMatches(topic, BOUNDARY_RULES), ...defaultBoundaries(category)]);
  const safeGroups = affectedGroups.length ? affectedGroups : ['당사자'];
  const safePlaces = places.length ? places : ['일상 공간'];
  const safePressures = pressures.length ? pressures : ['생활 압박'];
  const safeTensions = tensionAxes.length ? tensionAxes : ['개인 경험/사회적 조건'];

  return {
    category,
    topic,
    affectedGroups: safeGroups,
    places: safePlaces,
    pressures: safePressures,
    tensionAxes: safeTensions,
    boundaries,
    sceneSeed: buildFrameSceneSeed(topic, safeGroups, safePlaces, safePressures, safeTensions, category),
  };
}

function extractMatches(topic: string, rules: FrameRule[]): string[] {
  return rules.flatMap((rule) => (matchesAny(topic, rule.terms) ? rule.values : []));
}

function inferGroupsFromTopic(topic: string): string[] {
  const groups: string[] = [];
  if (topic.includes('청소년') || topic.includes('학생')) groups.push('청소년');
  if (topic.includes('청년')) groups.push('청년');
  if (topic.includes('노인') || topic.includes('고령')) groups.push('노년층');
  if (topic.includes('부모') || topic.includes('학부모') || topic.includes('가족')) groups.push('가족');
  return groups;
}

function defaultGroups(category: TopicCategory): string[] {
  if (category === 'school-meal' || category === 'smartphone-sleep' || category === 'youth-work') return ['학생'];
  if (category === 'climate-anxiety') return ['청소년'];
  if (category === 'media-body-image') return ['청소년'];
  return [];
}

function defaultPlaces(category: TopicCategory): string[] {
  if (category === 'smartphone-sleep') return ['집', '온라인 공간'];
  if (category === 'school-meal') return ['학교'];
  if (category === 'youth-work') return ['일터', '집'];
  if (category === 'climate-anxiety') return ['학교', '온라인 공간'];
  if (category === 'regional-access') return ['지역사회', '통학길'];
  if (category === 'education-support') return ['학교'];
  if (category === 'digital-access') return ['온라인 공간'];
  if (category === 'media-body-image') return ['온라인 공간', '학교', '가정'];
  return [];
}

function defaultPressures(category: TopicCategory): string[] {
  if (category === 'smartphone-sleep') return ['건강', '관계 안전'];
  if (category === 'school-meal') return ['건강', '학업'];
  if (category === 'youth-work') return ['돈', '시간', '학업'];
  if (category === 'climate-anxiety') return ['미래', '건강'];
  if (category === 'regional-access') return ['접근성', '시간'];
  if (category === 'education-support') return ['학업', '미래'];
  if (category === 'digital-access') return ['접근성', '소외'];
  if (category === 'media-body-image') return ['외모 평가', '관계 안전', '자기 이미지'];
  return [];
}

function defaultTensions(category: TopicCategory): string[] {
  if (category === 'smartphone-sleep') return ['편리함/위험'];
  if (category === 'school-meal') return ['개인 선호/학교 조건'];
  if (category === 'youth-work') return ['당장 버티기/미래 준비'];
  if (category === 'climate-anxiety') return ['개인 실천/구조 변화'];
  if (category === 'regional-access') return ['개인 노력/지역 조건'];
  if (category === 'education-support') return ['개인 노력/제도 지원'];
  if (category === 'digital-access') return ['편리함/위험'];
  if (category === 'media-body-image') return ['자기표현/평가 불안', '또래 관계/자기 존중감'];
  return [];
}

function defaultBoundaries(category: TopicCategory): string[] {
  if (category === 'school-meal') return ['전문적인 영양 판정이나 학교 급식 예산의 실제 내역'];
  if (category === 'youth-work') return ['개별 사업장의 노동법 위반 여부나 실제 임금 체불 사실 단정'];
  if (category === 'climate-anxiety') return ['기후 과학의 실제 예측 수치나 국제 정책 효과 단정'];
  if (category === 'media-body-image') return ['개인의 외모, 심리 상태, 섭식 문제를 실제로 진단하거나 특정 학생의 경험으로 단정할 수 없음'];
  return [];
}

function buildFrameSceneSeed(
  topic: string,
  groups: string[],
  places: string[],
  pressures: string[],
  tensions: string[],
  category: TopicCategory,
): Omit<ConcreteScene, 'id' | 'people'> {
  if (category === 'media-body-image') {
    return {
      setting: '온라인 미디어를 본 뒤 학교나 집에서 외모 이야기가 오가는 시간',
      action: `${groups[0]}이 ${topic} 때문에 사진, 영상, 댓글, 또래 반응을 의식하게 된다`,
      pressure: pressures.join(', '),
      feeling: `${tensions[0]} 사이에서 스스로를 비교하게 되는 감정`,
      consequence: '미디어를 보는 일이 단순한 취향이 아니라 관계와 자기 이미지 문제로 이어진다',
      quoteSeed: '그냥 넘기려고 해도 비교하게 되는 순간이 있어요.',
    };
  }

  const setting = `${places[0]}에서 ${groups[0]}이 ${topic}을 직접 체감하는 시간`;
  const pressure = pressures.join(', ');
  const feeling = `${tensions[0]} 사이에서 쉽게 단정하지 못하는 감정`;

  if (category === 'general') {
    return {
      setting,
      action: `${topic} 때문에 ${groups[0]}의 일상 선택과 주변 관계를 다시 생각하게 된다`,
      pressure,
      feeling,
      consequence: `${topic}을 개인 태도만이 아니라 생활 조건과 사회적 압박의 문제로 보게 된다`,
      quoteSeed: `${topic}은 제 생활에서 ${pressure} 문제로 먼저 다가와요.`,
    };
  }

  return {
    setting,
    action: `${topic}이 ${places[0]}의 반복되는 생활 장면 안에서 드러난다`,
    pressure,
    feeling,
    consequence: `${topic}을 하나의 정답보다 조건에 따라 달라지는 경험으로 말하게 된다`,
    quoteSeed: `${topic}을 생각하면 ${places[0]}에서 느낀 ${pressure}이 먼저 떠올라요.`,
  };
}
