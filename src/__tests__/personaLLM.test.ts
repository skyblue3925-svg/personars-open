import { describe, expect, test, vi } from 'vitest';
import { fallbackPersonas } from '../data/personas';
import { createResearchDraft } from '../lib/researchDraft';
import { chatWithPersona, ensureSimulationPrefix, SIMULATION_PREFIX } from '../lib/personaLLM';

const persona = fallbackPersonas[0];
const draft = createResearchDraft('청소년 스마트폰 사용과 수면');

describe('personaLLM', () => {
  test('forces the simulation prefix on arbitrary text', () => {
    expect(ensureSimulationPrefix('제 경험으로는 밤에 알림을 끄기 어렵습니다.')).toBe(
      `${SIMULATION_PREFIX}\n제 경험으로는 밤에 알림을 끄기 어렵습니다.`,
    );
  });

  test('returns llm answers from the configured API with prefix and metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: '제 경험으로는 통학 중 스마트폰을 계속 확인하게 됩니다.',
        usage: { tokensIn: 120, tokensOut: 48 },
      }),
    });

    const response = await chatWithPersona(
      {
        personaId: persona.id,
        topic: draft.topic,
        researchQuestion: draft.question,
        history: [],
        latest: '실제 사례가 있나요?',
      },
      persona,
      draft,
      { apiUrl: 'https://example.test/api/persona-chat', fetcher },
    );

    expect(response.source).toBe('llm');
    expect(response.modelId).toBe('gemini-2.5-flash');
    expect(response.text.startsWith(SIMULATION_PREFIX)).toBe(true);
    expect(response.tokensIn).toBe(120);
    expect(fetcher).toHaveBeenCalledOnce();
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.character.topicFrame.category).toBe('smartphone-sleep');
    expect(payload.character.topicFrame.sceneSeed.setting).toContain('청소년 스마트폰 사용과 수면');
    expect(payload.character.concreteScenes.length).toBeGreaterThan(0);
  });

  test('preserves valid Korean evidence returned by the persona API', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: '자기 전 알림을 확인하다가 잠드는 시간이 늦어졌습니다.',
        evidence: [{ kind: 'lifeScene', label: '생활 장면 근거', text: '침실 장면을 바탕으로 한 답변입니다.' }],
      }),
    });

    const response = await chatWithPersona(
      {
        personaId: persona.id,
        topic: draft.topic,
        researchQuestion: draft.question,
        history: [],
        latest: '어떤 장면이 있었나요?',
      },
      persona,
      draft,
      { apiUrl: 'https://example.test/api/persona-chat', fetcher },
    );

    expect(response.evidence).toEqual([
      { kind: 'lifeScene', label: '생활 장면 근거', text: '침실 장면을 바탕으로 한 답변입니다.' },
    ]);
  });

  test('falls back to local Korean evidence when the persona API omits evidence', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '자기 전 알림 확인 경험을 말할 수 있습니다.' }),
    });

    const response = await chatWithPersona(
      {
        personaId: persona.id,
        topic: draft.topic,
        researchQuestion: draft.question,
        history: [],
        latest: '어떤 장면이 있었나요?',
      },
      persona,
      draft,
      { apiUrl: 'https://example.test/api/persona-chat', fetcher },
    );

    expect(response.evidence?.map((item) => item.label)).toContain('생활 장면 근거');
    expect(response.evidence?.map((item) => item.text).join(' ')).not.toMatch(/dossier|scene|canSpeakTo|cannotSpeakTo/i);
  });

  test('falls back to the deterministic template when the API fails', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const response = await chatWithPersona(
      {
        personaId: persona.id,
        topic: draft.topic,
        researchQuestion: draft.question,
        history: [],
        latest: '실제 사례가 있나요?',
      },
      persona,
      draft,
      { apiUrl: 'https://example.test/api/persona-chat', fetcher },
    );

    expect(response.source).toBe('template');
    expect(response.text.startsWith(SIMULATION_PREFIX)).toBe(true);
    expect(response.text).toContain(persona.label);
    expect(response.text).toContain(draft.topic);
  });

  test('uses the deployed worker as the default API endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: '밤에 알림을 확인하다가 잠드는 시간이 늦어지는 경험이 있습니다.',
      }),
    });

    const response = await chatWithPersona(
      {
        personaId: persona.id,
        topic: draft.topic,
        researchQuestion: draft.question,
        history: [],
        latest: '조금 더 자세히 말해줄 수 있나요?',
      },
      persona,
      draft,
      { fetcher, apiUrl: 'https://example.test/persona' },
    );

    expect(response.source).toBe('llm');
    expect(fetcher).toHaveBeenCalledWith('https://example.test/persona', expect.any(Object));
  });

  test('reports the persona API as unavailable when no endpoint is configured', async () => {
    const module = await import('../lib/personaLLM');

    expect(module.hasPersonaApiEndpoint()).toBe(false);
  });
});
