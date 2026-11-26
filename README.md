# HolaSpeak

모바일 우선 스페인어 학습 PWA입니다. React 19와 Astryx 0.7.17을 사용합니다.

## 1단계: 회원가입과 사용자 데이터

Firebase 프로젝트 `holaspeak-ac16d`의 Authentication과 Cloud Firestore를 사용합니다.

- Google 로그인 및 이메일/비밀번호 회원가입·로그인
- 이메일 인증 메일, 비밀번호 재설정
- `users/{Firebase UID}`에 이름·이메일·가입일·학습 기록 저장
- XP와 포인트는 같은 누적 값이며 100 XP마다 레벨 상승 (0 XP = 레벨 1)
- 첫 가입 시 게스트 기록 이전, 재로그인 시 계정 기록 복원
- 오프라인 변경 보관 및 재연결 동기화, 동시 수정 충돌 시 선택
- 한국 시간 기준 하루 한 번 출석, 연속·누적 출석 기록
- 레슨·복습·게임 완료 날짜를 별도 기록해 연속 미션 참여일·이번 달 학습일·이번 주 학습일 계산. 출석만으로 미션 참여일이 늘어나지 않으며 일일 미션은 날짜가 바뀌면 초기화

포인트는 개인 학습 진행도입니다. 경쟁 순위나 유료 재화에 쓰려면 점수 지급을 서버에서 검증하는 구조를 추가해야 합니다.

## Firebase 콘솔 설정

1. Authentication → 시작하기 → 이메일/비밀번호와 Google 로그인 활성화. Google 지원 이메일을 선택합니다.
2. Authentication → 설정 → 승인된 도메인에 `gimiyoni6378-dot.github.io` 추가. 로컬 테스트용 `localhost`도 필요하면 추가합니다.
3. Firestore Database → 데이터베이스 만들기 → **Standard / 프로덕션 모드**, 한국 사용자는 서울 리전 선택. 요금제는 Spark 무료를 유지합니다.
4. Firestore → 규칙에 [firestore.rules](firestore.rules) 내용을 붙여넣고 게시합니다. 문서는 로그인 사용자가 자신의 UID 경로에서만 조회·수정할 수 있습니다. 테스트 모드 전체 공개 규칙은 사용하지 않습니다.
5. [사이트](https://gimiyoni6378-dot.github.io/holaspeak/)에서 실제 가입·학습·로그아웃·재로그인으로 기록 복원을 확인합니다.

웹 앱 설정은 `tts-config.js`에 있습니다. Firebase 웹 API 키는 공개 클라이언트 설정입니다. 서비스 계정 키·관리자 자격증명은 저장소에 넣지 않습니다.

## 개발

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npx.cmd astryx doctor --built dist
python -m http.server 5173
```

빌드 산출물은 `dist/`입니다. GitHub Pages에서 저장소 루트를 호스팅해도 동일한 정적 앱이 동작합니다. 일부 기존 레슨 화면은 HTML/DOM 코드이며 새 계정 화면은 React/Astryx입니다. CDN 모듈을 이용하므로 최초 실행에는 네트워크가 필요합니다.

## 음성: Azure Speech + Firebase Spark + Vercel Hobby

예시 TTS와 기본 발음 평가는 Azure Speech, 사용자 인증·학습·출석·평가 이력은 Firebase Spark를 사용합니다. Azure 키를 보호할 Vercel Hobby 중계 서버를 루트 `api/`와 `server/`에 준비했습니다. 캐시와 사용량은 기존 Firestore에 저장합니다. Azure 리소스 지역은 `eastus`이며 Vercel Production의 Secret으로 인증 정보를 설정했습니다. 로그인 사용자는 Azure Neural TTS로 예시를 듣고, 선택한 단어·문장을 녹음해 기본 발음 평가를 받을 수 있습니다. 실제 서버 TTS·평가 응답은 검증했고 실기기 마이크 테스트는 남아 있습니다.

[설정과 검증 절차](VERCEL-SETUP.md)를 따릅니다. Azure Speech **F0** 무료 범위는 TTS 월 50만 자, STT 월 5시간이며 서버에서 보수적 사용량 예약과 한도 차단을 적용합니다. Blaze 전환은 필요하지 않습니다. 예시 음성만 설정별 캐시하고, 녹음은 매번 새로 평가합니다. 평가 점수와 문장만 계정 이력에 저장하며 녹음은 저장하지 않습니다.

`functions/`의 Google Cloud TTS와 `tts-service/`는 이전 미배포 초안입니다. 현재 인증/음성 배포 경로가 아닙니다. `firebase.json`은 Firestore만 설정하며 Firebase 함수 배포 대상이 없습니다.
