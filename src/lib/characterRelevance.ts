import type { PersonaSeed, TopicFrame, TopicRelevance } from '../types/research';
import { DIGITAL_ACCESS_TERMS, categoryTerms, matchesAny } from './topicFrameRules';

export function scorePersonaRelevance(
  frame: TopicFrame,
  persona: PersonaSeed,
): { score: number; level: TopicRelevance; reasons: string[] } {
  const profileText = [
    persona.label,
    persona.ageGroup,
    persona.region,
    persona.occupation,
    persona.background,
    persona.perspective,
    ...persona.livedExperiences,
    ...persona.concerns,
    ...persona.tensions,
  ].join(' ');
  const reasons: string[] = [];
  let score = 0;

  const groupScore = scoreGroupOverlap(frame.affectedGroups, persona);
  if (groupScore > 0) {
    score += groupScore;
    reasons.push(`집단 겹침: ${frame.affectedGroups.join(', ')}`);
  }

  const placeMatches = frame.places.filter((place) => profileText.includes(place) || placeMatchesPersona(place, persona));
  if (placeMatches.length > 0) {
    score += 2;
    reasons.push(`생활 장소 겹침: ${placeMatches.join(', ')}`);
  }

  const pressureMatches = frame.pressures.filter((pressure) => pressureMatchesPersona(pressure, profileText));
  if (pressureMatches.length > 0) {
    score += 2;
    reasons.push(`압박 겹침: ${pressureMatches.join(', ')}`);
  }

  if (frame.tensionAxes.some((axis) => profileText.includes(axis.split('/')[0]) || profileText.includes(axis.split('/')[1] ?? ''))) {
    score += 1;
    reasons.push(`갈등 축 관찰 가능: ${frame.tensionAxes.join(', ')}`);
  }

  const level: TopicRelevance = score >= 5 ? 'direct' : score >= 2 ? 'adjacent' : 'limited';
  return { score, level, reasons: reasons.length ? reasons : ['직접 겹침이 적어 제한적 관찰자에 가까움'] };
}

export function assessPersonaRelevance(frame: TopicFrame, persona: PersonaSeed): TopicRelevance {
  const topicCategory = frame.category;
  const isStudent = persona.ageGroup.includes('10대') || persona.occupation.includes('학생');
  const isYouth = isStudent || persona.ageGroup.includes('20대') || persona.occupation.includes('구직자');
  const isOlder = persona.ageGroup.includes('60대') || persona.ageGroup.includes('70대') || persona.occupation.includes('은퇴');

  if (topicCategory === 'smartphone-sleep' && isStudent) return 'direct';
  if ((topicCategory === 'school-meal' || topicCategory === 'youth-work') && isStudent) return 'direct';
  if (topicCategory === 'climate-anxiety' && (isStudent || persona.ageGroup.includes('20대'))) return 'adjacent';
  if (topicCategory === 'regional-access' && (persona.region !== '수도권' || persona.perspective.includes('격차'))) return 'direct';
  if (topicCategory === 'education-support' && (isStudent || persona.occupation.includes('교사') || persona.occupation.includes('대학생'))) {
    return 'direct';
  }
  if (topicCategory === 'digital-access' && matchesAny(persona.background + persona.perspective, DIGITAL_ACCESS_TERMS)) return 'direct';
  if (topicCategory === 'media-body-image' && (isStudent || persona.label.includes('학부모') || persona.background.includes('자녀'))) return 'direct';
  if (frame.affectedGroups.includes('학생') && isStudent) return 'direct';
  if ((frame.affectedGroups.includes('청소년') || frame.affectedGroups.includes('청년')) && isYouth) return 'direct';
  if (frame.affectedGroups.includes('노인') && isOlder) return 'direct';
  if (frame.affectedGroups.includes('학부모') && persona.label.includes('학부모')) return 'direct';
  if (frame.affectedGroups.includes('가족') && (persona.background.includes('가족') || persona.background.includes('자녀'))) return 'direct';

  const scored = scorePersonaRelevance(frame, persona);
  if (scored.score >= 2) return scored.level;
  if (topicCategory === 'general') return 'adjacent';
  return matchesAny(persona.background + persona.perspective + persona.livedExperiences.join(' '), categoryTerms(topicCategory)) ? 'adjacent' : 'limited';
}

function scoreGroupOverlap(groups: string[], persona: PersonaSeed): number {
  const isStudent = persona.ageGroup.includes('10대') || persona.occupation.includes('학생');
  const isYouth = isStudent || persona.ageGroup.includes('20대') || persona.occupation.includes('구직자');
  const isOlder = persona.ageGroup.includes('60대') || persona.ageGroup.includes('70대') || persona.occupation.includes('은퇴');
  let score = 0;

  if (groups.includes('학생') && isStudent) score += 3;
  if ((groups.includes('청소년') || groups.includes('청년')) && isYouth) score += 3;
  if (groups.includes('노인') && isOlder) score += 3;
  if (groups.includes('학부모') && persona.label.includes('학부모')) score += 3;
  if (groups.includes('가족') && (persona.background.includes('가족') || persona.background.includes('자녀') || persona.label.includes('학부모'))) score += 2;
  if (groups.includes('노동자') && (persona.occupation.includes('회사원') || persona.occupation.includes('구직자') || persona.occupation.includes('자영업'))) score += 2;
  if (groups.includes('지역 주민') && persona.region !== '수도권') score += 2;

  return score;
}

function placeMatchesPersona(place: string, persona: PersonaSeed): boolean {
  if (place === '학교') return persona.occupation.includes('학생') || persona.occupation.includes('교사') || persona.background.includes('학교');
  if (place === '집') return persona.background.includes('가정') || persona.background.includes('가족') || persona.background.includes('자녀') || persona.occupation.includes('학생');
  if (place === '온라인 공간') return persona.background.includes('온라인') || persona.background.includes('커뮤니티') || persona.occupation.includes('개발자');
  if (place === '통학길') return persona.background.includes('통학') || persona.livedExperiences.some((item) => item.includes('통학') || item.includes('이동'));
  if (place === '지역사회') return persona.perspective.includes('지역') || persona.background.includes('지역') || persona.region !== '수도권';
  if (place === '일터') return !persona.occupation.includes('학생') && !persona.occupation.includes('은퇴');
  if (place === '돌봄 현장') return persona.occupation.includes('복지') || persona.background.includes('돌봄') || persona.background.includes('가족');
  return false;
}

function pressureMatchesPersona(pressure: string, profileText: string): boolean {
  const termsByPressure: Record<string, string[]> = {
    돈: ['생활비', '비용', '매출', '구직', '임금', '취업'],
    시간: ['시간', '통학', '근무', '퇴근', '농번기'],
    '관계 안전': ['친구', '관계', '공동체', '상담'],
    안전: ['안전', '위험', '보호'],
    낙인: ['낙인', '차별', '소외'],
    접근성: ['접근성', '이동', '온라인', '지역', '교통'],
    학업: ['학업', '학교', '시험', '과제', '수업', '진로'],
    미래: ['미래', '진로', '취업', '장기'],
    건강: ['수면', '건강', '의료', '돌봄', '피로'],
  };

  return (termsByPressure[pressure] ?? [pressure]).some((term) => profileText.includes(term));
}
