import type { InterviewTurn } from '../types/research';

export type InterviewFlowAxisId = 'lifeScene' | 'emotionTension' | 'relationship' | 'conditionConstraint' | 'unknownBoundary';

export type InterviewFlowAxisState = 'empty' | 'started' | 'enough';

export type InterviewFlowAxisDefinition = {
  id: InterviewFlowAxisId;
  label: string;
  description: string;
  recommendation: string;
};

export type InterviewFlowAxisSummary = InterviewFlowAxisDefinition & {
  confirmedCount: number;
  inferredCount: number;
  state: InterviewFlowAxisState;
  isInferredOnly: boolean;
  latestQuestion?: string;
};

export type InterviewFlowMap = {
  axes: InterviewFlowAxisSummary[];
  recommendation: {
    axisId: InterviewFlowAxisId;
    text: string;
  };
  hasMappedTurns: boolean;
};

export const INTERVIEW_FLOW_AXES: InterviewFlowAxisDefinition[] = [
  {
    id: 'lifeScene',
    label: '생활 장면',
    description: '장소, 시간, 행동, 사건을 구체화한 질문',
    recommendation: '다음에는 생활 장면을 물어보면 좋습니다. 실제 장소, 시간, 행동으로 좁혀보세요.',
  },
  {
    id: 'emotionTension',
    label: '감정/긴장',
    description: '불편함, 압박, 갈등, 망설임을 확인한 질문',
    recommendation: '다음에는 감정이나 긴장을 물어보면 좋습니다. 가장 부담스러웠던 지점을 확인해보세요.',
  },
  {
    id: 'relationship',
    label: '관계',
    description: '친구, 가족, 교사 등 주변 사람의 영향을 확인한 질문',
    recommendation: '다음에는 관계 축을 물어보면 좋습니다. 주변 사람의 반응이나 영향으로 좁혀보세요.',
  },
  {
    id: 'conditionConstraint',
    label: '조건/제약',
    description: '선택을 어렵게 만든 조건, 규칙, 자원, 압력을 확인한 질문',
    recommendation: '다음에는 조건/제약을 확인해보세요. 왜 그렇게 할 수밖에 없었는지 물어보면 좋습니다.',
  },
  {
    id: 'unknownBoundary',
    label: '모르는 범위',
    description: '직접 경험한 것과 추측을 구분한 질문',
    recommendation: '모르는 범위를 확인하면 답변의 신뢰 경계를 세울 수 있습니다.',
  },
];

const AXIS_ORDER = INTERVIEW_FLOW_AXES.map((axis) => axis.id);

export function buildInterviewFlowMap(turns: InterviewTurn[]): InterviewFlowMap {
  const summaries = INTERVIEW_FLOW_AXES.map<InterviewFlowAxisSummary>((axis) => ({
    ...axis,
    confirmedCount: 0,
    inferredCount: 0,
    state: 'empty',
    isInferredOnly: false,
  }));
  const byId = new Map(summaries.map((axis) => [axis.id, axis]));

  for (const turn of turns) {
    const confirmed = turn.coach?.coverage ? coverageIds(turn.coach.coverage) : [];
    const inferred = confirmed.length > 0 ? [] : inferCoverageFromQuestion(turn.question);

    for (const axisId of confirmed) {
      const axis = byId.get(axisId);
      if (!axis) continue;
      axis.confirmedCount += 1;
      axis.latestQuestion = turn.question;
    }

    for (const axisId of inferred) {
      const axis = byId.get(axisId);
      if (!axis) continue;
      axis.inferredCount += 1;
      axis.latestQuestion = turn.question;
    }
  }

  for (const axis of summaries) {
    axis.state = axis.confirmedCount >= 2 ? 'enough' : axis.confirmedCount > 0 || axis.inferredCount > 0 ? 'started' : 'empty';
    axis.isInferredOnly = axis.confirmedCount === 0 && axis.inferredCount > 0;
  }

  const recommendedAxis = selectRecommendationAxis(summaries);
  return {
    axes: summaries,
    recommendation: {
      axisId: recommendedAxis.id,
      text: recommendedAxis.state === 'enough' ? '모든 축이 충분히 탐색되었습니다. 새 축을 채우기보다 현재 답변에서 더 깊게 파고들어 보세요.' : recommendedAxis.recommendation,
    },
    hasMappedTurns: summaries.some((axis) => axis.confirmedCount > 0 || axis.inferredCount > 0),
  };
}

function coverageIds(coverage: InterviewTurn['coach'] extends infer Coach ? Coach extends { coverage: infer Coverage } ? Coverage : never : never): InterviewFlowAxisId[] {
  const result: InterviewFlowAxisId[] = [];
  for (const axisId of AXIS_ORDER) {
    if (coverage?.[axisId]) result.push(axisId);
  }
  return result;
}

function inferCoverageFromQuestion(question: string): InterviewFlowAxisId[] {
  const normalized = question.toLowerCase();
  const axes = new Set<InterviewFlowAxisId>();

  if (hasAny(normalized, ['언제', '어디', '장면', '상황', '실제로', '일이', '했나요', '무엇을', '처음', '그때', 'place', 'when', 'where', 'happen'])) {
    axes.add('lifeScene');
  }
  if (hasAny(normalized, ['감정', '기분', '부담', '압박', '불편', '갈등', '망설', '걱정', '힘들', '긴장', 'feel', 'pressure', 'hard'])) {
    axes.add('emotionTension');
  }
  if (hasAny(normalized, ['친구', '부모', '가족', '선생', '교사', '주변', '사람', '관계', '반응', '영향', 'friend', 'parent', 'family'])) {
    axes.add('relationship');
  }
  if (hasAny(normalized, ['조건', '제약', '어려', '왜', '때문', '이유', '규칙', '시간', '돈', '자원', '바꾸기', '할 수밖에', 'why', 'reason'])) {
    axes.add('conditionConstraint');
  }
  if (hasAny(normalized, ['직접', '들은', '추측', '모르', '확실', '경험한', '아닌', '범위', '근거', 'know', 'guess', 'directly'])) {
    axes.add('unknownBoundary');
  }

  return [...axes];
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function selectRecommendationAxis(axes: InterviewFlowAxisSummary[]): InterviewFlowAxisSummary {
  return (
    axes.find((axis) => axis.state === 'empty') ??
    [...axes].filter((axis) => axis.state !== 'enough').sort((a, b) => a.confirmedCount - b.confirmedCount || a.inferredCount - b.inferredCount)[0] ??
    axes[0]
  );
}
