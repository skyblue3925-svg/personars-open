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

type CoachRequest = {
  personaId: string;
  topic: string;
  researchQuestion: string;
  latest: string;
  history?: Array<{ role: 'student' | 'persona'; text: string }>;
  persona: {
    label: string;
    ageGroup?: string;
    region?: string;
    occupation?: string;
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
  };
};

type CoachFeedback = {
  score: number;
  tags: string[];
  summary: string;
  suggestion: string;
  revisedQuestion: string;
  coverage: {
    lifeScene: boolean;
    emotionTension: boolean;
    relationship: boolean;
    conditionConstraint: boolean;
    unknownBoundary: boolean;
  };
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).json({});
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'coach_unavailable' });

  const body = normalizeBody(req.body);
  if (!isValidCoachRequest(body)) return res.status(400).json({ error: 'invalid_request' });

  const providerErrors: string[] = [];
  const attemptedModelIds: string[] = [];
  const feedback = await requestGemini(process.env.GEMINI_API_KEY, body, attemptedModelIds, providerErrors);

  if (!feedback) {
    return res.status(502).json({ error: 'coach_generation_failed', attemptedModelIds, providerErrors });
  }

  return res.status(200).json({
    ...feedback.value,
    modelId: feedback.modelId,
    attemptedModelIds,
    providerErrors,
    generatedAt: new Date().toISOString(),
    usage: {
      tokensIn: feedback.usage?.promptTokenCount,
      tokensOut: feedback.usage?.candidatesTokenCount,
    },
  });
}

function applyCors(req: ApiRequest, res: ApiResponse) {
  const origin = headerValue(req.headers?.origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Vary', 'Origin');
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
}

function normalizeBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function requestGemini(apiKey: string, body: CoachRequest, attemptedModelIds: string[], providerErrors: string[]) {
  for (const modelId of GEMINI_MODEL_IDS) {
    attemptedModelIds.push(modelId);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildCoachSystemPrompt() }] },
          contents: [{ role: 'user', parts: [{ text: buildCoachUserPrompt(body) }] }],
          generationConfig: {
            temperature: 0.25,
            topP: 0.85,
            maxOutputTokens: 900,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        providerErrors.push(`${modelId}:${response.status}`);
        continue;
      }

      const data = (await response.json()) as GeminiResponse;
      const parsed = parseFeedback(extractGeminiText(data));
      if (parsed) return { value: parsed, modelId, usage: data.usageMetadata };
    } catch {
      providerErrors.push(`${modelId}:fetch_error`);
    }
  }

  return null;
}

function buildCoachSystemPrompt(): string {
  return [
    'You are an interview training coach for Korean high school research classes.',
    'Evaluate the student interviewer question before it is sent to a simulated persona.',
    'Be concise, practical, and non-blocking. Never shame the student.',
    'Return only JSON with this exact shape:',
    '{"score": number, "tags": string[], "summary": string, "suggestion": string, "revisedQuestion": string, "coverage": {"lifeScene": boolean, "emotionTension": boolean, "relationship": boolean, "conditionConstraint": boolean, "unknownBoundary": boolean}}',
  ].join('\n');
}

function buildCoachUserPrompt(body: CoachRequest): string {
  const history =
    body.history
      ?.slice(-8)
      .map((turn) => `${turn.role === 'persona' ? 'persona' : 'student'}: ${turn.text}`)
      .join('\n') || 'No previous turns.';

  return [
    `[Research topic]\n${body.topic}`,
    `[Research question]\n${body.researchQuestion}`,
    `[Persona]\n${body.persona.label} / ${body.persona.ageGroup ?? ''} / ${body.persona.region ?? ''} / ${body.persona.occupation ?? ''}`,
    body.character
      ? `[Dossier]\nlifeContext: ${body.character.lifeContext}\ncanSpeakTo: ${body.character.canSpeakTo.join(' / ')}\ncannotSpeakTo: ${body.character.cannotSpeakTo.join(' / ')}\nscenes: ${body.character.concreteScenes
          .slice(0, 4)
          .map((scene) => `${scene.setting} | ${scene.action} | ${scene.pressure} | ${scene.feeling}`)
          .join('\n')}`
      : `[Dossier]\n${body.persona.livedExperiences.join(' / ')}`,
    `[Recent transcript]\n${history}`,
    `[Student question to coach]\n${body.latest}`,
    [
      'Score for interview usefulness, not grammar.',
      'Prefer follow-up, scene-centered, non-leading, experience-based questions.',
      'Flag if the question asks outside the dossier or asks the persona to invent statistics/expert knowledge.',
      'The revisedQuestion must be in Korean unless the student question is clearly in English.',
    ].join('\n'),
  ].join('\n\n');
}

function parseFeedback(text: string): CoachFeedback | null {
  try {
    const parsed = JSON.parse(stripCodeFence(text)) as Partial<CoachFeedback>;
    return {
      score: clampScore(parsed.score),
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 4) : [],
      summary: stringOrDefault(parsed.summary, '질문을 점검했습니다.'),
      suggestion: stringOrDefault(parsed.suggestion, '경험 장면을 더 구체적으로 물어보세요.'),
      revisedQuestion: stringOrDefault(parsed.revisedQuestion, ''),
      coverage: {
        lifeScene: Boolean(parsed.coverage?.lifeScene),
        emotionTension: Boolean(parsed.coverage?.emotionTension),
        relationship: Boolean(parsed.coverage?.relationship),
        conditionConstraint: Boolean(parsed.coverage?.conditionConstraint),
        unknownBoundary: Boolean(parsed.coverage?.unknownBoundary),
      },
    };
  } catch {
    return null;
  }
}

function extractGeminiText(data: GeminiResponse): string {
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
}

function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function clampScore(score: unknown): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 70;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isValidCoachRequest(body: unknown): body is CoachRequest {
  const request = body as CoachRequest;
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
