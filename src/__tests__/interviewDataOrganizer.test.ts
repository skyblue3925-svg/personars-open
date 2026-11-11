import { expect, test } from 'vitest';
import { buildInterviewDataSummary } from '../lib/interviewDataOrganizer';
import type { ResearchProject } from '../types/research';

test('organizes interview turns into classroom-ready qualitative materials', () => {
  const project = buildProject();

  const summary = buildInterviewDataSummary(project);

  expect(summary.keyStatements).toEqual([
    expect.objectContaining({
      personaLabel: '청소년 참여자',
      text: '밤마다 알림을 확인하느라 시간이 밀립니다.',
    }),
    expect.objectContaining({
      personaLabel: '보호자 참여자',
      text: '가족 관계가 나빠질까 봐 시간을 정하는 말도 조심스럽습니다.',
    }),
  ]);
  expect(summary.repeatedThemes).toContain('시간');
  expect(summary.repeatedThemes).not.toContain('지원');
  expect(summary.viewpointDifferences.join(' ')).toContain('청소년 참여자');
  expect(summary.viewpointDifferences.join(' ')).toContain('보호자 참여자');
  expect(summary.quoteCandidates).toEqual([
    '청소년 참여자: 밤마다 알림을 확인하느라 시간이 밀립니다.',
    '보호자 참여자: 가족 관계가 나빠질까 봐 시간을 정하는 말도 조심스럽습니다.',
  ]);
});

test('returns empty classroom materials before any interview turns exist', () => {
  const project = { ...buildProject(), interviews: buildProject().interviews.map((interview) => ({ ...interview, turns: [] })) };

  const summary = buildInterviewDataSummary(project);

  expect(summary.keyStatements).toEqual([]);
  expect(summary.repeatedThemes).toEqual([]);
  expect(summary.viewpointDifferences).toEqual([]);
  expect(summary.quoteCandidates).toEqual([]);
});

function buildProject(): ResearchProject {
  return {
    draft: {
      topic: '청소년 스마트폰 사용과 수면',
      title: '청소년 스마트폰 사용과 수면 질적 인터뷰 활동',
      question: '어떤 경험과 관점이 드러나는가?',
      hypothesis: '경험과 맥락을 탐색합니다.',
      targetGroup: '수업 참여자',
    },
    samplePlan: {
      id: 'sample',
      label: '선택한 페르소나',
      size: 2,
      groups: [],
      biasNote: '수업용 가상 페르소나입니다.',
    },
    interviewQuestions: [],
    interviews: [
      {
        persona: {
          id: 'teen',
          label: '청소년 참여자',
          ageGroup: '10대',
          region: '서울',
          occupation: '학생',
          background: '고등학생',
          perspective: '스마트폰 알림을 직접 겪는다.',
          voice: '솔직한 말투',
          livedExperiences: [],
          concerns: ['잠이 부족함'],
          tensions: ['친구 관계와 수면 시간 사이의 갈등'],
        },
        groupReason: '청소년 당사자 관점',
        turns: [
          {
            question: '어떤 장면이 떠오르나요?',
            answer: '[가상 페르소나 시뮬레이션]\n밤마다 알림을 확인하느라 시간이 밀립니다. 다음 날 수업 집중도도 흔들립니다.',
            source: 'template',
          },
        ],
        quotes: [],
        codes: [],
        themes: [],
      },
      {
        persona: {
          id: 'parent',
          label: '보호자 참여자',
          ageGroup: '40대',
          region: '부산',
          occupation: '보호자',
          background: '고등학생 자녀 보호자',
          perspective: '가정 안의 대화를 본다.',
          voice: '신중한 말투',
          livedExperiences: [],
          concerns: ['가족 대화의 부담'],
          tensions: ['통제와 신뢰 사이의 갈등'],
        },
        groupReason: '보호자 관점',
        turns: [
          {
            question: '보호자는 무엇이 어렵나요?',
            answer: '[가상 페르소나 시뮬레이션]\n가족 관계가 나빠질까 봐 시간을 정하는 말도 조심스럽습니다. 그래서 규칙보다 대화가 먼저 필요합니다.',
            source: 'template',
          },
        ],
        quotes: [],
        codes: [],
        themes: [],
      },
    ],
  };
}
