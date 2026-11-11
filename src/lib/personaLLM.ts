import type { InterviewCharacter, InterviewEvidence, PersonaSeed, ResearchDraft } from '../types/research';
import { buildInterviewCharacter } from './interviewCharacter';
import { buildInterviewEvidence, normalizeInterviewEvidence } from './interviewEvidence';
import { composePersonaAnswer } from './interviewEngine';
import { ensureSimulationPrefix, SIMULATION_PREFIX } from './simulationSafety';

export { ensureSimulationPrefix, SIMULATION_PREFIX };

// 기본 주소는 두지 않는다. VITE_PERSONA_API_URL이 없으면 로컬 템플릿 응답으로 동작한다.
export const DEFAULT_PERSONA_API_URL = '';

export function hasPersonaApiEndpoint(): boolean {
  return Boolean(import.meta.env.VITE_PERSONA_API_URL || DEFAULT_PERSONA_API_URL);
}

export type PersonaChatRequest = {
  personaId: string;
  topic: string;
  researchQuestion: string;
  history: Array<{ role: 'student' | 'persona'; text: string }>;
  latest: string;
  character?: InterviewCharacter;
  studentRole?: string;
};

export type PersonaChatResponse = {
  text: string;
  source: 'llm' | 'template';
  modelId?: string;
  generatedAt?: string;
  tokensIn?: number;
  tokensOut?: number;
  evidence?: InterviewEvidence[];
};

type PersonaChatOptions = {
  apiUrl?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
  sessionId?: string;
};

type PersonaApiResponse = {
  text?: string;
  evidence?: unknown;
  modelId?: string;
  generatedAt?: string;
  usage?: {
    tokensIn?: number;
    tokensOut?: number;
  };
};

export function getSessionId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'server-ephemeral';
  }
  const key = 'personars-interview-session-id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
    window.localStorage.setItem(key, id);
  }
  return id;
}

export async function chatWithPersona(
  request: PersonaChatRequest,
  persona: PersonaSeed,
  draft: ResearchDraft,
  options: PersonaChatOptions = {},
): Promise<PersonaChatResponse> {
  const apiUrl = options.apiUrl ?? import.meta.env.VITE_PERSONA_API_URL ?? DEFAULT_PERSONA_API_URL;
  const now = options.now ?? (() => new Date());
  const character = request.character ?? buildInterviewCharacter(draft, persona);

  if (!apiUrl) {
    return fallbackToTemplate(request, persona, draft, now, character);
  }

  try {
    const fetcher = options.fetcher ?? fetch;
    const sessionId = options.sessionId ?? getSessionId();
    const response = await fetcher(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Session-Id': sessionId,
      },
      body: JSON.stringify({ ...request, persona, character }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return fallbackToTemplate(request, persona, draft, now, character);
    }

    const data = (await response.json()) as PersonaApiResponse;
    const text = ensureSimulationPrefix(data.text ?? '');
    const evidence = normalizeInterviewEvidence(data.evidence);

    return {
      text,
      source: 'llm',
      modelId: data.modelId ?? 'gemini-2.5-flash',
      generatedAt: data.generatedAt ?? now().toISOString(),
      tokensIn: data.usage?.tokensIn,
      tokensOut: data.usage?.tokensOut,
      evidence: evidence.length > 0 ? evidence : buildInterviewEvidence(character, request.history.length),
    };
  } catch {
    return fallbackToTemplate(request, persona, draft, now, character);
  }
}

function fallbackToTemplate(
  request: PersonaChatRequest,
  persona: PersonaSeed,
  draft: ResearchDraft,
  now: () => Date,
  character: InterviewCharacter,
): PersonaChatResponse {
  const text = composePersonaAnswer(
    draft,
    persona,
    {
      id: 'follow-up',
      text: request.latest,
      intent: inferFallbackIntent(request.latest),
    },
    request.history.length,
    character,
  );

  return {
    text: ensureSimulationPrefix(text),
    source: 'template',
    generatedAt: now().toISOString(),
    evidence: buildInterviewEvidence(character, request.history.length),
  };
}

function inferFallbackIntent(question: string): string {
  if (question.includes('사례') || question.includes('경험') || question.includes('이유')) return '개인 경험 확인';
  if (question.includes('다르게') || question.includes('관점') || question.includes('영향')) return '관점 차이 탐색';
  if (question.includes('조건') || question.includes('반복')) return '조건 탐색';
  if (question.includes('조심') || question.includes('한계')) return '자료 활용 한계 성찰';
  if (question.includes('해결') || question.includes('필요')) return '해결 방안 수집';
  return '생활 장면 탐색';
}
