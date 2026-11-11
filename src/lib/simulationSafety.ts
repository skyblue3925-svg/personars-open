export const SIMULATION_PREFIX = '[가상 페르소나 시뮬레이션]';

export function ensureSimulationPrefix(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith(SIMULATION_PREFIX)) return trimmed;
  return `${SIMULATION_PREFIX}\n${trimmed}`;
}
