import { expect, test } from 'vitest';
import { appendInterviewTurn } from '../lib/projectInterviewTranscript';
import type { ResearchProject } from '../types/research';

function buildProject(): ResearchProject {
  return {
    draft: {
      title: 'Mobile saving study',
      topic: 'mobile saving',
      question: 'How should mobile users save interview work?',
      hypothesis: 'Clear save flows improve completion.',
      targetGroup: 'students',
      independentVariable: 'save flow clarity',
      dependentVariable: 'completion confidence',
    },
    samplePlan: {
      id: 'sample',
      label: 'Sample',
      size: 1,
      groups: [{ label: 'Students', ratio: 1, description: 'Test group' }],
      biasNote: 'Synthetic test data',
    },
    interviewQuestions: [],
    interviews: [
      {
        persona: {
          id: 'persona-a',
          label: 'Persona A',
          ageGroup: 'teen',
          region: 'Seoul',
          occupation: 'student',
          background: 'Uses a phone for school work.',
          perspective: 'Needs simple mobile tools.',
          voice: 'plain spoken',
          livedExperiences: ['Saved notes after class'],
          concerns: ['losing work'],
          tensions: ['quick sharing vs careful records'],
        },
        groupReason: 'Selected for mobile save testing.',
        turns: [
          {
            question: 'What matters first?',
            answer: '[가상 페르소나 시뮬레이션]\nI need to know where my work went.',
            source: 'template',
            generatedAt: '2026-04-29T00:00:00.000Z',
          },
        ],
        quotes: ['I need to know where my work went.'],
        codes: ['save confidence'],
        themes: ['mobile workflow'],
      },
    ],
  };
}

test('appends a live interview turn to the matching project interview without mutating the original project', () => {
  const project = buildProject();
  const turn = {
    question: 'Can you explain the mobile save moment?',
    answer:
      '[가상 페르소나 시뮬레이션]\nWhen I finish on my phone, I want one button that saves the whole interview and lets me share it.',
    source: 'llm' as const,
    modelId: 'gemini-3-flash-preview',
    generatedAt: '2026-04-29T01:00:00.000Z',
  };

  const updated = appendInterviewTurn(project, 'persona-a', turn);

  expect(updated).not.toBe(project);
  expect(updated.interviews[0]).not.toBe(project.interviews[0]);
  expect(project.interviews[0].turns).toHaveLength(1);
  expect(updated.interviews[0].turns).toHaveLength(2);
  expect(updated.interviews[0].turns[1]).toEqual(turn);
  expect(updated.interviews[0].quotes.join(' ')).toContain('one button that saves');
  expect(updated.interviews[0].codes).toEqual(project.interviews[0].codes);
  expect(updated.interviews[0].themes).toEqual(project.interviews[0].themes);
});

test('returns the original project when the persona id is not part of the project', () => {
  const project = buildProject();

  const updated = appendInterviewTurn(project, 'missing-persona', {
    question: 'Will this be stored?',
    answer: '[가상 페르소나 시뮬레이션]\nNo matching interview exists.',
    source: 'llm',
  });

  expect(updated).toBe(project);
});
