import { ArrowLeft, ArrowRight, Check, SlidersHorizontal, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildPersonaCandidates,
  filterPersonaCandidates,
  relevanceLabel,
  type PersonaAgeFilter,
  type PersonaCandidateFilters,
  type PersonaRoleFilter,
} from '../lib/personaSelection';
import { buildPersonaUtilizationSummary, type PersonaSourceStatus } from '../lib/personaDataset';
import type { PersonaSeed, ResearchDraft, TopicRelevance } from '../types/research';

type PersonaSelectStepProps = {
  draft: ResearchDraft;
  personas: PersonaSeed[];
  sourceStatus?: PersonaSourceStatus;
  selectedIds: string[];
  activityMode?: string;
  onBack: () => void;
  onNext: (selectedIds: string[], selectedPersonas: PersonaSeed[]) => void;
};

const ageOptions: PersonaAgeFilter[] = ['all', '청소년', '청년', '중장년', '노년'];
const relevanceOptions: Array<TopicRelevance | 'all'> = ['all', 'direct', 'adjacent', 'limited'];
const roleOptions: PersonaRoleFilter[] = ['all', '당사자', '가족/보호자', '현장 종사자', '제도/기관 관찰자'];
const MAX_SELECTED = 3;
const DISPLAY_LIMIT = 80;
const SERVER_SEARCH_THRESHOLD = 3;

type PersonaSearchApiResult = {
  sourceRecordCount: number;
  expandedPersonaCount: number;
  isComplete: boolean;
  matchedCount: number;
  returnedCount: number;
  personas: PersonaSeed[];
};

export function PersonaSelectStep({ draft, personas, sourceStatus, selectedIds, activityMode, onBack, onNext }: PersonaSelectStepProps) {
  const [filters, setFilters] = useState<PersonaCandidateFilters>({ age: ['all'], relevance: ['all'], role: ['all'] });
  const [selected, setSelected] = useState<string[]>(selectedIds.slice(0, MAX_SELECTED));
  const [serverResult, setServerResult] = useState<PersonaSearchApiResult | null>(null);
  const [serverSearchState, setServerSearchState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const candidates = useMemo(() => buildPersonaCandidates(draft, personas), [draft, personas]);
  const filtered = useMemo(() => filterPersonaCandidates(candidates, filters), [candidates, filters]);
  const serverCandidates = useMemo(() => buildPersonaCandidates(draft, serverResult?.personas ?? []), [draft, serverResult]);
  const filteredServerCandidates = useMemo(() => filterPersonaCandidates(serverCandidates, filters), [serverCandidates, filters]);
  const displayedCandidates = useMemo(() => uniqueCandidates([...filtered, ...filteredServerCandidates]), [filtered, filteredServerCandidates]);
  const visibleCandidates = useMemo(() => selectBalancedCandidates(displayedCandidates, DISPLAY_LIMIT), [displayedCandidates]);
  const selectableCandidates = useMemo(() => uniqueCandidates([...candidates, ...serverCandidates]), [candidates, serverCandidates]);
  const structuredOptions = useMemo(() => buildStructuredFilterOptions(personas), [personas]);
  const summary = useMemo(
    () =>
      buildPersonaUtilizationSummary(
        candidates.map((candidate) => candidate.persona),
        filtered.map((candidate) => candidate.persona),
        selected,
      ),
    [candidates, filtered, selected],
  );
  const hasScarceLocalCandidates = filtered.length < SERVER_SEARCH_THRESHOLD;
  const canSearchServer = hasScarceLocalCandidates && hasTargetedServerSearchFilters(filters);

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_SELECTED) return [...current.slice(1), id];
      return [...current, id];
    });
  };

  const searchServerIndex = async () => {
    setServerSearchState('loading');
    try {
      const response = await fetch(personaSearchApiUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPersonaSearchRequest(filters)),
      });
      if (!response.ok) throw new Error('persona search failed');
      setServerResult((await response.json()) as PersonaSearchApiResult);
      setServerSearchState('idle');
    } catch {
      setServerResult(null);
      setServerSearchState('failed');
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[14px] font-medium text-[#0066cc]">페르소나 선택</p>
        <h2 className="mt-1 text-[32px] font-semibold leading-[1.1] text-[#1d1d1f] sm:text-[40px]">페르소나 고르기</h2>
        <p className="mt-3 text-[16px] leading-[1.55] text-black/70">
          수업 활동 주제와 관련도가 높은 페르소나 후보를 살펴보고, 깊게 인터뷰할 대상을 고릅니다. 최대 3명까지 선택할 수
          있고, 선택 후 바로 1:1 인터뷰를 시작합니다.
        </p>
      </div>

      {sourceStatus && (
        <div className="rounded-[12px] border border-[#0071e3]/20 bg-white p-4 text-[14px] leading-6 text-black/72 shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
          <p className="font-semibold text-[#0066cc]">{sourceStatus.label}</p>
          <p className="mt-1">
            후보 {summary.filteredCandidates.toLocaleString('ko-KR')}명 / 전체 후보 {summary.totalCandidates.toLocaleString('ko-KR')}명
          </p>
          <p className="mt-1 text-[12px] text-black/50">
            {sourceStatus.kind === 'nemotron-full'
              ? '브라우저에는 전체 700만 건이 아니라 균형 후보 패킷만 내려받고, 세부 조건은 서버 검색 색인으로 보완합니다.'
              : sourceStatus.kind === 'nemotron-partial'
                ? '전체 700만 활용 아님: 현재는 부분 후보 패킷으로 파이프라인과 화면을 검증 중입니다.'
                : 'Nemotron 색인이 없어서 기본 예비 페르소나를 사용 중입니다.'}
          </p>
        </div>
      )}

      <div className="rounded-[12px] border border-black/10 bg-white p-4 shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-black/60">
          <SlidersHorizontal size={16} />
          필터
        </div>
        <FilterRow<TopicRelevance | 'all'>
          label="주제 관련도"
          options={relevanceOptions}
          value={filters.relevance}
          labelFor={(value) => (value === 'all' ? '전체' : relevanceLabel(value))}
          onChange={(relevance) => setFilters((current) => ({ ...current, relevance }))}
        />
        <FilterRow<PersonaRoleFilter> label="역할/입장" options={roleOptions} value={filters.role} onChange={(role) => setFilters((current) => ({ ...current, role }))} />
        <FilterRow<PersonaAgeFilter> label="연령대" options={ageOptions} value={filters.age} onChange={(age) => setFilters((current) => ({ ...current, age }))} />
        {structuredOptions.province.length > 1 && (
          <FilterRow
            label="지역"
            options={structuredOptions.province}
            value={filters.province ?? ['all']}
            onChange={(province) => setFilters((current) => ({ ...current, province: selectedOrUndefined(province) }))}
          />
        )}
        <label className="mt-3 block">
          <span className="mb-2 block text-[12px] font-semibold text-black/45">직업/역할 키워드</span>
          <input
            value={filters.occupationKeyword ?? ''}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                occupationKeyword: event.target.value.trim() ? event.target.value : undefined,
              }))
            }
            placeholder="예: 교사, 상담사, 자영업"
            className="h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[14px] outline-none focus:border-[#0071e3]"
          />
        </label>
        {(structuredOptions.sex.length > 1 || structuredOptions.educationLevel.length > 1 || structuredOptions.familyType.length > 1) && (
          <details className="mt-3 rounded-[10px] border border-black/10 bg-[#fafafc]">
            <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-black/55">상세 조건</summary>
            <div className="border-t border-black/8 px-3 pb-3">
        {structuredOptions.sex.length > 1 && (
          <FilterRow
            label="성별"
            options={structuredOptions.sex}
            value={filters.sex ?? ['all']}
            onChange={(sex) => setFilters((current) => ({ ...current, sex: selectedOrUndefined(sex) }))}
          />
        )}
        {structuredOptions.educationLevel.length > 1 && (
          <FilterRow
            label="학력"
            options={structuredOptions.educationLevel}
            value={filters.educationLevel ?? ['all']}
            onChange={(educationLevel) => setFilters((current) => ({ ...current, educationLevel: selectedOrUndefined(educationLevel) }))}
          />
        )}
        {structuredOptions.familyType.length > 1 && (
          <FilterRow
            label="가족형태"
            options={structuredOptions.familyType}
            value={filters.familyType ?? ['all']}
            onChange={(familyType) => setFilters((current) => ({ ...current, familyType: selectedOrUndefined(familyType) }))}
          />
        )}
            </div>
          </details>
        )}
        {false && (
          <FilterRow
            label="페르소나 유형"
            options={structuredOptions.personaType}
            value={filters.personaType ?? ['all']}
            labelFor={(value) => (value === 'all' ? '전체' : personaTypeLabel(value))}
            onChange={(personaType) => setFilters((current) => ({ ...current, personaType: selectedOrUndefined(personaType) }))}
          />
        )}
      </div>

      <div className="rounded-[12px] border border-[#0071e3]/20 bg-white p-4 text-[14px] leading-6 text-black/72">
        <p className="font-semibold text-[#0066cc]">
          {activityMode === 'fgi' ? `선택됨 (FGI 모드는 3명 필수): ${selected.length}/3` : `선택됨 ${selected.length}/${MAX_SELECTED}`}
        </p>
        <p className="mt-1">
          {selected.length > 0
            ? selected
                .map((id) => selectableCandidates.find((candidate) => candidate.persona.id === id)?.persona.label)
                .filter(Boolean)
                .join(' · ')
            : '아직 선택한 페르소나가 없습니다. 카드에서 선택을 누르세요.'}
        </p>
      </div>

      {canSearchServer && (
        <div className="rounded-[12px] border border-[#0071e3]/20 bg-white p-4 text-[14px] leading-6 text-black/72">
          <p className="font-semibold text-[#0066cc]">현재 후보가 적습니다</p>
          <p className="mt-1">브라우저 후보 패킷은 유지하면서 서버의 Nemotron 검색 색인에서 같은 조건의 후보를 더 찾을 수 있습니다.</p>
          <button
            type="button"
            onClick={searchServerIndex}
            disabled={serverSearchState === 'loading'}
            className="mt-3 inline-flex h-10 items-center rounded-full bg-[#0071e3] px-4 text-[13px] font-semibold text-white disabled:bg-black/20"
          >
            {serverSearchState === 'loading' ? '검색 중' : '전체 색인에서 더 찾아보기'}
          </button>
          {serverSearchState === 'failed' && <p className="mt-2 text-[12px] text-black/50">전체 색인 검색에 실패했습니다. 현재 후보 패킷은 그대로 사용할 수 있습니다.</p>}
        </div>
      )}

      {hasScarceLocalCandidates && !canSearchServer && (
        <div className="rounded-[12px] border border-black/10 bg-white p-4 text-[14px] leading-6 text-black/62">
          <p className="font-semibold text-[#1d1d1f]">전체 색인 검색 조건을 더 좁혀 주세요</p>
          <p className="mt-1">
            실제 700만 색인은 지역, 연령대, 성별을 함께 좁혔을 때 수업 중 기다릴 만한 속도로 응답합니다. 세 조건을 선택하면 같은 조건으로 서버 후보를 더 찾을 수 있습니다.
          </p>
        </div>
      )}

      {serverResult && (
        <div className="rounded-[12px] border border-black/10 bg-white p-4 text-[14px] leading-6 text-black/72">
          <p className="font-semibold text-[#0066cc]">
            {serverResult.isComplete && serverResult.expandedPersonaCount >= 7_000_000 ? '전체 700만 색인에서 찾은 후보' : '서버 검색 색인에서 찾은 후보'}
          </p>
          <p className="mt-1">
            조건에 맞는 후보 {serverResult.matchedCount.toLocaleString('ko-KR')}명 중 {serverResult.returnedCount.toLocaleString('ko-KR')}명을 표시합니다.
          </p>
        </div>
      )}

      {visibleCandidates.length < displayedCandidates.length && (
        <div className="rounded-[12px] border border-black/10 bg-white p-4 text-[13px] leading-5 text-black/58">
          후보 {displayedCandidates.length.toLocaleString('ko-KR')}명 중 {visibleCandidates.length.toLocaleString('ko-KR')}명을 역할, 연령, 지역이
          겹치지 않도록 우선 표시합니다. 조건을 더 좁히면 다른 후보를 볼 수 있습니다.
        </div>
      )}

      <div className="grid gap-3">
        {visibleCandidates.map((candidate) => {
          const isSelected = selected.includes(candidate.persona.id);
          return (
            <article
              key={candidate.persona.id}
              className={`rounded-[12px] border bg-white p-4 shadow-[3px_5px_30px_rgba(0,0,0,0.05)] ${
                isSelected ? 'border-[#0071e3]' : 'border-black/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <UserRound size={17} className="shrink-0 text-[#0071e3]" />
                    <h3 className="truncate text-[18px] font-semibold text-[#1d1d1f]">{candidate.persona.label}</h3>
                  </div>
                  <p className="mt-1 text-[12px] text-black/50">
                    {candidate.persona.ageGroup} · {candidate.persona.region} · {candidate.persona.occupation}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(candidate.persona.id)}
                  aria-label={`${candidate.persona.label} 선택`}
                  className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold ${
                    isSelected ? 'bg-[#0071e3] text-white' : 'border border-black/10 bg-white text-black/70'
                  }`}
                >
                  {isSelected && <Check size={14} />}
                  선택
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {candidate.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[12px] font-semibold text-black/58">
                    {tag === '직접 관련' ? '직접' : tag}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[14px] leading-6 text-black/70">{candidate.character.canSpeakTo[0]}</p>
              <p className="mt-2 text-[12px] leading-5 text-black/48">묻지 말아야 할 범위: {candidate.character.cannotSpeakTo[0]}</p>
            </article>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-5 text-[14px] font-semibold">
          <ArrowLeft size={17} />
          이전
        </button>
        <button
          type="button"
          onClick={() => onNext(selected, selectedPersonasFor(selectableCandidates, selected))}
          disabled={activityMode === 'fgi' ? selected.length !== 3 : selected.length === 0}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0071e3] px-5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/20"
        >
          선택 완료
          <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}

function hasTargetedServerSearchFilters(filters: PersonaCandidateFilters): boolean {
  return Boolean(hasSelectedFilter(filters.province) && hasSelectedFilter(filters.age) && hasSelectedFilter(filters.sex));
}

function buildPersonaSearchRequest(filters: PersonaCandidateFilters) {
  return {
    ageGroup: ageGroupsForSearch(filters.age),
    sex: selectedOrUndefined(filters.sex),
    province: selectedOrUndefined(filters.province),
    educationLevel: selectedOrUndefined(filters.educationLevel),
    familyType: selectedOrUndefined(filters.familyType),
    occupationKeyword: filters.occupationKeyword,
    limit: 30,
  };
}

function uniqueCandidates<T extends { persona: PersonaSeed }>(candidates: T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.persona.id)) return false;
    seen.add(candidate.persona.id);
    return true;
  });
}

function selectBalancedCandidates<T extends { persona: PersonaSeed; role: string }>(candidates: T[], limit: number): T[] {
  if (candidates.length <= limit) return candidates;

  const ageBuckets = new Map<string, T[]>();
  for (const candidate of candidates) {
    const key = candidate.persona.ageGroup || 'unknown';
    const bucket = ageBuckets.get(key) ?? [];
    bucket.push(candidate);
    ageBuckets.set(key, bucket);
  }

  const ageQueues = Array.from(ageBuckets.entries())
    .sort(([left], [right]) => left.localeCompare(right, 'ko-KR', { numeric: true }))
    .map(([, bucket]) => interleaveCandidateBuckets(bucket));

  const selected: T[] = [];
  while (selected.length < limit && ageQueues.some((queue) => queue.length > 0)) {
    for (const queue of ageQueues) {
      const candidate = queue.shift();
      if (candidate) selected.push(candidate);
      if (selected.length >= limit) break;
    }
  }

  return selected;
}

function interleaveCandidateBuckets<T extends { persona: PersonaSeed; role: string }>(candidates: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const candidate of candidates) {
    const key = candidateDiversityKey(candidate);
    const bucket = buckets.get(key) ?? [];
    bucket.push(candidate);
    buckets.set(key, bucket);
  }

  const selected: T[] = [];
  while (buckets.size > 0) {
    for (const [key, bucket] of Array.from(buckets.entries())) {
      const candidate = bucket.shift();
      if (candidate) selected.push(candidate);
      if (bucket.length === 0) buckets.delete(key);
    }
  }

  return selected;
}

function candidateDiversityKey(candidate: { persona: PersonaSeed; role: string }): string {
  const persona = candidate.persona;
  return [candidate.role, persona.ageGroup, persona.source?.province || persona.region].join('|');
}

function selectedPersonasFor(candidates: Array<{ persona: PersonaSeed }>, selectedIds: string[]): PersonaSeed[] {
  const byId = new Map(candidates.map((candidate) => [candidate.persona.id, candidate.persona]));
  return selectedIds.map((id) => byId.get(id)).filter((persona): persona is PersonaSeed => Boolean(persona));
}

function ageGroupsForSearch(value: PersonaCandidateFilters['age']): string[] | undefined {
  const mapped = selectedOrUndefined(value)?.flatMap((age) => {
    if (age === '청소년') return ['10대'];
    if (age === '청년') return ['20대', '30대'];
    if (age === '중장년') return ['40대', '50대'];
    if (age === '노년') return ['60대', '70대', '80대', '90대'];
    return [];
  });
  return mapped && mapped.length > 0 ? mapped : undefined;
}

function personaSearchApiUrl(): string {
  return import.meta.env.VITE_PERSONA_SEARCH_API_URL ?? '/api/persona-search';
}

function buildStructuredFilterOptions(personas: PersonaSeed[]) {
  return {
    sex: withAll(unique(personas.map((persona) => normalizeSex(persona.source?.sex)).filter(isPresent))),
    province: withAll(unique(personas.map((persona) => persona.source?.province).filter(isPresent))),
    educationLevel: withAll(unique(personas.map((persona) => persona.source?.educationLevel).filter(isPresent))),
    familyType: withAll(unique(personas.map((persona) => persona.source?.familyType).filter(isPresent)).slice(0, 20)),
    personaType: withAll(unique(personas.map((persona) => persona.source?.personaType).filter(isPresent))),
  };
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'ko-KR'));
}

function withAll(values: string[]): string[] {
  return ['all', ...values];
}

function normalizeSex(value?: string): string {
  if (value === '여자') return '여성';
  if (value === '남자') return '남성';
  return value ?? '';
}

function personaTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    professional_persona: '직업',
    sports_persona: '스포츠',
    arts_persona: '예술',
    travel_persona: '여행',
    culinary_persona: '음식',
    family_persona: '가족',
    persona: '요약',
  };
  return labels[value] ?? value;
}

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
  labelFor = (item) => (item === 'all' ? '전체' : item),
}: {
  label: string;
  options: T[];
  value: T | T[] | undefined;
  onChange: (value: T[]) => void;
  labelFor?: (value: T) => string;
}) {
  const selected: T[] = Array.isArray(value) ? value : value === undefined ? [] : [value];

  return (
    <div className="mt-3">
      <p className="mb-2 text-[12px] font-semibold text-black/45">{label}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(toggleFilterOption(selected, option))}
              aria-pressed={isSelected}
              className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold ${
                isSelected ? 'bg-[#1d1d1f] text-white' : 'border border-black/10 bg-white text-black/62'
              }`}
            >
              {labelFor(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function toggleFilterOption<T extends string>(selected: T[], option: T): T[] {
  if (option === 'all') return ['all' as T];
  const next = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected.filter((item) => item !== 'all'), option];
  return next.length > 0 ? next : (['all'] as T[]);
}

function selectedOrUndefined<T extends string>(value: T | T[] | undefined): T[] | undefined {
  const selected = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const filtered = selected.filter((item) => item !== 'all');
  return filtered.length > 0 ? filtered : undefined;
}

function hasSelectedFilter<T extends string>(value: T | T[] | undefined): boolean {
  return Boolean(selectedOrUndefined(value)?.length);
}
