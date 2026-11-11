import { describe, expect, test } from 'vitest';
import { buildInterviewEvidence, normalizeInterviewEvidence } from '../lib/interviewEvidence';
import type { InterviewCharacter } from '../types/research';

const character: InterviewCharacter = {
  persona: {
    id: 'p-test',
    label: '테스트 학생',
    ageGroup: '10대',
    region: '수도권',
    occupation: '고등학생',
    background: '수도권 고등학생입니다.',
    perspective: '관계와 학업 부담을 함께 봅니다.',
    voice: '조심스럽지만 구체적으로 말합니다.',
    livedExperiences: ['시험 전날 알림을 확인했습니다.'],
    concerns: ['수면 부족'],
    tensions: ['관계와 휴식 사이의 갈등'],
  },
  topicCategory: 'smartphone-sleep',
  topicFrame: {
    category: 'smartphone-sleep',
    topic: '청소년 스마트폰 사용과 수면',
    affectedGroups: ['고등학생'],
    places: ['침실'],
    pressures: ['단체 채팅방 알림'],
    tensionAxes: ['관계와 휴식'],
    boundaries: ['의학적 진단은 말할 수 없음'],
    sceneSeed: {
      setting: '시험 전날 침실',
      action: '단체 채팅방 알림을 확인함',
      pressure: '친구 관계에서 빠질까 봐 걱정함',
      feeling: '피곤하고 불안함',
      consequence: '잠드는 시간이 늦어짐',
      quoteSeed: '확인만 하려다가 계속 보게 됐어요.',
    },
  },
  relevance: 'direct',
  lifeContext: '학교생활과 수면 리듬을 겪는 학생',
  canSpeakTo: ['자기 전 스마트폰 확인 경험'],
  cannotSpeakTo: ['의학적 수면 진단'],
  concreteScenes: [
    {
      id: 'scene-1',
      setting: '시험 전날 침실',
      people: ['친구들'],
      action: '단체 채팅방 알림을 확인함',
      pressure: '친구 관계에서 빠질까 봐 걱정함',
      feeling: '피곤하고 불안함',
      consequence: '잠드는 시간이 늦어짐',
      quoteSeed: '확인만 하려다가 계속 보게 됐어요.',
    },
  ],
  recurringTensions: ['관계와 휴식 사이의 갈등'],
  usedSceneIds: [],
};

describe('interviewEvidence', () => {
  test('builds Korean student-facing evidence without exposing internal terms', () => {
    const evidence = buildInterviewEvidence(character, 0);

    expect(evidence.map((item) => item.label)).toEqual([
      '인물 설정 근거',
      '생활 장면 근거',
      '말할 수 있는 범위',
      '추측 주의',
    ]);
    expect(evidence.map((item) => item.text).join(' ')).toContain('시험 전날 침실');
    expect(evidence.map((item) => item.text).join(' ')).not.toMatch(/dossier|scene|canSpeakTo|cannotSpeakTo/i);
  });

  test('normalizes only valid Korean evidence items from API responses', () => {
    const evidence = normalizeInterviewEvidence([
      { kind: 'lifeScene', label: '생활 장면 근거', text: '침실 장면을 바탕으로 한 답변입니다.' },
      { kind: 'scene', label: 'scene', text: 'bad' },
      { kind: 'personaProfile', label: '', text: 'bad' },
    ]);

    expect(evidence).toEqual([
      { kind: 'lifeScene', label: '생활 장면 근거', text: '침실 장면을 바탕으로 한 답변입니다.' },
    ]);
  });
});
