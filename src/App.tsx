import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardList,
  Download,
  FileText,
  MessageSquareText,
  RefreshCcw,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { generatedNemotronPersonaPacket } from './data/generatedNemotronPersonas';
import type { GeneratedNemotronPersonaPacket } from './data/generatedNemotronPersonas';
import { fallbackPersonas } from './data/personas';
import { InterviewStep } from './components/InterviewStep';
import { PersonaSelectStep } from './components/PersonaSelectStep';
import { buildInterviewDataSummary, firstSentence, stripSimulationPrefix } from './lib/interviewDataOrganizer';
import { buildInterviewQuestions, buildInterviews } from './lib/interviewEngine';
import { hasPersonaApiEndpoint } from './lib/personaLLM';
import { getPersonaDataset } from './lib/personaDataset';
import { appendInterviewTurn } from './lib/projectInterviewTranscript';
import { selectInterviewPersonas } from './lib/personaSelection';
import type { InterviewTurn, PersonaSeed, ResearchDraft, ResearchProject } from './types/research';
import { SITE_CREDIT } from './config/site';

const STORAGE_KEY = 'personars-interview-project';

type AppStep = 'activity' | 'persona' | 'interview' | 'organize';

type ActivitySettings = {
  subject: string;
  activityType: string;
  activityMode: 'interview' | 'fgi' | 'heatmap' | 'roleplay' | 'negotiation';
  topic: string;
  purpose: string;
  gradeLevel: string;
  context: string;
};

type SavedState = {
  step: AppStep;
  settings: ActivitySettings;
  selectedPersonaIds: string[];
  project: ResearchProject | null;
};

const DEFAULT_SETTINGS: ActivitySettings = {
  subject: '사회',
  activityType: '질적 인터뷰 활동',
  activityMode: 'interview',
  topic: '청소년 스마트폰 사용과 수면',
  purpose: '서로 다른 생활 맥락에서 주제가 어떻게 경험되는지 듣기',
  gradeLevel: '중·고등학생',
  context: '수업에서 사용할 인터뷰 자료를 만들기 위해, 다양한 관점과 구체적인 생활 장면을 중심으로 질문합니다.',
};

const ACTIVITY_TYPE_OPTIONS = [
  '질적 인터뷰 활동',
  '토론 준비',
  '탐구 활동',
  '작품·텍스트 독자 반응 탐색',
  '역사·사회 사건 현재 관점 비교',
  '진로·직업 탐색',
  '지역사회 문제 조사',
  '과학기술 영향 탐구',
  '동아리·자율 활동',
] as const;
const CUSTOM_ACTIVITY_TYPE = '직접 입력';

const steps: Array<{ id: AppStep; label: string }> = [
  { id: 'activity', label: '활동 설정' },
  { id: 'persona', label: '페르소나 선택' },
  { id: 'interview', label: '인터뷰' },
  { id: 'organize', label: '데이터 정리' },
];

export default function App() {
  const savedState = loadSavedState();
  const [step, setStep] = useState<AppStep>(savedState?.step ?? 'activity');
  const [settings, setSettings] = useState<ActivitySettings>(savedState?.settings ?? DEFAULT_SETTINGS);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(savedState?.selectedPersonaIds ?? []);
  const [project, setProject] = useState<ResearchProject | null>(savedState?.project ?? null);
  const [personaPacket, setPersonaPacket] = useState<GeneratedNemotronPersonaPacket>(generatedNemotronPersonaPacket);

  const personaDataset = useMemo(() => getPersonaDataset(personaPacket, fallbackPersonas), [personaPacket]);
  const draft = useMemo(() => buildActivityDraft(settings), [settings]);
  const activeStepIndex = steps.findIndex((item) => item.id === step);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step,
        settings,
        selectedPersonaIds,
        project,
      } satisfies SavedState),
    );
  }, [step, settings, selectedPersonaIds, project]);

  useEffect(() => {
    if (typeof fetch === 'undefined') return;
    let cancelled = false;
    fetch('/data/nemotron-persona-packet.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((packet: GeneratedNemotronPersonaPacket | null) => {
        if (!cancelled && packet?.personas?.length) setPersonaPacket(packet);
      })
      .catch(() => {
        // The checked-in packet keeps the app usable when the larger generated packet is absent.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startPersonaSelection = () => {
    const normalized = normalizeSettings(settings);
    setSettings(normalized);
    setProject(null);
    setSelectedPersonaIds([]);
    setStep('persona');
  };

  const confirmPersonaSelection = (ids: string[], selectedPersonasFromStep: PersonaSeed[] = []) => {
    const selectedPersonas =
      selectedPersonasFromStep.length > 0 ? selectedPersonasFromStep : selectInterviewPersonas(personaDataset.personas, ids);
    const safePersonas = selectedPersonas.length > 0 ? selectedPersonas : personaDataset.personas.slice(0, 1);
    const interviewQuestions = buildInterviewQuestions(draft);
    const interviews = buildInterviews(draft, safePersonas, safePersonas.length, interviewQuestions).map((interview) => ({
      ...interview,
      turns: [],
      quotes: [],
      codes: [],
      themes: [],
    }));

    const nextProject: ResearchProject = {
      draft,
      aiInterviewEnabled: hasPersonaApiEndpoint(),
      samplePlan: {
        id: 'qualitative-persona-sample',
        label: '선택한 인터뷰 페르소나',
        size: safePersonas.length,
        groups: safePersonas.map((persona) => ({
          label: persona.label,
          ratio: 1 / safePersonas.length,
          description: `${persona.ageGroup} · ${persona.region} · ${persona.occupation}`,
        })),
        biasNote: '수업 활동용 가상 페르소나 표본입니다. 실제 집단 대표성이나 통계적 일반화를 주장하지 않습니다.',
      },
      interviewQuestions,
      interviews,
      selectedPersonaIds: safePersonas.map((persona) => persona.id),
    };

    setSelectedPersonaIds(nextProject.selectedPersonaIds ?? []);
    setProject(nextProject);
    setStep('interview');
  };

  const addInterviewTurn = (personaId: string, turn: InterviewTurn) => {
    setProject((current) => (current ? appendInterviewTurn(current, personaId, turn) : current));
  };

  const resetActivity = () => {
    setSettings(DEFAULT_SETTINGS);
    setSelectedPersonaIds([]);
    setProject(null);
    window.localStorage.removeItem(STORAGE_KEY);
    setStep('activity');
  };

  const canEnterPersona = Boolean(settings.topic.trim() && settings.purpose.trim());
  const canEnterProjectStep = Boolean(project);

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <section className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-5 py-7 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {SITE_CREDIT ? <p className="text-[13px] font-medium text-black/55">{SITE_CREDIT}</p> : <span />}
          <button
            type="button"
            onClick={resetActivity}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-black/10 bg-white px-3 text-[12px] font-semibold text-black/60 transition hover:border-[#0071e3]/30 hover:text-[#0057b8]"
          >
            <RefreshCcw size={14} />
            새 활동
          </button>
        </div>

        <header className="grid gap-5 py-4 xl:grid-cols-[1fr_360px] xl:items-end xl:py-8">
          <div>
            <p className="text-[14px] font-medium leading-5 text-[#0066cc]">Personars Interview</p>
            <h1 className="mt-3 max-w-5xl text-[40px] font-semibold leading-[1.08] tracking-normal text-[#1d1d1f] sm:text-[56px]">
              페르소나 인터뷰 도구
            </h1>
            <p className="mt-5 max-w-3xl text-[17px] leading-[1.47] text-black/78">
              교사가 주제와 맥락을 정하면, 학생이 다양한 페르소나와 질적 인터뷰를 진행하고 인터뷰 데이터를 수업 활동에
              활용할 수 있는 도구.
            </p>
          </div>
          <aside className="rounded-[12px] border border-black/10 bg-white/78 p-5 text-[14px] leading-6 text-black/76 shadow-[3px_5px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl">
            답변은 가상 페르소나 설정에 기반한 수업용 자료입니다. 활동지, 토론, 탐구 자료로 활용하되 실제 참여자 증언이나 통계
            근거처럼 다루지 않습니다.
          </aside>
        </header>

        <nav className="grid grid-cols-4 gap-2 rounded-[12px] border border-black/10 bg-white p-2 shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
          {steps.map((item, index) => {
            const disabled = item.id === 'persona' ? !canEnterPersona : ['interview', 'organize'].includes(item.id) ? !canEnterProjectStep : false;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!disabled && index <= Math.max(activeStepIndex, project ? steps.length - 1 : 1)) setStep(item.id);
                }}
                className={`h-10 rounded-[8px] text-[13px] font-semibold transition ${
                  item.id === step ? 'bg-[#0071e3] text-white' : 'text-black/55 hover:bg-[#f5f5f7] disabled:opacity-35'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {step === 'activity' && <ActivitySetupStep settings={settings} onChange={setSettings} onNext={startPersonaSelection} />}
        {step === 'persona' && (
          <PersonaSelectStep
            draft={draft}
            personas={personaDataset.personas}
            sourceStatus={personaDataset.sourceStatus}
            selectedIds={selectedPersonaIds}
            activityMode={settings.activityMode}
            onBack={() => setStep('activity')}
            onNext={confirmPersonaSelection}
          />
        )}
        {step === 'interview' && project && (
          <div className="space-y-5">
            <ActivitySummary settings={settings} project={project} />
            <InterviewStep project={project} activityMode={settings.activityMode} onTurnAdded={addInterviewTurn} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStep('organize')}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0071e3] px-5 text-[14px] font-semibold text-white transition hover:bg-[#0066cc]"
              >
                데이터 정리로 이동
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        )}
        {step === 'organize' && project && (
          <InterviewDataStep settings={settings} project={project} onBack={() => setStep('interview')} />
        )}
      </section>
    </main>
  );
}

function ActivitySetupStep({
  settings,
  onChange,
  onNext,
}: {
  settings: ActivitySettings;
  onChange: (settings: ActivitySettings) => void;
  onNext: () => void;
}) {
  const update = (key: keyof ActivitySettings, value: string) => onChange({ ...settings, [key]: value });
  const canContinue = Boolean(settings.topic.trim() && settings.purpose.trim());
  const activityTypeSelectValue = activityTypeOptionFor(settings.activityType);

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form
        className="rounded-[12px] border border-black/10 bg-white p-5 shadow-[3px_5px_30px_rgba(0,0,0,0.06)] sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canContinue) onNext();
        }}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0066cc]">
          <ClipboardList size={17} />
          활동 설정
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="과목" id="subject">
            <select
              id="subject"
              value={settings.subject}
              onChange={(event) => update('subject', event.target.value)}
              className="h-11 w-full rounded-[9px] border border-black/10 bg-[#fafafc] px-3 text-[14px] outline-none focus:border-[#0071e3] focus:bg-white"
            >
              {['사회', '국어', '과학', '영어', '역사', '진로', '동아리', '자율 활동', '기타'].map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </Field>
          <Field label="활동 모드" id="activityMode">
            <select
              id="activityMode"
              value={settings.activityMode}
              onChange={(event) => update('activityMode', event.target.value as any)}
              className="h-11 w-full rounded-[9px] border border-black/10 bg-[#fafafc] px-3 text-[14px] outline-none focus:border-[#0071e3] focus:bg-white"
            >
              <option value="interview">1:1 심층 인터뷰 (기본)</option>
              <option value="fgi">초점집단면접 (FGI) - 3인 패널 대화</option>
              <option value="heatmap">지역사회 가상 이슈 맵핑 (Pain-Point 분석)</option>
              <option value="roleplay">이해관계자 롤플레잉 토론 (1:1 역할극)</option>
              <option value="negotiation">정책 협상 시뮬레이터 (중재)</option>
            </select>
          </Field>
          <Field label="활동 유형" id="activityType">
            <select
              id="activityType"
              value={activityTypeSelectValue}
              onChange={(event) => {
                const value = event.target.value;
                update('activityType', value === CUSTOM_ACTIVITY_TYPE ? '' : value);
              }}
              className="h-11 w-full rounded-[9px] border border-black/10 bg-[#fafafc] px-3 text-[14px] outline-none focus:border-[#0071e3] focus:bg-white"
            >
              {ACTIVITY_TYPE_OPTIONS.map((activityType) => (
                <option key={activityType} value={activityType}>
                  {activityType}
                </option>
              ))}
              <option value={CUSTOM_ACTIVITY_TYPE}>{CUSTOM_ACTIVITY_TYPE}</option>
            </select>
            {activityTypeSelectValue === CUSTOM_ACTIVITY_TYPE && (
              <input
                aria-label="활동 유형 직접 입력"
                value={settings.activityType}
                onChange={(event) => update('activityType', event.target.value)}
                className="mt-2 h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[14px] outline-none focus:border-[#0071e3]"
                placeholder="예: 실험 관찰 인터뷰, 전시 기획 인터뷰"
              />
            )}
            <p className="mt-2 text-[12px] leading-5 text-black/50">
              페르소나는 현대 대한민국 생활 맥락의 페르소나로 답합니다. 과거 인물이나 작품 속 인물을 직접 재현하지 않습니다.
            </p>
          </Field>
          <Field label="학년/수준" id="gradeLevel">
            <input
              id="gradeLevel"
              value={settings.gradeLevel}
              onChange={(event) => update('gradeLevel', event.target.value)}
              className="h-11 w-full rounded-[9px] border border-black/10 bg-[#fafafc] px-3 text-[14px] outline-none focus:border-[#0071e3] focus:bg-white"
              placeholder="예: 고1, 중3, 동아리 심화"
            />
          </Field>
          <Field label="인터뷰 주제" id="topic">
            <input
              id="topic"
              value={settings.topic}
              onChange={(event) => update('topic', event.target.value)}
              className="h-11 w-full rounded-[9px] border border-black/10 bg-[#fafafc] px-3 text-[14px] outline-none focus:border-[#0071e3] focus:bg-white"
              placeholder="예: 지역 서점과 청소년 독서 경험"
            />
          </Field>
          <Field label="인터뷰 목적" id="purpose" className="sm:col-span-2">
            <input
              id="purpose"
              value={settings.purpose}
              onChange={(event) => update('purpose', event.target.value)}
              className="h-11 w-full rounded-[9px] border border-black/10 bg-[#fafafc] px-3 text-[14px] outline-none focus:border-[#0071e3] focus:bg-white"
              placeholder="예: 서로 다른 이용 경험과 독서 동기를 듣기"
            />
          </Field>
          <Field label="수업 맥락" id="context" className="sm:col-span-2">
            <textarea
              id="context"
              value={settings.context}
              onChange={(event) => update('context', event.target.value)}
              className="min-h-24 w-full resize-y rounded-[9px] border border-black/10 bg-[#fafafc] p-3 text-[14px] leading-6 outline-none focus:border-[#0071e3] focus:bg-white"
              placeholder="활동지, 토론, 프로젝트 등 인터뷰 데이터를 어디에 쓸지 적어 주세요."
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={!canContinue}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0071e3] px-5 text-[14px] font-semibold text-white transition hover:bg-[#0066cc] disabled:cursor-not-allowed disabled:bg-black/20"
          >
            페르소나 선택하기
            <ArrowRight size={17} />
          </button>
        </div>
      </form>

      <aside className="rounded-[12px] border border-black/10 bg-white p-5 text-[14px] leading-6 text-black/72 shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0066cc]">
          <BookOpen size={17} />
          활동 범위
        </div>
        <dl className="mt-4 space-y-3">
          <SummaryItem label="과목" value={settings.subject} />
          <SummaryItem label="활동" value={settings.activityType} />
          <SummaryItem label="수준" value={settings.gradeLevel} />
          <SummaryItem label="주제" value={settings.topic} />
        </dl>
      </aside>
    </section>
  );
}

function ActivitySummary({ settings, project }: { settings: ActivitySettings; project: ResearchProject }) {
  return (
    <section className="rounded-[12px] border border-[#0071e3]/20 bg-white p-4 text-[14px] leading-6 text-black/72 shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-[#0066cc]">
          <UsersRound size={16} />
          {settings.subject} · {settings.activityType}
        </span>
        <span className="text-black/35">/</span>
        <span>{project.interviews.length}명 페르소나 인터뷰</span>
      </div>
      <p className="mt-1 text-black/62">{settings.purpose}</p>
    </section>
  );
}

function InterviewDataStep({ settings, project, onBack }: { settings: ActivitySettings; project: ResearchProject; onBack: () => void }) {
  const markdown = useMemo(() => buildActivityExport(settings, project), [settings, project]);
  const interviewSummary = useMemo(() => buildInterviewDataSummary(project), [project]);

  const copyMarkdown = async () => {
    await navigator.clipboard?.writeText(markdown);
  };

  const downloadMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `personars-interview-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[14px] font-medium text-[#0066cc]">인터뷰 데이터 정리</p>
        <h2 className="mt-1 text-[32px] font-semibold leading-[1.1] text-[#1d1d1f] sm:text-[40px]">수업 활동에 쓸 자료로 정리하기</h2>
        <p className="mt-3 text-[16px] leading-[1.55] text-black/70">
          학생 질문과 페르소나 답변을 핵심 발언, 반복 주제, 관점 차이, 직접 인용 후보로 모읍니다.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DataPanel title="핵심 발언" icon={<MessageSquareText size={17} />}>
          {interviewSummary.keyStatements.length > 0 ? (
            <ul className="space-y-2">
              {interviewSummary.keyStatements.map((statement) => (
                <li key={`${statement.personaLabel}-${statement.question}`} className="rounded-[9px] border border-black/8 bg-[#fafafc] p-3">
                  <p className="text-[12px] font-semibold text-[#0057b8]">{statement.personaLabel}</p>
                  <p className="mt-1 text-[13px] leading-5 text-black/72">{statement.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-black/55">아직 정리할 인터뷰 답변이 없습니다. 인터뷰 화면에서 질문을 보낸 뒤 다시 확인하세요.</p>
          )}
        </DataPanel>

        <DataPanel title="반복 주제와 관점 차이" icon={<UsersRound size={17} />}>
          <div className="space-y-3">
            <div>
              <p className="text-[12px] font-semibold text-black/45">반복 주제</p>
              <p className="mt-1 text-[13px] leading-5 text-black/72">
                {interviewSummary.repeatedThemes.length > 0 ? interviewSummary.repeatedThemes.join(' · ') : '답변이 쌓이면 반복되는 표현과 관심사가 표시됩니다.'}
              </p>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-black/45">관점 차이</p>
              <p className="mt-1 text-[13px] leading-5 text-black/72">
                {interviewSummary.viewpointDifferences.length > 0
                  ? interviewSummary.viewpointDifferences.join(' / ')
                  : '서로 다른 페르소나의 답변이 쌓이면 관점 차이가 표시됩니다.'}
              </p>
            </div>
          </div>
        </DataPanel>

        <DataPanel title="직접 인용 후보" icon={<FileText size={17} />}>
          {interviewSummary.quoteCandidates.length > 0 ? (
            <ul className="space-y-2">
              {interviewSummary.quoteCandidates.map((quote) => (
                <li key={quote} className="text-[13px] leading-5 text-black/72">
                  - {quote}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-black/55">인용 후보는 실제 인터뷰 턴이 생긴 뒤 표시됩니다.</p>
          )}
        </DataPanel>

        <DataPanel title="수업 활동용 요약" icon={<ClipboardList size={17} />}>
          <p className="text-[13px] leading-6 text-black/72">
            {settings.subject} {settings.activityType}에서 “{settings.topic}”을 다루며, {project.interviews.length}명의 가상 페르소나를 통해{' '}
            {settings.purpose}라는 목적을 탐색했습니다. 이 자료는 토론 질문, 활동지 근거, 추가 탐구 질문을 만드는 데 사용할 수 있습니다.
          </p>
        </DataPanel>
      </div>

      <div className="rounded-[12px] border border-black/10 bg-white p-4">
        <p className="text-[13px] font-semibold text-[#1d1d1f]">내보내기 미리보기</p>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-[10px] bg-[#1d1d1f] p-4 text-[12px] leading-5 text-white/86">
          {markdown}
        </pre>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-5 text-[14px] font-semibold">
          <ArrowLeft size={17} />
          인터뷰로 돌아가기
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyMarkdown} className="inline-flex h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-5 text-[14px] font-semibold">
            <ClipboardList size={17} />
            마크다운 복사
          </button>
          <button type="button" onClick={downloadMarkdown} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0071e3] px-5 text-[14px] font-semibold text-white">
            <Download size={17} />
            활동지용 텍스트 저장
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, id, className = '', children }: { label: string; id: string; className?: string; children: ReactNode }) {
  return (
    <div className={`block ${className}`}>
      <label htmlFor={id} className="mb-2 block text-[12px] font-semibold text-black/45">
        {label}
      </label>
      {children}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold text-black/40">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-medium text-[#1d1d1f]">{value || '미정'}</dd>
    </div>
  );
}

function DataPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[12px] border border-black/10 bg-white p-4 shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0066cc]">
        {icon}
        {title}
      </div>
      <div className="mt-3 text-[14px] leading-6">{children}</div>
    </section>
  );
}

function buildActivityDraft(settings: ActivitySettings): ResearchDraft {
  const normalized = normalizeSettings(settings);
  return {
    topic: normalized.topic,
    title: `${normalized.topic} 질적 인터뷰 활동`,
    question: `${normalized.topic}에 대해 ${normalized.purpose} 위해 어떤 경험과 관점이 드러나는가?`,
    hypothesis: '질적 인터뷰에서는 결론 확정보다 경험, 맥락, 의미의 차이를 탐색합니다.',
    targetGroup: `${normalized.gradeLevel} 수준의 ${normalized.subject} 수업에서 ${normalized.purpose}와 관련된 다양한 사람들`,
  };
}

function normalizeSettings(settings: ActivitySettings): ActivitySettings {
  return {
    subject: settings.subject.trim() || DEFAULT_SETTINGS.subject,
    activityType: settings.activityType.trim() || DEFAULT_SETTINGS.activityType,
    topic: settings.topic.trim() || DEFAULT_SETTINGS.topic,
    purpose: settings.purpose.trim() || DEFAULT_SETTINGS.purpose,
    gradeLevel: settings.gradeLevel.trim() || DEFAULT_SETTINGS.gradeLevel,
    context: settings.context.trim() || DEFAULT_SETTINGS.context,
    activityMode: settings.activityMode || DEFAULT_SETTINGS.activityMode,
  };
}

function activityTypeOptionFor(value: string): string {
  return ACTIVITY_TYPE_OPTIONS.includes(value as (typeof ACTIVITY_TYPE_OPTIONS)[number]) ? value : CUSTOM_ACTIVITY_TYPE;
}

function buildActivityExport(settings: ActivitySettings, project: ResearchProject): string {
  const turns = project.interviews.flatMap((interview) =>
    interview.turns.map((turn) => ({
      persona: interview.persona.label,
      question: turn.question,
      answer: stripSimulationPrefix(turn.answer),
    })),
  );
  const quotes = turns.map((turn) => `- ${turn.persona}: ${firstSentence(turn.answer)}`).join('\n') || '- 아직 인터뷰 답변이 없습니다.';

  return [
    `# ${settings.topic} 페르소나 인터뷰 정리`,
    '',
    `- 과목: ${settings.subject}`,
    `- 활동 모드: ${settings.activityMode === 'interview' ? '1:1 심층 인터뷰' : settings.activityMode === 'fgi' ? '초점집단면접 (FGI)' : settings.activityMode === 'heatmap' ? '지역사회 가상 이슈 맵핑' : settings.activityMode === 'roleplay' ? '이해관계자 롤플레잉 토론' : '정책 협상 시뮬레이터'}`,
    `- 활동 유형: ${settings.activityType}`,
    `- 학년/수준: ${settings.gradeLevel}`,
    `- 인터뷰 목적: ${settings.purpose}`,
    '',
    '## 선택한 페르소나',
    ...project.interviews.map((interview) => `- ${interview.persona.label} (${interview.persona.ageGroup}, ${interview.persona.region}, ${interview.persona.occupation})`),
    '',
    '## 핵심 인용 후보',
    quotes,
    '',
    '## 전체 대화 기록',
    turns.length > 0
      ? turns.map((turn) => `### ${turn.persona}\n질문: ${turn.question}\n\n답변: ${turn.answer}`).join('\n\n')
      : '아직 저장된 인터뷰 턴이 없습니다.',
    '',
    '> 이 자료는 가상 페르소나 기반 수업 활동용 자료이며 실제 참여자 증언이나 통계 근거가 아닙니다.',
  ].join('\n');
}

function loadSavedState(): SavedState | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as SavedState) : null;
  } catch {
    return null;
  }
}
