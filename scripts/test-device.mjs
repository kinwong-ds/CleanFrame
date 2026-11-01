// Test the production adapter with a synthetic API and clock. No TV access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../app/device.js', import.meta.url), 'utf8');
function harness(screen) {
  let now = 0, next = 0;
  const timers = new Map(), requests = [], launches = [], switches = [], hidden = [];
  const application = {
    getCurrentApplication: () => ({ appInfo: { id: 'Owner12345.Home' }, hide: () => hidden.push(now) }),
    getAppsInfo: (ok, fail) => requests.push({ ok, fail }),
    launch: (id, ok, fail) => launches.push({ id, ok, fail })
  };
  const window = { tizen: { application } };
  if (screen) {
    window.tizen.systeminfo = { getPropertyValue: (name, ok) => { assert.equal(name, 'VIDEOSOURCE'); ok(screen); } };
    window.tizen.tvwindow = { setSource: (source, ok, fail, type) => switches.push({ source, ok, fail, type }) };
  }
  vm.runInNewContext(source, {
    window, tizen: window.tizen,
    setTimeout: (callback, delay) => { const id = ++next; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  function advance(ms) {
    now += ms;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  }
  return { device: window.FrameDevice, requests, launches, switches, hidden, advance };
}

test('a 500-app catalogue can arrive after the old eight-second deadline', () => {
  const h = harness(), results = [];
  h.device.apps((error, apps) => results.push({ error, apps }));
  assert.equal(h.requests.length, 1);
  h.advance(15000);
  assert.equal(results.length, 0);
  h.requests[0].ok(Array.from({ length: 500 }, (_, i) => ({ id: 'App' + String(i).padStart(7, '0') + '.Consumer', name: 'App ' + i, show: true })));
  assert.equal(results.length, 1);
  assert.equal(results[0].error, null);
  assert.equal(results[0].apps.length, 500);
});

test('catalogue timeout and late callbacks finish only once', () => {
  const h = harness(), results = [];
  h.device.apps((error, apps) => results.push({ error, apps }));
  h.advance(19999);
  assert.equal(results.length, 0);
  h.advance(1);
  assert.equal(results.length, 1);
  assert.match(results[0].error.message, /did not respond/);
  h.requests[0].ok([]);
  h.requests[0].fail({ message: 'Late failure' });
  assert.equal(results.length, 1);
});

test('regional streaming apps stay distinct and system helpers stay hidden', () => {
  const h = harness();
  let apps;
  h.device.apps((error, value) => { assert.equal(error, null); apps = value; });
  h.requests[0].ok([
    { id: 'Owner12345.Home', name: 'My Home', show: true },
    { id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube', show: false },
    { id: 'PvWgqxV3Xa.YouTubeTV', name: 'YouTube TV', show: false },
    { id: 'cj37Ni3qXM.HBONow', name: 'HBO Max', show: false },
    { id: '2022ePop01.SmartTV', name: 'Smart TV', show: true },
    { id: 'd0m1lV1nt2.emanual', name: 'User Guide', show: true },
    { id: 'Hidden1234.Consumer', name: 'Hidden app', show: false }
  ]);
  assert.equal(apps.length, 3);
  assert.equal(apps.find(a => a.name === 'YouTube').brand, 'youtube');
  assert.equal(apps.find(a => a.name === 'YouTube TV').brand, '');
  assert.equal(apps.find(a => a.name === 'HBO Max').brand, 'hbomax');
});

test('the hidden TV viewer is listed once as TV input without its system icon', () => {
  const h = harness();
  let apps;
  h.device.apps((error, value) => { assert.equal(error, null); apps = value; });
  h.requests[0].ok([
    { id: 'org.tizen.tv-viewer', name: 'tv-viewer', show: false, iconPath: '/usr/share/icons/viewer.png' },
    { id: 'org.tizen.tv-viewer', name: 'tv-viewer', show: false },
    { id: 'org.tizen.tv-viewer-sub1', name: 'tv-viewer-sub1', show: false }
  ]);
  assert.equal(JSON.stringify(apps.map(a => [a.appId, a.name, a.icon])), JSON.stringify([['org.tizen.tv-viewer', 'TV input', '']]));
});

const MONITOR = {
  connected: [{ type: 'HDMI', number: 1, editName: 'PC' }],
  disconnected: [{ type: 'HDMI', number: 2, editName: null }, { type: 'DP', number: 1, editName: 'PC' }]
};

test('a screen that reports its inputs lists each one in place of TV input', () => {
  const h = harness(MONITOR);
  let apps;
  h.device.apps((error, value) => { assert.equal(error, null); apps = value; });
  h.requests[0].ok([{ id: 'org.tizen.tv-viewer', name: 'tv-viewer', show: false }]);
  assert.equal(JSON.stringify(apps.map(a => [a.appId, a.name])), JSON.stringify([['input.DP1', 'DP'], ['input.HDMI2', 'HDMI 2'], ['input.HDMI1', 'PC']]));
});

test('an input shortcut switches the main source, opens the viewer and steps aside', () => {
  const h = harness(MONITOR), results = [];
  h.device.launchApp('input.DP1', error => results.push(error));
  assert.equal(h.switches.length, 1);
  assert.equal(JSON.stringify([h.switches[0].source.type, h.switches[0].source.number, h.switches[0].type]), JSON.stringify(['DP', 1, 'MAIN']));
  assert.equal(h.launches.length, 0);
  h.switches[0].ok(h.switches[0].source);
  assert.equal(h.launches[0].id, 'org.tizen.tv-viewer');
  h.launches[0].ok();
  assert.deepEqual(results, [null]);
  h.advance(300);
  assert.equal(h.hidden.length, 1);
});

test('a missing input reports an error without switching', () => {
  const h = harness(MONITOR), results = [];
  h.device.launchApp('input.HDMI3', error => results.push(error));
  assert.equal(h.switches.length, 0);
  assert.match(results[0].message, /not available/);
});

test('launch keeps its eight-second deadline independently of discovery', () => {
  const h = harness(), results = [];
  h.device.launchApp('Synthetic.App', error => results.push(error));
  h.advance(8000);
  assert.equal(results.length, 1);
  assert.match(results[0].message, /did not respond/);
  h.launches[0].ok();
  assert.equal(results.length, 1);
});
