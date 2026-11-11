import type { InterviewCharacter, InterviewCoachFeedback, PersonaSeed } from '../types/research';

// 기본 주소는 두지 않는다. VITE_INTERVIEW_COACH_API_URL이 없으면 AI 코치는 꺼진 상태로 동작한다.
export const DEFAULT_INTERVIEW_COACH_API_URL = '';

export type InterviewCoachRequest = {
  personaId: string;
  topic: string;
  researchQuestion: string;
  history: Array<{ role: 'student' | 'persona'; text: string }>;
  latest: string;
  persona: PersonaSeed;
  character: InterviewCharacter;
};

type InterviewCoachOptions = {
  apiUrl?: string;
  fetcher?: typeof fetch;
};

type InterviewCoachApiResponse = Omit<InterviewCoachFeedback, 'source' | 'tokensIn' | 'tokensOut'> & {
  usage?: {
    tokensIn?: number;
    tokensOut?: number;
  };
};

export async function coachInterviewQuestion(
  request: InterviewCoachRequest,
  options: InterviewCoachOptions = {},
): Promise<InterviewCoachFeedback> {
  const apiUrl = options.apiUrl ?? import.meta.env.VITE_INTERVIEW_COACH_API_URL ?? DEFAULT_INTERVIEW_COACH_API_URL;
  if (!apiUrl) {
    throw new Error('interview_coach_unavailable');
  }
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error('interview_coach_unavailable');
  }

  const data = (await response.json()) as InterviewCoachApiResponse;
  return {
    score: clampScore(data.score),
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 4) : [],
    summary: data.summary ?? '질문을 점검했습니다.',
    suggestion: data.suggestion ?? '상황과 경험을 조금 더 구체적으로 물어보세요.',
    revisedQuestion: data.revisedQuestion ?? request.latest,
    coverage: {
      lifeScene: Boolean(data.coverage?.lifeScene),
      emotionTension: Boolean(data.coverage?.emotionTension),
      relationship: Boolean(data.coverage?.relationship),
      conditionConstraint: Boolean(data.coverage?.conditionConstraint),
      unknownBoundary: Boolean(data.coverage?.unknownBoundary),
    },
    source: 'llm',
    modelId: data.modelId,
    generatedAt: data.generatedAt,
    tokensIn: data.usage?.tokensIn,
    tokensOut: data.usage?.tokensOut,
  };
}

function clampScore(score: unknown): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 70;
  return Math.max(0, Math.min(100, Math.round(score)));
}
