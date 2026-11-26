import { test } from 'node:test';
import assert from 'node:assert/strict';
import { microphoneHelp } from '../src/microphone-help.js';

test('iPhone Chrome gets iOS app settings rather than Android settings', () => {
  const help = microphoneHelp({ userAgent: 'iPhone AppleWebKit CriOS/140 Mobile Safari/604.1' });
  assert.match(help.title, /아이폰.*Chrome/);
  assert.match(help.steps[0], /설정 → 앱 → Chrome/);
  assert.doesNotMatch(help.steps.join(' '), /⋮/);
});
test('iPhone Safari and desktop-mode iPad get Safari site permissions', () => {
  for (const device of [
    { userAgent: 'iPhone Version/26.0 Mobile Safari/605.1' },
    { userAgent: 'Macintosh Version/26.0 Safari/605.1', platform: 'MacIntel', maxTouchPoints: 5 },
  ]) {
    const help = microphoneHelp(device);
    assert.match(help.title, /Safari/);
    assert.match(help.steps[0], /웹사이트 설정/);
  }
});
test('iOS installed and embedded apps offer opening a full browser', () => {
  for (const device of [
    { userAgent: 'iPhone Version/26.0 Safari/605.1', standalone: true },
    { userAgent: 'iPhone Version/26.0 Safari/605.1 KAKAOTALK' },
    { userAgent: 'iPhone FxiOS/145 Mobile' },
  ]) assert.match(microphoneHelp(device).steps[0], /주소를 직접/);
});
test('Android and desktop use their own settings and always explain retry', () => {
  assert.match(microphoneHelp({ userAgent: 'Android Chrome/140' }).steps[0], /사이트 설정/);
  const desktop = microphoneHelp({ userAgent: 'Macintosh Chrome/140', platform: 'MacIntel', maxTouchPoints: 0 });
  assert.equal(desktop.title, '브라우저 마이크 설정');
  assert.match(desktop.steps.at(-1), /새로고침.*녹음 시작/);
});
