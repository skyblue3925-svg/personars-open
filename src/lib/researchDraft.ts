import type { ResearchDraft } from '../types/research';

export function createResearchDraft(topic: string): ResearchDraft {
  const normalizedTopic = topic.trim() || '생활 경험과 관점 탐색';
  const targetGroup = inferTargetGroup(normalizedTopic);

  return {
    topic: normalizedTopic,
    title: `${normalizedTopic} 질적 인터뷰 활동`,
    question: `${normalizedTopic}에 대해 ${targetGroup}과 관련된 사람들은 어떤 경험, 감정, 조건, 관점 차이를 말하는가?`,
    hypothesis: '질적 인터뷰에서는 결론 확정보다 경험, 맥락, 의미의 차이를 탐색합니다.',
    targetGroup: `${targetGroup} 및 주제와 관련된 다양한 이해관계자`,
  };
}

function inferTargetGroup(topic: string): string {
  if (topic.includes('청소년') || topic.includes('학생') || topic.includes('학교') || topic.includes('입시') || topic.includes('급식')) {
    return '청소년';
  }
  if (topic.includes('청년') || topic.includes('대학생') || topic.includes('취업') || topic.includes('주거')) return '청년';
  if (topic.includes('노인') || topic.includes('고령') || topic.includes('돌봄')) return '노년층';
  if (topic.includes('학부모') || topic.includes('부모') || topic.includes('가족')) return '가족과 보호자';
  if (topic.includes('노동') || topic.includes('근무') || topic.includes('아르바이트')) return '노동 경험이 있는 사람들';
  if (topic.includes('지역') || topic.includes('교통') || topic.includes('의료')) return '지역 주민';
  return '관련 당사자';
}
