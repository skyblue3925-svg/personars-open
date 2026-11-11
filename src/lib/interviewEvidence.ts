import type { ConcreteScene, InterviewCharacter, InterviewEvidence, InterviewEvidenceKind } from '../types/research';

const LABELS: Record<InterviewEvidenceKind, string> = {
  personaProfile: '인물 설정 근거',
  lifeScene: '생활 장면 근거',
  speakableScope: '말할 수 있는 범위',
  uncertainBoundary: '추측 주의',
};

const VALID_KINDS = new Set<InterviewEvidenceKind>(['personaProfile', 'lifeScene', 'speakableScope', 'uncertainBoundary']);
const INTERNAL_TERM_PATTERN = /\b(dossier|scene|canSpeakTo|cannotSpeakTo)\b/i;

export function buildInterviewEvidence(character: InterviewCharacter, sceneIndex = 0): InterviewEvidence[] {
  const scene = pickScene(character, sceneIndex);
  const canSpeakTo = character.canSpeakTo[0] ?? character.lifeContext;
  const cannotSpeakTo = character.cannotSpeakTo[0] ?? '직접 겪지 않은 내용';

  return [
    {
      kind: 'personaProfile',
      label: LABELS.personaProfile,
      text: `${character.persona.label}의 배경, 관점, 말투를 바탕으로 만든 답변입니다.`,
    },
    {
      kind: 'lifeScene',
      label: LABELS.lifeScene,
      text: `${scene.setting}에서 ${scene.action} 상황을 바탕으로 한 답변입니다.`,
    },
    {
      kind: 'speakableScope',
      label: LABELS.speakableScope,
      text: `${canSpeakTo}처럼 이 페르소나가 자기 경험 안에서 말할 수 있는 내용입니다.`,
    },
    {
      kind: 'uncertainBoundary',
      label: LABELS.uncertainBoundary,
      text: `${cannotSpeakTo}은 직접 확인한 사실처럼 받아들이면 안 됩니다.`,
    },
  ];
}

export function normalizeInterviewEvidence(value: unknown): InterviewEvidence[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is InterviewEvidence => isEvidenceLike(item))
    .map((item) => ({
      kind: item.kind,
      label: item.label.trim(),
      text: item.text.trim(),
    }));
}

function isEvidenceLike(value: unknown): value is InterviewEvidence {
  const item = value as InterviewEvidence;
  return Boolean(
    item &&
      VALID_KINDS.has(item.kind) &&
      typeof item.label === 'string' &&
      item.label.trim().length > 0 &&
      !INTERNAL_TERM_PATTERN.test(item.label) &&
      typeof item.text === 'string' &&
      item.text.trim().length > 0 &&
      !INTERNAL_TERM_PATTERN.test(item.text),
  );
}

function pickScene(character: InterviewCharacter, sceneIndex: number): ConcreteScene {
  return character.concreteScenes[sceneIndex % character.concreteScenes.length] ?? character.concreteScenes[0];
}
