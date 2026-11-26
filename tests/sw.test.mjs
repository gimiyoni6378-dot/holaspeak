import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
test('service worker revalidates modules, falls back offline and excludes private requests', async () => {
  const handlers = {}; let offline = false, fetchedCache;
  vm.runInNewContext(source, {
    Request, Response, URL,
    self: { location: { origin: 'https://hola.test' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { match: async () => new Response('old-module'), open: async () => ({ put: async () => {} }) },
    fetch: async request => { fetchedCache = request.cache; if (offline) throw new Error('offline'); return new Response('new-module'); },
  });
  const dispatch = request => { let response; handlers.fetch({ request, respondWith: value => { response = value; } }); return response; };
  assert.equal(await (await dispatch(new Request('https://hola.test/src/progression.js'))).text(), 'new-module');
  assert.equal(fetchedCache, 'no-cache');
  offline = true;
  assert.equal(await (await dispatch(new Request('https://hola.test/src/progression.js'))).text(), 'old-module');
  assert.equal(dispatch(new Request('https://hola.test/progress')), undefined);
  assert.equal(dispatch(new Request('https://hola.test/private.js', { headers: { Authorization: 'Bearer session' } })), undefined);
  assert.equal(dispatch(new Request('https://hola.test/src/progression.js', { cache: 'reload' })), undefined);
});
