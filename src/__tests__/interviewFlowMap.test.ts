import { describe, expect, test } from 'vitest';
import { buildInterviewFlowMap } from '../lib/interviewFlowMap';
import type { InterviewTurn } from '../types/research';

describe('interviewFlowMap', () => {
  test('counts AI-confirmed coverage separately from inferred coverage', () => {
    const turns: InterviewTurn[] = [
      {
        question: '그때 실제로 어떤 일이 있었나요?',
        answer: '침대에서 알림을 확인했습니다.',
        coach: {
          score: 85,
          tags: ['장면 탐색'],
          summary: '구체 장면을 묻습니다.',
          suggestion: '좋습니다.',
          revisedQuestion: '그때 실제로 어떤 일이 있었나요?',
          coverage: {
            lifeScene: true,
            emotionTension: false,
            relationship: false,
            conditionConstraint: true,
            unknownBoundary: false,
          },
          source: 'llm',
        },
      },
      {
        question: '주변 친구들은 어떻게 반응했나요?',
        answer: '친구들도 비슷했습니다.',
      },
    ];

    const map = buildInterviewFlowMap(turns);

    expect(map.axes.find((axis) => axis.id === 'lifeScene')?.confirmedCount).toBe(1);
    expect(map.axes.find((axis) => axis.id === 'conditionConstraint')?.confirmedCount).toBe(1);
    expect(map.axes.find((axis) => axis.id === 'relationship')?.inferredCount).toBe(1);
  });

  test('requires two AI-confirmed turns before an axis is enough', () => {
    const turns: InterviewTurn[] = [
      { question: '주변 친구들은 어떻게 반응했나요?', answer: 'A' },
      { question: '부모님은 어떻게 보셨나요?', answer: 'B' },
    ];

    const map = buildInterviewFlowMap(turns);

    expect(map.axes.find((axis) => axis.id === 'relationship')?.state).toBe('started');
    expect(map.axes.find((axis) => axis.id === 'relationship')?.isInferredOnly).toBe(true);
  });

  test('recommends empty axes before partially covered axes', () => {
    const map = buildInterviewFlowMap([
      {
        question: '그때 실제로 어떤 일이 있었나요?',
        answer: 'A',
        coach: {
          score: 80,
          tags: [],
          summary: 'A',
          suggestion: 'B',
          revisedQuestion: 'C',
          coverage: {
            lifeScene: true,
            emotionTension: false,
            relationship: false,
            conditionConstraint: false,
            unknownBoundary: false,
          },
          source: 'llm',
        },
      },
    ]);

    expect(map.recommendation.axisId).toBe('emotionTension');
  });
});
