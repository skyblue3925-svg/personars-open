# Personars Interview

범용 질적연구 수업을 위한 페르소나 기반 인터뷰 도구입니다.

교사가 과목, 활동 유형, 주제, 목적을 정하면 학생이 다양한 가상 페르소나를 선택해 1:1 질적 인터뷰를 진행하고, 핵심 발언과 인용 후보를 활동지나 탐구 자료로 정리할 수 있습니다.

## 실행

```bash
npm ci
npm run dev
```

기본 로컬 주소는 `http://127.0.0.1:5001/`입니다. 의존성은 `package-lock.json` 기준으로 설치하세요(`npm install`이 아니라 `npm ci`).

## 검증

```bash
npm test
npm run build
```

일부 Windows 샌드박스 환경에서는 Vitest가 Vite 설정을 로딩하는 중 `spawn EPERM`으로 실패할 수 있습니다. 이 경우 일반 Windows 권한에서 같은 명령을 다시 실행해야 합니다.

## 가져다 쓰는 법

1. **그냥 써 보기** — 저장소를 받아 `npm ci && npm run dev`. AI 서버가 없어도 전체 흐름(활동 설정 → 페르소나 선택 → 인터뷰 → 데이터 정리)이 동작합니다. 이때 페르소나의 답은 AI가 만든 것이 아니라 **미리 만들어 둔 연습용 응답**이고, 화면에 "로컬 연습 응답"으로 표시됩니다(AI가 답하면 "AI 심층 응답"으로 표시).
2. **우리 반에 올려서 쓰기** — `npm run build`로 만든 `dist/` 폴더를 Cloudflare Pages, Vercel, Netlify, GitHub Pages 같은 정적 호스팅에 올리면 학생들이 주소로 접속해 쓸 수 있습니다. 서버나 데이터베이스가 필요 없고, AI 서버를 연결하지 않았다면 학생의 활동 내용은 각자 브라우저(localStorage)에만 저장됩니다. AI 서버를 연결하면 학생이 입력한 질문 등이 그 서버와 외부 AI 서비스로 전송됩니다.
3. **AI 응답 켜기** — 직접 만든 Gemini API 키로 서버(Vercel 함수 또는 Cloudflare Worker)를 따로 배포하고 `VITE_PERSONA_API_URL`을 연결합니다. 비용은 키 주인이 부담하며, 아래 "AI 서버 직접 배포"의 주의 사항을 먼저 읽으세요.
4. **고쳐 쓰기** — 화면 문구, 활동 모드, 페르소나 후보는 `src/`와 `public/data/`에서 바꿉니다. MIT 라이선스라서 수정, 재배포, 상업적 이용이 가능합니다. 단 `LICENSE`와, 페르소나 데이터에 대한 `NOTICE.md`의 출처 표시는 남겨야 합니다.
5. **페르소나 후보 새로 만들기** — `scripts/build-nemotron-persona-index.py`가 NVIDIA 원본 데이터에서 후보 패킷을 다시 만듭니다.

## 설정

모든 설정은 선택 사항입니다. `.env.example`을 `.env`로 복사해 필요한 것만 채우세요.

```env
VITE_SITE_CREDIT=            # 화면 상단 제작자 표기 (비우면 표시하지 않음)
VITE_PERSONA_API_URL=        # 인터뷰 응답 서버 주소
VITE_PERSONA_SEARCH_API_URL= # 조건 검색 서버 주소
VITE_INTERVIEW_COACH_API_URL= # AI 코치 서버 주소
```

- `VITE_PERSONA_API_URL`이 비어 있거나 호출에 실패하면 **로컬 템플릿 응답**으로 동작합니다. AI 서버 없이도 화면 흐름을 모두 써 볼 수 있습니다.
- `VITE_PERSONA_SEARCH_API_URL`이 비어 있으면 `/api/persona-search`를 사용합니다.
- `VITE_INTERVIEW_COACH_API_URL`이 비어 있으면 AI 코치는 꺼진 상태입니다.

## AI 서버 직접 배포

이 저장소는 AI 서버 주소를 포함하지 않습니다. AI 응답을 쓰려면 직접 배포하세요.

**주의: 서버 API 키를 쓰는 엔드포인트는 공개 인터넷에 열립니다.** 아래 보호 장치는 기본 수준이며, 비용을 확실히 막으려면 Gemini 프로젝트의 사용량 한도나 호스팅의 속도 제한을 반드시 따로 설정하세요.

- **Vercel 함수** (`api/`): 환경변수 `GEMINI_API_KEY`를 설정합니다.
  - 브라우저에서 **다른 사이트가 이 API를 부르는 것**을 막습니다. 같은 사이트의 Origin이거나 `ALLOWED_ORIGINS`(쉼표로 구분)에 적힌 출처만 허용하고, Origin 헤더가 없는 요청은 거부합니다. **다만 이것은 인증이 아닙니다.** curl 같은 스크립트는 허용된 Origin 헤더를 직접 만들어 보낼 수 있으므로, 이 검사만으로 서버 키 남용을 막을 수는 없습니다. 아래 호출 제한과 Gemini 사용량 한도가 실제 안전장치입니다.
  - 요청 본문은 60,000자까지, 호출은 IP당 하루 300회(`API_DAILY_LIMIT`로 변경)까지 받습니다. 호출 횟수는 서버리스 인스턴스마다 따로 세므로 정확한 상한이 아닙니다. IP는 `x-forwarded-for` 첫 값을 믿으므로 Vercel 배포를 전제로 한 값이고, 앞단에 다른 프록시가 있으면 위조될 수 있습니다.
  - AI 응답이 실패했을 때 Cloudflare Worker를 대체 경로로 쓰려면 `CLOUDFLARE_PERSONA_API_URL`과 이 사이트의 주소 `PUBLIC_SITE_ORIGIN`을 함께 설정하고, 같은 주소를 Worker의 `ALLOWED_ORIGINS`에도 넣습니다. 둘 중 하나라도 없으면 대체 경로는 꺼집니다. 이 경로로 들어온 요청은 Worker가 Vercel의 출구 IP 하나로 보기 때문에, 모든 사용자가 Worker의 일일 한도를 함께 나눠 씁니다.
- **Cloudflare Worker** (`worker/`): 배포 전 `worker/wrangler.jsonc`의 `ALLOWED_ORIGINS`에 본인 사이트 주소를, `kv_namespaces.id`에 본인 KV ID를 넣습니다. Origin이 없거나 목록에 없는 요청은 거부하고, 인터뷰 응답은 IP당 하루 `DAILY_LIMIT`회(기본 1500), 페르소나 검색은 IP당 하루 `SEARCH_DAILY_LIMIT`회(기본 3000)로 셉니다. 이 Origin 검사도 위와 같은 이유로 인증이 아니라 브라우저의 다른 사이트 호출을 막는 용도입니다. 입력 길이(`latest` 1,000자, 대화 기록 20턴×1,500자)도 제한합니다.
- API 키는 서버 환경변수에만 두고, 저장소나 `VITE_` 변수에 넣지 마세요(`VITE_` 값은 브라우저에 그대로 노출됩니다).
- 학생이 입력한 내용은 외부 AI 서비스(Gemini 등)로 전송될 수 있습니다. 개인정보를 입력하지 않도록 수업에서 안내하세요.

## 현재 제품 범위

- **활동 설정**: 과목, 활동 유형, 학년/수준, 주제, 목적, 수업 맥락과 **활동 모드**를 정합니다. 활동 모드는 1:1 심층 인터뷰, 초점집단면접(FGI), 지역사회 가상 이슈 맵핑, 이해관계자 롤플레잉 토론, 정책 협상 시뮬레이터 다섯 가지입니다.
- **페르소나 선택**: 저장소에 포함된 후보 패킷(약 6,400명)에서 최대 3명을 고릅니다. 조건 검색용 서버 색인은 **저장소에 포함돼 있지 않아서**, 기본 배포에서는 후보 패킷만 쓰고 서버 검색 보완은 동작하지 않습니다(`/api/persona-search`는 503). 색인을 쓰려면 NVIDIA 원본 parquet 파일로 `scripts/build-nemotron-persona-record-search-shards.py`를 실행해 만들고, Cloudflare R2에 `scripts/upload-nemotron-search-r2.*`로 올립니다.
- **인터뷰**: 페르소나 자기소개, 학생 질문, 페르소나 답변, 근거 보기, AI 코치(서버를 연결했을 때만), 흐름 지도, 인터뷰 돌아보기를 제공합니다.
- **데이터 정리**: 핵심 발언, 반복 주제, 관점 차이, 직접 인용 후보, 활동지용 마크다운 내보내기를 제공합니다.
- **AI가 없을 때**: 페르소나의 답은 미리 만들어 둔 연습용 응답으로 채워지고 "로컬 연습 응답"으로 표시됩니다. "가상 지역사회 AI 분석 리포트"도 AI 분석이 아니라 예시 응답이며, 리포트 끝에 그 사실이 적힙니다.

로컬 후보 패킷은 전체 700만 페르소나 설명을 브라우저에 싣는 구조가 아닙니다. `scripts/build-nemotron-persona-index.py`가 원본에서 (페르소나 유형, 시도, 연령대, 성별) 층마다 최대 3개를 고정 시드로 무작위 추출해 만듭니다.

페르소나 데이터는 현대 대한민국 생활 맥락을 기준으로 하므로, 문학 작품 속 인물이나 과거 역사 인물을 직접 재현하는 용도가 아닙니다. 국어·역사 수업에서는 작품 독자 반응이나 역사·사회 사건에 대한 현재 시민 관점 비교처럼 활용합니다.

## 데이터와 출처

- 페르소나 후보 패킷(`public/data/nemotron-persona-packet.json`)은 NVIDIA의 [Nemotron-Personas-Korea](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea)에서 뽑은 합성 인물 샘플입니다. 실제 사람이 아니며 CC BY 4.0으로 제공됩니다. 자세한 출처 표시는 [NOTICE.md](NOTICE.md)를 보세요.
- 이 데이터는 실제 통계 예측이나 실제 주민 여론이 아니라 수업용 시나리오 탐색에 쓰는 자료입니다.
- 학생 이름, 학번, 학교 정보 등 개인정보를 이 도구나 외부 AI 서비스에 입력하지 마세요.

## 라이선스

MIT. 자세한 내용은 [LICENSE](LICENSE)를 보세요. 포함된 페르소나 데이터는 별도로 CC BY 4.0이며 [NOTICE.md](NOTICE.md)에 출처가 있습니다.
