import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import htm from 'htm';
import {
  Badge,
  Button,
  Card,
  ProgressBar,
  Stack,
  Text,
  Theme,
} from '@astryxdesign/core';
import { Heading } from '@astryxdesign/core/Heading';
import { themes, defaultThemeSlug, themeModes } from './src/astryx-themes.js';
import { getSession } from './src/hola-client.js';

const h = htm.bind(React.createElement);
export const HolaTheme = ({ children }) => h`
  <${Theme} theme=${themes[defaultThemeSlug]} mode=${themeModes[defaultThemeSlug] || 'light'}>
    ${children}
  </${Theme}>
`;

function MissionButton({ icon, title, description, mission }) {
  return h`
    <${Button}
      variant="ghost"
      label=${title}
      data-quest=${mission}
      className="mission-button"
    >
      <${Stack} direction="horizontal" gap=${3} align="center" className="mission-content">
        <span className="mission-icon" aria-hidden="true">${icon}</span>
        <${Stack} gap=${0.5} className="mission-copy">
          <${Text} weight="semibold">${title}</${Text}>
          <${Text} type="supporting" color="secondary">${description}</${Text}>
        </${Stack}>
        <span className="mission-status" id=${`q-${mission}`} aria-hidden="true">›</span>
      </${Stack}>
    </${Button}>
  `;
}

function HomeDashboard() {
  const [daysDone, setDaysDone] = React.useState(0);
  window.holaSetProgress = setDaysDone;

  return h`
    <${HolaTheme}>
      <${Stack} as="section" gap=${5} className="astryx-home">
        <${Stack} direction="horizontal" align="center" justify="between" className="home-welcome">
          <${Stack} gap=${1}>
            <${Text} type="supporting" color="secondary"><span id="today"></span></${Text}>
            <${Heading} level=${1} className="welcome-title">¡Hola, ${getSession()?.user.name || '학습자'}!</${Heading}>
            <${Text} color="secondary">오늘은 짧은 인사부터 익혀봐요.</${Text}>
          </${Stack}>
          <${Badge} variant="success" label="A1 · 첫걸음" />
        </${Stack}>

        <${Card} variant="green" elevation="med" padding=${4} className="home-hero">
          <${Stack} gap=${3} className="hero-copy">
            <${Badge} variant="warning" label="오늘의 미션 · 01" />
            <${Heading} level=${2} className="hero-title">첫 인사,<br />한마디부터</${Heading}>
            <${Text} as="p" color="secondary">스페인어 인사 세 개를 듣고 말해봐요.</${Text}>
            <${Stack} direction="horizontal" gap=${2} align="center" className="hero-meta">
              <${Text} type="supporting">3분</${Text}><span aria-hidden="true">·</span><${Text} type="supporting">초보 단계</${Text}>
            </${Stack}>
            <${Button} variant="primary" size="lg" label="미션 시작" data-lesson="" className="hero-cta">
              미션 시작 <span aria-hidden="true">→</span>
            </${Button}>
          </${Stack}>
          <span className="hero-art" aria-hidden="true">
            <img className="hero-mascot" src="./assets/mascot/hola-bull-happy-web.png" alt="" />
            <span className="hero-art-word">hola <i>올라</i></span>
          </span>
        </${Card}>

        <${Stack} as="section" gap=${2} className="home-section">
          <${Stack} direction="horizontal" align="end" justify="between" className="section-heading">
            <${Stack} gap=${0.5}>
              <${Text} type="label" color="secondary">3분 학습</${Text}>
              <${Heading} level=${2}>작은 미션, 큰 한 걸음</${Heading}>
            </${Stack}>
        <${Text} id="qcount" type="label" color="accent">0/3</${Text}>
          </${Stack}>
          <${Card} elevation="low" padding=${1} className="mission-list">
            <${Stack} gap=${0}>
              <${MissionButton} icon="01" title="인사 표현 익히기" description="단어 3개 · 쉬운 퀴즈" mission="lesson" />
              <${MissionButton} icon="02" title="단어 카드 복습" description="뜻과 발음을 떠올려요" mission="review" />
              <${MissionButton} icon="03" title="한 단어 말해보기" description="Hola · 올라 · 안녕" mission="speak" />
            </${Stack}>
          </${Card}>
        </${Stack}>

        <${Button} variant="secondary" label="스페인어 발음 첫걸음" data-pronunciation="" className="pronunciation-link">
          <span className="pronunciation-mark" aria-hidden="true">Ñ</span>
          <${Stack} gap=${0.5}>
            <${Text} weight="semibold">스페인어 발음 첫걸음</${Text}>
            <${Text} type="supporting" color="secondary">알파벳과 소리 규칙을 쉽게 배워요</${Text}>
          </${Stack}>
          <span className="pronunciation-arrow" aria-hidden="true">→</span>
        </${Button}>

        <${Card} variant="muted" elevation="low" padding=${4} className="weekly-card">
          <${Stack} gap=${3}>
            <${Stack} direction="horizontal" align="start" justify="between">
              <${Stack} gap=${1}>
                <${Text} type="label" color="secondary">이번 주 학습</${Text}>
                <${Heading} level=${2}>꾸준함이 실력이 돼요</${Heading}>
              </${Stack}>
              <${Badge} variant="warning" label="7일 목표" />
            </${Stack}>
            <${Stack} direction="horizontal" justify="between" className="week-days">
              <${Text}>월</${Text}><${Text}>화</${Text}><${Text}>오늘</${Text}><${Text}>목</${Text}><${Text}>금</${Text}><${Text}>토</${Text}><${Text}>일</${Text}>
            </${Stack}>
            <${Stack} className="week-progress">
              <${ProgressBar} label="이번 주 학습 진행" value=${daysDone} max=${7} hasValueLabel formatValueLabel=${(value) => `${value}일`} variant="success" />
            </${Stack}>
            <${Text} type="supporting" color="secondary">이번 주 <b id="daysdone">${daysDone}일</b> 학습 완료</${Text}>
          </${Stack}>
        </${Card}>

        <${Stack} as="section" gap=${2} className="home-section journey-section">
          <${Stack} direction="horizontal" align="end" justify="between" className="section-heading">
            <${Stack} gap=${0.5}>
              <${Text} type="label" color="secondary">초급 코스 · A1</${Text}>
              <${Heading} level=${2}>나의 학습 여정</${Heading}>
            </${Stack}>
            <${Button} variant="ghost" label="학습길 전체 보기" data-to="path" className="journey-all">전체 보기 →</${Button}>
          </${Stack}>
          <${Card} elevation="low" padding=${2} className="journey-card">
            <${Stack} gap=${1}>
              <${Stack} direction="horizontal" align="center" gap=${3} className="journey-row current">
                <span className="journey-icon" aria-hidden="true">✎</span>
                <${Stack} gap=${0.5} className="journey-copy"><${Text} weight="semibold">인사와 첫 표현</${Text}><${Text} type="supporting" color="secondary">첫 미션 · 뜻과 발음 3개</${Text}></${Stack}>
                <${Badge} variant="success" label="시작" />
              </${Stack}>
              <${Stack} direction="horizontal" align="center" gap=${3} className="journey-row">
                <span className="journey-icon pronunciation" aria-hidden="true">Ñ</span>
                <${Stack} gap=${0.5} className="journey-copy"><${Text} weight="semibold">알파벳과 발음</${Text}><${Text} type="supporting" color="secondary">모음부터 H, C, G 소리까지</${Text}></${Stack}>
                <${Button} variant="secondary" label="발음 배우기" data-pronunciation="" size="sm">배우기</${Button}>
              </${Stack}>
              <${Stack} direction="horizontal" align="center" gap=${3} className="journey-row locked">
                <span className="journey-icon" aria-hidden="true">☕</span>
                <${Stack} gap=${0.5} className="journey-copy"><${Text} weight="semibold">카페에서 주문하기</${Text}><${Text} type="supporting" color="secondary">인사를 익힌 다음 도전해요</${Text}></${Stack}>
                <span aria-label="잠김">🔒</span>
              </${Stack}>
            </${Stack}>
          </${Card}>
        </${Stack}>
      </${Stack}>
    </${HolaTheme}>
  `;
}

function InstallCard() {
  const [status, setStatus] = React.useState(window.holaPwaState || {});
  const [helpOpen, setHelpOpen] = React.useState(false);

  React.useEffect(() => {
    const onState = (event) => setStatus(event.detail);
    const onHelpToggle = () => setHelpOpen((open) => !open);
    window.addEventListener('hola:pwa-state', onState);
    window.addEventListener('hola:pwa-help-toggle', onHelpToggle);
    return () => {
      window.removeEventListener('hola:pwa-state', onState);
      window.removeEventListener('hola:pwa-help-toggle', onHelpToggle);
    };
  }, []);

  return h`
    <${HolaTheme}>
      <${Card} className="astryx-install-card" maxWidth=${520} elevation="low">
        <${Stack} gap=${3} align="start">
          <${Heading} level=${2}>Hola를 앱처럼 설치</${Heading}>
          <${Text}>${status.caption || '홈 화면에서 바로 열고, 저장된 레슨은 오프라인에서도 볼 수 있어요.'}</${Text}>
          <${Stack} direction="horizontal" gap=${2} wrap="wrap">
            <${Button} variant="primary" label=${status.label || '설치하기'} isDisabled=${Boolean(status.installed)} onClick=${(event) => { event.stopPropagation(); window.holaPwaInstall(); }} />
            <${Button} variant="secondary" label=${helpOpen ? '설치 안내 닫기' : '설치 방법 보기'} aria-expanded=${helpOpen} onClick=${(event) => { event.stopPropagation(); setHelpOpen((open) => !open); }} />
          </${Stack}>
          ${helpOpen ? h`<${Text}>${status.help || '브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.'}</${Text}>` : null}
        </${Stack}>
      </${Card}>
    </${HolaTheme}>
  `;
}

export function mountHome() {
  const homeMount = document.querySelector('#astryx-home-root');
  if (!homeMount) return false;
  const homeRoot = createRoot(homeMount);
  flushSync(() => homeRoot.render(h`<${HomeDashboard} />`));
  return true;
}

const installMount = document.querySelector('#astryx-install-root');
if (installMount) createRoot(installMount).render(h`<${InstallCard} />`);
