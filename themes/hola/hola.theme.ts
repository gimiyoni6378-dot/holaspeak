// The hola theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in hola.settings.json and the generated hola.settings.ts;
// change them with `astryx experimental theme editor set hola ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {holaSettings} from './hola.settings';

export const holaTheme = defineTheme({
  extends: holaSettings,
  name: 'hola',
});
