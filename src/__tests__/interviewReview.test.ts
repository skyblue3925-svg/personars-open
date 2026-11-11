import { expect, test } from 'vitest';
import { buildInterviewReview } from '../lib/interviewReview';
import type { InterviewTurn } from '../types/research';

test('returns an empty interview review before any follow-up turns', () => {
  const review = buildInterviewReview([]);

  expect(review.isEmpty).toBe(true);
  expect(review.summary).toBe('아직 돌아볼 면접 기록이 없습니다.');
  expect(review.goodQuestions).toEqual([]);
  expect(review.suggestedQuestions.length).toBeGreaterThan(0);
  expect(review.leadingQuestions).toEqual([]);
  expect(review.trustCautions).toEqual([]);
  expect(review.quoteCandidates).toEqual([]);
});

test('summarizes useful interview review signals from turns', () => {
  const turns: InterviewTurn[] = [
    {
      question: '그때 실제로 어디에서 어떤 일이 있었나요?',
      answer: '[가상 페르소나 시뮬레이션]\n급식실 앞 복도에서 줄이 길어져 쉬는 시간이 사라지는 느낌이 들었어요.',
      evidence: [{ kind: 'lifeScene', label: '생활 장면 근거', text: '급식실 앞 복도 장면' }],
    },
    {
      question: '급식 줄이 너무 길어서 당연히 불만이 많았죠?',
      answer: '[가상 페르소나 시뮬레이션]\n모든 학생이 급식 정책 때문에 불만을 가진다고 말할 수는 없어요.',
      evidence: [{ kind: 'uncertainBoundary', label: '추측 주의', text: '전체 학생 의견은 직접 확인한 내용이 아닙니다.' }],
    },
  ];

  const review = buildInterviewReview(turns);

  expect(review.isEmpty).toBe(false);
  expect(review.summary).toContain('2개의 후속 질문');
  expect(review.goodQuestions[0].question).toContain('어디에서 어떤 일이');
  expect(review.goodQuestions[0].reason).toContain('생활 장면');
  expect(review.leadingQuestions[0].question).toContain('당연히');
  expect(review.leadingQuestions[0].rewrite).toContain('어떤 점이 기억에 남았나요');
  expect(review.trustCautions[0].reason).toContain('추측 주의');
  expect(review.quoteCandidates[0].text).toContain('급식실 앞 복도');
  expect(review.suggestedQuestions.map((item) => item.question).join(' ')).toContain('주변 사람');
});

test('does not expose internal English terms in review text', () => {
  const review = buildInterviewReview([
    {
      question: '무엇을 직접 알고 있나요?',
      answer: '[가상 페르소나 시뮬레이션]\n제가 직접 본 것은 급식실 줄이 길었다는 점이에요.',
      evidence: [{ kind: 'speakableScope', label: '말할 수 있는 범위', text: '자기 경험 안에서 말할 수 있는 내용입니다.' }],
    },
  ]);

  const combined = JSON.stringify(review);
  expect(combined).not.toMatch(/dossier|scene bank|canSpeakTo|cannotSpeakTo/i);
});
