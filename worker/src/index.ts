import { buildSystemPrompt, ensurePrefix } from './prompt';
import { isValidPersonaSearchRequest, searchPersonaR2, type PersonaSearchR2Bucket } from './personaSearch';
import { isOverDailyLimit } from './rateLimit';
import type { RateLimitStore } from './types';

const GEMINI_MODEL_IDS = ['gemini-3-flash-preview', 'gemini-2.5-flash'] as const;
const WORKERS_AI_MODEL_IDS = [
  '@cf/openai/gpt-oss-20b',
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/meta/llama-3.1-8b-instruct',
] as const;

type Env = {
  AI: {
    run: (
      model: string,
      input: {
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        max_tokens?: number;
        temperature?: number;
        top_p?: number;
        repetition_penalty?: number;
      },
    ) => Promise<WorkersAiResponse | string>;
  };
  GEMINI_API_KEY?: string;
  GEMINI_API_KEY_POOL?: string;
  ALLOWED_ORIGINS?: string;
  DAILY_LIMIT?: string;
  RATE_KV: RateLimitStore;
  PERSONA_SEARCH?: PersonaSearchR2Bucket;
};

const MAX_BODY_CHARS = 60_000;
const MAX_LATEST_CHARS = 1_000;
const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_TEXT_CHARS = 1_500;

type ChatRequest = {
  personaId: string;
  topic: string;
  researchQuestion: string;
  latest: string;
  studentRole?: string;
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
      id?: string;
      setting: string;
      people: string[];
      action: string;
      pressure: string;
      feeling: string;
      consequence: string;
      quoteSeed: string;
    }>;
    recurringTensions: string[];
    usedSceneIds?: string[];
    persona?: ChatRequest['persona'];
  };
  history?: Array<{ role: 'student' | 'persona'; text: string }>;
};

type WorkersAiResponse = {
  response?: string;
  text?: string;
  generated_text?: string;
  result?: {
    response?: string;
    text?: string;
  };
  choices?: Array<{
    text?: string;
    message?: {
      content?: string;
    };
  }>;
  output?: unknown;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type WorkersAiRun = {
  ai: WorkersAiResponse | string;
  modelId: (typeof WORKERS_AI_MODEL_IDS)[number];
  attemptedModelIds: string[];
  providerErrors: string[];
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

type AiRun = {
  ai: WorkersAiResponse | GeminiResponse | string;
  modelId: string;
  provider: 'gemini' | 'workers-ai';
  attemptedModelIds: string[];
  providerErrors: string[];
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    const path = new URL(request.url).pathname;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/persona-search') return handlePersonaSearch(request, env, cors);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
    if (!isAllowedOrigin(origin, env)) return json({ error: 'origin_not_allowed' }, 403, cors);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (await isOverDailyLimit(ip, env)) return json({ error: 'daily_limit_exceeded' }, 429, cors);

    let body: ChatRequest;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_CHARS) return json({ error: 'payload_too_large' }, 413, cors);
      body = JSON.parse(raw) as ChatRequest;
    } catch {
      return json({ error: 'invalid_json' }, 400, cors);
    }

    if (!isValidChatRequest(body)) return json({ error: 'invalid_request' }, 400, cors);
    clampChatRequest(body);

    const character = body.character ? { ...body.character, persona: body.character.persona ?? body.persona } : undefined;
    const systemPrompt = buildSystemPrompt(character ?? body.persona, body.topic, body.researchQuestion, body.studentRole);
    const userPrompt = buildUserPrompt(body);

    let run = await requestAi(env, systemPrompt, userPrompt);
    let ai = run.ai;
    let modelId = run.modelId;
    let text = extractText(ai);

    if (answerBodyLength(text) < 160) {
      run = await requestAi(
        env,
        systemPrompt,
        `${userPrompt}\n\n방금 답은 너무 짧았습니다. 한 사람의 인터뷰 참여자가 잠시 생각하며 말하듯, 최신 질문에 직접 반응하세요. 주제 단서의 장면을 중심으로 구체적인 행동과 감정이 드러나게 다시 답하세요. 배경 단서는 생활 제약과 말투를 보태는 정도로만 사용하고, 별도 에피소드로 길게 풀지 마세요. 정해진 양식이나 보고서 문장처럼 쓰지 마세요.`,
      );
      ai = run.ai;
      modelId = run.modelId;
      text = extractText(ai);
    }

    if (!text.trim()) {
      text = buildFallbackAnswer(body);
    }

    return json(
      {
        text: ensurePrefix(text),
        modelId,
        attemptedModelIds: run.attemptedModelIds,
        providerErrors: run.providerErrors,
        generatedAt: new Date().toISOString(),
        usage: {
          tokensIn: usageIn(ai),
          tokensOut: usageOut(ai),
        },
      },
      200,
      cors,
    );
  },
};

async function handlePersonaSearch(request: Request, env: Env, cors: Headers): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  if (!isAllowedOrigin(request.headers.get('Origin'), env)) return json({ error: 'origin_not_allowed' }, 403, cors);
  if (!env.PERSONA_SEARCH) return json({ error: 'persona_search_unavailable' }, 503, cors);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, cors);
  }

  if (!isValidPersonaSearchRequest(body)) return json({ error: 'invalid_request' }, 400, cors);

  try {
    return json(await searchPersonaR2(env.PERSONA_SEARCH, body), 200, cors);
  } catch {
    return json({ error: 'persona_search_unavailable' }, 503, cors);
  }
}

function buildUserPrompt(body: ChatRequest): string {
  const previousTurns =
    body.history
      ?.slice(-4)
      .map((turn) => `${turn.role === 'persona' ? '참여자' : '면접자'}: ${stripSimulationPrefix(turn.text)}`)
      .join('\n') || '이전 대화 없음';

  return [
    '[이전 대화]',
    previousTurns,
    '',
    '[면접자의 최신 질문]',
    body.latest,
    '',
    '[대화 맥락 읽기]',
    '- 이전 대화는 맥락 확인용입니다. 최신 질문에만 직접 반응하세요.',
    '- 직전 답변의 문장이나 논지를 반복하지 마세요. 이어지는 말이면 "그 말에 덧붙이면", "그렇게만 보기는 어려운 게"처럼 연결하세요.',
    '- 면접자의 말이 반박이나 관점 제시라면 방어적으로 설교하지 말고, 동의/유보/다른 조건을 자신의 생활 맥락에서 말하세요.',
    '- 질문 문장을 그대로 되풀이하지 마세요.',
    '- 자료에 없는 직장 프로젝트, 회의, 병원, 기관, 인물, 통계는 만들지 마세요.',
    '- 배경 직업은 시간 부족이나 책임 위치를 설명할 때만 쓰고, 업무 이야기로 답변을 옮기지 마세요.',
    '- 도덕 훈계나 일반론으로 마무리하지 마세요. 인터뷰 대상자의 관찰, 망설임, 조건, 감정으로 끝내세요.',
    '',
    '[이번 답변에서 기억할 생활 단서]',
    sceneGroundingText(body),
    '',
    '사용법: 주제 단서를 답변의 중심 장면으로 삼고, 페르소나 배경 단서는 말투, 관계 위치, 생활 제약을 만드는 데 사용하세요. 배경 단서는 한 문장 이하로만 섞으세요. 배경 단서를 별도 에피소드로 길게 풀지 마세요. 말버릇 단서는 그대로 인용하지 말고 말투의 힌트로만 사용하세요. 단서를 그대로 나열하지 말고, 참여자가 자기 경험을 떠올리며 말하듯 자연스럽게 합성하세요.',
  ].join('\n');
}

function getGeminiApiKey(env: Env): string | undefined {
  const pool = env.GEMINI_API_KEY_POOL;
  if (pool) {
    const keys = pool.split(',').map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      const index = Math.floor(Math.random() * keys.length);
      return keys[index];
    }
  }
  return env.GEMINI_API_KEY;
}

async function requestAi(env: Env, systemPrompt: string, userPrompt: string): Promise<AiRun> {
  const attemptedModelIds: string[] = [];
  const providerErrors: string[] = [];
  const hasGeminiKey = Boolean(env.GEMINI_API_KEY || env.GEMINI_API_KEY_POOL);
  if (hasGeminiKey) {
    const gemini = await requestGemini(env, systemPrompt, userPrompt, attemptedModelIds, providerErrors);
    if (gemini) return { ...gemini, provider: 'gemini', attemptedModelIds, providerErrors };
  }

  const workersAi = await requestWorkersAi(env, systemPrompt, userPrompt, attemptedModelIds, providerErrors);
  return { ...workersAi, provider: 'workers-ai', attemptedModelIds, providerErrors };
}

async function requestGemini(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  attemptedModelIds: string[],
  providerErrors: string[],
): Promise<{ ai: GeminiResponse; modelId: (typeof GEMINI_MODEL_IDS)[number] } | null> {
  for (const modelId of GEMINI_MODEL_IDS) {
    attemptedModelIds.push(modelId);
    let retries = 2;
    let delay = 300;

    while (retries >= 0) {
      const apiKey = getGeminiApiKey(env);
      if (!apiKey) {
        providerErrors.push(`${modelId}:no_api_key`);
        break;
      }
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: geminiGenerationConfig(modelId),
              safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
              ],
            }),
          },
        );

        if (response.status === 429 && retries > 0) {
          retries--;
          const jitter = Math.floor(Math.random() * 200);
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
          delay *= 2;
          continue;
        }

        if (!response.ok) {
          // 상위 오류 본문은 서버 로그에만 남기고, 클라이언트에는 상태 코드만 돌려준다.
          console.warn(`gemini ${modelId} ${response.status}: ${await safeErrorText(response)}`);
          providerErrors.push(`${modelId}:${response.status}`);
          break;
        }
        return { ai: (await response.json()) as GeminiResponse, modelId };
      } catch (err) {
        if (retries > 0) {
          retries--;
          const jitter = Math.floor(Math.random() * 200);
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
          delay *= 2;
          continue;
        }
        providerErrors.push(`${modelId}:fetch_error`);
        break;
      }
    }
  }

  return null;
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    return (await response.text()).replace(/\s+/g, ' ').slice(0, 180);
  } catch {
    return 'unreadable_error';
  }
}



function geminiGenerationConfig(modelId: (typeof GEMINI_MODEL_IDS)[number]) {
  void modelId;
  return {
    temperature: 0.55,
    topP: 0.9,
    maxOutputTokens: 1200,
  };
}

async function requestWorkersAi(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  attemptedModelIds: string[] = [],
  providerErrors: string[] = [],
): Promise<WorkersAiRun> {
  let lastError: unknown;

  for (const modelId of WORKERS_AI_MODEL_IDS) {
    attemptedModelIds.push(modelId);
    try {
      const ai = await env.AI.run(modelId, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 900,
        temperature: 0.32,
        top_p: 0.72,
        repetition_penalty: 1.12,
      });
      return { ai, modelId, attemptedModelIds, providerErrors };
    } catch (error) {
      providerErrors.push(`${modelId}:error`);
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Workers AI request failed');
}

function stripSimulationPrefix(text: string): string {
  return text.replace('[가상 페르소나 시뮬레이션]', '').trim();
}

function extractText(ai: WorkersAiResponse | GeminiResponse | string): string {
  if (typeof ai === 'string') return ai.trim();
  if (isGeminiResponse(ai)) {
    return ai.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
  }
  const candidates = [
    ai.response,
    ai.text,
    ai.generated_text,
    ai.result?.response,
    ai.result?.text,
    ai.choices?.[0]?.message?.content,
    ai.choices?.[0]?.text,
    extractOutputText(ai.output),
  ];

  return candidates.find((candidate) => candidate?.trim())?.trim() ?? '';
}

function usageIn(ai: WorkersAiResponse | GeminiResponse | string): number | undefined {
  if (typeof ai === 'string') return undefined;
  if (isGeminiResponse(ai)) return ai.usageMetadata?.promptTokenCount;
  return ai.usage?.prompt_tokens;
}

function usageOut(ai: WorkersAiResponse | GeminiResponse | string): number | undefined {
  if (typeof ai === 'string') return undefined;
  if (isGeminiResponse(ai)) return ai.usageMetadata?.candidatesTokenCount;
  return ai.usage?.completion_tokens;
}

function isGeminiResponse(ai: WorkersAiResponse | GeminiResponse): ai is GeminiResponse {
  return 'candidates' in ai || 'usageMetadata' in ai;
}

function extractOutputText(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (!Array.isArray(output)) return undefined;

  return output
    .flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (!item || typeof item !== 'object') return [];
      const record = item as { text?: string; content?: unknown };
      if (typeof record.text === 'string') return [record.text];
      if (typeof record.content === 'string') return [record.content];
      if (Array.isArray(record.content)) {
        return record.content.flatMap((contentItem) => {
          if (typeof contentItem === 'string') return [contentItem];
          if (!contentItem || typeof contentItem !== 'object') return [];
          const contentRecord = contentItem as { text?: string };
          return typeof contentRecord.text === 'string' ? [contentRecord.text] : [];
        });
      }
      return [];
    })
    .join('\n');
}

function answerBodyLength(text: string): number {
  return stripSimulationPrefix(text).length;
}

function buildFallbackAnswer(body: ChatRequest): string {
  const scene = body.character?.concreteScenes?.[0];
  if (scene) {
    return [
      `음... ${scene.setting}에서 ${scene.action}던 장면이 먼저 떠올라요.`,
      `${scene.pressure} 때문에 그냥 넘기기가 쉽지 않았고, 그때 느낌은 ${scene.feeling}에 가까웠어요.`,
      `그래서 ${body.topic}을 물으면 저는 큰 통계보다 그런 관계와 감정의 흐름이 먼저 생각나요. ${scene.quoteSeed}`,
    ].join(' ');
  }

  const experience = body.persona.livedExperiences[0] ?? '제가 직접 겪은 장면은 아직 구체적으로 정리하기 어렵습니다';
  const tension = body.persona.tensions[0] ?? '한쪽으로 단정하기 어려운 느낌이 있습니다';
  return `음... 제 경험으로는 ${experience}. 그래서 ${body.topic}을 생각하면 ${tension}. 이걸 전체 의견처럼 말하기는 어렵지만, 적어도 저는 그 장면 때문에 이 질문이 꽤 현실적으로 느껴져요.`;
}

// 입력 길이를 잘라 토큰 비용과 프롬프트 남용을 줄인다.
function clampChatRequest(body: ChatRequest): void {
  body.latest = body.latest.slice(0, MAX_LATEST_CHARS);
  if (Array.isArray(body.history)) {
    body.history = body.history.slice(-MAX_HISTORY_TURNS).map((turn) => ({ ...turn, text: String(turn.text ?? '').slice(0, MAX_HISTORY_TEXT_CHARS) }));
  }
}

function isValidChatRequest(body: ChatRequest): boolean {
  return Boolean(
    body &&
      body.personaId &&
      body.topic &&
      body.researchQuestion &&
      body.latest &&
      body.persona?.label &&
      Array.isArray(body.persona.livedExperiences) &&
      Array.isArray(body.persona.concerns) &&
      Array.isArray(body.persona.tensions) &&
      (!body.character || Array.isArray(body.character.concreteScenes)),
  );
}

function sceneGroundingText(body: ChatRequest): string {
  const clipStr = (str: string, max = 150) => (str && str.length > max ? str.slice(0, max).trim() + '...' : str || '');
  if (!body.character?.concreteScenes?.length) {
    return body.persona.livedExperiences.slice(0, 4).map(e => clipStr(e, 120)).join(' / ');
  }
  const [primary, ...background] = body.character.concreteScenes;
  const formatScene = (scene: NonNullable<ChatRequest['character']>['concreteScenes'][number]) =>
    `${clipStr(scene.setting, 80)} | ${clipStr(scene.action, 120)} | ${clipStr(scene.pressure, 100)} | ${clipStr(scene.feeling, 80)} | ${clipStr(scene.consequence, 100)} | ${clipStr(scene.quoteSeed, 60)}`;
  const lines = [`주제 단서: ${formatScene(primary)}`];
  if (background.length > 0) {
    lines.push(`페르소나 배경 단서: ${background.slice(0, 1).map(formatScene).join(' / ')}`);
  }
  return lines.join('\n');
}

function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

function corsHeaders(origin: string | null, env: Env): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-session-id',
    Vary: 'Origin',
  });

  if (origin && isAllowedOrigin(origin, env)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return headers;
}

function json(value: unknown, status: number, headers: Headers): Response {
  const nextHeaders = new Headers(headers);
  nextHeaders.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers: nextHeaders });
}
