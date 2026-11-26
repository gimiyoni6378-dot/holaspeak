// Browser settings differ even on the same phone. Never infer permission from device type.
export function microphoneHelp(device = {}) {
  const ua = device.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
  const standalone = device.standalone === true;
  const inApp = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER/i.test(ua);
  const chrome = /CriOS/.test(ua);
  const safari = /Version\/.+Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  let title = '브라우저 마이크 설정', steps;
  if (ios && chrome && !standalone && !inApp) {
    title = '아이폰·아이패드 Chrome 마이크 설정';
    steps = ['기기의 설정 앱에서 Chrome을 찾아 마이크를 켜 주세요. 설정 → 앱 → Chrome 또는 설정 검색을 이용하세요.', '이 사이트를 차단했다면 Chrome 주소창 왼쪽의 마이크 아이콘에서 권한을 켜 주세요. 아이콘은 권한을 변경한 사이트에서만 보일 수 있어요.'];
  } else if (ios && safari && !standalone && !inApp) {
    title = '아이폰·아이패드 Safari 마이크 설정';
    steps = ['Safari 주소창의 페이지 메뉴 → 웹사이트 설정에서 이 사이트의 마이크를 허용해 주세요. 버전에 따라 더 보기 안에 있어요.', '계속 차단되면 기기 설정 → 앱 → Safari → 마이크에서 ‘묻기’를 선택해 주세요. 구버전은 설정 → Safari에 있어요.'];
  } else if (ios) {
    title = standalone ? '아이폰 홈 화면 앱에서 녹음이 안 되나요?' : '아이폰에서 녹음이 안 되나요?';
    steps = ['Safari 또는 Chrome에서 HolaSpeak 주소를 직접 열어 녹음 시작을 눌러 주세요. 카카오톡 등 앱 안의 브라우저에서는 권한 요청이 제한될 수 있어요.', 'Safari는 주소창의 페이지 메뉴 → 웹사이트 설정 → 마이크를 확인하세요. Chrome은 기기의 설정 앱에서 Chrome → 마이크를 켜 주세요.'];
  } else if (/Android/i.test(ua)) {
    title = '안드로이드 마이크 설정';
    steps = ['Chrome에서는 ⋮ → 설정 → 사이트 설정 → 마이크에서 이 사이트를 허용해 주세요. 다른 브라우저는 사이트 권한을 확인하세요.', '기기 설정 → 앱 → 사용 중인 브라우저 → 권한에서도 마이크를 허용해 주세요. 앱 안의 브라우저라면 Chrome에서 주소를 직접 열어 주세요.'];
  } else {
    steps = ['주소창 옆의 사이트 설정에서 이 사이트의 마이크 사용을 허용해 주세요.', '기기 설정에서도 사용 중인 브라우저의 마이크 접근을 허용해 주세요.'];
  }
  return { title, steps: [...steps, '설정을 바꾼 뒤 이 페이지를 새로고침하고 ‘녹음 시작’을 다시 눌러 주세요.'] };
}
