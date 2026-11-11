import { expect, test } from 'vitest';
import worker from '../../worker/src/index';
import { buildSystemPrompt, ensurePrefix, SIMULATION_PREFIX } from '../../worker/src/prompt';

test('worker prompt asks for natural first-person interview answers grounded in life scenes', () => {
  const prompt = buildSystemPrompt(
    {
      persona: {
        label: '수도권 고등학생',
        background: '수도권 일반고 학생',
        perspective: '학업과 친구 관계 속에서 주제를 바라본다',
        voice: '조심스럽지만 자기 경험을 구체적으로 설명하는 말투',
        livedExperiences: ['통학 시간에 친구들과 연락하고 과제 공지를 확인한다'],
        concerns: ['수면 부족과 학업 부담'],
        tensions: ['편리함과 피로 사이에서 갈등한다'],
      },
      lifeContext: '수도권 일반고 학생의 밤 시간 생활 맥락',
      canSpeakTo: ['밤 시간 스마트폰 사용과 수면 부족'],
      cannotSpeakTo: ['실제 전체 학생 통계'],
      concreteScenes: [
        {
          setting: '평일 밤 침대',
          people: ['수도권 고등학생', '친구들'],
          action: '스마트폰 알림을 확인하다가 수면 시간이 밀린다',
          pressure: '수면 부족과 학업 부담',
          feeling: '편리함과 피로 사이에서 갈등한다',
          consequence: '다음 날 집중력이 떨어진다',
          quoteSeed: '알림을 안 보면 뒤처질 것 같아요.',
        },
      ],
      recurringTensions: ['편리함과 피로 사이에서 갈등한다'],
    },
    '청소년 스마트폰 사용과 수면',
    '스마트폰 사용은 수면 경험에 어떤 영향을 주는가?',
  );

  expect(prompt).toContain('실제 인터뷰에서 잠시 생각하며 말하는 1인칭 구어체');
  expect(prompt).toContain('평일 밤 침대');
  expect(prompt).toContain('알림을 안 보면 뒤처질 것 같아요.');
  expect(prompt).toContain('정해진 단락 구조를 만들지 않습니다');
  expect(prompt).toContain('단서에 없는 연락 수단');
  expect(prompt).toContain('한국어로 답합니다');
});

test('worker prefix limiter preserves substantially longer answers', () => {
  const longAnswer = '가'.repeat(520);
  const text = ensurePrefix(longAnswer);

  expect(text.startsWith(SIMULATION_PREFIX)).toBe(true);
  expect(text).toContain(longAnswer);
});

test('worker prefix limiter does not cut usable long interview answers', () => {
  const longAnswer = '가'.repeat(1300);
  const text = ensurePrefix(longAnswer);

  expect(text.startsWith(SIMULATION_PREFIX)).toBe(true);
  expect(text).toContain(longAnswer);
  expect(text).not.toContain('...');
});

test('worker prompt avoids rigid template instructions that flatten persona voice', () => {
  const prompt = buildSystemPrompt(
    {
      label: '수도권 고등학생',
      background: '수도권 일반고 학생',
      perspective: '친구 관계와 수면 사이에서 고민한다',
      voice: '망설이다가 구체적인 장면을 말하는 말투',
      livedExperiences: ['침대에서 친구 메시지를 확인하다가 잠드는 시간이 늦어진다'],
      concerns: ['수면 부족'],
      tensions: ['답장 압박과 피곤함 사이의 갈등'],
    },
    '청소년 스마트폰 사용과 수면',
    '스마트폰 사용은 수면 경험에 어떤 영향을 주는가?',
  );

  expect(prompt).not.toContain('첫 문단');
  expect(prompt).not.toContain('두 번째 문단');
  expect(prompt).not.toContain('세 번째 문단');
  expect(prompt).not.toContain('scene bank');
  expect(prompt).not.toContain('dossier');
});

test('worker prompt prevents unrelated invented domains and keeps the answer in the interview context', () => {
  const prompt = buildSystemPrompt(
    {
      persona: {
        label: '맞벌이 학부모',
        background: '40대 영남권 회사원, 가정의 시간과 돌봄 부담이 큼',
        perspective: '가정과 학교의 지원을 함께 보며 자녀 문제를 조심스럽게 바라본다',
        voice: '조심스럽고 단정하지만 실제 생활의 난처함을 말한다',
        livedExperiences: ['퇴근 후 자녀 이야기를 듣고 학교 안내를 챙기는 시간이 부족하다'],
        concerns: ['가정의 시간과 돌봄 부담'],
        tensions: ['자녀의 자율성과 부모의 개입 사이 긴장'],
      },
      lifeContext: '맞벌이 학부모',
      canSpeakTo: ['자녀가 미디어와 또래 관계 속에서 외모를 의식하는 장면'],
      cannotSpeakTo: ['의학적 진단', '전체 청소년 통계'],
      concreteScenes: [
        {
          setting: '온라인 미디어를 본 뒤 집에서 외모 이야기가 오가는 시간',
          people: ['맞벌이 학부모', '자녀'],
          action: '자녀가 영상과 댓글을 보고 자기 외모를 비교한다',
          pressure: '외모 평가',
          feeling: '자기표현과 평가 불안 사이의 흔들림',
          consequence: '부모가 어떻게 반응해야 할지 조심스러워진다',
          quoteSeed: '그냥 넘기기에도 비교하게 되는 시간이 있어요',
        },
      ],
      recurringTensions: ['자기표현과 평가 불안', '자녀 자율성과 부모 개입'],
    },
    '외모지상주의와 미디어의 관계. 청소년을 중심으로.',
    '외모지상주의와 미디어의 관계는 청소년에게 어떤 영향을 미치는가?',
  );

  expect(prompt).toContain('자료에 없는 직장 프로젝트, 회의, 병원, 기관, 인물, 통계는 만들지 않습니다');
  expect(prompt).toContain('면접자의 방금 질문에 이어서 말하는 참여자');
  expect(prompt).toContain('한국어 구어체');
});

test('worker prompt harness separates topic evidence from persona background data', async () => {
  const captured = await captureWorkerUserPrompt({
    latest: '자녀분이 실제로 외모에 신경을 많이 쓰나요?',
    history: [],
  });

  expect(captured).toContain('주제 단서');
  expect(captured).toContain('외모 평가');
  expect(captured).toContain('페르소나 배경 단서');
  expect(captured).toContain('가정의 시간과 돌봄 부담');
  expect(captured).toContain('배경 단서는 말투, 관계 위치, 생활 제약을 만드는 데 사용');
  expect(captured).toContain('배경 단서를 별도 에피소드로 길게 풀지 마세요');
  expect(captured).toContain('말버릇 단서는 그대로 인용하지 말고');
  expect(captured).toContain('배경 단서는 한 문장 이하');
});

test('worker prompt tells the model to read conversational context and answer the latest turn', async () => {
  const captured = await captureWorkerUserPrompt({
    latest: '요즘은 미디어의 책임으로 돌리던데요.',
    history: [
      {
        role: 'student',
        text: '자녀분이 미디어를 많이 활용하나요? 그리고 외모에 관심이 많나요?',
      },
      {
        role: 'persona',
        text: '[가상 페르소나 시뮬레이션]\n아이들이 유튜브나 소셜 미디어를 통해 외모에 관심을 갖곤 해요.',
      },
    ],
  });

  expect(captured).toContain('대화 맥락 읽기');
  expect(captured).toContain('최신 질문에만 직접 반응');
  expect(captured).toContain('직전 답변의 문장이나 논지를 반복하지 마세요');
  expect(captured).toContain('면접자의 말이 반박이나 관점 제시라면');
  expect(captured).toContain('도덕 훈계나 일반론으로 마무리하지 마세요');
});

async function captureWorkerUserPrompt({
  latest,
  history,
}: {
  latest: string;
  history: Array<{ role: 'student' | 'persona'; text: string }>;
}) {
  let capturedUserPrompt = '';
  const env = {
    AI: {
      run: async (_model: string, input: { messages: Array<{ role: string; content: string }> }) => {
        capturedUserPrompt = input.messages.find((message) => message.role === 'user')?.content ?? '';
        return { response: '네, 저는 미디어에서 보이는 외모 기준을 보면서 아이가 또래 반응을 의식하는 장면이 먼저 떠올라요.' };
      },
    },
    RATE_KV: {
      get: async () => '0',
      put: async () => undefined,
    },
  };

  await worker.fetch(
    new Request('https://worker.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personaId: 'p-005',
        topic: '외모지상주의와 미디어의 관계. 청소년을 중심으로.',
        researchQuestion: '외모지상주의와 미디어의 관계는 청소년에게 어떤 영향을 미치는가?',
        latest,
        history,
        persona: {
          label: '맞벌이 학부모',
          background: '가정의 시간과 돌봄 부담',
          perspective: '가정과 학교의 지원을 함께 본다',
          voice: '조심스럽게 말함',
          livedExperiences: ['퇴근 후 자녀 이야기를 듣고 학교 안내를 챙기는 시간이 부족하다'],
          concerns: ['가정의 시간과 돌봄 부담'],
          tensions: ['자녀 자율성과 방치 사이의 긴장'],
        },
        character: {
          lifeContext: '맞벌이 학부모',
          canSpeakTo: ['자녀가 미디어와 또래 관계 속에서 외모를 의식하는 장면'],
          cannotSpeakTo: ['의학적 진단'],
          concreteScenes: [
            {
              setting: '온라인 미디어를 본 뒤 집에서 외모 이야기가 오가는 시간',
              people: ['맞벌이 학부모', '자녀'],
              action: '자녀가 영상과 댓글을 본 뒤 외모를 비교한다',
              pressure: '외모 평가',
              feeling: '자기표현과 평가 불안 사이의 흔들림',
              consequence: '부모가 어떻게 반응해야 할지 조심스러워진다',
              quoteSeed: '그냥 넘기려 해도 비교하게 되는 순간이 있어요.',
            },
            {
              setting: '퇴근 후 학교 안내를 챙기는 시간',
              people: ['맞벌이 학부모', '자녀'],
              action: '학교 안내를 늦게 확인한다',
              pressure: '가정의 시간과 돌봄 부담',
              feeling: '바쁘고 미안함',
              consequence: '대화 시간이 부족해진다',
              quoteSeed: '시간이 늘 부족해요.',
            },
          ],
          recurringTensions: ['자기표현과 평가 불안'],
        },
      }),
    }),
    env as never,
  );

  return capturedUserPrompt;
}
