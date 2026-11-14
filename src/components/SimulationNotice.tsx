import { PrivacyNotice } from './PrivacyNotice';

export function SimulationNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`rounded-[10px] border border-[#f0b429]/45 bg-[#fff8e6] ${compact ? 'p-3' : 'p-4'}`}>
      <p className="text-[13px] font-semibold text-[#7a4b00]">AI 시뮬레이션 자료 - 실제 응답자가 아닙니다</p>
      <p className="mt-1 text-[13px] leading-5 text-[#5f4700]">
        이 화면의 인물 설정 자료, 생활 장면 자료, 면접 응답은 심층 인터뷰 연습을 위한 가상 자료입니다. 실제 조사 결과나 실제
        인터뷰 자료처럼 인용하면 안 됩니다.
      </p>
      <PrivacyNotice />
    </aside>
  );
}
