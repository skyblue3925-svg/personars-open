import { afterEach, expect, test, vi } from 'vitest';
import worker from '../../worker/src/index';

afterEach(() => {
  vi.restoreAllMocks();
});

test('worker uses Gemini 3 Flash first when a Gemini key is configured', async () => {
  const naturalAnswer =
    '음... 저는 밤에 누우면 바로 자야 한다는 걸 알면서도 친구 메시지가 오면 손이 먼저 가요. 답장을 안 하면 다음 날 학교에서 좀 어색해질까 봐요. 그래서 그냥 한 번만 확인하려고 했는데, 얘기가 이어지면 시간이 금방 지나가고 아침에 일어날 때 머리가 무거워요. 그게 매일 큰일처럼 느껴지는 건 아니지만, 아침에 수업을 들을 때 멍해지면 전날 밤에 또 끊지 못했다는 생각이 들어요.';
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: naturalAnswer }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  const env = {
    ALLOWED_ORIGINS: 'https://example.test',
    GEMINI_API_KEY: 'test-key',
    AI: {
      run: async () => {
        throw new Error('Workers AI should not be used when Gemini succeeds');
      },
    },
    RATE_KV: {
      get: async () => '0',
      put: async () => undefined,
    },
  };

  const request = new Request('https://worker.test', {
    method: 'POST',
    headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({
      personaId: 'p1',
      topic: '청소년 스마트폰 사용과 수면',
      researchQuestion: '스마트폰 사용은 수면에 어떤 영향을 주는가?',
      latest: '밤에 스마트폰을 쓰는 상황을 구체적으로 말해줄 수 있나요?',
      history: [],
      persona: {
        label: '고등학생 민서',
        background: '수도권 일반고 2학년',
        perspective: '친구 관계와 수면 사이에서 고민한다',
        voice: '망설이다가 구체적으로 말하는 말투',
        livedExperiences: ['잠들기 전 친구 메시지를 확인한다'],
        concerns: ['수면 부족'],
        tensions: ['답장 압박과 피곤함 사이의 갈등'],
      },
      character: {
        lifeContext: '수도권 일반고 2학년',
        canSpeakTo: ['잠들기 전 스마트폰 사용 경험'],
        cannotSpeakTo: ['의학적 진단'],
        concreteScenes: [
          {
            id: 's1',
            setting: '집 침대에서 잠들기 전',
            people: ['본인', '친구'],
            action: '친구 메시지와 알림을 확인함',
            pressure: '답장을 늦게 하면 관계가 어색해질 것 같은 압박',
            feeling: '피곤하지만 끊기 어려움',
            consequence: '잠드는 시간이 늦어짐',
            quoteSeed: '그냥 확인만 하려다가 계속 보게 돼요',
          },
        ],
        recurringTensions: ['답장 압박과 피곤함 사이의 갈등'],
      },
    }),
  });

  const response = await worker.fetch(request, env as never);
  const json = (await response.json()) as { text: string; modelId: string };

  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]?.toString()).toContain('gemini-3-flash-preview:generateContent');
  expect(json.modelId).toBe('gemini-3-flash-preview');
  expect(json.text).toContain('음...');
  expect(json.text).toContain('학교에서 좀 어색해질까');
  expect(json.text).not.toContain('제 경우에는 이 질문을 들으면 먼저');
});

test('worker falls back from Gemini 3 Flash to Gemini 2.5 Flash before Workers AI', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response('region blocked', { status: 503 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '그 말에 어느 정도 동의해요. 미디어가 외모 기준을 계속 보여주니까 아이가 집에서도 그 기준을 가져와서 자기 모습을 비교하더라고요. 다만 부모 입장에서는 미디어 탓만 하고 끝내기보다는, 그걸 본 뒤 아이가 어떤 말을 하는지 듣는 시간이 더 필요하다고 느껴요. 그런데 퇴근하고 나면 그 이야기를 길게 붙잡을 여유가 없어서, 알고도 지나치는 순간이 생깁니다.',
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  const env = {
    ALLOWED_ORIGINS: 'https://example.test',
    GEMINI_API_KEY: 'test-key',
    AI: {
      run: async () => {
        throw new Error('Workers AI should not be used when Gemini fallback succeeds');
      },
    },
    RATE_KV: {
      get: async () => '0',
      put: async () => undefined,
    },
  };

  const response = await worker.fetch(buildBasicRequest(), env as never);
  const json = (await response.json()) as { text: string; modelId: string };

  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]?.toString()).toContain('gemini-3-flash-preview:generateContent');
  expect(fetchMock.mock.calls[1][0]?.toString()).toContain('gemini-2.5-flash:generateContent');
  expect(json.modelId).toBe('gemini-2.5-flash');
  expect(json.text).toContain('미디어가 외모 기준을 계속 보여주니까');
});

test('worker falls back to Workers AI when Gemini models fail', async () => {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response('region blocked', { status: 503 }))
    .mockResolvedValueOnce(new Response('quota exceeded', { status: 429 }));
  const requestedModels: string[] = [];
  const env = {
    ALLOWED_ORIGINS: 'https://example.test',
    GEMINI_API_KEY: 'test-key',
    AI: {
      run: async (model: string) => {
        requestedModels.push(model);
        if (requestedModels.length === 1) throw new Error('model unavailable');
        return {
          response:
            '음... 그 말에 덧붙이면, 미디어 책임이 크다고는 생각해요. 아이가 영상을 보고 자기 얼굴이나 몸을 비교하는 장면이 실제로 있으니까요. 다만 집에서는 그걸 어떻게 받아들이는지 옆에서 보게 되니까, 한쪽 책임으로만 말하기가 조심스러워요. 미디어가 분위기를 만들고, 또래 반응이 붙고, 부모는 늦게 알아차리는 식으로 겹쳐지는 느낌이 있습니다.',
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        };
      },
    },
    RATE_KV: {
      get: async () => '0',
      put: async () => undefined,
    },
  };

  const request = new Request('https://worker.test', {
    method: 'POST',
    headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({
      personaId: 'p1',
      topic: '외모지상주의와 미디어의 관계',
      researchQuestion: '미디어는 외모 인식에 어떤 영향을 주는가?',
      latest: '요즘은 미디어의 책임으로 돌리던데요.',
      history: [],
      persona: {
        label: '맞벌이 학부모',
        background: '40대 회사원',
        perspective: '가정과 미디어 환경을 함께 본다',
        voice: '조심스럽게 말한다',
        livedExperiences: ['자녀가 미디어를 본 뒤 외모 이야기를 한다'],
        concerns: ['외모 평가'],
        tensions: ['자녀 자율성과 부모 개입'],
      },
    }),
  });

  const response = await worker.fetch(request, env as never);
  const json = (await response.json()) as { text: string; modelId: string };

  expect(response.status).toBe(200);
  expect(requestedModels.length).toBe(2);
  expect(requestedModels[0]).toBe('@cf/openai/gpt-oss-20b');
  expect(requestedModels[1]).toBe('@cf/meta/llama-3.2-3b-instruct');
  expect(json.modelId).toBe('@cf/meta/llama-3.2-3b-instruct');
  expect(json.text).toContain('미디어 책임');
});

test('worker reads OpenAI-style choice responses from Workers AI models', async () => {
  const env = {
    ALLOWED_ORIGINS: 'https://example.test',
    AI: {
      run: async () => ({
        choices: [
          {
            message: {
              content:
                '그 말에 어느 정도 동의해요. 미디어가 외모 기준을 계속 보여주니까 아이가 집에서도 그 기준을 가져와서 자기 모습을 비교하더라고요. 다만 부모 입장에서는 미디어 탓만 하고 끝내기보다는, 그걸 본 뒤 아이가 어떤 말을 하는지 듣는 시간이 더 필요하다고 느껴요.',
            },
          },
        ],
      }),
    },
    RATE_KV: {
      get: async () => '0',
      put: async () => undefined,
    },
  };

  const request = new Request('https://worker.test', {
    method: 'POST',
    headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({
      personaId: 'p1',
      topic: '외모지상주의와 미디어의 관계',
      researchQuestion: '미디어는 외모 인식에 어떤 영향을 주는가?',
      latest: '요즘은 미디어의 책임으로 돌리던데요.',
      history: [],
      persona: {
        label: '맞벌이 학부모',
        background: '40대 회사원',
        perspective: '가정과 미디어 환경을 함께 본다',
        voice: '조심스럽게 말한다',
        livedExperiences: ['자녀가 미디어를 본 뒤 외모 이야기를 한다'],
        concerns: ['외모 평가'],
        tensions: ['자녀 자율성과 부모 개입'],
      },
    }),
  });

  const response = await worker.fetch(request, env as never);
  const json = (await response.json()) as { text: string };

  expect(response.status).toBe(200);
  expect(json.text).toContain('미디어가 외모 기준을 계속 보여주니까');
  expect(json.text).not.toContain('장면이 먼저 떠올라요');
});

test('worker rate limits by IP even when the session id changes', async () => {
  const kvStored: Record<string, string> = {};
  const env = {
    ALLOWED_ORIGINS: 'https://example.test',
    GEMINI_API_KEY: 'test-key',
    AI: {
      run: async () => ({
        response: '안녕',
      }),
    },
    RATE_KV: {
      get: async (key: string) => kvStored[key] ?? null,
      put: async (key: string, value: string) => {
        kvStored[key] = value;
      },
    },
  };

  const req1 = new Request('https://worker.test', {
    method: 'POST',
    headers: { origin: 'https://example.test', 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', 'X-Session-Id': 'session-A' },
    body: JSON.stringify({
      personaId: 'p1',
      topic: '주제',
      researchQuestion: '질문',
      latest: '안녕',
      persona: { label: 'A', background: 'B', perspective: 'C', voice: 'D', livedExperiences: [], concerns: [], tensions: [] }
    }),
  });

  const req2 = new Request('https://worker.test', {
    method: 'POST',
    headers: { origin: 'https://example.test', 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', 'X-Session-Id': 'session-B' },
    body: JSON.stringify({
      personaId: 'p1',
      topic: '주제',
      researchQuestion: '질문',
      latest: '안녕',
      persona: { label: 'A', background: 'B', perspective: 'C', voice: 'D', livedExperiences: [], concerns: [], tensions: [] }
    }),
  });

  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '[가상 페르소나 시뮬레이션]\n음... 저는 괜찮아요. 충분히 길게 대답하고 행동과 감정을 표현하겠습니다. 이 정도 길이면 160자를 가뿐히 넘길 수 있을 것 같습니다. 왜냐하면 학생들과 진행하는 인터뷰 세션은 현실감 있고 풍부해야 하니까요. 그렇지 않으면 대화가 너무 뚝뚝 끊겨서 학습 효과가 떨어집니다. 더 많은 이야기를 들려주고 싶네요.' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );

  const res1 = await worker.fetch(req1, env as never);
  const res2 = await worker.fetch(req2, env as never);

  expect(res1.status).toBe(200);
  expect(res2.status).toBe(200);

  const day = new Date().toISOString().slice(0, 10);
  expect(kvStored[`persona-chat:${day}:1.2.3.4`]).toBe('2');
});

function buildBasicRequest() {
  return new Request('https://worker.test', {
    method: 'POST',
    headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({
      personaId: 'p1',
      topic: '외모지상주의와 미디어의 관계',
      researchQuestion: '미디어는 외모 인식에 어떤 영향을 주는가?',
      latest: '요즘은 미디어의 책임으로 돌리던데요.',
      history: [],
      persona: {
        label: '맞벌이 학부모',
        background: '40대 회사원',
        perspective: '가정과 미디어 환경을 함께 본다',
        voice: '조심스럽게 말한다',
        livedExperiences: ['자녀가 미디어를 본 뒤 외모 이야기를 한다'],
        concerns: ['외모 평가'],
        tensions: ['자녀 자율성과 부모 개입'],
      },
    }),
  });
}

test('worker systemInstruction contains studentRole when studentRole is provided in ChatRequest', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: '[가상 페르소나 시뮬레이션]\n음... 안녕하세요. 토론을 진행해봅시다. 저는 이 주제에 관심이 많습니다. 구체적인 경험을 들려드리자면, 지난번에 비슷한 상황이 있었는데 정말 당황스러웠습니다. 앞으로 이런 부분들을 어떻게 풀어가면 좋을지 함께 고민해보면 좋겠습니다. 더 궁금한 점이 있으시다면 편하게 질문해주세요. 이 정도 길이면 충분히 긴 응답 조건인 160자 제한을 통과할 수 있을 것입니다.' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  const env = {
    ALLOWED_ORIGINS: 'https://example.test',
    GEMINI_API_KEY: 'test-key',
    RATE_KV: {
      get: async () => '0',
      put: async () => undefined,
    },
  };

  const req = new Request('https://worker.test', {
    method: 'POST',
    headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({
      personaId: 'p1',
      topic: '외모지상주의와 미디어의 관계',
      researchQuestion: '미디어는 외모 인식에 어떤 영향을 주는가?',
      latest: '요즘은 미디어의 책임으로 돌리던데요.',
      studentRole: '구의회 의원',
      history: [],
      persona: {
        label: '맞벌이 학부모',
        background: '40대 회사원',
        perspective: '가정과 미디어 환경을 함께 본다',
        voice: '조심스럽게 말한다',
        livedExperiences: ['자녀가 미디어를 본 뒤 외모 이야기를 한다'],
        concerns: ['외모 평가'],
        tensions: ['자녀 자율성과 부모 개입'],
      },
    }),
  });

  const response = await worker.fetch(req, env as never);
  expect(response.status).toBe(200);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const fetchBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
  expect(fetchBody.systemInstruction.parts[0].text).toContain('면접자(학생)의 역할/입장: 구의회 의원');
});
