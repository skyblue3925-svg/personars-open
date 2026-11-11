import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { InterviewStep } from '../components/InterviewStep';
import { fallbackPersonas } from '../data/personas';
import { buildInterviewQuestions, buildInterviews } from '../lib/interviewEngine';
import { createResearchDraft } from '../lib/researchDraft';
import type { ResearchProject } from '../types/research';

vi.mock('../lib/personaLLM', async () => {
  const actual = await vi.importActual<typeof import('../lib/personaLLM')>('../lib/personaLLM');
  return {
    ...actual,
    chatWithPersona: vi.fn(async () => ({
      text: '[가상 페르소나 시뮬레이션]\nMobile save should keep the exact interview I just created.',
      source: 'llm',
      modelId: 'gemini-3-flash-preview',
      generatedAt: '2026-04-29T01:00:00.000Z',
      evidence: [
        { kind: 'lifeScene', label: '생활 장면 근거', text: '침실 장면을 바탕으로 한 답변입니다.' },
        { kind: 'speakableScope', label: '말할 수 있는 범위', text: '자기 경험 안에서 말할 수 있는 내용입니다.' },
      ],
    })),
  };
});

vi.mock('../lib/interviewCoach', async () => {
  const actual = await vi.importActual<typeof import('../lib/interviewCoach')>('../lib/interviewCoach');
  return {
    ...actual,
    coachInterviewQuestion: vi.fn(async () => ({
      score: 88,
      tags: ['좋은 후속 질문', '장면 탐색'],
      summary: '직전 답변을 잘 이어받고 있습니다.',
      suggestion: '구체적인 장면을 더 물어보세요.',
      revisedQuestion: '그때 실제로 어떤 일이 있었나요?',
      coverage: {
        lifeScene: true,
        emotionTension: false,
        relationship: false,
        conditionConstraint: true,
        unknownBoundary: false,
      },
      source: 'llm',
      modelId: 'gemini-3-flash-preview',
      generatedAt: '2026-04-29T06:00:00.000Z',
    })),
  };
});

function buildProject(): ResearchProject {
  const draft = createResearchDraft('청소년 스마트폰 사용과 수면');
  const questions = buildInterviewQuestions(draft);

  return {
    draft,
    samplePlan: {
      id: 'test',
      label: 'Test sample',
      size: 10,
      groups: [{ label: 'Students', ratio: 1, description: 'Test group' }],
      biasNote: 'For tests',
    },
    interviewQuestions: questions,
    interviews: buildInterviews(draft, [fallbackPersonas[0]], 1, questions),
  };
}

test('interview chat starts as a live one-on-one session instead of showing canned template answers', () => {
  render(<InterviewStep project={buildProject()} />);

  expect(screen.getByText(/질문을 보내면/)).toBeTruthy();
  expect(screen.queryByText(/scene bank template/)).toBeNull();
});

test('shows the selected persona introduction before the first student question', () => {
  const project = buildProject();
  render(<InterviewStep project={project} />);

  const introduction = screen.getByTestId('persona-introduction');
  expect(introduction.textContent).toContain(project.interviews[0].persona.label);
  expect(introduction.textContent).toContain(project.draft.topic);
});

test('uses student-facing Korean labels instead of internal interview terms', () => {
  render(<InterviewStep project={buildProject()} />);

  expect(screen.getByText('현재 인터뷰 대상')).toBeTruthy();
  expect(screen.getByText('인물 설정 자료')).toBeTruthy();
  expect(screen.getByText('생활 장면 자료')).toBeTruthy();
  expect(screen.getByText('말할 수 있는 범위')).toBeTruthy();
  expect(screen.getByText('말하기 어려운 범위')).toBeTruthy();

  expect(screen.queryByText('Active Interviewee')).toBeNull();
  expect(screen.queryByText(/dossier/i)).toBeNull();
  expect(screen.queryByText(/scene bank/i)).toBeNull();
});

test('reports generated follow-up turns to the parent project state', async () => {
  const project = buildProject();
  const onTurnAdded = vi.fn();

  render(<InterviewStep project={project} onTurnAdded={onTurnAdded} />);

  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'How should mobile saving work after this interview?' },
  });
  fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }));

  await waitFor(() => {
    expect(onTurnAdded).toHaveBeenCalledWith(
      project.interviews[0].persona.id,
      expect.objectContaining({
        question: 'How should mobile saving work after this interview?',
        answer: expect.stringContaining('exact interview'),
        source: 'llm',
        modelId: 'gemini-3-flash-preview',
        generatedAt: '2026-04-29T01:00:00.000Z',
      }),
    );
  });
});

test('keeps the LLM interview coach optional and attaches feedback only after the student requests it', async () => {
  const project = buildProject();
  const onTurnAdded = vi.fn();

  render(<InterviewStep project={project} onTurnAdded={onTurnAdded} />);

  expect(screen.queryByText('코치 피드백 받기')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'AI 코치 켜기' }));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Why did that happen?' },
  });
  fireEvent.click(screen.getByRole('button', { name: '코치 피드백 받기' }));

  expect(await screen.findByText('88점')).toBeTruthy();
  expect(screen.getByText('그때 실제로 어떤 일이 있었나요?')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }));

  await waitFor(() => {
    expect(onTurnAdded).toHaveBeenCalledWith(
      project.interviews[0].persona.id,
      expect.objectContaining({
        question: 'Why did that happen?',
        coach: expect.objectContaining({
          score: 88,
          revisedQuestion: '그때 실제로 어떤 일이 있었나요?',
          source: 'llm',
        }),
      }),
    );
  });
});

test('renders an interview flow map above the question input and updates it after a coached turn', async () => {
  const project = buildProject();

  render(<InterviewStep project={project} />);

  expect(screen.getByTestId('interview-flow-map')).toBeTruthy();
  expect(screen.getByTestId('interview-flow-map-empty')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'AI 코치 켜기' }));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Why did that happen?' },
  });
  fireEvent.click(screen.getByRole('button', { name: '코치 피드백 받기' }));
  await screen.findByText('88점');
  fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }));

  await waitFor(() => {
    expect(screen.getAllByText('AI 1 · 추정 0').length).toBeGreaterThanOrEqual(2);
  });
  expect(screen.getByTestId('interview-flow-map-recommendation')).toBeTruthy();
});

test('keeps the question input directly above review helpers', () => {
  render(<InterviewStep project={buildProject()} />);

  const textbox = screen.getByRole('textbox');
  const flowMap = screen.getByTestId('interview-flow-map');
  const reviewPanel = screen.getByTestId('interview-review-panel');

  expect(textbox.compareDocumentPosition(flowMap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(textbox.compareDocumentPosition(reviewPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('keeps answer evidence collapsed until the student opens it', async () => {
  const project = buildProject();
  render(<InterviewStep project={project} />);

  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'What happened before sleeping?' },
  });
  fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }));

  expect((await screen.findAllByText(/exact interview/)).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: '근거 보기' })).toBeTruthy();
  expect(screen.queryByText('침실 장면을 바탕으로 한 답변입니다.')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '근거 보기' }));

  expect(screen.getByText('이 답변은 어떤 가상 설정을 바탕으로 만들어졌나요?')).toBeTruthy();
  expect(screen.getByText('생활 장면 근거')).toBeTruthy();
  expect(screen.getByText('침실 장면을 바탕으로 한 답변입니다.')).toBeTruthy();
  expect(within(screen.getByTestId('answer-evidence-panel')).queryByText(/dossier|scene|canSpeakTo|cannotSpeakTo/i)).toBeNull();
});

test('renders interview review after a student asks a follow-up question', async () => {
  const project = buildProject();
  render(<InterviewStep project={project} />);

  expect(screen.getByText('면접 돌아보기')).toBeTruthy();
  expect(screen.getByText('아직 돌아볼 면접 기록이 없습니다.')).toBeTruthy();

  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '그때 실제로 어디에서 어떤 일이 있었나요?' },
  });
  fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }));

  expect(await screen.findByText('이번 면접 요약')).toBeTruthy();
  expect(screen.getByText('잘한 질문')).toBeTruthy();
  expect(screen.getByText('다음에 더 물어볼 질문')).toBeTruthy();
  expect(screen.getByText('믿기 전에 확인할 답변')).toBeTruthy();

  const panel = screen.getByTestId('interview-review-panel');
  expect(within(panel).queryByText(/dossier|scene bank|canSpeakTo|cannotSpeakTo/i)).toBeNull();
});
