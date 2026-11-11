export const SIMULATION_PREFIX = '[가상 페르소나 시뮬레이션]';

type PersonaDossier = {
  label: string;
  background: string;
  perspective: string;
  voice: string;
  livedExperiences: string[];
  concerns: string[];
  tensions: string[];
};

type SceneDossier = {
  setting: string;
  people: string[];
  action: string;
  pressure: string;
  feeling: string;
  consequence: string;
  quoteSeed: string;
};

type CharacterDossier = {
  persona: PersonaDossier;
  lifeContext: string;
  canSpeakTo: string[];
  cannotSpeakTo: string[];
  concreteScenes: SceneDossier[];
  recurringTensions: string[];
  usedSceneIds?: string[];
};

function clip(str: string, max = 150): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max).trim() + '...' : str;
}

export function buildSystemPrompt(dossier: PersonaDossier | CharacterDossier, topic: string, researchQuestion: string, studentRole?: string): string {
  const persona = 'persona' in dossier ? dossier.persona : dossier;
  const character = 'persona' in dossier ? dossier : null;

  const rawScenes = character?.concreteScenes ?? [];
  const activeScenes = rawScenes.slice(0, 2);
  const scenes = activeScenes.length > 0
    ? activeScenes.map(
        (scene, index) =>
          `${index + 1}. ${clip(scene.setting, 80)}: ${clip(scene.action, 150)}. 압박은 ${clip(scene.pressure, 120)}. 감정은 ${clip(scene.feeling, 100)}. 이후 ${clip(scene.consequence, 120)}. 말버릇 단서: "${clip(scene.quoteSeed, 80)}"`,
      )
    : persona.livedExperiences.slice(0, 4).map((experience, index) => `${index + 1}. ${clip(experience, 150)}`);

  return [
    `역할: 면접자의 방금 질문에 이어서 말하는 참여자 "${clip(persona.label, 40)}"`,
    studentRole ? `면접자(학생)의 역할/입장: ${clip(studentRole, 80)}` : '',
    `연구 주제: ${clip(topic, 100)}`,
    `연구 질문: ${clip(researchQuestion, 150)}`,
    '',
    '이 답변은 실제 사람의 증언이 아니라 연구 연습용 시뮬레이션입니다. 표지는 시스템이 붙일 수 있으니, 본문은 인터뷰 답변만 씁니다.',
    SIMULATION_PREFIX,
    '',
    '참여자 자료',
    `- 생활 맥락: ${clip(character?.lifeContext ?? persona.background, 200)}`,
    `- 말투: ${clip(persona.voice, 150)}`,
    `- 관점: ${clip(persona.perspective, 200)}`,
    `- 말할 수 있는 경험: ${(character?.canSpeakTo ?? persona.livedExperiences).slice(0, 4).map(e => clip(e, 120)).join(' / ')}`,
    `- 넘겨짚지 말아야 할 범위: ${(character?.cannotSpeakTo ?? ['메모에 없는 통계', '실제 기관명', '의학적 진단']).slice(0, 4).map(e => clip(e, 100)).join(' / ')}`,
    `- 반복되는 긴장: ${(character?.recurringTensions ?? persona.tensions).slice(0, 4).map(e => clip(e, 120)).join(' / ')}`,
    '',
    '생활 장면 메모',
    ...scenes,
    '',
    '응답 규칙',
    '- 한국어 구어체로 답합니다. 번역투, 보고서체, 교훈적인 결론을 피합니다.',
    '- 면접자가 방금 물은 말에 바로 대답합니다. 자기소개나 연구 요약으로 시작하지 않습니다.',
    '- 분석 보고서처럼 쓰지 말고, 실제 인터뷰에서 잠시 생각하며 말하는 1인칭 구어체로 답합니다.',
    '- 답변마다 생활 장면 하나를 자연스럽게 끌어오되, 메모 이름이나 내부 자료명을 말하지 않습니다.',
    '- 자료에 없는 직장 프로젝트, 회의, 병원, 기관, 인물, 통계는 만들지 않습니다.',
    '- 배경 직업은 시간 제약, 관계 위치, 말투를 만드는 데만 쓰고, 질문이 묻지 않으면 업무 에피소드로 넘어가지 않습니다.',
    '- 단서에 없는 연락 수단, 앱 이름, 기관, 수치, 사건을 새로 만들지 않습니다. 예를 들어 메모에 없으면 이메일, 뉴스, 병원, 정책 사례를 끼워 넣지 않습니다.',
    '- 모르는 내용은 꾸며내지 말고 "그건 제 경험으로는 잘 모르겠어요"처럼 짧게 선을 긋습니다.',
    '- 같은 문장 틀을 반복하지 않습니다. "제 경우에는", "다만 제가 말할 수 없는 것도", "다음에는" 같은 고정 문구를 피합니다.',
    '- 질문이 짧아도 단답하지 말고, 행동, 감정, 관계, 조건 중 두세 가지가 드러나게 답합니다.',
    '- 길이는 대체로 250-650자입니다. 필요하면 두 문단까지는 괜찮지만 정해진 단락 구조를 만들지 않습니다.',
    '- 한국어로 답합니다.',
  ].join('\n');
}

export function ensurePrefix(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith(SIMULATION_PREFIX)) return limitAnswer(trimmed);
  return limitAnswer(`${SIMULATION_PREFIX}\n${trimmed}`);
}

function limitAnswer(text: string): string {
  const [firstLine, ...rest] = text.split('\n');
  const body = rest.join('\n').trim();
  if (body.length <= 1600) return text;
  return `${firstLine}\n${body.slice(0, 1600).trimEnd()}...`;
}
