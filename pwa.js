(() => {
  const offlineNotice = document.querySelector('#offline-notice');
  let installPrompt = null;
  const installState = {
    label: '설치하기',
    caption: '홈 화면에서 바로 열고, 저장된 레슨은 오프라인에서도 볼 수 있어요.',
    help: '설치 버튼이 나타나지 않으면 브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.',
    installed: false,
  };

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function updateNetworkStatus() {
    if (offlineNotice) offlineNotice.hidden = navigator.onLine;
  }

  function publishInstallState() {
    window.holaPwaState = { ...installState };
    const button = document.querySelector('#pwa-install');
    const caption = document.querySelector('#install-caption');
    const help = document.querySelector('#pwa-help');
    const helpCopy = document.querySelector('#pwa-help-copy');
    if (button) {
      button.textContent = installState.label;
      button.disabled = installState.installed;
    }
    if (caption) caption.textContent = installState.caption;
    if (helpCopy) helpCopy.textContent = installState.help;
    if (help) help.hidden = installState.installed;
    window.dispatchEvent(new CustomEvent('hola:pwa-state', { detail: { ...installState } }));
  }

  window.holaPwaInstall = async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      prompt.prompt();
      await prompt.userChoice;
      return;
    }
    const help = document.querySelector('#pwa-help');
    if (help) {
      help.open = !help.open;
      help.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    window.dispatchEvent(new Event('hola:pwa-help-toggle'));
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('#pwa-install')) window.holaPwaInstall();
    if (event.target.closest('#pwa-help-toggle')) window.dispatchEvent(new Event('hola:pwa-help-toggle'));
  });

  updateNetworkStatus();
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

  if (isStandalone) {
    installState.label = '설치됨';
    installState.caption = '홈 화면에서 앱으로 사용 중이에요.';
    installState.installed = true;
  } else if (isIOS) {
    installState.label = '설치 안내';
    installState.caption = 'Safari 공유 메뉴에서 홈 화면에 추가할 수 있어요.';
    installState.help = 'Safari에서 공유 버튼을 누른 뒤 “홈 화면에 추가”를 선택하세요.';
  }
  publishInstallState();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installState.label = '앱 설치';
    installState.caption = '홈 화면에서 바로 여는 Hola 앱을 설치해요.';
    publishInstallState();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installState.label = '설치됨';
    installState.caption = '홈 화면에서 앱으로 사용 중이에요.';
    installState.installed = true;
    publishInstallState();
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
        .catch((error) => console.warn('Hola offline support is unavailable.', error));
    });
  }
})();
