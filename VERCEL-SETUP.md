# HolaSpeak: Vercel Hobby + Firebase Spark + Azure Speech F0

Vercel 팀 `agent-office3`의 Hobby 무료 플랜을 인앱 대시보드에서 확인했다. 프로젝트는 별도 `holaspeak-speech`를 사용한다. 기존 `agent-office_93`는 변경하지 않는다. 유료 업그레이드, 유료 DB, 유료 Blob, Cloudflare 계정은 필요하지 않다.

## 서버 구성

- 루트 `api/speech.js`는 Node.js 24 Web API 함수다. `/synthesize`와 `/assessments`를 `vercel.json` rewrite로 전달한다.
- Firebase Admin SDK가 같은 프로젝트의 ID 토큰을 검증하고 Firestore에 접근한다. Azure 키와 Firebase 서비스 계정은 **서버 환경변수**에만 저장한다.
- 예시 MP3는 Firestore `_speechAudio`의 최대 500개 고정 해시 슬롯에 저장한다. 슬롯 충돌은 예시를 교체하며, 캐시 키가 일치하는 예시만 반환한다. 캐시 크기는 최대 약 325 MB다. 다른 Firebase 데이터도 동일한 Spark 무료 저장량/읽기/쓰기 할당량을 사용한다.
- `_speechUsage`의 월/일 카운터를 트랜잭션으로 먼저 예약한다. 모든 사용자 합산 TTS 500,000자/UTC월(SSML 전체 길이로 보수적 차감), 기본 발음 평가 18,000초/UTC월이다. 사용자별 UTC 하루 TTS 5,000자·평가 300초. 시간 초과·실패도 예약량은 차감한다.
- Firestore 트랜잭션 실패·한도 초과 시 Azure를 호출하지 않는다. 여러 Vercel 인스턴스도 카운터를 공유한다. 예시 생성에는 영구 60초 lease를 사용한다. 이미 생성 중인 예시는 409 안내 후 사용자가 재시도한다.
- 녹음과 평가 응답은 서버 DB에 저장하지 않는다. **동일 녹음도 매번 새 Azure 평가와 UUID**를 받는다. 프런트엔드가 문장·점수만 개인 이력에 저장한다. 저장 재시도는 평가를 다시 요청하지 않는다.
- 공개 앱은 GitHub Pages 주소를 유지한다. Vercel 주소는 API 주소다. 서버 모듈·자격증명은 정적 `dist/`에 포함하지 않는다.

## 환경변수

Vercel 프로젝트 → Settings → Environment Variables, **Production**에 설정한다. Preview는 실제 음성 호출을 활성화하지 않는다.

| 이름 | 값 |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `holaspeak-ac16d` |
| `ALLOWED_ORIGIN` | `https://gimiyoni6378-dot.github.io` |
| `AZURE_SPEECH_REGION` | `eastus` |
| `SPEECH_ENABLED` | 실제 설정 전 `false`, 키 설정·검증 시 `true` |
| `AZURE_SPEECH_KEY` | Azure Speech F0 리소스의 키 1 또는 키 2. Sensitive로 저장 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | 서버용 서비스 계정 JSON 전체. Sensitive로 저장 |

키와 JSON은 채팅·GitHub·프런트엔드 파일에 넣지 않는다. JSON이 필요하면 Firebase 콘솔의 프로젝트 설정 → 서비스 계정에서 발급해 Vercel에 직접 입력한다. 서버 인증서는 UID 인증·Firestore 접근용이다. 향후 운영 시 Google Workload Identity Federation을 구성하면 장기 키 없이 연결할 수 있다.

`SPEECH_ENABLED=false`인 배포는 키가 없어도 정상 기동하며 실제 음성 요청에는 503 준비 중 안내를 반환한다. 설정을 바꾼 뒤 Redeploy가 필요하다. 배포된 주소가 확인되면 `tts-config.js`의 `HOLA_TTS_API_URL`, `HOLA_API_URL`에 입력하고, 실제 마이크 테스트 준비 후 `HOLA_ENABLE_SPEECH=true`로 변경한다.

## 무료 조건과 사용 중단

Vercel Hobby·Firebase Spark·Azure Speech **F0**를 유지한다. Azure F0가 아닌 S0를 사용하지 않는다. 무료 사용량은 계정/리소스 전체에서 공유되므로 Azure 리소스는 HolaSpeak 전용으로 사용한다. 계정의 요금제와 Azure 구독 상태는 앱 코드가 제어할 수 없다. Azure 무료 평가판 구독은 만료 시 서비스가 중단될 수 있다. 그때 유료 전환을 자동 진행하지 않는다.

[Vercel Hobby](https://vercel.com/docs/plans/hobby)는 무료 한도를 초과하면 해당 기능 사용이 제한된다. [Azure F0](https://azure.microsoft.com/en-us/pricing/details/speech/) TTS 월 50만 자와 STT 월 5시간 범위 안에서만 기본 평가를 사용한다. 운율/콘텐츠 유료 추가 기능은 요청하지 않는다. Firestore 무료 할당량을 소진해도 API는 새 Azure 호출을 차단한다.

## 검증

`npm test`, `npm run test:rules`(Java 21), `npm run build`, `npx astryx doctor --built dist`를 실행한다. 서버 테스트는 캐시 재사용·인스턴스 간 lease·동시 카운터·DB 오류 차단·동일 녹음 재평가·비밀값 비노출을 확인한다. 외부 음성 성공 여부는 실제 키 설정 후 TTS 한 문장과 마이크 두 번으로 별도 검증한다.

`azure-worker/`는 이전 Cloudflare 미배포 초안이다. 현재 서버 배포 경로는 루트 Vercel 프로젝트다. 두 서버를 동시에 활성화하면 카운터가 분리되므로 Vercel만 활성화한다.
