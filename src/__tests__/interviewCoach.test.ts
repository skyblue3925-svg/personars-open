import { describe, expect, test, vi } from 'vitest';
import { fallbackPersonas } from '../data/personas';
import { coachInterviewQuestion } from '../lib/interviewCoach';
import { buildInterviewCharacter } from '../lib/interviewCharacter';
import { createResearchDraft } from '../lib/researchDraft';

const persona = fallbackPersonas[0];
const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
const character = buildInterviewCharacter(draft, persona);

describe('interviewCoach', () => {
  test('returns llm question feedback from the configured coach API', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        score: 82,
        tags: ['좋은 후속 질문', '장면 탐색'],
        summary: '직전 답변을 잘 이어받고 있습니다.',
        suggestion: '그때 실제로 어떤 장면이 있었는지 더 구체적으로 물어보세요.',
        revisedQuestion: '그때 잠들기 전 실제로 어떤 일이 있었나요?',
        coverage: {
          lifeScene: true,
          emotionTension: false,
          relationship: false,
          conditionConstraint: true,
          unknownBoundary: false,
        },
        modelId: 'gemini-3-flash-preview',
        generatedAt: '2026-04-29T06:00:00.000Z',
        usage: { tokensIn: 300, tokensOut: 120 },
      }),
    });

    const feedback = await coachInterviewQuestion(
      {
        personaId: persona.id,
        topic: draft.topic,
        researchQuestion: draft.question,
        latest: 'Why did that happen?',
        history: [],
        persona,
        character,
      },
      { apiUrl: 'https://example.test/api/coach', fetcher },
    );

    expect(feedback.source).toBe('llm');
    expect(feedback.score).toBe(82);
    expect(feedback.tags).toContain('좋은 후속 질문');
    expect(feedback.coverage.lifeScene).toBe(true);
    expect(feedback.tokensIn).toBe(300);
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/coach', expect.any(Object));
    expect(JSON.parse(fetcher.mock.calls[0][1].body).character.lifeContext).toBe(character.lifeContext);
  });

  test('uses the deployed coach endpoint by default', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        score: 75,
        tags: ['점검 완료'],
        summary: '질문 의도는 분명합니다.',
        suggestion: '경험 장면을 더 물어보세요.',
        revisedQuestion: '그때 어떤 장면이 있었나요?',
        coverage: {},
      }),
    });

    await coachInterviewQuestion(
      {
        personaId: persona.id,
        topic: draft.topic,
        researchQuestion: draft.question,
        latest: 'Can you explain more?',
        history: [],
        persona,
        character,
      },
      { fetcher, apiUrl: 'https://example.test/coach' },
    );

    expect(fetcher).toHaveBeenCalledWith('https://example.test/coach', expect.any(Object));
  });

  test('throws when no coach endpoint is configured', async () => {
    await expect(
      coachInterviewQuestion({ personaId: 'p', topic: 't', researchQuestion: 'q', latest: 'l', history: [], persona: {} as never, character: {} as never }, { fetcher: vi.fn() }),
    ).rejects.toThrow('interview_coach_unavailable');
  });
});
