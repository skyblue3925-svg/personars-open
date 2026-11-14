import { buildSystemPrompt, ensurePrefix } from '../worker/src/prompt.js';
import { guard } from './_lib/guard.js';

declare const process: {
  env: Record<string, string | undefined>;
};

const GEMINI_MODEL_IDS = ['gemini-3-flash-preview', 'gemini-2.5-flash'] as const;

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  setHeader: (key: string, value: string) => void;
  status: (status: number) => { json: (value: unknown) => void };
  json: (value: unknown) => void;
};

type ChatRequest = {
  personaId: string;
  topic: string;
  researchQuestion: string;
  latest: string;
  persona: {
    label: string;
    background: string;
    perspective: string;
    voice: string;
    livedExperiences: string[];
    concerns: string[];
    tensions: string[];
  };
  character?: {
    lifeContext: string;
    canSpeakTo: string[];
    cannotSpeakTo: string[];
    concreteScenes: Array<{
      setting: string;
      people: string[];
      action: string;
      pressure: string;
      feeling: string;
      consequence: string;
      quoteSeed: string;
    }>;
    recurringTensions: string[];
    persona?: ChatRequest['persona'];
  };
  history?: Array<{ role: 'student' | 'persona'; text: string }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
};

type InterviewEvidenceKind = 'personaProfile' | 'lifeScene' | 'speakableScope' | 'uncertainBoundary';

type InterviewEvidence = {
  kind: InterviewEvidenceKind;
  label: string;
  text: string;
};

type StructuredGeminiText = {
  text: string;
  evidence: InterviewEvidence[];
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (guard(req, res)) return;

  const body = normalizeBody(req.body);
  if (!isValidChatRequest(body)) return res.status(400).json({ error: 'invalid_request' });

  const character = body.character ? { ...body.character, persona: body.character.persona ?? body.persona } : undefined;
  const systemPrompt = buildSystemPrompt(character ?? body.persona, body.topic, body.researchQuestion);
  const userPrompt = buildUserPrompt(body);
  const providerErrors: string[] = [];
  const attemptedModelIds: string[] = [];

  const gemini = process.env.GEMINI_API_KEY
    ? await requestGemini(process.env.GEMINI_API_KEY, systemPrompt, userPrompt, attemptedModelIds, providerErrors)
    : null;

  if (gemini) {
    return res.status(200).json({
      text: ensurePrefix(gemini.text),
      evidence: gemini.evidence,
      modelId: gemini.modelId,
      attemptedModelIds,
      providerErrors,
      generatedAt: new Date().toISOString(),
      usage: {
        tokensIn: gemini.usage?.promptTokenCount,
        tokensOut: gemini.usage?.candidatesTokenCount,
      },
    });
  }

  const fallback = await requestCloudflareFallback(body, attemptedModelIds, providerErrors);
  return res.status(fallback.status).json(fallback.body);
}

function normalizeBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function buildUserPrompt(body: ChatRequest): string {
  const previousTurns =
    body.history
      ?.slice(-8)
      .map((turn) => `${turn.role === 'persona' ? '참여자' : '면접자'}: ${stripSimulationPrefix(turn.text)}`)
      .join('\n') || '이전 대화 없음';

  return [
    '[이전 대화]',
    previousTurns,
    '- 반드시 JSON으로만 답하세요. 형식: {"text":"페르소나 답변","evidence":[{"kind":"lifeScene","label":"생활 장면 근거","text":"학생이 이해할 수 있는 한국어 근거"}]}',
    '- evidence label은 인물 설정 근거, 생활 장면 근거, 말할 수 있는 범위, 추측 주의 중 하나를 사용하세요.',
    '- evidence text에는 dossier, scene, canSpeakTo, cannotSpeakTo 같은 내부 영어 용어를 쓰지 마세요.',
    '',
    '[면접자의 최신 질문]',
    body.latest,
    '',
    '[대화 맥락 읽기]',
    '- 이전 대화는 맥락 확인용입니다. 최신 질문에만 직접 반응하세요.',
    '- 직전 답변의 문장이나 논지를 반복하지 마세요.',
    '- 면접자의 말이 반박이나 관점 제시라면 동의, 유보, 다른 조건을 자신의 생활 맥락에서 말하세요.',
    '- 질문 문장을 그대로 되풀이하지 마세요.',
    '- 자료에 없는 직장 프로젝트, 회의, 병원, 기관, 인물, 통계는 만들지 마세요.',
    '- 도덕 훈계나 일반론으로 마무리하지 마세요.',
    '',
    '[이번 답변에서 기억할 생활 단서]',
    sceneGroundingText(body),
    '',
    '사용법: 주제 단서를 답변의 중심 장면으로 삼고, 페르소나 배경 단서는 말투, 관계 위치, 생활 제약을 만드는 데만 사용하세요. 단서를 그대로 나열하지 말고 참여자가 자기 경험을 떠올리며 말하듯 자연스럽게 합성하세요.',
  ].join('\n');
}

async function requestGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  attemptedModelIds: string[],
  providerErrors: string[],
) {
  for (const modelId of GEMINI_MODEL_IDS) {
    attemptedModelIds.push(modelId);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.55,
            topP: 0.9,
            maxOutputTokens: 1800,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        providerErrors.push(`${modelId}:${response.status}`);
        continue;
      }

      const data = (await response.json()) as GeminiResponse;
      const text = extractGeminiText(data);
      if (text) {
        const structured = parseStructuredGeminiText(text);
        return { text: structured.text, evidence: structured.evidence, modelId, usage: data.usageMetadata };
      }
    } catch {
      providerErrors.push(`${modelId}:fetch_error`);
    }
  }

  return null;
}

async function requestCloudflareFallback(body: ChatRequest, attemptedModelIds: string[], providerErrors: string[]) {
  const url = process.env.CLOUDFLARE_PERSONA_API_URL;
  // 워커는 Origin 없는 요청을 거부하므로, 이 사이트의 주소(PUBLIC_SITE_ORIGIN)를 Origin으로 보낸다.
  // 같은 주소를 워커의 ALLOWED_ORIGINS에도 넣어야 한다.
  const siteOrigin = process.env.PUBLIC_SITE_ORIGIN;
  if (!url || !siteOrigin) {
    providerErrors.push('cloudflare-worker:not_configured');
    return { status: 502, body: { error: 'persona_proxy_not_configured', attemptedModelIds, providerErrors } };
  }
  attemptedModelIds.push('cloudflare-worker');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: siteOrigin },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    return {
      status: response.status,
      body: {
        ...data,
        attemptedModelIds,
        providerErrors,
      },
    };
  } catch {
    providerErrors.push('cloudflare-worker:fetch_error');
    return { status: 502, body: { error: 'persona_proxy_failed', attemptedModelIds, providerErrors } };
  }
}

function extractGeminiText(data: GeminiResponse): string {
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
}

function parseStructuredGeminiText(raw: string): StructuredGeminiText {
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; evidence?: unknown };
    return {
      text: typeof parsed.text === 'string' ? parsed.text : raw,
      evidence: normalizeApiEvidence(parsed.evidence),
    };
  } catch {
    return { text: raw, evidence: [] };
  }
}

function normalizeApiEvidence(value: unknown): InterviewEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is InterviewEvidence => {
    const evidence = item as InterviewEvidence;
    return Boolean(
      evidence &&
        isEvidenceKind(evidence.kind) &&
        typeof evidence.label === 'string' &&
        evidence.label.trim() &&
        !containsInternalTerm(evidence.label) &&
        typeof evidence.text === 'string' &&
        evidence.text.trim() &&
        !containsInternalTerm(evidence.text),
    );
  });
}

function isEvidenceKind(value: unknown): value is InterviewEvidenceKind {
  return value === 'personaProfile' || value === 'lifeScene' || value === 'speakableScope' || value === 'uncertainBoundary';
}

function containsInternalTerm(value: string): boolean {
  return /\b(dossier|scene|canSpeakTo|cannotSpeakTo)\b/i.test(value);
}

function stripSimulationPrefix(text: string): string {
  return text.replace('[가상 페르소나 시뮬레이션]', '').trim();
}

function sceneGroundingText(body: ChatRequest): string {
  if (!body.character?.concreteScenes?.length) return body.persona.livedExperiences.join(' / ');
  const [primary, ...background] = body.character.concreteScenes;
  const formatScene = (scene: NonNullable<ChatRequest['character']>['concreteScenes'][number]) =>
    `${scene.setting} | ${scene.action} | ${scene.pressure} | ${scene.feeling} | ${scene.consequence} | ${scene.quoteSeed}`;
  const lines = [`주제 단서: ${formatScene(primary)}`];
  if (background.length > 0) lines.push(`페르소나 배경 단서: ${background.slice(0, 2).map(formatScene).join(' / ')}`);
  return lines.join('\n');
}

function isValidChatRequest(body: unknown): body is ChatRequest {
  const request = body as ChatRequest;
  return Boolean(
    request &&
      request.personaId &&
      request.topic &&
      request.researchQuestion &&
      request.latest &&
      request.persona?.label &&
      Array.isArray(request.persona.livedExperiences) &&
      Array.isArray(request.persona.concerns) &&
      Array.isArray(request.persona.tensions),
  );
}
