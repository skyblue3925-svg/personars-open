import type { ConcreteScene, InterviewCharacter, InterviewQuestion, InterviewResult, InterviewTurn, PersonaSeed, ResearchDraft } from '../types/research';
import { buildInterviewCharacter } from './interviewCharacter';
import { buildInterviewEvidence } from './interviewEvidence';
import { ensureSimulationPrefix } from './simulationSafety';

export function buildInterviewQuestions(draft: ResearchDraft): InterviewQuestion[] {
  return [
    {
      id: 'iq-1',
      text: `${draft.topic}이 본인의 일상이나 주변 사람들에게 어떤 영향을 준다고 느끼나요?`,
      intent: '개인 경험 확인',
    },
    {
      id: 'iq-2',
      text: `${draft.topic}와 관련해 가장 구체적으로 떠오르는 장면이나 사례는 무엇인가요?`,
      intent: '생활 장면 탐색',
    },
    {
      id: 'iq-3',
      text: `본인과 다른 처지의 사람들은 ${draft.topic}을 어떻게 다르게 느낄 것 같나요?`,
      intent: '관점 차이 탐색',
    },
    {
      id: 'iq-4',
      text: `${draft.topic} 경험이 반복되거나 덜 심해지는 조건은 무엇인가요?`,
      intent: '조건 탐색',
    },
    {
      id: 'iq-5',
      text: `수업 활동에서 이 인터뷰 답변을 사용할 때 조심해야 할 점은 무엇인가요?`,
      intent: '자료 활용 한계 성찰',
    },
  ];
}

export function selectRepresentativePersonas(personas: PersonaSeed[], count: number): PersonaSeed[] {
  const safeCount = Math.max(1, Math.min(count, personas.length));
  const preferred = personas.filter((persona) => ['10대', '20대', '40대', '60대'].includes(persona.ageGroup));
  const pool = preferred.length >= safeCount ? preferred : personas;

  return pool.slice(0, safeCount);
}

export function buildInterviews(
  draft: ResearchDraft,
  personas: PersonaSeed[],
  count: number,
  interviewQuestions = buildInterviewQuestions(draft).slice(0, 3),
): InterviewResult[] {
  const selected = selectRepresentativePersonas(personas, count);

  return selected.map((persona) => {
    const character = buildInterviewCharacter(draft, persona);
    const groupReason = `${persona.ageGroup} ${persona.region} 배경의 관점을 보완하기 위해 선택했습니다.`;

    const turns = interviewQuestions.slice(0, 4).map((question, questionIndex) => ({
      question: question.text,
      answer: ensureSimulationPrefix(buildPersonaAnswer(draft, persona, question, questionIndex, character)),
      source: 'template' as const,
      generatedAt: new Date().toISOString(),
      evidence: buildInterviewEvidence(character, questionIndex),
    }));
    const codes = deriveCodes(draft, persona, interviewQuestions);

    return {
      persona,
      character: {
        ...character,
        usedSceneIds: turns.map((_, index) => pickScene(character, index).id),
      },
      groupReason,
      turns,
      quotes: selectQuotes(turns, persona),
      codes,
      themes: deriveThemes(persona, codes),
    };
  });
}

export function answerPersonaFollowUp(draft: ResearchDraft, persona: PersonaSeed, question: string): InterviewTurn {
  const trimmedQuestion = question.trim();
  const character = buildInterviewCharacter(draft, persona);
  const answer = composePersonaAnswer(
    draft,
    persona,
    {
      id: 'follow-up',
      text: trimmedQuestion,
      intent: inferQuestionIntent(trimmedQuestion),
    },
    0,
    character,
  );

  return {
    question: trimmedQuestion,
    answer: ensureSimulationPrefix(answer),
    source: 'template',
    generatedAt: new Date().toISOString(),
    evidence: buildInterviewEvidence(character, 0),
  };
}

function buildPersonaAnswer(
  draft: ResearchDraft,
  persona: PersonaSeed,
  question: InterviewQuestion,
  index: number,
  character: InterviewCharacter,
): string {
  return composePersonaAnswer(draft, persona, question, index, character);
}

export function composePersonaAnswer(
  draft: ResearchDraft,
  persona: PersonaSeed,
  question: InterviewQuestion,
  index = 0,
  character = buildInterviewCharacter(draft, persona),
): string {
  const concern = pickPersonaItem(persona.concerns, index);
  const tension = pickPersonaItem(persona.tensions, index);
  const intent = question.intent;
  const asksForExample = question.text.includes('사례') || question.text.includes('경험');
  const scene = pickScene(character, index);
  const sceneAnswer = describeScene(scene);
  const directReaction = buildDirectReaction(question.text, scene, character);

  if (intent.includes('개인 경험')) {
    return `${directReaction} 제 생활에서 먼저 떠오르는 장면은 ${sceneAnswer} 이때 ${draft.topic}은 추상적인 문제가 아니라 ${scene.pressure} 문제로 느껴집니다. 다만 ${scene.feeling} 그래서 이 장면을 전체 학생의 결론처럼 말하면 안 된다고 봅니다.`;
  }

  if (intent.includes('생활 장면')) {
    if (asksForExample) {
      return `${directReaction} 실제 사례로는 ${sceneAnswer} 이런 상황에서는 ${draft.topic}에 대한 응답이 높게 나와도 단순한 선호가 아니라 ${scene.pressure}가 반영된 결과일 수 있습니다. 특히 ${scene.feeling}라는 점 때문에 같은 점수라도 이유를 따로 물어봐야 합니다.`;
    }
    return `${directReaction} 그 경향은 제 생활 조건과 함께 봐야 합니다. ${sceneAnswer} ${persona.perspective} 그래서 평균만 비교하면 비슷해 보여도 응답 이유는 다르게 설명될 수 있습니다.`;
  }

  if (intent.includes('관점 차이')) {
    return `${directReaction} 제 관점만 놓고 보면 ${persona.perspective} 하지만 다른 처지의 사람은 ${scene.pressure}를 다르게 겪을 수 있습니다. 그래서 같은 ${draft.topic}이라도 나이, 지역, 역할에 따라 중요하게 보는 지점이 달라질 것 같습니다.`;
  }

  if (intent.includes('조건')) {
    return `${directReaction} 제 경우에는 ${scene.pressure}가 반복될 때 이 경험이 더 커집니다. 반대로 주변에서 확인해 주거나 선택지가 보이면 부담이 줄어듭니다. ${scene.consequence} 그래서 "항상 그렇다"보다 "조건에 따라 달라진다"에 가깝습니다.`;
  }

  if (intent.includes('해결')) {
    return `${directReaction} 우선 필요한 건 큰 구호보다 실제로 접근 가능한 지원입니다. ${sceneAnswer} 그래서 학교나 지역사회가 한 번 안내하고 끝내기보다 계속 확인할 수 있는 통로를 만들어야 합니다. ${tension}`;
  }

  return `${directReaction} 이 답변은 제 인물 설정 안에서 떠올린 한 장면입니다. ${sceneAnswer} 그래서 수업 자료로 쓸 때는 ${draft.topic}에 대한 전체 의견처럼 일반화하지 말고, 어떤 맥락에서 나온 말인지 함께 적어야 합니다.`;
}

function pickScene(character: InterviewCharacter, index: number): ConcreteScene {
  return character.concreteScenes[index % character.concreteScenes.length] ?? character.concreteScenes[0];
}

function describeScene(scene: ConcreteScene): string {
  return `${scene.setting}에서 ${scene.people.join(', ')}이 함께 얽힌 상황입니다. ${scene.action} 그 압박은 ${scene.pressure}이고, 결과적으로 ${scene.consequence}.`;
}

function buildDirectReaction(question: string, scene: ConcreteScene, character: InterviewCharacter): string {
  const voiceFrame = `${character.persona.voice}로 말하면,`;
  if (question.includes('왜') || question.includes('이유')) {
    return `${voiceFrame} 그 질문에는 이유를 하나로 말하기보다 ${scene.pressure}부터 봐야 한다고 답하고 싶습니다.`;
  }
  if (question.includes('사례') || question.includes('경험')) {
    return `${voiceFrame} 사례를 묻는다면 인물 설정 자료에서 벗어나지 않고 ${scene.setting} 장면을 말할 수 있습니다.`;
  }
  if (question.includes('해결') || question.includes('필요')) {
    return `${voiceFrame} 해결책을 묻는다면 ${character.canSpeakTo[0]} 범위 안에서만 말할 수 있습니다.`;
  }
  return `${voiceFrame} 질문에 바로 답하면, 제가 말할 수 있는 범위는 ${character.canSpeakTo[0]}입니다.`;
}

function selectQuotes(turns: InterviewTurn[], persona: PersonaSeed): string[] {
  const candidates = turns.map((turn) => {
    const sentences = turn.answer.split('. ').map((sentence) => sentence.replace(/\.$/, '.'));
    const evidenceSentence =
      sentences.find((sentence) => persona.livedExperiences.some((experience) => sentence.includes(experience.slice(0, 8)))) ??
      sentences.find((sentence) => sentence.includes('사례')) ??
      sentences[0];
    return ensureSimulationPrefix(`${persona.label}: ${evidenceSentence}`);
  });
  const contextual = candidates.filter((quote) => quote.includes(persona.region) || quote.includes(persona.occupation) || quote.includes(persona.concerns[0]));

  return (contextual.length >= 2 ? contextual : candidates).slice(0, 2);
}

function deriveCodes(draft: ResearchDraft, persona: PersonaSeed, questions: InterviewQuestion[]): string[] {
  const codes = new Set<string>(['페르소나 경험', '질문 의도 반응', `${draft.topic} 맥락화`, persona.concerns[0]]);

  if (persona.ageGroup.includes('10대') || persona.occupation.includes('학생')) codes.add('학생 생활세계');
  if (persona.region !== '수도권') codes.add('지역 접근성');
  if (persona.occupation.includes('교사') || persona.occupation.includes('복지') || persona.occupation.includes('활동가')) codes.add('현장 지원 관점');
  if (questions.some((question) => question.intent.includes('조건'))) codes.add('조건부 해석');
  if (questions.some((question) => question.intent.includes('한계'))) codes.add('연구 한계 인식');

  return Array.from(codes);
}

function deriveThemes(persona: PersonaSeed, codes: string[]): string[] {
  const themes = ['페르소나별 맥락 차이', '개인 경험과 구조적 조건의 연결'];

  if (codes.includes('지역 접근성')) themes.push('지역 조건에 따른 해석 차이');
  if (codes.includes('학생 생활세계')) themes.push('학생 일상과 제도 지원의 간격');
  if (persona.perspective.includes('개인정보') || persona.perspective.includes('편향')) themes.push('기술 활용과 보호 장치의 균형');

  return themes;
}

function pickPersonaItem(items: string[], index: number): string {
  return items[index % items.length] ?? items[0] ?? '구체 맥락이 더 필요합니다';
}

function inferQuestionIntent(question: string): string {
  if (question.includes('사례') || question.includes('경험') || question.includes('이유')) return '개인 경험 확인';
  if (question.includes('다르게') || question.includes('관점') || question.includes('영향')) return '관점 차이 탐색';
  if (question.includes('조건') || question.includes('반복')) return '조건 탐색';
  if (question.includes('조심') || question.includes('한계')) return '자료 활용 한계 성찰';
  if (question.includes('해결') || question.includes('필요')) return '해결 방안 수집';
  return '생활 장면 탐색';
}
