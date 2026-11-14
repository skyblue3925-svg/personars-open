import { Bot, MessageCircle, Send, Sparkles, UserRound, Users, Flame, BarChart3, ShieldAlert, ArrowLeft, ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { coachInterviewQuestion } from '../lib/interviewCoach';
import { buildInterviewFlowMap } from '../lib/interviewFlowMap';
import type { InterviewFlowMap, InterviewFlowAxisSummary } from '../lib/interviewFlowMap';
import { buildInterviewCharacter } from '../lib/interviewCharacter';
import { buildInterviewReview } from '../lib/interviewReview';
import type { InterviewReview } from '../lib/interviewReview';
import { chatWithPersona } from '../lib/personaLLM';
import type { InterviewCoachFeedback, InterviewResult, InterviewTurn, ResearchProject } from '../types/research';
import { SimulationNotice } from './SimulationNotice';

type InterviewStepProps = {
  project: ResearchProject;
  activityMode?: string;
  onTurnAdded?: (personaId: string, turn: InterviewTurn) => void;
};

export function InterviewStep({ project, activityMode = 'interview', onTurnAdded }: InterviewStepProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState(project.interviews[0]?.persona.id ?? '');
  const [question, setQuestion] = useState('');
  const [followUps, setFollowUps] = useState<Record<string, InterviewTurn[]>>({});
  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [coachEnabled, setCoachEnabled] = useState(false);
  const [coachPending, setCoachPending] = useState(false);
  const [coachFeedback, setCoachFeedback] = useState<InterviewCoachFeedback | null>(null);
  const [coachedQuestion, setCoachedQuestion] = useState('');
  const [coachError, setCoachError] = useState('');

  // Roleplay mode state
  const [studentRole, setStudentRole] = useState('인터뷰 진행자');

  // Heatmap mode state
  const [reportText, setReportText] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const activeInterview = useMemo(
    () => project.interviews.find((item) => item.persona.id === selectedPersonaId) ?? project.interviews[0],
    [project.interviews, selectedPersonaId],
  );

  if (!activeInterview) {
    return null;
  }

  const character = activeInterview.character ?? buildInterviewCharacter(project.draft, activeInterview.persona);
  const activeFollowUps = followUps[activeInterview.persona.id] ?? [];
  const transcript = activeFollowUps;
  const flowMap = useMemo(() => buildInterviewFlowMap(transcript), [transcript]);
  const review = useMemo(() => buildInterviewReview(transcript), [transcript]);
  const totalTurns = transcript.length;
  const turnLimitReached = totalTurns >= 30;
  const isPending = pendingPersonaId === activeInterview.persona.id || pendingPersonaId === 'fgi-all' || pendingPersonaId === 'negotiation-all';
  const usedSceneIds = new Set([
    ...activeFollowUps.map((_, index) => character.concreteScenes[index % character.concreteScenes.length]?.id ?? ''),
  ]);

  const ask = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || turnLimitReached || isPending) return;
    const currentCoach = coachFeedback && coachedQuestion === trimmedQuestion ? coachFeedback : undefined;

    setPendingPersonaId(activeInterview.persona.id);
    const response = await chatWithPersona(
      {
        personaId: activeInterview.persona.id,
        topic: project.draft.topic,
        researchQuestion: project.draft.question,
        latest: trimmedQuestion,
        character,
        studentRole: activityMode === 'roleplay' ? studentRole : undefined,
        history: transcript.flatMap((turn) => [
          { role: 'student' as const, text: turn.question },
          { role: 'persona' as const, text: turn.answer },
        ]),
      },
      activeInterview.persona,
      project.draft,
      { apiUrl: aiEnabled ? undefined : '' },
    );

    const turn: InterviewTurn = {
      question: activityMode === 'roleplay' ? `${trimmedQuestion} (역할: ${studentRole})` : trimmedQuestion,
      answer: response.text,
      source: response.source,
      modelId: response.modelId,
      generatedAt: response.generatedAt,
      evidence: response.evidence,
      coach: currentCoach,
    };

    setFollowUps((current) => ({
      ...current,
      [activeInterview.persona.id]: [...(current[activeInterview.persona.id] ?? []), turn],
    }));
    onTurnAdded?.(activeInterview.persona.id, turn);
    setQuestion('');
    setCoachFeedback(null);
    setCoachedQuestion('');
    setCoachError('');
    setPendingPersonaId(null);
  };

  const askFgi = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isPending) return;

    setPendingPersonaId('fgi-all');

    await Promise.all(
      project.interviews.map(async (interview) => {
        const char = interview.character ?? buildInterviewCharacter(project.draft, interview.persona);
        const activeTurns = followUps[interview.persona.id] ?? [];

        const response = await chatWithPersona(
          {
            personaId: interview.persona.id,
            topic: project.draft.topic,
            researchQuestion: project.draft.question,
            latest: trimmedQuestion,
            character: char,
            history: activeTurns.flatMap((turn) => [
              { role: 'student' as const, text: turn.question },
              { role: 'persona' as const, text: turn.answer },
            ]),
          },
          interview.persona,
          project.draft,
          { apiUrl: aiEnabled ? undefined : '' },
        );

        const turn: InterviewTurn = {
          question: trimmedQuestion,
          answer: response.text,
          source: response.source,
          modelId: response.modelId,
          generatedAt: response.generatedAt,
          evidence: response.evidence,
        };

        setFollowUps((current) => ({
          ...current,
          [interview.persona.id]: [...(current[interview.persona.id] ?? []), turn],
        }));
        onTurnAdded?.(interview.persona.id, turn);
      })
    );

    setQuestion('');
    setPendingPersonaId(null);
  };

  const askNegotiation = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isPending) return;

    setPendingPersonaId('negotiation-all');

    const pA = project.interviews[0];
    const pB = project.interviews[1] ?? project.interviews[0];

    if (!pA) {
      setPendingPersonaId(null);
      return;
    }

    const sharedTurns = followUps['negotiation-shared'] ?? [];

    const charA = pA.character ?? buildInterviewCharacter(project.draft, pA.persona);
    const historyA = sharedTurns.flatMap((turn) => [
      { role: 'student' as const, text: turn.question },
      { role: 'persona' as const, text: turn.answer },
    ]);

    const responseA = await chatWithPersona(
      {
        personaId: pA.persona.id,
        topic: project.draft.topic,
        researchQuestion: project.draft.question,
        latest: `${trimmedQuestion} (${pA.persona.label}님, 의견을 말씀해주시겠어요?)`,
        character: charA,
        history: historyA,
      },
      pA.persona,
      project.draft,
      { apiUrl: aiEnabled ? undefined : '' },
    );

    const charB = pB.character ?? buildInterviewCharacter(project.draft, pB.persona);
    const historyB = [
      ...historyA,
      { role: 'student' as const, text: `${trimmedQuestion} (${pA.persona.label}님의 의견)` },
      { role: 'persona' as const, text: responseA.text },
    ];

    const responseB = await chatWithPersona(
      {
        personaId: pB.persona.id,
        topic: project.draft.topic,
        researchQuestion: project.draft.question,
        latest: `앞서 ${pA.persona.label}님이 이렇게 말씀하셨습니다: "${responseA.text.replace(/\[가상 페르소나 시뮬레이션\]\n/, '')}". ${pB.persona.label}님은 이에 대해 어떻게 생각하시나요? 다른 측면이나 보완할 점을 말씀해주세요.`,
        character: charB,
        history: historyB,
      },
      pB.persona,
      project.draft,
      { apiUrl: aiEnabled ? undefined : '' },
    );

    const turn: InterviewTurn = {
      question: trimmedQuestion,
      answer: `**[${pA.persona.label}]**\n${responseA.text.replace(/\[가상 페르소나 시뮬레이션\]\n/, '')}\n\n**[${pB.persona.label}]**\n${responseB.text.replace(/\[가상 페르소나 시뮬레이션\]\n/, '')}`,
      source: responseA.source,
      modelId: responseA.modelId,
      generatedAt: new Date().toISOString(),
    };

    setFollowUps((current) => ({
      ...current,
      ['negotiation-shared']: [...(current['negotiation-shared'] ?? []), turn],
    }));

    onTurnAdded?.(pA.persona.id, { question: trimmedQuestion, answer: responseA.text, source: responseA.source });
    onTurnAdded?.(pB.persona.id, { question: `토론: ${trimmedQuestion}`, answer: responseB.text, source: responseB.source });

    setQuestion('');
    setPendingPersonaId(null);
  };

  const requestCoach = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || coachPending) return;

    setCoachPending(true);
    setCoachError('');
    try {
      const feedback = await coachInterviewQuestion({
        personaId: activeInterview.persona.id,
        topic: project.draft.topic,
        researchQuestion: project.draft.question,
        latest: trimmedQuestion,
        character,
        persona: activeInterview.persona,
        history: transcript.flatMap((turn) => [
          { role: 'student' as const, text: turn.question },
          { role: 'persona' as const, text: turn.answer },
        ]),
      });
      setCoachFeedback(feedback);
      setCoachedQuestion(trimmedQuestion);
    } catch {
      setCoachFeedback(null);
      setCoachedQuestion('');
      setCoachError('AI 코치 연결에 실패했습니다. 코치 없이 질문을 보낼 수 있습니다.');
    } finally {
      setCoachPending(false);
    }
  };

  // Heatmap calculations
  const allConcerns = useMemo(() => {
    const map = new Map<string, number>();
    for (const interview of project.interviews) {
      const list = interview.persona.concerns ?? [];
      for (const item of list) {
        map.set(item, (map.get(item) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [project.interviews]);

  const allTensions = useMemo(() => {
    const map = new Map<string, number>();
    for (const interview of project.interviews) {
      const list = interview.persona.tensions ?? [];
      for (const item of list) {
        map.set(item, (map.get(item) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [project.interviews]);

  const generateCommunityReport = async () => {
    setReportLoading(true);
    try {
      const promptText = `다음 가상 주민들의 프로필과 우려사항을 분석하여, 이 지역사회의 가장 시급한 문제점들과 상충되는 이해관계에 대해 교사용 분석 보고서(3~4문단)를 작성해주세요.\n\n주민 목록:\n${project.interviews.map(i => `- ${i.persona.label} (${i.persona.ageGroup}, ${i.persona.region}, ${i.persona.occupation}): 우려사항 [${i.persona.concerns.join(', ')}]`).join('\n')}`;

      const response = await chatWithPersona(
        {
          personaId: 'heatmap-analysis',
          topic: project.draft.topic,
          researchQuestion: project.draft.question,
          latest: promptText,
          history: [],
        },
        project.interviews[0].persona,
        project.draft,
        { apiUrl: aiEnabled ? undefined : '' }
      );
      const reportBody = response.text.replace(/\[가상 페르소나 시뮬레이션\]\n/, '');
      setReportText(
        response.source === 'llm'
          ? reportBody
          : `${reportBody}

(AI 서버가 연결되지 않았거나 응답하지 않아, AI 분석이 아니라 미리 만들어 둔 연습용 응답으로 표시된 내용입니다.)`,
      );
    } catch {
      setReportText('보고서 생성에 실패했습니다. 연결을 확인하고 다시 시도하세요.');
    } finally {
      setReportLoading(false);
    }
  };

  // Render helpers based on modes
  if (activityMode === 'heatmap') {
    return (
      <section className="space-y-5">
        <div>
          <p className="text-[14px] font-medium text-[#0066cc]">지역사회 가상 이슈 맵핑</p>
          <h2 className="mt-1 text-[32px] font-semibold leading-[1.1] text-[#1d1d1f] sm:text-[40px]">가상 이슈 맵핑 & Pain-Point 분석</h2>
          <p className="mt-3 text-[17px] leading-[1.47] text-black/70">
            선택한 페르소나들의 관심사와 일상생활 속 사회적 갈등 요소들을 종합 분석하여, 지역사회의 진짜 Pain-Point를 시각화합니다.
          </p>
        </div>

        <SimulationNotice />

        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-[12px] border border-black/10 bg-white p-4 shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
              <p className="text-[12px] font-semibold uppercase text-black/45">선택된 주민 프로필 ({project.interviews.length}명)</p>
              <div className="mt-3 space-y-3">
                {project.interviews.map((interview) => (
                  <div key={interview.persona.id} className="rounded-[9px] border border-black/8 bg-[#fafafc] p-3 text-[13px]">
                    <p className="font-semibold text-[#1d1d1f]">{interview.persona.label}</p>
                    <p className="mt-0.5 text-black/50">{interview.persona.ageGroup} · {interview.persona.region} · {interview.persona.occupation}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {interview.persona.concerns.slice(0, 2).map((c) => (
                        <span key={c} className="rounded-full bg-white px-2 py-0.5 text-[11px] border border-black/8 text-black/60">{c}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <div className="rounded-[12px] border border-black/10 bg-white p-5 shadow-[3px_5px_30px_rgba(0,0,0,0.06)]">
              <h3 className="flex items-center gap-2 text-[18px] font-semibold text-[#1d1d1f]">
                <BarChart3 size={18} className="text-[#0071e3]" />
                가장 빈번한 일상생활 우려사항 (Concerns)
              </h3>
              <div className="mt-5 space-y-4">
                {allConcerns.slice(0, 8).map(([concern, count]) => {
                  const percentage = Math.round((count / project.interviews.length) * 100);
                  return (
                    <div key={concern} className="space-y-1">
                      <div className="flex justify-between text-[13px] font-medium">
                        <span className="text-[#1d1d1f]">{concern}</span>
                        <span className="text-[#0071e3]">{count}명 ({percentage}%)</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-black/5 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#0071e3] to-[#00c6ff] rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[12px] border border-black/10 bg-white p-5 shadow-[3px_5px_30px_rgba(0,0,0,0.06)]">
                <h3 className="flex items-center gap-2 text-[17px] font-semibold text-[#1d1d1f]">
                  <Flame size={18} className="text-[#ff453a]" />
                  사회적 갈등/긴장 쟁점 (Tension Axes)
                </h3>
                <div className="mt-4 space-y-2">
                  {allTensions.slice(0, 6).map(([tension, count]) => (
                    <div key={tension} className="flex items-center justify-between rounded-[8px] bg-[#fff5f5] border border-[#ff453a]/10 p-3 text-[13px]">
                      <span className="font-medium text-black/80">{tension}</span>
                      <span className="rounded-full bg-[#ff453a]/10 px-2 py-0.5 text-[11px] font-bold text-[#ff453a]">가중치 {count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[12px] border border-black/10 bg-white p-5 shadow-[3px_5px_30px_rgba(0,0,0,0.06)]">
                <h3 className="flex items-center gap-2 text-[17px] font-semibold text-[#1d1d1f]">
                  <ShieldAlert size={18} className="text-[#ff9f0a]" />
                  위험 요소 및 모니터링 필요 지표
                </h3>
                <ul className="mt-4 space-y-2.5 text-[13px] leading-5 text-black/70">
                  <li className="flex gap-2">
                    <span className="text-[#ff9f0a] font-bold">•</span>
                    <span>세대 간/지역 간 경험 격차에 따른 상호 오해 가능성</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#ff9f0a] font-bold">•</span>
                    <span>직접적인 정책 대상자(당사자)의 목소리 과소 대표 위험</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#ff9f0a] font-bold">•</span>
                    <span>생활 압박으로 인한 가상 주민들의 스트레스 누적</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="rounded-[12px] border border-[#0071e3]/20 bg-[#fafafc] p-5">
              <h3 className="text-[18px] font-semibold text-[#1d1d1f]">가상 지역사회 AI 분석 리포트</h3>
              <p className="mt-1 text-[13px] text-black/55">전체 주민 프로필과 우려사항을 바탕으로 종합적인 사회적 시사점을 도출합니다.</p>
              
              {reportText ? (
                <div className="mt-4 rounded-[10px] border border-black/10 bg-white p-4 text-[14px] leading-7 text-black/82 whitespace-pre-wrap">
                  {reportText}
                </div>
              ) : (
                <div className="mt-4 flex flex-col items-center justify-center rounded-[10px] border border-dashed border-black/15 bg-white p-8">
                  <p className="text-[14px] text-black/50">아직 리포트가 생성되지 않았습니다.</p>
                  <button
                    type="button"
                    onClick={generateCommunityReport}
                    disabled={reportLoading}
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-[#0071e3] px-5 text-[13px] font-semibold text-white disabled:bg-black/20"
                  >
                    {reportLoading ? 'AI 리포트 분석 중...' : 'AI 종합 리포트 생성'}
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>
      </section>
    );
  }

  if (activityMode === 'fgi') {
    return (
      <section className="space-y-5">
        <div>
          <p className="text-[14px] font-medium text-[#0066cc]">초점집단면접 (FGI) 데스크</p>
          <h2 className="mt-1 text-[32px] font-semibold leading-[1.1] text-[#1d1d1f] sm:text-[40px]">3인 패널 초점집단면접</h2>
          <p className="mt-3 text-[17px] leading-[1.47] text-black/70">
            선택된 3명의 페르소나가 한 자리에 모여 대화합니다. 질문을 입력하면 3명의 페르소나가 각자의 입장에서 답변을 보냅니다.
          </p>
        </div>

        <SimulationNotice />

        <div className="grid gap-4 md:grid-cols-3">
          {project.interviews.map((interview) => {
            const personaTurns = followUps[interview.persona.id] ?? [];
            const isFgiPending = pendingPersonaId === 'fgi-all';
            return (
              <div key={interview.persona.id} className="flex flex-col min-w-0 rounded-[12px] border border-black/10 bg-white shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
                <div className="border-b border-black/10 p-4 bg-[#fafafc] rounded-t-[12px]">
                  <p className="text-[11px] font-semibold text-[#0066cc]">패널 {interview.persona.label}</p>
                  <p className="text-[13px] text-black/50 mt-0.5">{interview.persona.ageGroup} · {interview.persona.region} · {interview.persona.occupation}</p>
                </div>
                
                <div className="flex-1 min-h-[380px] max-h-[500px] overflow-auto p-4 space-y-4">
                  {personaTurns.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-black/15 p-4 text-[13px] leading-5 text-black/55 bg-[#fafafc]">
                      아래 공통 질문창에 질문을 입력하면, {interview.persona.label}님의 1인칭 답변이 여기에 기록됩니다.
                    </div>
                  ) : (
                    personaTurns.map((turn, index) => (
                      <div key={index} className="space-y-2">
                        <div className="text-[11px] text-[#0066cc] font-semibold">Q. {turn.question}</div>
                        <div className="rounded-[8px] bg-black/5 p-3 text-[13px] leading-6 text-black/80">
                          {turn.answer}
                        </div>
                      </div>
                    ))
                  )}
                  {isFgiPending && (
                    <div className="flex items-center justify-center p-3 text-[13px] text-black/40">
                      답변을 작성하는 중...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-[12px] border border-black/10 bg-[#fafafc] p-4">
          <label className="text-[12px] font-semibold uppercase text-black/45">패널 공동 질문 입력</label>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={isPending}
            className="mt-2 min-h-24 w-full resize-y rounded-[10px] border border-black/10 bg-white p-3 text-[15px] leading-6 outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/25"
            placeholder="공통 질문을 입력하세요. 예: 다들 어떤 순간에 가장 피로감을 느끼시나요?"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[12px] text-black/45">세 패널에게 동시에 질문을 전송하고 병렬로 응답을 수집합니다.</p>
            <button
              type="button"
              onClick={askFgi}
              disabled={isPending || !question.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0071e3] px-5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/20"
            >
              <Send size={16} />
              {isPending ? '응답 수집 중...' : '패널 전체에 질문'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (activityMode === 'negotiation') {
    const sharedTurns = followUps['negotiation-shared'] ?? [];
    const isNegPending = pendingPersonaId === 'negotiation-all';
    const pA = project.interviews[0];
    const pB = project.interviews[1] ?? project.interviews[0];

    return (
      <section className="space-y-5">
        <div>
          <p className="text-[14px] font-medium text-[#0066cc]">정책 협상 시뮬레이터</p>
          <h2 className="mt-1 text-[32px] font-semibold leading-[1.1] text-[#1d1d1f] sm:text-[40px]">이해관계 정책 협상 대방</h2>
          <p className="mt-3 text-[17px] leading-[1.47] text-black/70">
            두 명의 페르소나({pA?.persona.label}와 {pB?.persona.label})가 중재자 역할을 맡은 학생과 의견 조율 토론을 나눕니다.
          </p>
        </div>

        <SimulationNotice />

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-[12px] border border-black/10 bg-white p-4 shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
              <p className="text-[12px] font-semibold uppercase text-black/45">협상 당사자 정보</p>
              <div className="mt-3 space-y-4">
                {pA && (
                  <div className="rounded-[9px] border border-[#0071e3]/20 bg-[#eef6ff] p-3 text-[13px]">
                    <span className="rounded bg-[#0071e3] text-white text-[10px] font-bold px-1.5 py-0.5">당사자 A</span>
                    <p className="font-semibold text-[#1d1d1f] mt-1">{pA.persona.label}</p>
                    <p className="text-black/55 text-[12px]">{pA.persona.occupation}</p>
                    <p className="mt-2 text-[12px] text-black/70 leading-5"><b>입장:</b> {pA.persona.perspective}</p>
                  </div>
                )}
                {pB && (
                  <div className="rounded-[9px] border border-[#ff9f0a]/20 bg-[#fffbf4] p-3 text-[13px]">
                    <span className="rounded bg-[#ff9f0a] text-white text-[10px] font-bold px-1.5 py-0.5">당사자 B</span>
                    <p className="font-semibold text-[#1d1d1f] mt-1">{pB.persona.label}</p>
                    <p className="text-black/55 text-[12px]">{pB.persona.occupation}</p>
                    <p className="mt-2 text-[12px] text-black/70 leading-5"><b>입장:</b> {pB.persona.perspective}</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <main className="flex flex-col min-w-0 rounded-[12px] border border-black/10 bg-white shadow-[3px_5px_30px_rgba(0,0,0,0.06)]">
            <div className="border-b border-black/10 p-4 bg-[#fafafc] rounded-t-[12px]">
              <p className="text-[13px] font-semibold text-[#1d1d1f]">협상 중재 회의록</p>
            </div>

            <div className="flex-1 min-h-[350px] max-h-[500px] overflow-auto p-4 space-y-4">
              {sharedTurns.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-black/15 p-5 text-[14px] leading-6 text-black/62 bg-[#fafafc]">
                  <p className="font-semibold text-black">안녕하세요. 중재인 회의실입니다.</p>
                  양측의 대립되는 주장에 대해 의견을 물어보거나 타협점을 제안해보세요. AI 당사자들이 교대로 의견을 개진하며 협상을 벌입니다.
                </div>
              ) : (
                sharedTurns.map((turn, index) => (
                  <div key={index} className="space-y-3">
                    <div className="ml-auto max-w-[85%] rounded-[14px] bg-[#1d1d1f] px-4 py-3 text-white">
                      <div className="text-[11px] text-white/60 font-semibold">중재자 (학생) 제안</div>
                      <p className="mt-1 text-[14px] leading-5">{turn.question}</p>
                    </div>
                    <div className="max-w-[90%] rounded-[14px] border border-black/10 bg-[#fafafc] p-4 text-[14px] leading-7 text-black/80 space-y-3">
                      <div className="text-[12px] text-[#0066cc] font-semibold">교차 발언 결과</div>
                      <div className="whitespace-pre-wrap text-[14px]">{turn.answer}</div>
                    </div>
                  </div>
                ))
              )}
              {isNegPending && (
                <div className="flex items-center justify-center p-3 text-[13px] text-black/45">
                  두 참여자가 차례대로 토론하는 중입니다 (순차 답변 생성 중)...
                </div>
              )}
            </div>

            <div className="border-t border-black/10 bg-[#fafafc] p-4 rounded-b-[12px]">
              <label className="text-[12px] font-semibold uppercase text-black/45">중재 타협안 또는 토론 유도 질문</label>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                disabled={isPending}
                className="mt-2 min-h-24 w-full resize-y rounded-[10px] border border-black/10 bg-white p-3 text-[15px] leading-6 outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/25"
                placeholder="예: 양측의 주장을 들어보니 타협이 필요해 보입니다. 시간제한은 두되 주말에는 약간 유연하게 늘리는 타협안에 대해 의견이 어떠신가요?"
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[12px] text-black/45">질문을 던지면 A의 발언 후 B가 연속해서 답을 작성합니다.</p>
                <button
                  type="button"
                  onClick={askNegotiation}
                  disabled={isPending || !question.trim()}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0071e3] px-5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/20"
                >
                  <Send size={16} />
                  {isPending ? '토론 진행 중...' : '토론 전송'}
                </button>
              </div>
            </div>
          </main>
        </div>
      </section>
    );
  }

  // Standard or Roleplay modes
  return (
    <section className="space-y-5">
      <div>
        <p className="text-[14px] font-medium text-[#0066cc]">
          {activityMode === 'roleplay' ? '이해관계자 롤플레잉 토론' : '심층 인터뷰 데스크'}
        </p>
        <h2 className="mt-1 text-[32px] font-semibold leading-[1.1] text-[#1d1d1f] sm:text-[40px]">
          {activityMode === 'roleplay' ? '1:1 이해관계자 역할극 워크벤치' : '1:1 심층 인터뷰 워크벤치'}
        </h2>
        <p className="mt-3 text-[17px] leading-[1.47] text-black/70">
          {activityMode === 'roleplay'
            ? '본인의 역할을 설정하고 페르소나와 1:1 토론을 벌입니다. 페르소나는 학생의 역할과 입장을 인지하고 상응하여 소통합니다.'
            : '한 명의 페르소나를 선택해 상담하듯 깊게 묻습니다. 답변은 인물 설정 자료와 생활 장면 자료에 기반해 생성됩니다.'}
        </p>
      </div>

      <SimulationNotice />

      {activityMode === 'roleplay' && (
        <div className="rounded-[12px] border border-[#0071e3]/30 bg-[#eef6ff] p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-[#0057b8]">
            <Users size={17} />
            나(학생)의 역할극 역할 설정:
          </div>
          <select
            value={studentRole}
            onChange={(e) => setStudentRole(e.target.value)}
            className="h-10 rounded-[9px] border border-black/10 bg-white px-3 text-[14px] outline-none focus:border-[#0071e3]"
          >
            <option value="학교 교사">학교 교사</option>
            <option value="신문 기자">신문 기자</option>
            <option value="지역구의회 의원">지역구의회 의원</option>
            <option value="학부모 회장">학부모 회장</option>
            <option value="동급생 친구">동급생 친구</option>
            <option value="청소년 상담사">청소년 상담사</option>
          </select>
          <input
            type="text"
            value={studentRole}
            onChange={(e) => setStudentRole(e.target.value)}
            placeholder="직접 입력하세요"
            className="h-10 flex-1 min-w-[150px] rounded-[9px] border border-black/10 bg-white px-3 text-[14px] outline-none focus:border-[#0071e3]"
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <PersonaSelector interviews={project.interviews} selectedPersonaId={activeInterview.persona.id} onSelect={setSelectedPersonaId} />

        <main className="min-w-0 rounded-[12px] border border-black/10 bg-white shadow-[3px_5px_30px_rgba(0,0,0,0.06)]">
          <div className="border-b border-black/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-[#0066cc]">현재 인터뷰 대상</p>
                <h3 className="mt-1 text-[26px] font-semibold leading-tight text-[#1d1d1f]">{activeInterview.persona.label}</h3>
                <p className="mt-1 text-[13px] text-black/50">
                  {activeInterview.persona.ageGroup} · {activeInterview.persona.region} · {activeInterview.persona.occupation}
                </p>
              </div>
              <InterviewModeSwitch aiEnabled={aiEnabled} onChange={setAiEnabled} />
            </div>
            <p className="mt-3 text-[13px] leading-5 text-black/60">
              {aiEnabled
                ? 'Worker에 연결해 실제 면접 응답처럼 1인칭 답변을 생성합니다. 연결에 실패하면 로컬 연습 응답으로 전환됩니다.'
                : '연습 모드입니다. Worker를 호출하지 않고 로컬 응답만 사용합니다.'}
            </p>
          </div>

          <div className="max-h-[760px] space-y-4 overflow-auto p-5">
            {transcript.length === 0 ? (
              <div data-testid="persona-introduction" className="rounded-[12px] border border-dashed border-black/15 bg-[#fafafc] p-5 text-[14px] leading-6 text-black/62">
                <p className="mb-2 font-semibold text-[#1d1d1f]">
                  안녕하세요. 저는 {activeInterview.persona.label}입니다. 오늘은 {project.draft.topic} 인터뷰에 참여합니다.
                </p>
                질문을 보내면 이곳에 한 명의 인터뷰 참여자와 나눈 대화가 쌓입니다. 미리 만들어진 답변 전문을 보여주지 않고,
                지금 선택한 인물 설정 자료와 생활 장면을 바탕으로 응답을 생성합니다.
              </div>
            ) : (
              transcript.map((turn, index) => <InterviewExchange key={`${turn.question}-${index}`} turn={turn} isFollowUp />)
            )}
          </div>

          <div className="border-t border-black/10 bg-[#fafafc] p-4">
            <label className="text-[12px] font-semibold uppercase text-black/45">다음 질문</label>
            <textarea
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                if (event.target.value.trim() !== coachedQuestion) {
                  setCoachFeedback(null);
                  setCoachError('');
                }
              }}
              disabled={turnLimitReached || isPending}
              className="mt-2 min-h-28 w-full resize-y rounded-[10px] border border-black/10 bg-white p-3 text-[15px] leading-6 outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/25"
              placeholder="예: 그때 실제로 어떤 생각이 먼저 들었나요? 주변 사람들은 어떻게 반응했나요?"
            />
            <div className="mt-3 rounded-[10px] border border-black/10 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-[#1d1d1f]">선택형 AI 인터뷰 코치</p>
                  <p className="mt-1 text-[12px] leading-5 text-black/55">
                    필요한 학생만 켜서 질문을 보내기 전에 피드백을 받습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCoachEnabled((enabled) => !enabled);
                    setCoachFeedback(null);
                    setCoachedQuestion('');
                    setCoachError('');
                  }}
                  className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition ${
                    coachEnabled ? 'bg-[#1d1d1f] text-white' : 'bg-[#eef6ff] text-[#0057b8]'
                  }`}
                >
                  <Sparkles size={15} />
                  {coachEnabled ? 'AI 코치 끄기' : 'AI 코치 켜기'}
                </button>
              </div>

              {coachEnabled && (
                <div className="mt-3 space-y-3">
                  <button
                    type="button"
                    onClick={requestCoach}
                    disabled={!question.trim() || coachPending || isPending}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-[#0071e3]/30 bg-[#f5fbff] px-4 text-[13px] font-semibold text-[#0066cc] disabled:cursor-not-allowed disabled:border-black/10 disabled:text-black/30"
                  >
                    <Sparkles size={14} />
                    {coachPending ? '코치 피드백 생성 중' : '코치 피드백 받기'}
                  </button>
                  {coachError && <p className="text-[12px] leading-5 text-[#b54708]">{coachError}</p>}
                  {coachFeedback && (
                    <CoachFeedbackCard
                      feedback={coachFeedback}
                      onApply={() => {
                        setQuestion(coachFeedback.revisedQuestion);
                        setCoachedQuestion(coachFeedback.revisedQuestion);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-black/45">{totalTurns}/30턴 · 한 사람의 대화를 계속 이어갑니다.</p>
              <button
                type="button"
                onClick={ask}
                disabled={turnLimitReached || isPending || !question.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0071e3] px-5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/20"
              >
                <Send size={16} />
                {isPending ? '응답 생성 중' : turnLimitReached ? '30턴 도달' : '질문 보내기'}
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              <details className="rounded-[10px] border border-black/10 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-black/60">흐름 지도 열기</summary>
                <div className="border-t border-black/8 p-3">
                  <InterviewFlowMapPanel flowMap={flowMap} />
                </div>
              </details>
              <details className="rounded-[10px] border border-black/10 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-black/60">돌아보기 열기</summary>
                <div className="border-t border-black/8 p-3">
                  <InterviewReviewPanel review={review} />
                </div>
              </details>
            </div>
          </div>
        </main>

        <aside className="space-y-4">
          <DossierPanel title="인물 설정 자료">
            <p>{character.lifeContext}</p>
            <p className="mt-2 text-black/55">선정 이유: {activeInterview.groupReason}</p>
          </DossierPanel>

          <DossierPanel title="주제 프레임">
            <div className="grid gap-2 text-[12px]">
              <FrameLine label="집단" values={character.topicFrame.affectedGroups} />
              <FrameLine label="장소" values={character.topicFrame.places} />
              <FrameLine label="압박" values={character.topicFrame.pressures} />
              <FrameLine label="갈등" values={character.topicFrame.tensionAxes} />
            </div>
          </DossierPanel>

          <DossierPanel title="말할 수 있는 범위">
            <DossierList items={character.canSpeakTo} />
          </DossierPanel>

          <DossierPanel title="말하기 어려운 범위">
            <DossierList items={character.cannotSpeakTo} />
          </DossierPanel>

          <DossierPanel title="생활 장면 자료">
            <div className="space-y-2">
              {character.concreteScenes.slice(0, 4).map((scene) => (
                <div key={scene.id} className="rounded-[8px] border border-black/10 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12px] font-semibold text-[#1d1d1f]">{scene.setting}</p>
                    {usedSceneIds.has(scene.id) && (
                      <span className="rounded-full bg-[#e8f2ff] px-2 py-0.5 text-[11px] font-semibold text-[#0057b8]">사용됨</span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-black/65">
                    {scene.action} 압박: {scene.pressure} · 느낌: {scene.feeling}
                  </p>
                </div>
              ))}
            </div>
          </DossierPanel>

          <DossierPanel title="질문 힌트">
            <DossierList
              items={[
                '그 장면에서 실제로 무엇을 먼저 했나요?',
                '그때 혼자 결정한 건가요, 주변 관계가 영향을 줬나요?',
                '이 경험이 반복되는 조건과 덜 심해지는 조건은 무엇인가요?',
              ]}
            />
          </DossierPanel>
        </aside>
      </div>
    </section>
  );
}

function PersonaSelector({
  interviews,
  selectedPersonaId,
  onSelect,
}: {
  interviews: InterviewResult[];
  selectedPersonaId: string;
  onSelect: (personaId: string) => void;
}) {
  return (
    <aside className="rounded-[12px] border border-black/10 bg-white p-3 shadow-[3px_5px_30px_rgba(0,0,0,0.05)] xl:sticky xl:top-4 xl:self-start">
      <p className="px-2 py-2 text-[12px] font-semibold uppercase text-black/45">인터뷰 대상 선택</p>
      <div className="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-2 xl:overflow-visible xl:pb-0">
        {interviews.map((interview) => {
          const active = interview.persona.id === selectedPersonaId;
          return (
            <button
              key={interview.persona.id}
              type="button"
              onClick={() => onSelect(interview.persona.id)}
              className={`min-w-[210px] rounded-[10px] border p-3 text-left transition xl:min-w-0 xl:w-full ${
                active ? 'border-[#0071e3] bg-[#eef6ff]' : 'border-black/10 bg-white hover:bg-[#fafafc]'
              }`}
            >
              <div className="flex items-center gap-2">
                <UserRound size={16} className={active ? 'text-[#0071e3]' : 'text-black/45'} />
                <p className="text-[14px] font-semibold text-[#1d1d1f]">{interview.persona.label}</p>
              </div>
              <p className="mt-1 text-[12px] leading-5 text-black/55">
                {interview.persona.ageGroup} · {interview.persona.occupation}
              </p>
              <p className="mt-2 text-[12px] leading-5 text-black/60">{interview.persona.concerns[0]}</p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function InterviewModeSwitch({ aiEnabled, onChange }: { aiEnabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <div className="grid w-full grid-cols-2 gap-1 rounded-full border border-black/10 bg-[#f5f5f7] p-1 sm:w-auto">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-semibold transition ${
          aiEnabled ? 'bg-[#0071e3] text-white shadow-sm' : 'text-black/55 hover:bg-white'
        }`}
      >
        <Bot size={15} />
        AI 심층 응답
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`inline-flex h-10 items-center justify-center rounded-full px-3 text-[13px] font-semibold transition ${
          !aiEnabled ? 'bg-[#1d1d1f] text-white shadow-sm' : 'text-black/55 hover:bg-white'
        }`}
      >
        템플릿 연습
      </button>
    </div>
  );
}

function DossierPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[12px] border border-black/10 bg-white p-4 shadow-[3px_5px_30px_rgba(0,0,0,0.05)]">
      <p className="text-[12px] font-semibold uppercase text-black/45">{title}</p>
      <div className="mt-2 text-[13px] leading-5 text-black/75">{children}</div>
    </section>
  );
}

function DossierList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item}>- {item}</li>
      ))}
    </ul>
  );
}

function InterviewFlowMapPanel({ flowMap }: { flowMap: InterviewFlowMap }) {
  return (
    <section data-testid="interview-flow-map" className="mt-3 rounded-[10px] border border-black/10 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[#1d1d1f]">면접 흐름 지도</p>
          <p className="mt-1 text-[12px] leading-5 text-black/55">지금까지의 질문이 어떤 영역을 탐색했는지 보여줍니다.</p>
        </div>
        {!flowMap.hasMappedTurns && (
          <span data-testid="interview-flow-map-empty" className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[11px] font-semibold text-black/45">
            아직 지도화된 질문이 없습니다.
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        {flowMap.axes.map((axis) => (
          <FlowAxisRow key={axis.id} axis={axis} />
        ))}
      </div>

      <p data-testid="interview-flow-map-recommendation" className="mt-3 rounded-[8px] bg-[#f5fbff] px-3 py-2 text-[12px] leading-5 text-[#0057b8]">
        {flowMap.recommendation.text}
      </p>
    </section>
  );
}

function InterviewReviewPanel({ review }: { review: InterviewReview }) {
  return (
    <section data-testid="interview-review-panel" className="mt-3 rounded-[10px] border border-black/10 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[#1d1d1f]">면접 돌아보기</p>
          <p className="mt-1 text-[12px] leading-5 text-black/55">질문을 보낸 뒤, 무엇을 잘했고 다음에 무엇을 더 물을지 확인합니다.</p>
        </div>
      </div>
      {review.isEmpty ? (
        <p className="mt-3 rounded-[8px] bg-[#fafafc] px-3 py-2 text-[12px] leading-5 text-black/55">{review.summary}</p>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ReviewSection title="이번 면접 요약" items={[review.summary]} />
          <ReviewSection title="잘한 질문" items={review.goodQuestions.map((item) => `${item.question} - ${item.reason}`)} />
          <ReviewSection title="다음에 더 물어볼 질문" items={review.suggestedQuestions.map((item) => `${item.question} - ${item.reason}`)} />
          <ReviewSection
            title="답을 유도한 질문"
            items={review.leadingQuestions.map((item) => `${item.question} -> ${item.rewrite}`)}
            emptyText="아직 뚜렷한 유도 질문은 없습니다."
          />
          <ReviewSection
            title="믿기 전에 확인할 답변"
            items={review.trustCautions.map((item) => `${item.answerExcerpt} - ${item.reason}`)}
            emptyText="현재 답변에서는 큰 신뢰 주의 신호가 보이지 않습니다."
          />
          <ReviewSection title="활동지에 쓸 만한 말" items={review.quoteCandidates.map((item) => `${item.text} - ${item.reason}`)} />
        </div>
      )}
    </section>
  );
}

function ReviewSection({ title, items, emptyText = '아직 표시할 내용이 없습니다.' }: { title: string; items: string[]; emptyText?: string }) {
  return (
    <div className="rounded-[8px] border border-black/8 bg-[#fafafc] p-3">
      <p className="text-[12px] font-semibold text-[#0057b8]">{title}</p>
      <ul className="mt-2 space-y-1 text-[12px] leading-5 text-black/68">
        {(items.length > 0 ? items : [emptyText]).map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function FlowAxisRow({ axis }: { axis: InterviewFlowAxisSummary }) {
  const stateLabel = axis.state === 'enough' ? '충분' : axis.state === 'started' ? '시작됨' : '비어 있음';
  const segments = axis.state === 'enough' ? 3 : axis.state === 'started' ? 1 : 0;

  return (
    <div className="rounded-[8px] border border-black/10 bg-[#fafafc] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-[#1d1d1f]">{axis.label}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-black/45">{axis.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              axis.state === 'enough'
                ? 'bg-[#0071e3] text-white'
                : axis.state === 'started'
                  ? axis.isInferredOnly
                    ? 'bg-white text-black/55'
                    : 'bg-[#e8f2ff] text-[#0057b8]'
                  : 'bg-white text-black/35'
            }`}
          >
            {stateLabel}
            {axis.isInferredOnly ? ' · 추정' : ''}
          </span>
          <span className="text-[11px] font-semibold text-black/45">
            AI {axis.confirmedCount} · 추정 {axis.inferredCount}
          </span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`h-1.5 rounded-full ${
              index < segments
                ? axis.isInferredOnly
                  ? 'bg-black/20'
                  : 'bg-[#0071e3]'
                : axis.inferredCount > 0 && index === 0
                  ? 'bg-black/15'
                  : 'bg-black/8'
            }`}
          />
        ))}
      </div>
      {axis.latestQuestion && <p className="mt-2 truncate text-[11px] text-black/45">최근 질문: {axis.latestQuestion}</p>}
    </div>
  );
}

function CoachFeedbackCard({ feedback, onApply }: { feedback: InterviewCoachFeedback; onApply: () => void }) {
  const coverageItems = [
    ['생활 장면', feedback.coverage.lifeScene],
    ['감정/긴장', feedback.coverage.emotionTension],
    ['관계', feedback.coverage.relationship],
    ['조건/제약', feedback.coverage.conditionConstraint],
    ['모르는 범위', feedback.coverage.unknownBoundary],
  ];

  return (
    <section className="rounded-[10px] border border-[#0071e3]/15 bg-[#f5fbff] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#0071e3] px-2.5 py-1 text-[12px] font-semibold text-white">{feedback.score}점</span>
        {feedback.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-[#0057b8]">
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-5 text-black/75">{feedback.summary}</p>
      <p className="mt-1 text-[13px] leading-5 text-black/60">{feedback.suggestion}</p>
      <div className="mt-3 rounded-[8px] border border-black/10 bg-white p-3">
        <p className="text-[12px] font-semibold text-black/45">수정 예시</p>
        <p className="mt-1 text-[14px] leading-6 text-black/80">{feedback.revisedQuestion}</p>
        <button type="button" onClick={onApply} className="mt-2 h-8 rounded-full bg-[#1d1d1f] px-3 text-[12px] font-semibold text-white">
          예시 질문 적용
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {coverageItems.map(([label, covered]) => (
          <span
            key={label as string}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              covered ? 'bg-[#e8f2ff] text-[#0057b8]' : 'bg-white text-black/40'
            }`}
          >
            {covered ? '확인됨' : '비어 있음'} · {label}
          </span>
        ))}
      </div>
    </section>
  );
}

function FrameLine({ label, values }: { label: string; values: string[] }) {
  return (
    <p>
      <span className="font-semibold text-black/45">{label}</span>
      <span className="ml-2 text-black/75">{values.join(' · ')}</span>
    </p>
  );
}

function InterviewExchange({ turn, isFollowUp }: { turn: InterviewTurn; isFollowUp: boolean }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidence = turn.evidence ?? [];

  return (
    <article className="space-y-3">
      <div className="ml-auto max-w-[86%] rounded-[14px] bg-[#0071e3] px-4 py-3 text-white">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-white/75">
          <MessageCircle size={14} />
          면접자 질문
        </div>
        <p className="mt-1 text-[15px] leading-6">{turn.question}</p>
      </div>
      <div className="max-w-[92%] rounded-[14px] border border-black/10 bg-[#fafafc] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold text-black/48">페르소나 응답</p>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-black/50">
            {turn.source === 'llm' ? 'AI 심층 응답' : '로컬 연습 응답'}
          </span>
          {isFollowUp && <span className="rounded-full bg-[#e8f2ff] px-2 py-0.5 text-[11px] font-semibold text-[#0057b8]">후속 질문</span>}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-black/80">{turn.answer}</p>
        {evidence.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setEvidenceOpen((open) => !open)}
              className="h-8 rounded-full border border-black/10 bg-white px-3 text-[12px] font-semibold text-black/65 transition hover:border-[#0071e3]/35 hover:text-[#0057b8]"
            >
              {evidenceOpen ? '근거 접기' : '근거 보기'}
            </button>
            {evidenceOpen && <EvidencePanel evidence={evidence} />}
          </div>
        )}
      </div>
    </article>
  );
}

function EvidencePanel({ evidence }: { evidence: NonNullable<InterviewTurn['evidence']> }) {
  return (
    <section data-testid="answer-evidence-panel" className="mt-3 rounded-[10px] border border-black/10 bg-white p-3">
      <p className="text-[12px] font-semibold text-[#1d1d1f]">이 답변은 어떤 가상 설정을 바탕으로 만들어졌나요?</p>
      <p className="mt-1 text-[12px] leading-5 text-black/55">가상 페르소나 설정에 기반한 설명입니다.</p>
      <div className="mt-3 space-y-2">
        {evidence.map((item) => (
          <div key={`${item.kind}-${item.label}-${item.text}`} className="rounded-[8px] border border-black/8 bg-[#fafafc] px-3 py-2">
            <p className="text-[12px] font-semibold text-[#0057b8]">{item.label}</p>
            <p className="mt-1 text-[12px] leading-5 text-black/70">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
