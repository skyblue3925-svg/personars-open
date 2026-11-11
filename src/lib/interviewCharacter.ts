import type { InterviewCharacter, PersonaSeed, ResearchDraft, TopicFrame, TopicRelevance } from '../types/research';
import { assessPersonaRelevance, scorePersonaRelevance } from './characterRelevance';
import { buildConcreteScenes } from './sceneBank';
import { analyzeTopicFrame, classifyTopic } from './topicFrame';
import { unique } from './topicFrameRules';

export { analyzeTopicFrame, classifyTopic, scorePersonaRelevance };

export function buildInterviewCharacter(draft: ResearchDraft, persona: PersonaSeed): InterviewCharacter {
  const topicFrame = analyzeTopicFrame(draft.topic);
  const relevance = assessPersonaRelevance(topicFrame, persona);
  const concreteScenes = buildConcreteScenes(draft, persona, topicFrame);

  return {
    persona,
    topicCategory: topicFrame.category,
    topicFrame,
    relevance,
    lifeContext: `${persona.background} ${persona.perspective} ${persona.voice}로 자신의 생활 조건을 설명한다.`,
    canSpeakTo: buildCanSpeakTo(draft, persona, topicFrame, relevance),
    cannotSpeakTo: buildCannotSpeakTo(draft, persona, topicFrame, relevance),
    concreteScenes,
    recurringTensions: unique([...topicFrame.tensionAxes, ...persona.tensions, ...persona.concerns]).slice(0, 4),
    usedSceneIds: [],
  };
}

function buildCanSpeakTo(draft: ResearchDraft, persona: PersonaSeed, frame: TopicFrame, relevance: TopicRelevance): string[] {
  const base = [
    buildScopeSummary(frame),
    `${persona.region} ${persona.occupation}의 생활 리듬에서 ${draft.topic}이 어떻게 느껴지는지`,
    `${persona.concerns[0]}이 면접 답변에 어떤 영향을 주는지`,
    `${frame.tensionAxes[0] ?? persona.tensions[0]}라는 반복 긴장`,
  ];

  if (frame.category === 'smartphone-sleep') {
    base.unshift('밤 시간 스마트폰 사용, 알림 확인, 수면 부족이 일상에 남기는 영향');
  }
  if (frame.category === 'school-meal') {
    base.unshift('점심 급식 경험, 식사 만족도, 오후 수업 집중력 사이의 생활감');
  }
  if (frame.category === 'youth-work') {
    base.unshift('청소년 아르바이트나 주변 근무 경험이 학업 스트레스와 시간 압박에 연결되는 방식');
  }
  if (frame.category === 'climate-anxiety') {
    base.unshift('기후 문제를 접할 때 생기는 미래 불안과 학교생활 속 대화 분위기');
  }
  if (relevance !== 'direct') {
    base.push('직접 당사자라기보다 주변에서 관찰하거나 제한적으로 겪은 범위');
  }

  return unique(base);
}

function buildScopeSummary(frame: TopicFrame): string {
  return `${joinNatural(frame.places)}에서 ${joinNatural(frame.affectedGroups)}와 관련해 나타나는 ${joinNatural(frame.pressures)}`;
}

function joinNatural(values: string[]): string {
  return values.filter(Boolean).join(', ');
}

function buildCannotSpeakTo(draft: ResearchDraft, persona: PersonaSeed, frame: TopicFrame, relevance: TopicRelevance): string[] {
  const limits = [
    ...frame.boundaries,
    `${draft.topic}에 대한 전체 집단의 실제 통계나 대표 의견`,
    '인물 설정 자료에 없는 기관명, 뉴스, 정책 효과, 날짜가 있는 사건',
    `${persona.label} 밖의 사람을 실제로 인터뷰한 것처럼 단정하는 말`,
  ];

  if (relevance === 'limited') {
    limits.unshift('직접 경험이 약한 세부 생활 장면');
  }

  return unique(limits);
}
