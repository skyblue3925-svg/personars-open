import { expect, test } from 'vitest';
import { fallbackPersonas } from '../data/personas';
import { generatedNemotronPersonaPacket } from '../data/generatedNemotronPersonas';
import { buildPersonaUtilizationSummary, getPersonaDataset } from '../lib/personaDataset';

test('prefers generated Nemotron candidates over fallback personas', () => {
  const dataset = getPersonaDataset(generatedNemotronPersonaPacket, fallbackPersonas);

  expect(dataset.personas.length).toBe(generatedNemotronPersonaPacket.personas.length);
  expect(dataset.sourceStatus.kind).toBe('nemotron-partial');
  expect(dataset.sourceStatus.label).toContain('부분');
});

test('uses fallback personas when the generated packet is empty', () => {
  const dataset = getPersonaDataset({ ...generatedNemotronPersonaPacket, personas: [] }, fallbackPersonas);

  expect(dataset.personas).toHaveLength(fallbackPersonas.length);
  expect(dataset.sourceStatus.kind).toBe('fallback');
  expect(dataset.sourceStatus.label).toContain('기본');
});

test('reports full-source status only when metadata confirms a complete scan', () => {
  const dataset = getPersonaDataset(
    {
      ...generatedNemotronPersonaPacket,
      metadata: {
        ...generatedNemotronPersonaPacket.metadata,
        sourceRecordCount: 1_000_000,
        expandedPersonaCount: 7_000_000,
        isComplete: true,
        label: 'Nemotron 전체 색인',
      },
    },
    fallbackPersonas,
  );

  expect(dataset.sourceStatus.kind).toBe('nemotron-full');
  expect(dataset.sourceStatus.label).toContain('전체 원자료 기반 후보 패킷');
  expect(dataset.sourceStatus.label).not.toContain('전체 색인 사용');
});

test('summarizes candidate utilization counts and distributions', () => {
  const dataset = getPersonaDataset(generatedNemotronPersonaPacket, fallbackPersonas);
  const summary = buildPersonaUtilizationSummary(dataset.personas, dataset.personas.slice(0, 2), [dataset.personas[0].id]);

  expect(summary.totalCandidates).toBe(dataset.personas.length);
  expect(summary.filteredCandidates).toBe(2);
  expect(summary.selectedCandidates).toBe(1);
  expect(summary.ageBands.length).toBeGreaterThan(0);
  expect(summary.regions.length).toBeGreaterThan(0);
  expect(summary.personaTypes.length).toBeGreaterThan(0);
});
