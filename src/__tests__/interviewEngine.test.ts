import { expect, test } from 'vitest';
import { fallbackPersonas } from '../data/personas';
import { buildInterviewQuestions, buildInterviews } from '../lib/interviewEngine';
import { createResearchDraft } from '../lib/researchDraft';

test('template interview answers react directly and use scene bank without repeated introductions', () => {
  const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
  const interviews = buildInterviews(draft, [fallbackPersonas[0]], 1, buildInterviewQuestions(draft).slice(0, 4));
  const answers = interviews[0].turns.map((turn) => turn.answer);

  expect(answers[0]).toContain('질문에 바로 답하면');
  expect(answers.join(' ')).toContain('평일 밤');
  expect(interviews[0].character?.concreteScenes[0].quoteSeed).toContain('알림');
  expect(answers.join(' ')).not.toContain('저는 수도권 고등학생');
});

test('generated interviews record which scenes were used', () => {
  const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
  const interview = buildInterviews(draft, [fallbackPersonas[0]], 1, buildInterviewQuestions(draft).slice(0, 3))[0];

  expect(interview.character?.usedSceneIds).toHaveLength(3);
  expect(new Set(interview.character?.usedSceneIds).size).toBe(3);
});

test('default interview questions are qualitative prompts without survey or hypothesis prerequisites', () => {
  const draft = createResearchDraft('지역 서점이 청소년 독서 경험에 주는 영향');
  const questions = buildInterviewQuestions(draft).map((question) => `${question.text} ${question.intent}`).join('\n');

  expect(questions).toContain('일상');
  expect(questions).toContain('관점');
  expect(questions).not.toContain('설문');
  expect(questions).not.toContain('가설');
});
