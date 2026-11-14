export const PRIVACY_NOTICE_TEXT =
  '학생 이름·학번·연락처 등 개인정보는 입력하지 마세요. AI 서버를 연결해 쓰는 경우 입력한 내용은 외부 AI 서비스(Gemini 등)로 전송될 수 있습니다.';

export function PrivacyNotice() {
  return (
    <p role="note" className="mt-1 text-[13px] leading-5 text-[#5f4700]">
      {PRIVACY_NOTICE_TEXT}
    </p>
  );
}
