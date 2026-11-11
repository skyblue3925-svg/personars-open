import type { GeneratedNemotronPersonaPacket } from '../data/generatedNemotronPersonas';
import type { PersonaSeed } from '../types/research';

export type PersonaSourceStatusKind = 'nemotron-full' | 'nemotron-partial' | 'fallback';

export type PersonaSourceStatus = {
  kind: PersonaSourceStatusKind;
  label: string;
  sourceRecordCount: number;
  expandedPersonaCount: number;
};

export type PersonaDataset = {
  personas: PersonaSeed[];
  sourceStatus: PersonaSourceStatus;
};

export type PersonaUtilizationBucket = {
  label: string;
  count: number;
};

export type PersonaUtilizationSummary = {
  totalCandidates: number;
  filteredCandidates: number;
  selectedCandidates: number;
  ageBands: PersonaUtilizationBucket[];
  regions: PersonaUtilizationBucket[];
  occupations: PersonaUtilizationBucket[];
  personaTypes: PersonaUtilizationBucket[];
};

export function getPersonaDataset(packet: GeneratedNemotronPersonaPacket, fallbackPersonas: PersonaSeed[]): PersonaDataset {
  if (packet.personas.length > 0) {
    const kind: PersonaSourceStatusKind = packet.metadata.isComplete ? 'nemotron-full' : 'nemotron-partial';
    return {
      personas: packet.personas,
      sourceStatus: {
        kind,
        label: packet.metadata.isComplete
          ? `Nemotron 전체 원자료 기반 후보 패킷 사용 (${packet.personas.length.toLocaleString('ko-KR')}명 후보 / ${packet.metadata.expandedPersonaCount.toLocaleString('ko-KR')}개 설명 기반)`
          : `Nemotron 부분 후보 패킷 사용 (${packet.personas.length.toLocaleString('ko-KR')}명 후보 / ${packet.metadata.expandedPersonaCount.toLocaleString('ko-KR')}개 설명 기반)`,
        sourceRecordCount: packet.metadata.sourceRecordCount,
        expandedPersonaCount: packet.metadata.expandedPersonaCount,
      },
    };
  }

  return {
    personas: fallbackPersonas.map((persona) => ({ ...persona, source: persona.source ?? { kind: 'fallback' } })),
    sourceStatus: {
      kind: 'fallback',
      label: `기본 예비 페르소나 사용 (${fallbackPersonas.length.toLocaleString('ko-KR')}명)`,
      sourceRecordCount: 0,
      expandedPersonaCount: fallbackPersonas.length,
    },
  };
}

export function buildPersonaUtilizationSummary(
  candidates: PersonaSeed[],
  filteredCandidates: PersonaSeed[],
  selectedIds: string[],
): PersonaUtilizationSummary {
  return {
    totalCandidates: candidates.length,
    filteredCandidates: filteredCandidates.length,
    selectedCandidates: selectedIds.length,
    ageBands: countBy(filteredCandidates, (persona) => persona.ageGroup),
    regions: countBy(filteredCandidates, (persona) => persona.source?.province || persona.region),
    occupations: countBy(filteredCandidates, (persona) => persona.occupation),
    personaTypes: countBy(filteredCandidates, (persona) => persona.source?.personaType || 'fallback'),
  };
}

function countBy(personas: PersonaSeed[], pick: (persona: PersonaSeed) => string | undefined): PersonaUtilizationBucket[] {
  const counts = new Map<string, number>();
  for (const persona of personas) {
    const label = pick(persona)?.trim() || '미상';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
