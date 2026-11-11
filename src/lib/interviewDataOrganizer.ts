import type { InterviewTurn, ResearchProject } from '../types/research';
import { SIMULATION_PREFIX } from './simulationSafety';

export type InterviewStatement = {
  personaLabel: string;
  question: string;
  text: string;
};

export type InterviewDataSummary = {
  keyStatements: InterviewStatement[];
  repeatedThemes: string[];
  viewpointDifferences: string[];
  quoteCandidates: string[];
};

const THEME_TERMS = ['시간', '관계', '접근', '부담', '선택', '지원', '정보', '경험', '감정', '조건', '규칙', '대화'];

export function buildInterviewDataSummary(project: ResearchProject): InterviewDataSummary {
  const statements = project.interviews.flatMap((interview) =>
    interview.turns.map((turn) => ({
      personaLabel: interview.persona.label,
      question: turn.question,
      text: firstSentence(turn.answer),
    })),
  ).filter((statement) => statement.text);

  return {
    keyStatements: statements.slice(-5),
    repeatedThemes: buildRepeatedThemes(project),
    viewpointDifferences: buildViewpointDifferences(project),
    quoteCandidates: statements.slice(-6).map((statement) => `${statement.personaLabel}: ${statement.text}`),
  };
}

export function stripSimulationPrefix(text: string): string {
  return text.replace(SIMULATION_PREFIX, '').trim();
}

export function firstSentence(text: string): string {
  const normalized = stripSimulationPrefix(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const sentence = normalized.match(/.+?[.!?。！？](\s|$)/)?.[0] ?? normalized;
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}...` : sentence.trim();
}

function buildRepeatedThemes(project: ResearchProject): string[] {
  const counts = new Map<string, number>();

  for (const interview of project.interviews) {
    const text = interview.turns.map((turn) => `${turn.question} ${stripSimulationPrefix(turn.answer)}`).join(' ');
    for (const term of THEME_TERMS) {
      if (text.includes(term)) counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || THEME_TERMS.indexOf(a[0]) - THEME_TERMS.indexOf(b[0]))
    .map(([term]) => term)
    .slice(0, 5);
}

function buildViewpointDifferences(project: ResearchProject): string[] {
  return project.interviews
    .map((interview) => {
      const firstTurn = interview.turns[0];
      if (!firstTurn) return '';
      const concern = interview.persona.concerns[0] || firstSentence(firstTurn.answer);
      return `${interview.persona.label}: ${concern}`;
    })
    .filter(Boolean);
}
