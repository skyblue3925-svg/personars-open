import { ArrowLeft, BarChart3, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { InterviewQuestion, ResearchDraft } from '../types/research';

type InterviewDesignStepProps = {
  draft: ResearchDraft;
  questions: InterviewQuestion[];
  onBack: () => void;
  onNext: (questions: InterviewQuestion[]) => void;
};

export function InterviewDesignStep({ draft, questions, onBack, onNext }: InterviewDesignStepProps) {
  const [items, setItems] = useState(questions);

  const update = (id: string, text: string) => {
    setItems((current) => current.map((question) => (question.id === id ? { ...question, text } : question)));
  };

  const add = () => {
    setItems((current) => [
      ...current,
      {
        id: `iq-${current.length + 1}`,
        text: `${draft.topic}과 관련해 설문 응답만으로 설명하기 어려운 경험은 무엇인가요?`,
        intent: '학생 추가 질문',
      },
    ]);
  };

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[14px] font-medium text-[#0066cc]">Step 5</p>
        <h2 className="mt-1 text-[32px] font-semibold leading-[1.1] text-[#1d1d1f] sm:text-[40px]">전문 인터뷰 질문 설계</h2>
        <p className="mt-3 text-[17px] leading-[1.47] text-black/70">
          질문은 답을 유도하기보다 구체 장면, 압박, 갈등, 말할 수 없는 범위를 드러내야 합니다. 질문을 수정한 뒤 심층 인터뷰를 생성하세요.
        </p>
      </div>
      <div className="grid gap-3">
        {items.map((question, index) => (
          <div key={question.id} className="grid gap-3 rounded-[12px] border border-black/10 bg-white p-4 shadow-[3px_5px_30px_rgba(0,0,0,0.05)] md:grid-cols-[92px_1fr_auto] md:items-center">
            <div>
              <p className="text-[12px] font-semibold text-black/45">질문 {index + 1}</p>
              <p className="mt-1 text-[12px] text-[#0066cc]">{question.intent}</p>
            </div>
            <input value={question.text} onChange={(event) => update(question.id, event.target.value)} className="h-11 w-full rounded-[10px] border border-black/15 bg-[#fafafc] px-4 text-[15px] outline-none focus:border-[#0071e3]" />
            <button
              type="button"
              onClick={() => setItems((current) => current.filter((item) => item.id !== question.id))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-black/55 hover:bg-[#f5f5f7]"
              aria-label="면접 질문 삭제"
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="inline-flex h-10 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-[14px] font-semibold">
        <Plus size={17} />
        질문 추가
      </button>
      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-5 text-[14px] font-semibold">
          <ArrowLeft size={17} />
          이전
        </button>
        <button type="button" onClick={() => onNext(items)} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0071e3] px-5 text-[14px] font-semibold text-white">
          <BarChart3 size={17} />
          심층 인터뷰 생성
        </button>
      </div>
    </section>
  );
}
