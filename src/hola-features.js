import * as React from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import { Stack, Text, Button, Selector, TextInput, ProgressBar } from '@astryxdesign/core';
import { Heading } from '@astryxdesign/core/Heading';
import { HolaTheme } from '../astryx-ui.js';
import { api, getSession, getStatus, loadProgress, subscribe, mountGoogleButton, logout, sync, resolveConflict, loginGoogle, loginEmail, signupEmail, verifyEmail, forgotPassword, checkIn } from './hola-client.js';
import { progression, activitySummary } from './progression.js';
import { say, stopAudio, recordAttempt, audioBase64, voiceSettings, setVoiceSettings } from './hola-audio.js';
const h = htm.bind(React.createElement);
function useAccount() { const [, update] = React.useReducer(x => x + 1, 0); React.useEffect(() => subscribe(update), []); return { session: getSession(), ...getStatus() }; }
function GoogleLogin() {
  const state = useAccount();
  const ref = React.useRef(), [error, setError] = React.useState('');
  React.useEffect(() => { mountGoogleButton(ref.current).catch(e => setError(e.message)); }, []);
  if (state.provider === 'firebase') return h`<${FirebaseAuth} />`;
  return h`<${Stack} gap=${2}><${Stack} as="section" ref=${ref} aria-label="Google로 계속하기" /><${Text} role="status">${error || state.syncError || (state.busy ? 'Google 계정을 확인하고 있어요…' : !state.configured ? 'Google 계정 연결을 준비 중이에요. 지금은 게스트로 학습할 수 있어요.' : '처음 가입하면 현재 게스트 기록을 이어서 저장해요. 기존 계정은 저장된 기록을 불러와요.')}</${Text}></${Stack}>`;
}
function FirebaseAuth() {
  const state = useAccount();
  const [mode, setMode] = React.useState('signup'), [name, setName] = React.useState(''), [email, setEmail] = React.useState(''), [password, setPassword] = React.useState(''), [message, setMessage] = React.useState('');
  const submit = async e => { e.preventDefault(); setMessage(''); if (!email || !password || (mode === 'signup' && !name.trim())) { setMessage('이름, 이메일과 비밀번호를 확인해 주세요.'); return; } if (mode === 'signup') await signupEmail(name, email, password); else await loginEmail(email, password); setPassword(''); };
  const reset = async () => { if (!email.trim()) { setMessage('이메일을 먼저 입력해 주세요.'); return; } try { await forgotPassword(email); setMessage('가입된 이메일이라면 비밀번호 재설정 메일을 받을 수 있어요.'); } catch (error) { setMessage(error.message); } };
  return h`<${Stack} gap=${3}>
    <${Button} label="Google로 계속하기" onClick=${loginGoogle} isLoading=${state.busy} isDisabled=${!state.configured} />
    <${Stack} as="form" gap=${3} onSubmit=${submit}>
      ${mode === 'signup' ? h`<${TextInput} label="이름" value=${name} onChange=${setName} autoComplete="name" isDisabled=${state.busy} />` : null}
      <${TextInput} label="이메일" type="email" value=${email} onChange=${setEmail} autoComplete="email" autoCapitalize="none" isDisabled=${state.busy} />
      <${TextInput} label="비밀번호" type="password" value=${password} onChange=${setPassword} autoComplete=${mode === 'signup' ? 'new-password' : 'current-password'} description=${mode === 'signup' ? '8자 이상 입력해 주세요.' : undefined} isDisabled=${state.busy} />
      <${Button} type="submit" label=${mode === 'signup' ? '이메일로 회원가입' : '이메일로 로그인'} isLoading=${state.busy} isDisabled=${!state.configured} />
    </${Stack}>
    <${Button} variant="ghost" label=${mode === 'signup' ? '이미 계정이 있어요 · 로그인' : '처음이에요 · 회원가입'} isDisabled=${state.busy} onClick=${() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMessage(''); setPassword(''); }} />
    ${mode === 'login' ? h`<${Button} variant="ghost" label="비밀번호 재설정" onClick=${reset} isDisabled=${state.busy} />` : null}
    <${Text} role="status" aria-live="polite">${message || state.syncError || (!state.configured ? '회원가입 연결을 준비 중이에요.' : '처음 가입하면 게스트 학습 기록을 계정에 이어서 저장해요.')}</${Text}>
  </${Stack}>`;
}
export function AccountPanel() {
  const speechEnabled = window.HOLA_ENABLE_SPEECH === true;
  const ttsEnabled = window.HOLA_ENABLE_TTS === true || speechEnabled;
  const state = useAccount(), [history, setHistory] = React.useState([]), [error, setError] = React.useState('');
  const attendance = activitySummary(loadProgress().attendanceDates), study = activitySummary(loadProgress().studyDates);
  const [voice, setVoice] = React.useState(voiceSettings), [audioStatus, setAudioStatus] = React.useState('');
  const refresh = async () => { const owner = getSession(); setError(''); try { const data = await api('/assessments'); if (getSession() === owner) setHistory(data.items); } catch (e) { if (getSession() === owner) setError(e.message); } };
  React.useEffect(() => { setHistory([]); if (state.session && speechEnabled) void refresh(); }, [state.session]);
  React.useEffect(() => { const fn = e => setAudioStatus(e.detail); window.addEventListener('hola:audio-status', fn); return () => window.removeEventListener('hola:audio-status', fn); }, []);
  React.useEffect(() => { const fn = () => { setHistory([]); if (getSession() && speechEnabled) void refresh(); }; window.addEventListener('hola:assessment-saved', fn); window.addEventListener('hola:progress-loaded', fn); return () => { window.removeEventListener('hola:assessment-saved', fn); window.removeEventListener('hola:progress-loaded', fn); }; }, []);
  const action = fn => async () => { setError(''); try { await fn(); } catch (e) { setError(e.message); } };
  const change = key => value => { const next = { ...voice, [key]: key === 'voice' ? value : Number(value) }; try { setVoiceSettings(next); setVoice(next); } catch { setError('음성 설정을 저장하지 못했어요.'); } };
  return h`<${HolaTheme}><${Stack} as="section" gap=${4}>
    <${Heading} level=${2}>계정과 학습 기록</${Heading}>
    ${state.session ? h`<${Text}>${state.session.user.name}님 · 계정 연결됨</${Text}><${Text}>${state.session.user.email || ''}</${Text}><${Button} label="로그아웃" isDisabled=${state.busy} onClick=${action(logout)} /><${Button} label="기록 동기화" isLoading=${state.busy} onClick=${action(sync)} />` : h`<${GoogleLogin} />`}
    ${state.session?.user.provider === 'firebase' && !state.session.user.emailVerified ? h`<${Button} label="이메일 인증 메일 다시 보내기" onClick=${action(verifyEmail)} />` : null}
    <${Text} role="status">${state.notice}</${Text}>
    <${Heading} level=${2}>나의 성장</${Heading}>
    <${Text} weight="semibold">레벨 ${progression(loadProgress().xp).level} · ${progression(loadProgress().xp).points} 포인트</${Text}>
    <${ProgressBar} label="다음 레벨까지" value=${progression(loadProgress().xp).xpInLevel} max=${100} />
    <${Text}>다음 레벨까지 ${progression(loadProgress().xp).xpToNextLevel} XP · 100 XP마다 레벨이 올라요.</${Text}>
    <${Heading} level=${2}>오늘의 출석</${Heading}>
    <${Text}>연속 출석 ${attendance.streak}일 · 누적 출석 ${attendance.total}일</${Text}>
    <${Button} label=${attendance.today ? '오늘 출석 완료' : '오늘 출석 체크'} isDisabled=${!state.session || attendance.today} onClick=${action(checkIn)} />
    <${Text}>${state.session ? '한국 시간 자정에 다음 날 출석이 열려요.' : '로그인하면 매일 출석을 남길 수 있어요.'}</${Text}>
    <${Heading} level=${2}>꾸준한 미션 참여</${Heading}>
    <${Text}>연속 ${study.streak}일 · 이번 달 ${study.month}일 · 누적 ${study.total}일</${Text}>
    <${Text}>${study.today ? '오늘 미션에 참여했어요.' : '레슨·복습·게임 중 하나를 완료하면 오늘의 참여가 기록돼요.'}</${Text}>
    <${Text} role="status" aria-live="polite">${state.syncError || (state.busy ? '기록을 연결하고 있어요…' : state.session ? '학습 기록은 계정에 저장돼요. 오프라인 변경은 연결되면 동기화해요.' : '게스트 기록은 현재 기기에 저장돼요.')}</${Text}>
    ${state.conflict ? h`<${Button} label="다른 기기의 기록 불러오기" onClick=${action(() => resolveConflict(false))} /><${Button} label="이 기기의 기록으로 저장하기" onClick=${action(() => resolveConflict(true))} />` : null}
    ${ttsEnabled ? h`    <${Heading} level=${2}>예시 음성 설정</${Heading}>
    <${Selector} label="Google 스페인어 음성" value=${voice.voice} onChange=${change('voice')} options=${['es-ES-Neural2-A', 'es-ES-Neural2-E', 'es-ES-Neural2-H']} presentation="adaptive" />
    <${Selector} label="말하기 속도" value=${String(voice.speakingRate)} onChange=${change('speakingRate')} options=${[{ value: '0.7', label: '천천히' }, { value: '0.9', label: '학습 속도' }, { value: '1.1', label: '자연스럽게' }]} presentation="adaptive" />
    <${Selector} label="음높이" value=${String(voice.pitch)} onChange=${change('pitch')} options=${[{ value: '-2', label: '낮게' }, { value: '0', label: '기본' }, { value: '2', label: '높게' }]} presentation="adaptive" />
    <${Button} label="Hola 예시 듣기" onClick=${() => { void say('Hola'); }} />
    <${Text} role="status" aria-live="polite">${audioStatus}</${Text}>
    <${Text}>${window.HOLA_TTS_API_URL ? 'Google 음성은 첫 생성 후 저장해 반복 재생해요.' : 'Google 음성 연결을 준비 중이에요. 지금은 기기 음성으로 들을 수 있어요.'}</${Text}>
    ` : null}
    ${speechEnabled ? h`<${Heading} level=${2}>최근 발음 평가</${Heading}>
    <${Text}>녹음마다 새로 평가해요. 녹음은 보관하지 않고 문장과 평가 기록을 계정에 저장해요.</${Text}>
    ${state.session ? h`<${Button} label="평가 기록 새로고침" onClick=${refresh} /><${Button} label="다시 말하기 연습" onClick=${() => window.dispatchEvent(new Event('hola:open-speaking'))} /><${Stack} as="ol" gap=${2}>${history.map(item => h`<${Stack} key=${item.id} as="li" gap=${1}><${Text} weight="semibold">${item.reference} · ${Math.round(item.result.pronunciation)}점</${Text}><${Text} type="supporting">${new Date(item.created).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</${Text}></${Stack} >`)}</${Stack}><${Text}>${history.length ? '최근 50건까지 표시해요.' : '아직 평가 기록이 없어요.'}</${Text}>` : null}
` : null}
    <${Text} role="alert">${error}</${Text}>
  </${Stack}></${HolaTheme}>`;
}
function Speaking({ onComplete }) {
  const [phase, setPhase] = React.useState('idle'), [error, setError] = React.useState(''), [result, setResult] = React.useState(null);
  const stop = React.useRef(), controller = React.useRef(), owner = React.useRef(getSession());
  React.useEffect(() => () => { controller.current?.abort(); stopAudio(); }, []);
  if (window.HOLA_ENABLE_SPEECH !== true) return h`<${HolaTheme}><${Stack} gap=${3}><${Heading} level=${2}>말하기 연습</${Heading}><${Text}>말하기 평가는 다음 단계에서 연결할 예정이에요. 먼저 회원가입과 학습 기록 저장을 이용해 주세요.</${Text}></${Stack}></${HolaTheme}>`;
  const start = async () => {
    if (phase === 'recording') { setPhase('assessing'); stop.current?.(); return; }
    setError(''); setResult(null); setPhase('permission');
    const active = new AbortController(); controller.current = active;
    try {
      const bytes = await recordAttempt({ signal: active.signal, onReady: fn => { stop.current = fn; setPhase('recording'); }, onAutoStop: () => setPhase('assessing') });
      if (active.signal.aborted || getSession() !== owner.current) return;
      setPhase('assessing');
      const item = await api('/assessments', { method: 'POST', body: { reference: 'Hola', audio: audioBase64(bytes) }, signal: AbortSignal.any([active.signal, AbortSignal.timeout(35000)]) });
      if (active.signal.aborted || getSession() !== owner.current) return;
      setResult(item.result); setPhase('idle'); onComplete();
      window.dispatchEvent(new Event('hola:assessment-saved'));
    } catch (e) { if (!active.signal.aborted) { setError(e.name === 'NotAllowedError' ? '마이크 권한을 허용한 뒤 다시 녹음해 주세요.' : e.message); setPhase('idle'); } }
  };
  return h`<${HolaTheme}><${Stack} gap=${3}>
    <${Heading} level=${2}>한 단어 말하기</${Heading}><${Text} weight="semibold">Hola · 올라 · 안녕</${Text}>
    <${Button} label="예시 음성 듣기" isDisabled=${phase !== 'idle'} onClick=${() => { void say('Hola'); }} />
    <${Text}>마이크로 25초 이내로 말해 주세요. 녹음은 Azure로 전송해 매번 새로 평가하고 저장하지 않아요.</${Text}>
    <${Button} label=${phase === 'recording' ? '녹음 끝내고 평가하기' : '녹음 시작'} isDisabled=${phase === 'permission' || phase === 'assessing'} onClick=${start} />
    <${Text} role="status" aria-live="polite">${phase === 'permission' ? '마이크 권한을 확인하고 있어요…' : phase === 'recording' ? '녹음 중이에요. 말한 뒤 녹음을 끝내 주세요.' : phase === 'assessing' ? '발음을 평가하고 있어요…' : error}</${Text}>
    ${result ? h`<${Heading} level=${3}>발음 ${Math.round(result.pronunciation)}점</${Heading}><${Text}>정확도 ${result.accuracy ?? '—'} · 유창성 ${result.fluency ?? '—'} · 완성도 ${result.completeness ?? '—'}</${Text}><${Stack} as="ul" gap=${1}>${result.words.map((w, i) => h`<${Stack} as="li" key=${i}><${Text}>${w.word} · ${w.accuracy ?? '—'}점 · ${w.error}</${Text}></${Stack}>`)}</${Stack}><${Text}>다시 녹음하면 새 평가 기록이 추가돼요.</${Text}>` : null}
  </${Stack}></${HolaTheme}>`;
}
export function mountAccount(element) { createRoot(element).render(h`<${AccountPanel} />`); }
export function mountSignup(element) { const root = createRoot(element); root.render(h`<${HolaTheme}><${Stack} gap=${3}><${Heading} level=${2}>계정으로 학습 이어가기</${Heading}><${GoogleLogin} /><${Text}>계정에 로그인하면 학습·평가 기록을 다른 기기에서도 이어볼 수 있어요.</${Text}></${Stack}></${HolaTheme}>`); return () => root.unmount(); }
export function mountSpeaking(element, onComplete) { const root = createRoot(element); root.render(h`<${Speaking} onComplete=${onComplete} />`); return () => root.unmount(); }
