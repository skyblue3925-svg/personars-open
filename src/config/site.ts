// 화면 상단에 보이는 제작자 표기.
// 비워 두면 표시하지 않는다. 배포하는 사람이 .env의 VITE_SITE_CREDIT로 정한다.
export const SITE_CREDIT: string = (import.meta.env.VITE_SITE_CREDIT as string | undefined) ?? '';
