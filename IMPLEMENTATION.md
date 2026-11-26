# HolaSpeak: 구현 상태와 운영 연결

## 현재 선택: Firebase 회원가입·사용자 데이터 (2026-11-26)

사용자와 협의해 Firebase `holaspeak-ac16d`로 전환했다. 현재 공개 앱의 인증은 Firebase Authentication, 데이터는 Firestore `users/{UID}`이다. Google/이메일 가입, 이메일 인증, 비밀번호 재설정, 계정별 진행 저장 및 100 XP당 레벨 상승을 구현했다. 웹 설정은 `tts-config.js`, Firestore 접근 규칙은 `firestore.rules`, 콘솔 설정 절차는 README를 따른다. Supabase 전용 프로젝트 생성은 무료 활성 프로젝트 한도로 실패했으며 기존 프로젝트는 변경하지 않았다.

현재 단계는 회원가입과 사용자 데이터까지이며 `HOLA_ENABLE_SPEECH = false`로 음성 UI를 숨긴다. 아래 Google OAuth + SQLite API 내용은 **이전 단계의 서버 초안**이며 현재 공개 앱 인증 경로가 아니다. TTS·Azure 단계에서 Firebase ID 토큰 서버 검증을 추가한 뒤 연결해야 한다.

Firebase SDK와 규칙 테스트 도구는 고정 버전으로 설치했다. 포인트·레벨 정규화와 기존 동기화 테스트를 실행했고, Firestore 규칙 검증은 Java 21이 있는 GitHub CI에서 Emulator로 실행한다. 실제 가입·재로그인 검증에는 Firebase 콘솔의 로그인 방법 활성화, 승인된 도메인과 Firestore 규칙 게시가 필요하다.

출석일(`attendanceDates`)과 미션 완료일(`studyDates`)은 서로 다른 날짜 이력으로 보관한다. 한국 시간 자정 기준으로 중복 날짜를 제거하며 연속 출석일, 연속 미션 참여일, 월간/주간 참여일을 계산한다. 하루에 여러 미션을 완료해도 참여일은 1일이다. 오늘 아직 참여하지 않았다면 어제까지의 연속 기록을 유지하고, 어제도 빠졌으면 0일로 표시한다. 일일 미션 상태는 `questDate`가 바뀌면 초기화한다. 기존 횟수 기반 `streak/month` 값은 실제 날짜 이력이 없는 경우 날짜를 추정해서 만들지 않는다.

## 현재 구조와 범위

2026-11-26 코드 확인: 홈과 설치 안내는 React 19 + htm + Astryx 0.7.17이며 학습길·게임·레슨은 기존 HTML/DOM 코드다. 전체 React 전환은 이번 변경 범위에 넣지 않았다. 기존 테마·모바일 화면을 유지하고 계정·음성 설정·평가 화면을 React/Astryx로 추가했다.

1. Google Identity Services 버튼 → 서버의 ID 토큰 검증(audience 포함) → Google `sub`로 사용자 식별 → 만료되는 무작위 앱 세션. 토큰은 서버에 해시로 보관하며 브라우저에서는 sessionStorage에 보관한다. Google 토큰은 저장하지 않는다.
2. Google Cloud TTS → 정규화 문장 + 언어 + 음성 이름 + 속도 + 피치 + MP3 + 캐시 버전으로 키 생성. 서버 SQLite 최대 500개, 브라우저 IndexedDB 최대 150개, 디코딩 메모리 최대 25개로 제한한다. 동시 생성 요청은 합친다. 미설정·미로그인·장애 때는 기기 음성으로 대체하고 프로필에서 안내한다. 게스트에게 유료 API를 공개하지 않는다.
3. MediaRecorder 녹음 → 브라우저에서 16kHz/16bit/mono PCM WAV로 변환 → 서버 → Azure Pronunciation Assessment(es-ES). 25초에 자동 종료하고 서버는 최대 30초를 허용한다. 매 제출마다 Azure를 호출하며 새 UUID로 기록을 저장한다. 평가 점수와 단어별 결과는 이력이고 캐시로 재사용하지 않는다. 녹음은 메모리에서만 처리하며 파일·DB·IndexedDB·서비스 워커에 저장하지 않는다.

계정별 기기 저장소와 서버 기록을 분리한다. 첫 가입 시 게스트 기록을 옮기며 기존 계정으로 로그인할 때는 서버 기록을 사용한다. 기존 계정에 미전송 변경이 있으면 보존한다. 오프라인 학습 변경은 연결 시 재전송하며 revision 충돌은 사용자가 이 기기/서버 기록을 선택하게 한다. 로그아웃 후 다른 사용자의 기록을 표시하지 않는다. 평가는 오프라인 재전송하지 않는다. 최근 50건을 화면에 표시하며 서버 이력은 초기화 전까지 보관한다. 초기화는 학습 기록과 평가 이력을 삭제한다.

## 로컬 실행과 배포

```powershell
npm.cmd install
npm.cmd install --prefix tts-service
# tts-service/.env.example을 참고해 서버 환경변수 설정 (.env는 자동 로드하지 않음)
npm.cmd start --prefix tts-service
python -m http.server 5173
npm.cmd test
npm.cmd test --prefix tts-service
npm.cmd run build
npx.cmd astryx doctor --built dist
```

`tts-config.js`에 `HOLA_API_URL`(끝에 경로 없는 HTTPS API 주소)과 `HOLA_GOOGLE_CLIENT_ID`를 설정한다. Google Cloud OAuth의 Web client에 실제 PWA 출처와 개발 출처를 Authorized JavaScript origins로 등록하고, 공개 서비스 전 동의 화면/테스트 사용자 설정을 완료한다. 같은 client ID를 서버 `GOOGLE_CLIENT_ID`에도 사용한다. Google Cloud 프로젝트에서 Text-to-Speech API와 결제를 활성화하고 실행 서비스 계정에 필요한 TTS 권한을 부여한다. Azure Speech 리소스의 키와 지역을 서버 환경변수로 설정한다. 서비스 키는 공개 웹 파일에 넣지 않는다.

서버 CORS `ALLOWED_ORIGINS`에는 PWA의 정확한 origin을 쉼표로 나열한다. API 응답은 모두 `no-store`이며 SW는 Authorization 요청 및 인증/기록/평가 경로를 캐시하지 않는다. 배포 산출물은 `dist/`이며 공개 파일만 복사한다. 현재 React/Astryx 런타임은 CDN import map을 유지한다. 처음부터 완전한 오프라인 구동을 보장하려면 이후 로컬 번들링이 필요하다.

SQLite는 **영구 볼륨이 있는 단일 서버 인스턴스**를 전제로 한다. 기본 Cloud Run/서버리스 임시 파일 시스템에 그대로 배포하면 기록이 유실되므로, 영구 디스크 호스트를 사용하거나 운영 배포 전에 관리형 DB/공유 오디오 저장소로 교체해야 한다. 이 저장소는 배포하지 않았다. 프록시 환경에서는 로그인 IP 한도(분당 20건)가 공유될 수 있으므로 배포 플랫폼의 프록시 설정과 외부 요청 제한을 구성한다. 사용자별 생성 한도는 UTC 날짜 기준 TTS 200회, 평가 100회다. 미완성 사용자 정보·가짜 OAuth 자격증명으로는 실제 로그인할 수 없다.

## 확인 근거와 한계

- Google 인증 구현 근거: https://developers.google.com/identity/gsi/web/guides/integrate 및 https://developers.google.com/identity/sign-in/web/backend-auth
- TTS 음성 설정: https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/AudioConfig
- Azure WAV/헤더/점수 형태: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short
- 테스트는 외부 공급자 함수를 대체해 인증 경계·데이터 분리·캐시·매 평가 호출·변환을 검증한다. 실제 Google 로그인, 실제 TTS 음성, Azure 실제 점수와 iOS/Android 마이크는 자격증명 및 실기기 검증이 남아 있다. 스페인어 평가에 영어 전용 운율 점수는 요청하지 않는다.
- 검증 결과: 프런트엔드 상태/PCM 테스트 2건, 서버 도메인/HTTP 통합 테스트 3건 통과. 390px 모바일 에뮬레이션에서 가로 넘침 및 콘솔 오류 없음. 테스트 계정의 프로필/평가 이력과 마이크 권한 거부 안내, 권한 요청 중 닫기 후 트랙 해제를 확인했다. Google 로그인과 마이크는 테스트 응답으로 검증했으며 실제 제공자 성공으로 간주하지 않는다. Astryx doctor는 pass 24 / warn 2 / fail 0 (기존 스킬 중복 및 CLI 경로 경고)이다.

## 듀오링고·스픽: 사실 / 추론 / 미확인

**REA에서 확인한 사실:** 이번 연결의 `get_evidence_bundle(detail: summary)` 결과 보존 기록 0건, matching_records 0건. 이전 채팅이나 다른 REA 세션에 자료가 있는지는 이 결과로 알 수 없다. 저장소에도 두 앱의 APK/IPA/HAR/REA 분석 보고서는 없다. 따라서 두 앱 기능이나 음성 공급자를 입증하는 REA 증거 ID는 제시할 수 없다.

**설계 판단·추론:** 짧은 레슨, 즉시 피드백, 반복 연습 이력을 HolaSpeak에 적용하는 것은 학습 경험에 관한 제품 판단이다. 두 앱 내부 구현을 재현했다고 주장하지 않는다. 예시 음성 캐시와 매 녹음 신규 평가는 사용자의 명시적 요구사항이다.

**미확인:** 두 앱의 실제 OAuth 제공자, TTS/평가 공급자, 모델, 오디오 캐시 키, 기록 스키마, 과금 구조. 후속 비교에는 해당 대상의 실제 캡처/아티팩트 또는 이전 REA 증거 번들이 필요하다.
