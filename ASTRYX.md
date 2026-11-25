# Astryx in Hola

Astryx Core is pinned at `0.7.17` in `package.json` and `package-lock.json`. The current mobile site is static HTML, so its profile install card mounts Astryx `Card`, `Stack`, `Heading`, `Text`, and `Button` components from `astryx-ui.js` through the no-build-step import map in `index.html`. The theme editor owns `themes/hola/hola.theme.ts`; its generated theme module and stylesheet are wired through `src/astryx-themes.js` and `src/themes/hola/`.

The browser loads the version-pinned runtime and core styles from esm.sh and jsDelivr. The original HTML install card remains as a fallback if those CDNs are unavailable; the rest of the app stays usable. `sw.js` caches the local Astryx mount module, theme, and styles with the app shell. The stylesheet is linked directly because this static page has no bundler for CSS module imports.

Install the pinned project tools with:

```powershell
npm.cmd install
```

Use the repository's CLI with:

```powershell
astryx.cmd search "mobile Spanish learning"
```

When upgrading Astryx, update the package versions and the matching pinned URLs in `index.html` together. Edit colors and typography with `astryx experimental theme editor`, then inspect `show hola --png`. Keep the service worker cache name moving forward when changing the offline shell.
