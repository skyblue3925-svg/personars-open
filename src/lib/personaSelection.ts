import type { InterviewCharacter, PersonaSeed, ResearchDraft, TopicRelevance } from '../types/research';
import { buildInterviewCharacter } from './interviewCharacter';

export type PersonaAgeFilter = 'all' | '청소년' | '청년' | '중장년' | '노년';
export type PersonaRoleFilter = 'all' | '당사자' | '가족/보호자' | '현장 종사자' | '제도/기관 관찰자';
export type MultiFilterValue<T extends string> = T | T[] | undefined;

export type PersonaCandidate = {
  persona: PersonaSeed;
  character: InterviewCharacter;
  score: number;
  tags: string[];
  role: PersonaRoleFilter;
};

export type PersonaCandidateFilters = {
  age: MultiFilterValue<PersonaAgeFilter>;
  relevance: MultiFilterValue<TopicRelevance | 'all'>;
  role: MultiFilterValue<PersonaRoleFilter>;
  sex?: MultiFilterValue<string>;
  province?: MultiFilterValue<string>;
  occupationKeyword?: string;
  educationLevel?: MultiFilterValue<string>;
  familyType?: MultiFilterValue<string>;
  personaType?: MultiFilterValue<string>;
};

export function buildPersonaCandidates(draft: ResearchDraft, personas: PersonaSeed[]): PersonaCandidate[] {
  return personas
    .map((persona) => {
      const character = buildInterviewCharacter(draft, persona);
      const score = relevanceWeight(character.relevance) + ageTopicWeight(draft.topic, persona) + roleWeight(persona);
      const ageTag = ageFilterFor(persona);
      const role = roleFilterFor(persona);
      const stakeholderTag = stakeholderTagFor(draft.topic, persona);
      const contextTag = regionalContextTagFor(persona);

      return {
        persona,
        character,
        score,
        role,
        tags: [relevanceLabel(character.relevance), ageTag, role, contextTag, stakeholderTag].filter(
          (tag): tag is string => Boolean(tag && tag !== 'all'),
        ),
      };
    })
    .sort((a, b) => b.score - a.score || a.persona.id.localeCompare(b.persona.id));
}

export function filterPersonaCandidates(candidates: PersonaCandidate[], filters: PersonaCandidateFilters): PersonaCandidate[] {
  return candidates.filter((candidate) => {
    const source = candidate.persona.source;
    const ageMatches = matchesSelected(candidate.tags, filters.age);
    const relevanceMatches = matchesSelected(candidate.character.relevance, filters.relevance);
    const roleMatches = matchesSelected(candidate.role, filters.role);
    const sexMatches = matchesSelected(normalizeSex(source?.sex), filters.sex, normalizeSex);
    const provinceMatches = matchesProvince(source?.province, candidate.persona.region, filters.province);
    const occupationMatches = !filters.occupationKeyword || candidate.persona.occupation.includes(filters.occupationKeyword);
    const educationMatches = matchesSelected(source?.educationLevel, filters.educationLevel);
    const familyMatches = matchesSelected(source?.familyType, filters.familyType);
    const personaTypeMatches = matchesSelected(source?.personaType, filters.personaType);

    return (
      ageMatches &&
      relevanceMatches &&
      roleMatches &&
      sexMatches &&
      provinceMatches &&
      occupationMatches &&
      educationMatches &&
      familyMatches &&
      personaTypeMatches
    );
  });
}

export function selectInterviewPersonas(personas: PersonaSeed[], selectedIds: string[]): PersonaSeed[] {
  const byId = new Map(personas.map((persona) => [persona.id, persona]));
  return selectedIds.map((id) => byId.get(id)).filter((persona): persona is PersonaSeed => Boolean(persona));
}

export function relevanceLabel(relevance: TopicRelevance): string {
  if (relevance === 'direct') return '직접 관련';
  if (relevance === 'adjacent') return '주변 관련';
  return '제한적 관련';
}

function relevanceWeight(relevance: TopicRelevance): number {
  if (relevance === 'direct') return 30;
  if (relevance === 'adjacent') return 15;
  return 4;
}

function ageFilterFor(persona: PersonaSeed): PersonaAgeFilter {
  const age = persona.source?.age;
  if (typeof age === 'number') {
    if (age < 20) return '청소년';
    if (age < 40) return '청년';
    if (age < 60) return '중장년';
    return '노년';
  }
  if (persona.ageGroup.includes('10')) return '청소년';
  if (persona.ageGroup.includes('20') || persona.ageGroup.includes('30')) return '청년';
  if (persona.ageGroup.includes('40') || persona.ageGroup.includes('50')) return '중장년';
  if (persona.ageGroup.includes('60') || persona.ageGroup.includes('70')) return '노년';
  return 'all';
}

function roleFilterFor(persona: PersonaSeed): PersonaRoleFilter {
  const source = persona.source;
  if (typeof source?.age === 'number' && source.age < 20) return '당사자';
  if (source?.personaType === 'family_persona') return '가족/보호자';
  if (source?.occupation && /(공무|기관|정책|행정)/.test(source.occupation)) return '제도/기관 관찰자';
  if (source?.occupation && /(교사|상담|복지|활동|간호|의료|코치)/.test(source.occupation)) return '현장 종사자';

  const text = `${persona.label} ${persona.occupation} ${persona.background} ${persona.perspective}`;
  if (text.includes('부모') || text.includes('보호자') || text.includes('가족')) return '가족/보호자';
  if (text.includes('공무') || text.includes('기관') || text.includes('공공') || text.includes('정책') || text.includes('행정')) {
    return '제도/기관 관찰자';
  }
  if (text.includes('교사') || text.includes('복지') || text.includes('활동가') || text.includes('상담') || text.includes('의료')) {
    return '현장 종사자';
  }
  return '당사자';
}

function ageTopicWeight(topic: string, persona: PersonaSeed): number {
  const age = ageFilterFor(persona);
  if ((topic.includes('청소년') || topic.includes('학생') || topic.includes('급식') || topic.includes('입시')) && age === '청소년') {
    return 8;
  }
  if ((topic.includes('청년') || topic.includes('취업') || topic.includes('주거')) && age === '청년') return 8;
  if ((topic.includes('노인') || topic.includes('돌봄') || topic.includes('의료')) && age === '노년') return 8;
  return 0;
}

function stakeholderTagFor(topic: string, persona: PersonaSeed): string | null {
  const isYouthTopic = /청소년|학생|학교/.test(topic);
  if (!isYouthTopic) return null;
  const age = persona.source?.age;
  if (typeof age === 'number' && age >= 19) return '관련 어른';
  if (persona.ageGroup.includes('10')) return '청소년 당사자';
  return null;
}

function roleWeight(persona: PersonaSeed): number {
  const role = roleFilterFor(persona);
  if (role === '당사자') return 3;
  if (role === '현장 종사자' || role === '제도/기관 관찰자') return 2;
  return 1;
}

function regionalContextTagFor(persona: PersonaSeed): string | null {
  const text = `${persona.region} ${persona.background} ${persona.perspective}`;
  if (persona.source?.province && persona.source.province !== '서울특별시') return '지역 생활';
  if (persona.region !== '수도권') return '지역 생활';
  if (text.includes('지역') || text.includes('주민') || text.includes('자영')) return '지역 생활';
  return null;
}

function normalizeSex(value?: string): string {
  if (value === '여자') return '여성';
  if (value === '남자') return '남성';
  return value ?? '';
}

function matchesSelected<T extends string>(
  actual: T | T[] | string | undefined,
  requested: MultiFilterValue<string>,
  normalize: (value: string | undefined) => string = (value) => value ?? '',
): boolean {
  const values = selectedValues(requested).map((value) => normalize(value));
  if (values.length === 0) return true;
  const actualValues = Array.isArray(actual) ? actual : actual === undefined ? [] : [actual];
  return actualValues.some((item) => values.includes(normalize(item)));
}

function matchesProvince(sourceProvince: string | undefined, region: string, requested: MultiFilterValue<string>): boolean {
  const values = selectedValues(requested);
  if (values.length === 0) return true;
  return values.some((value) => sourceProvince === value || region.includes(value));
}

function selectedValues(value: MultiFilterValue<string>): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map((item) => item.trim()).filter((item) => item && item !== 'all');
}
