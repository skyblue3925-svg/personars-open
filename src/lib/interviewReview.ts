import type { InterviewEvidenceKind, InterviewTurn } from '../types/research';
import { SIMULATION_PREFIX } from './simulationSafety';

export type InterviewReviewItem = {
  question: string;
  reason: string;
};

export type LeadingQuestionReview = {
  question: string;
  reason: string;
  rewrite: string;
};

export type TrustCautionReview = {
  answerExcerpt: string;
  reason: string;
};

export type QuoteCandidate = {
  text: string;
  reason: string;
};

export type InterviewReview = {
  isEmpty: boolean;
  summary: string;
  goodQuestions: InterviewReviewItem[];
  suggestedQuestions: InterviewReviewItem[];
  leadingQuestions: LeadingQuestionReview[];
  trustCautions: TrustCautionReview[];
  quoteCandidates: QuoteCandidate[];
};

type AxisId = 'lifeScene' | 'emotionTension' | 'relationship' | 'conditionConstraint' | 'unknownBoundary';

const AXIS_SUGGESTIONS: Record<AxisId, InterviewReviewItem> = {
  lifeScene: {
    question: '그 일이 실제로 일어난 장소와 상황을 더 자세히 말해줄 수 있나요?',
    reason: '생활 장면이 구체적일수록 답변을 활동 자료에서 해석하기 쉬워집니다.',
  },
  emotionTension: {
    question: '그때 가장 불편하거나 망설여졌던 점은 무엇이었나요?',
    reason: '감정과 갈등을 물으면 단순 찬반보다 깊은 이유를 확인할 수 있습니다.',
  },
  relationship: {
    question: '그 상황에서 주변 사람들은 어떻게 반응했나요?',
    reason: '친구, 가족, 교사 같은 관계를 확인하면 개인 경험의 맥락이 살아납니다.',
  },
  conditionConstraint: {
    question: '그렇게 행동할 수밖에 없었던 조건이나 제약은 무엇이었나요?',
    reason: '조건과 제약을 물으면 개인 선택으로만 해석하는 위험을 줄일 수 있습니다.',
  },
  unknownBoundary: {
    question: '직접 겪은 것과 추측한 것을 나누면 어디까지 말할 수 있나요?',
    reason: '알 수 있는 범위를 확인하면 믿기 어려운 답변을 구분할 수 있습니다.',
  },
};

const AXIS_LABELS: Record<AxisId, string> = {
  lifeScene: '생활 장면',
  emotionTension: '감정과 갈등',
  relationship: '주변 사람과 관계',
  conditionConstraint: '조건과 제약',
  unknownBoundary: '알 수 있는 범위',
};

const EVIDENCE_AXIS: Partial<Record<InterviewEvidenceKind, AxisId>> = {
  lifeScene: 'lifeScene',
  speakableScope: 'unknownBoundary',
  uncertainBoundary: 'unknownBoundary',
};

export function buildInterviewReview(turns: InterviewTurn[]): InterviewReview {
  const axes = new Set<AxisId>();
  for (const turn of turns) {
    inferAxes(turn).forEach((axis) => axes.add(axis));
  }

  return {
    isEmpty: turns.length === 0,
    summary: buildSummary(turns, axes),
    goodQuestions: buildGoodQuestions(turns).slice(0, 3),
    suggestedQuestions: buildSuggestedQuestions(axes).slice(0, 3),
    leadingQuestions: buildLeadingQuestions(turns).slice(0, 3),
    trustCautions: buildTrustCautions(turns).slice(0, 3),
    quoteCandidates: buildQuoteCandidates(turns).slice(0, 3),
  };
}

function buildSummary(turns: InterviewTurn[], axes: Set<AxisId>): string {
  if (turns.length === 0) return '아직 돌아볼 면접 기록이 없습니다.';
  const labels = [...axes].map((axis) => AXIS_LABELS[axis]);
  const covered = labels.length > 0 ? labels.join(', ') : '기본 답변';
  return `${turns.length}개의 후속 질문에서 ${covered}을 확인했습니다. 다음 질문에서는 아직 약한 축을 보완해 보세요.`;
}

function buildGoodQuestions(turns: InterviewTurn[]): InterviewReviewItem[] {
  return turns
    .map((turn) => {
      const axes = inferAxes(turn);
      if (axes.length === 0) return null;
      return {
        question: turn.question,
        reason: `${axes.map((axis) => AXIS_LABELS[axis]).join(', ')}을 확인한 질문입니다.`,
      };
    })
    .filter((item): item is InterviewReviewItem => Boolean(item));
}

function buildSuggestedQuestions(coveredAxes: Set<AxisId>): InterviewReviewItem[] {
  const missing = (Object.keys(AXIS_SUGGESTIONS) as AxisId[]).filter((axis) => !coveredAxes.has(axis));
  const source = missing.length > 0 ? missing : (Object.keys(AXIS_SUGGESTIONS) as AxisId[]);
  return source.map((axis) => AXIS_SUGGESTIONS[axis]);
}

function buildLeadingQuestions(turns: InterviewTurn[]): LeadingQuestionReview[] {
  return turns
    .filter((turn) => isLeadingQuestion(turn.question))
    .map((turn) => ({
      question: turn.question,
      reason: '질문 안에 예상 답이 들어 있어 응답자가 그 방향으로 끌려갈 수 있습니다.',
      rewrite: '그 상황에서 어떤 점이 기억에 남았나요?',
    }));
}

function buildTrustCautions(turns: InterviewTurn[]): TrustCautionReview[] {
  return turns
    .filter((turn) => hasUncertainEvidence(turn) || hasBroadClaim(turn.answer))
    .map((turn) => ({
      answerExcerpt: excerpt(turn.answer),
      reason: hasUncertainEvidence(turn)
        ? '추측 주의 근거가 있어 실제 사실처럼 인용하면 안 됩니다.'
        : '전체 집단이나 정책 효과처럼 넓은 주장으로 들릴 수 있습니다.',
    }));
}

function buildQuoteCandidates(turns: InterviewTurn[]): QuoteCandidate[] {
  return turns
    .map((turn) => excerpt(turn.answer))
    .filter((text) => text.length >= 12)
    .map((text) => ({
      text,
      reason: '구체적인 경험이나 표현이 담긴 짧은 인용 후보입니다.',
    }));
}

function inferAxes(turn: InterviewTurn): AxisId[] {
  const axes = new Set<AxisId>();
  const text = `${turn.question} ${turn.answer}`.toLowerCase();
  const coverage = turn.coach?.coverage;

  if (coverage?.lifeScene) axes.add('lifeScene');
  if (coverage?.emotionTension) axes.add('emotionTension');
  if (coverage?.relationship) axes.add('relationship');
  if (coverage?.conditionConstraint) axes.add('conditionConstraint');
  if (coverage?.unknownBoundary) axes.add('unknownBoundary');

  for (const evidence of turn.evidence ?? []) {
    const axis = EVIDENCE_AXIS[evidence.kind];
    if (axis) axes.add(axis);
  }

  if (hasAny(text, ['어디', '언제', '장면', '상황', '실제로', '무슨 일이', 'happen', 'where'])) axes.add('lifeScene');
  if (hasAny(text, ['기분', '감정', '불편', '힘들', '걱정', '망설', '갈등', 'pressure'])) axes.add('emotionTension');
  if (hasAny(text, ['친구', '가족', '부모', '교사', '주변 사람', '반응', '관계'])) axes.add('relationship');
  if (hasAny(text, ['조건', '제약', '이유', '왜', '때문', '시간', '규칙'])) axes.add('conditionConstraint');
  if (hasAny(text, ['직접', '추측', '근거', '알 수', '모르', '확인'])) axes.add('unknownBoundary');
  return [...axes];
}

function isLeadingQuestion(question: string): boolean {
  return hasAny(question, ['그렇죠', '문제였죠', '불만이 많았죠', '당연히', '너무', '심각했죠', '힘들었죠']);
}

function hasUncertainEvidence(turn: InterviewTurn): boolean {
  return (turn.evidence ?? []).some((item) => item.kind === 'uncertainBoundary' || item.label.includes('추측'));
}

function hasBroadClaim(answer: string): boolean {
  return hasAny(answer, ['모든 학생', '전체 학생', '대부분의 학생', '정책 효과', '통계적으로', '대표 의견']);
}

function excerpt(answer: string): string {
  const normalized = answer.replace(SIMULATION_PREFIX, '').replace(/\s+/g, ' ').trim();
  const sentence = normalized.match(/.+?[.!?。！？](\s|$)/)?.[0]?.trim() ?? normalized;
  return sentence.length > 120 ? `${sentence.slice(0, 117).trimEnd()}...` : sentence;
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
