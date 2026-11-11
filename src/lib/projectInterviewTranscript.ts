import type { InterviewTurn, ResearchProject } from '../types/research';
import { SIMULATION_PREFIX } from './simulationSafety';

export function appendInterviewTurn(project: ResearchProject, personaId: string, turn: InterviewTurn): ResearchProject {
  const interviewIndex = project.interviews.findIndex((interview) => interview.persona.id === personaId);
  if (interviewIndex === -1) return project;

  const interviews = project.interviews.map((interview, index) => {
    if (index !== interviewIndex) return interview;

    const turns = [...interview.turns, turn];
    return {
      ...interview,
      turns,
      quotes: selectQuotesFromTurns(turns),
    };
  });

  return {
    ...project,
    interviews,
  };
}

function selectQuotesFromTurns(turns: InterviewTurn[]): string[] {
  return turns
    .map((turn) => firstMeaningfulSentence(turn.answer))
    .filter((quote): quote is string => Boolean(quote))
    .slice(-5);
}

function firstMeaningfulSentence(answer: string): string | null {
  const normalized = answer.replace(SIMULATION_PREFIX, '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const sentenceMatch = normalized.match(/.+?[.!?。！？](\s|$)/);
  const sentence = (sentenceMatch?.[0] ?? normalized).trim();
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}...` : sentence;
}
