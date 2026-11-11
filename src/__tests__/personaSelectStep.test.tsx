import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PersonaSelectStep } from '../components/PersonaSelectStep';
import { generatedNemotronPersonaPacket } from '../data/generatedNemotronPersonas';
import { fallbackPersonas } from '../data/personas';
import { getPersonaDataset } from '../lib/personaDataset';
import { createResearchDraft } from '../lib/researchDraft';
import type { PersonaSeed } from '../types/research';

afterEach(() => {
  vi.restoreAllMocks();
});

test('lets students filter and choose interview personas', () => {
  const onNext = vi.fn();

  render(
    <PersonaSelectStep
      draft={createResearchDraft('청소년 스마트폰 사용과 수면')}
      personas={fallbackPersonas}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={onNext}
    />,
  );

  expect(screen.getByText(/페르소나 고르기/)).toBeTruthy();
  expect(screen.getByText(/직접 관련/)).toBeTruthy();
  expect(screen.getAllByText(/청소년/).length).toBeGreaterThan(0);

  fireEvent.click(screen.getAllByRole('button', { name: /선택/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: /선택 완료/ }));

  expect(onNext).toHaveBeenCalledWith([expect.any(String)], [expect.objectContaining({ id: expect.any(String) })]);
});

test('shows Nemotron source status and utilization without claiming full 7M from partial data', () => {
  const dataset = getPersonaDataset(generatedNemotronPersonaPacket, fallbackPersonas);

  render(
    <PersonaSelectStep
      draft={createResearchDraft('청소년 스마트폰 사용과 수면')}
      personas={dataset.personas}
      sourceStatus={dataset.sourceStatus}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  );

  expect(screen.getByText(/Nemotron 부분 후보 패킷 사용/)).toBeTruthy();
  expect(screen.getByText(/전체 700만 활용 아님/)).toBeTruthy();
  expect(screen.getByText(/전체 후보/)).toBeTruthy();
  expect(screen.queryByText(/Nemotron 전체 색인 사용/)).toBeNull();
});

test('offers full-index persona search only after filters are targeted enough for the live index', async () => {
  const serverPersona = buildStructuredPersona('server-teacher', 'Seoul', 'female', 'college', 'spouse', 'family_persona', 35);
  serverPersona.label = 'Seoul 30s teacher';
  serverPersona.occupation = 'teacher';
  const fetchMock = mockPersonaSearch([serverPersona]);

  render(
    <PersonaSelectStep
      draft={createResearchDraft('local commute')}
      personas={targetedFilterPersonas()}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByPlaceholderText(/교사/), { target: { value: 'teacher' } });
  expect(screen.queryByRole('button', { name: /전체 색인에서 더 찾아보기/ })).toBeNull();
  expect(screen.getByText(/지역, 연령대, 성별/)).toBeTruthy();

  selectTargetedServerFilters();
  fireEvent.click(screen.getByRole('button', { name: /전체 색인에서 더 찾아보기/ }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/persona-search', expect.any(Object)));
  const body = searchRequestBody(fetchMock) as { ageGroup?: string[]; province?: string[]; sex?: string[] };
  expect(body.ageGroup).toEqual(['20대', '30대']);
  expect(body.province).toEqual(['Seoul']);
  expect(body.sex).toEqual(['female']);
  expect(await screen.findByText(/전체 700만 색인에서 찾은 후보/)).toBeTruthy();
  expect(screen.getByText(/Seoul 30s teacher/)).toBeTruthy();
});

test('passes selected full-index persona objects to the parent step', async () => {
  const onNext = vi.fn();
  const serverPersona = buildStructuredPersona('server-teacher', 'Seoul', 'female', 'college', 'spouse', 'family_persona', 35);
  serverPersona.label = 'Seoul 30s teacher';
  serverPersona.occupation = 'teacher';
  const fetchMock = mockPersonaSearch([serverPersona]);

  render(
    <PersonaSelectStep
      draft={createResearchDraft('local commute')}
      personas={targetedFilterPersonas()}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={onNext}
    />,
  );

  fireEvent.change(screen.getByPlaceholderText(/교사/), { target: { value: 'teacher' } });
  selectTargetedServerFilters();
  fireEvent.click(screen.getByRole('button', { name: /전체 색인에서 더 찾아보기/ }));
  expect(await screen.findByText('Seoul 30s teacher')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Seoul 30s teacher 선택' }));
  fireEvent.click(screen.getByRole('button', { name: /선택 완료/ }));

  expect(fetchMock).toHaveBeenCalled();
  expect(onNext).toHaveBeenCalledWith(['server-teacher'], [expect.objectContaining({ id: 'server-teacher' })]);
});

test('reapplies current local filters to full-index search results', async () => {
  const adultPersona = buildStructuredPersona('server-adult', 'Seoul', 'female', 'college', 'spouse', 'family_persona', 43);
  adultPersona.label = 'Seoul 40s teacher';
  adultPersona.occupation = 'teacher';
  const fetchMock = mockPersonaSearch([adultPersona]);

  render(
    <PersonaSelectStep
      draft={createResearchDraft('teen reading')}
      personas={[
        buildStructuredPersona('p-teen', 'Seoul', 'female', 'middle school', 'parents', 'family_persona', 16),
        buildStructuredPersona('p-b', 'Busan', 'male', 'high school', 'single', 'professional_persona', 36),
      ]}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '청소년' }));
  fireEvent.click(screen.getByRole('button', { name: 'Seoul' }));
  fireEvent.click(screen.getByText('상세 조건'));
  fireEvent.click(screen.getByRole('button', { name: 'female' }));
  fireEvent.change(screen.getByPlaceholderText(/교사/), { target: { value: 'teacher' } });
  fireEvent.click(screen.getByRole('button', { name: /전체 색인에서 더 찾아보기/ }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const body = searchRequestBody(fetchMock) as { ageGroup?: string[] };
  expect(body.ageGroup).toEqual(['10대']);
  expect(screen.queryByText('Seoul 40s teacher')).toBeNull();
});

test('sends targeted structured filters to full-index persona search', async () => {
  const fetchMock = mockPersonaSearch([]);

  render(
    <PersonaSelectStep
      draft={createResearchDraft('local commute')}
      personas={targetedFilterPersonas()}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '청년' }));
  fireEvent.click(screen.getByRole('button', { name: 'Seoul' }));
  fireEvent.click(screen.getByRole('button', { name: 'Busan' }));
  fireEvent.click(screen.getByText('상세 조건'));
  fireEvent.click(screen.getByRole('button', { name: 'female' }));
  fireEvent.click(screen.getByRole('button', { name: 'male' }));
  fireEvent.click(screen.getByRole('button', { name: 'college' }));
  fireEvent.click(screen.getByRole('button', { name: 'high school' }));
  fireEvent.click(screen.getByRole('button', { name: /전체 색인에서 더 찾아보기/ }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const body = searchRequestBody(fetchMock) as {
    ageGroup: string[];
    province: string[];
    sex: string[];
    educationLevel: string[];
  };
  expect(body.ageGroup).toEqual(['20대', '30대']);
  expect(body.province).toEqual(['Seoul', 'Busan']);
  expect(body.sex).toEqual(['female', 'male']);
  expect(body.educationLevel).toEqual(['college', 'high school']);
});

test('does not expose internal persona type as a student-facing filter', () => {
  render(
    <PersonaSelectStep
      draft={createResearchDraft('local commute')}
      personas={targetedFilterPersonas()}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  );

  expect(screen.queryByText('페르소나 유형')).toBeNull();
  expect(screen.queryByRole('button', { name: '가족' })).toBeNull();
  expect(screen.queryByRole('button', { name: '직업' })).toBeNull();
});

test('keeps demographic filters in a detailed filter section', () => {
  render(
    <PersonaSelectStep
      draft={createResearchDraft('local commute')}
      personas={targetedFilterPersonas()}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  );

  const details = screen.getByText('상세 조건').closest('details');
  expect(details).toBeTruthy();
  expect(details?.hasAttribute('open')).toBe(false);

  fireEvent.click(screen.getByText('상세 조건'));

  expect(details?.hasAttribute('open')).toBe(true);
  expect(screen.getByRole('button', { name: 'female' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'college' })).toBeTruthy();
});

test('limits large local candidate packets instead of rendering every candidate card', () => {
  const manyPersonas = Array.from({ length: 120 }, (_, index) =>
    buildStructuredPersona(
      `bulk-${index}`,
      index % 2 === 0 ? 'Seoul' : 'Busan',
      index % 2 === 0 ? 'female' : 'male',
      'college',
      'single',
      index % 3 === 0 ? 'family_persona' : 'professional_persona',
      35,
    ),
  );

  render(
    <PersonaSelectStep
      draft={createResearchDraft('local commute')}
      personas={manyPersonas}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  );

  expect(screen.getAllByRole('article')).toHaveLength(80);
  expect(screen.getByText(/후보 120명 중 80명/)).toBeTruthy();
});

test('balances the default visible candidates across age bands', () => {
  const manyPersonas = Array.from({ length: 160 }, (_, index) => {
    const age = [16, 25, 45, 68][index % 4];
    return buildStructuredPersona(
      `age-${index}`,
      index % 2 === 0 ? 'Seoul' : 'Busan',
      index % 2 === 0 ? 'female' : 'male',
      'college',
      'single',
      index % 3 === 0 ? 'family_persona' : 'professional_persona',
      age,
    );
  });

  render(
    <PersonaSelectStep
      draft={createResearchDraft('local commute')}
      personas={manyPersonas}
      selectedIds={[]}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  );

  const articleText = screen.getAllByRole('article').map((article) => article.textContent ?? '');
  expect(articleText.some((text) => text.includes('10s'))).toBe(true);
  expect(articleText.some((text) => text.includes('20s'))).toBe(true);
  expect(articleText.some((text) => text.includes('40s'))).toBe(true);
  expect(articleText.some((text) => text.includes('60s'))).toBe(true);
});

function mockPersonaSearch(personas: PersonaSeed[]) {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        sourceRecordCount: 1_000_000,
        expandedPersonaCount: 7_000_000,
        isComplete: true,
        matchedCount: personas.length,
        returnedCount: personas.length,
        personas,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  fetchMock.mockClear();
  return fetchMock;
}

function searchRequestBody(fetchMock: ReturnType<typeof vi.spyOn>) {
  return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
}

function selectTargetedServerFilters() {
  fireEvent.click(screen.getByRole('button', { name: '청년' }));
  fireEvent.click(screen.getByRole('button', { name: 'Seoul' }));
  fireEvent.click(screen.getByText('상세 조건'));
  fireEvent.click(screen.getByRole('button', { name: 'female' }));
}

function targetedFilterPersonas(): PersonaSeed[] {
  return [
    buildStructuredPersona('p-a', 'Seoul', 'female', 'college', 'spouse', 'family_persona', 35),
    buildStructuredPersona('p-b', 'Busan', 'male', 'high school', 'single', 'professional_persona', 36),
  ];
}

function buildStructuredPersona(
  id: string,
  province: string,
  sex: string,
  educationLevel: string,
  familyType: string,
  personaType: string,
  age = 35,
): PersonaSeed {
  const ageGroup = `${Math.floor(age / 10) * 10}s`;
  return {
    id,
    label: `${province} ${ageGroup} candidate`,
    ageGroup,
    region: province,
    occupation: 'worker',
    background: 'background',
    perspective: 'perspective',
    voice: 'voice',
    livedExperiences: [],
    concerns: [],
    tensions: [],
    source: {
      kind: 'nemotron',
      province,
      sex,
      age,
      educationLevel,
      familyType,
      personaType,
    },
  };
}
