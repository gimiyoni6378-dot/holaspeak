# HolaSpeak API

Node >=22.13의 Express + SQLite 서비스입니다. Google 로그인, 사용자별 학습 기록, Google TTS 캐시와 Azure 발음 평가 이력을 제공합니다.

설정·실행·영구 저장소 배포 제약은 [IMPLEMENTATION.md](../IMPLEMENTATION.md)에 정리되어 있습니다. 환경변수 이름은 [.env.example](.env.example)을 참고하세요. `.env`를 자동으로 읽지 않으므로 환경변수로 전달하거나 Node의 `--env-file`을 사용하세요.

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

`/auth/google`을 제외한 데이터 API는 앱 세션 Bearer 인증이 필요합니다. 공개 사이트 출처는 `ALLOWED_ORIGINS`로 제한합니다. CORS는 인증을 대신하지 않습니다. 기본 SQLite 파일은 `data/hola.sqlite`이며 운영에서는 영구 디스크와 단일 인스턴스가 필요합니다. 기본 Cloud Run 임시 파일 시스템에 사용자 기록을 저장하면 안 됩니다.

- POST /auth/google: Google ID 토큰 서버 검증, 첫 가입 시 게스트 기록 이전
- GET /me, POST /auth/logout: 사용자 조회, 세션 폐기
- PUT /progress: revision 조건부 저장, 충돌 시 409
- DELETE /progress: 학습 및 평가 기록 초기화
- POST /synthesize: 문장·음성·속도·피치별 MP3 캐시
- POST /assessments: WAV를 Azure로 매번 새로 평가하고 결과 저장
- GET /assessments: 로그인 사용자의 최근 50건

녹음은 보관하지 않습니다. 평가 이력은 캐시로 사용하지 않습니다. API 응답은 모두 `Cache-Control: no-store`입니다.
