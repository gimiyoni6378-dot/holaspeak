# Azure Speech 연결 (Firebase Spark 유지)

현재 상태: 코드와 로컬 검증 준비. Azure/Cloudflare 계정 리소스는 만들거나 배포하지 않았다. 실서비스 설정 전에는 `SPEECH_ENABLED=false`이며 앱의 평가 버튼도 비활성이다.

## 수동 설정 순서

1. [Azure 무료 계정](https://azure.microsoft.com/free/)에 가입한다. 카드 확인이 있을 수 있으며 무료 계정 구독의 만료·갱신 조건은 가입 화면에서 확인한다.
2. Azure Portal에서 **Speech** 리소스를 생성한다. 이름 `holaspeak-speech`, 새 리소스 그룹 `holaspeak`, 가격 책정 계층 **Free F0**를 선택한다. F0가 보이지 않으면 유료 S0로 바꾸지 말고 지원 지역과 해당 구독의 기존 F0 리소스를 확인한다.
3. Speech → 키 및 엔드포인트에서 **지역**을 확인해 `wrangler.jsonc`의 `AZURE_SPEECH_REGION`에 입력한다. 키는 채팅·GitHub·`tts-config.js`에 넣지 않는다.
4. Cloudflare 계정에서 **Workers Free**를 사용한다. 이 서버는 Free에서 지원하는 SQLite Durable Object만 사용한다. Workers Paid나 Firebase Blaze 전환은 필요하지 않다.
5. 로컬 터미널에서 아래 명령을 실행한다. `secret put`에서 Azure 키를 직접 입력한다.

```powershell
cd azure-worker
npm.cmd ci
npx.cmd wrangler login
npx.cmd wrangler secret put AZURE_SPEECH_KEY
```

6. `wrangler.jsonc`의 `SPEECH_ENABLED`를 `true`로 변경하고 `npm.cmd run deploy`를 실행한다. 같은 `holaspeak-speech` Worker와 Durable Object 이름을 유지한다. 별도 복제 배포는 사용량 카운터를 분리하므로 하지 않는다.
7. 루트 `tts-config.js`의 `HOLA_TTS_API_URL`, `HOLA_API_URL`에 배포된 Worker HTTPS URL을 입력한다. **키는 입력하지 않는다.** `HOLA_ENABLE_SPEECH=true`를 설정한다.
8. Firebase Firestore 규칙에 루트 `firestore.rules`의 최신 내용을 게시한다. 평가는 `users/{uid}/assessments/{UUID}`에 저장한다.
9. Google 로그인 → 같은 문장을 반복 청취 → 속도/음높이/목소리 변경 → 마이크 녹음 두 번 → 두 개의 다른 평가 ID 확인 → 로그아웃/재로그인 후 이력 확인. 실제 기기 Chrome/Safari에서도 마이크와 재생을 확인한다. 이 단계 전에는 실연결 완료라고 표시하지 않는다.

## 무료 한도와 중단

- [Azure 공식 요금표](https://azure.microsoft.com/en-us/pricing/details/speech/): F0 Neural TTS 월 **50만 자**, STT 월 **5시간**(Standard/Custom 공유). 기본 발음 평가만 요청하며 prosody/content add-on은 사용하지 않는다.
- 서버는 UTC 월별 TTS 500,000자, 평가 18,000초를 **모든 사용자 합산**으로 제한한다. TTS는 SSML 전체 길이를 보수적으로 예약하므로 실제 문장 50만 자보다 일찍 중단될 수 있다. 평가는 요청별 초 올림이다. 실패·시간 초과도 예약량을 돌려주지 않는다.
- 사용자별 UTC 하루 신규 TTS 5,000자, 평가 300초. 월·일 카운터는 SQLite 트랜잭션으로 먼저 예약하고 재시작·재배포 후에도 유지한다. 저장된 예시 음성은 신규 생성 한도와 무관하게 재사용한다.
- Azure 리소스는 **F0를 유지**하며 HolaSpeak 전용으로 쓴다. 앱 카운터는 Azure 콘솔·다른 앱 사용량을 알 수 없다. Azure의 서비스 요청 속도 제한 때문에 월 한도 이전에도 429가 발생할 수 있다. 자동 재시도로 추가 평가하지 않는다.
- [Cloudflare Free](https://developers.cloudflare.com/durable-objects/platform/pricing/)는 무료 한도 초과 시 작업이 실패한다. 여기의 앱 카운터가 Cloudflare 계정 요금제를 제어하는 것은 아니다. 실제 계정이 Free인지 배포 전에 확인한다.

## 데이터 처리

- Worker: Firebase RS256 서명·issuer·audience·만료 검증. 허용 Origin의 로그인 사용자만 호출한다. 클라이언트가 보낸 UID는 신뢰하지 않는다.
- 예시: 정규화 문장·Azure 제공자·목소리·속도·음높이·언어·형식·버전별 캐시. 서버 최대 500개, 브라우저 IndexedDB 150개, 메모리 25개. 같은 예시 동시 생성 합치기.
- 평가: 16kHz/16bit/mono WAV만 허용(최대 30초), UI는 25초 자동 종료. **동일 녹음도 요청마다 Azure를 새로 호출**하고 새 UUID를 반환한다. 음성과 평가 응답을 Worker DB에 저장하거나 재사용하지 않는다. 앱은 평가 점수·문장·시각만 Firestore에 개인 학습 이력으로 저장한다.
- 이력 저장 실패 시 같은 UUID로 다시 저장하며 평가 API는 호출하지 않는다. 창을 닫기 전 메모리에서만 재시도할 수 있다. 점수는 개인 학습용이며 클라이언트가 저장하므로 경쟁 순위의 신뢰 근거로 사용하지 않는다.
- 요청·음성 본문·비밀 키 로그를 남기지 않는다. 사용자 음성은 평가를 위해 Azure로 전송되며 Azure 자체의 처리 정책은 별도로 적용된다.
- API 주소가 비어 있는 준비 단계에는 기기 스페인어 음성으로 듣는다. Azure 연결 후 오류를 다른 제공자의 음성으로 조용히 대체하지 않고 안내한다.

## 검증 (실제 Azure 요청 없음)

```powershell
npm.cmd test
npm.cmd run check
```

Node 22.5 이상이 필요하다. 단위 테스트는 메모리 SQLite 및 가짜 Azure 응답으로 캐시·재평가·한도·인증 경계를 확인한다. `check`는 배포하지 않는 Wrangler dry-run이다.
