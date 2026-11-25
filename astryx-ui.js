import * as React from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import { Button, Card, Heading, Stack, Text, Theme } from '@astryxdesign/core';
import { themes, defaultThemeSlug, themeModes } from './src/astryx-themes.js';

const h = htm.bind(React.createElement);

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
    <${Theme} theme=${themes[defaultThemeSlug]} mode=${themeModes[defaultThemeSlug] || 'light'}>
      <${Card} className="astryx-install-card" maxWidth=${520} elevation="low">
        <${Stack} gap=${3} align="start">
          <${Heading} level=${2}>Hola를 앱처럼 설치</${Heading}>
          <${Text}>${status.caption || '홈 화면에서 바로 열고, 저장된 레슨은 오프라인에서도 볼 수 있어요.'}</${Text}>
          <${Stack} gap=${2}>
            <${Button}
              variant="primary"
              label=${status.label || '설치하기'}
              isDisabled=${Boolean(status.installed)}
              onClick=${(event) => { event.stopPropagation(); window.holaPwaInstall(); }}
            />
            <${Button}
              variant="secondary"
              label=${helpOpen ? '설치 안내 닫기' : '설치 방법 보기'}
              aria-expanded=${helpOpen}
              onClick=${(event) => { event.stopPropagation(); setHelpOpen((open) => !open); }}
            />
          </${Stack}>
          ${helpOpen ? h`<${Text}>${status.help || '브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.'}</${Text}>` : null}
        </${Stack}>
      </${Card}>
    </${Theme}>
  `;
}

const mount = document.querySelector('#astryx-install-root');
if (mount) createRoot(mount).render(h`<${InstallCard} />`);
