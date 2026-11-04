/* Public Tizen application APIs. No Mac server, network address or credentials. */
(function () {
  'use strict';
  var IDS = {
    stremio: 'IkWsFHtOY9.Stremio', netflix: 'org.tizen.netflix-app',
    disneyplus: 'MCmYXNxgcu.DisneyPlus', youtube: '9Ur5IzDKqV.TizenYouTube',
    appletv: 'com.samsung.tv.aria-video', primevideo: 'org.tizen.primevideo',
    abciview: 'mWK87Xghap.ABCiview', sbs: 'OyE7OuxlUi.SBSOnDemand',
    applemusic: 'org.tizen.apple.apple-music'
  };
  var STREAMING = ['as6cYRgkPy.Binge', '73iTZRTc34.Stan', '5b8c3eb16b.BeamCTVDev',
    'cj37Ni3qXM.HBONow', 'LBUAQX1exg.Hulu', 'gzcc4LRFBF.Peacock', 'rJyOSqC6Up.CBSAllAccess',
    'Rk72oKFsRS.OtterKidsProd', '70fRFUwYlD.OtterGAProd', 'PvWgqxV3Xa.YouTubeTV',
    'XtU8fQk2gN.ESPN', 'ZmmGjO6VKO.slingtv', 'VtuWAiZdHN.STARZPlay', 'ckfgqqzvt0.dplus',
    'kk8MbItQ0H.VUDU', 'Jz7aUrV2Q4.Twitch', 'OK2Rdkjmsi.IMDbTV', 'Ob3XhAVMu6.amcplus',
    'KaLitts8bq.tenplaySamsungTizen', 'eYuOiOLYQX.KayoSports', 'Ne2ZsPWdKl.9NOW',
    '3KA0pm7a7V.TubiTV', 'rJeHak5zRg.Spotify', 'icp4AvUPiA.7plus'];
  var CONSUMER_SYSTEM = ['org.tizen.browser', 'com.microsoft.copilot'];
  var EXTRA_BRANDS = {'rJeHak5zRg.Spotify': 'spotify', '5b8c3eb16b.BeamCTVDev': 'hbomax', 'cj37Ni3qXM.HBONow': 'hbomax', '3KA0pm7a7V.TubiTV': 'tubi'};
  var INTERNAL = ['adplatform.ADPlayer', 'WykOS4t4F0.cmsWebApp', '25emanual3.emanual',
    'd0m1lV1nt2.emanual', '2022ePop01.SmartTV',
    'ZODRT12q2l.WebAccountExtension', 'ByJlgt0XeD.CastSettingsApp', 'tv6pbVMQFF.PrivacyChoices'];
  // Samsung's viewer shows the last-used input; list it under a plain name.
  var INPUT = 'org.tizen.tv-viewer', INPUT_NAME = 'TV input';
  // Hidden system screens offered as shortcuts. The menu app opens Picture settings.
  var SYSTEM_NAMES = { 'org.tizen.tv-viewer': INPUT_NAME, 'org.tizen.menu': 'Picture settings' };
  // Fixed inputs switch the main source, then open the viewer. Owner's label for HDMI 1.
  var SOURCE = /^input\.([A-Z]+)([0-9]{1,2})$/, SOURCE_NAMES = { HDMI1: 'PC' };
  var SELF = 'nClrkHome1.FrameHome';
  function api() { return window.tizen && window.tizen.application; }
  function selfId() {
    try { return api().getCurrentApplication().appInfo.id || SELF; }
    catch (err) { return SELF; }
  }
  function unavailable(done) {
    done({ message: 'Open CleanFrame on the TV to use this control.', detail: 'The web preview cannot control the TV.' });
  }
  function failure(err) {
    return { message: 'The TV could not open this screen.', detail: err && (err.message || err.name) || 'Try again, or press the remote’s Home button to return to CleanFrame.' };
  }
  function bounded(done, timeout) {
    var finished = false, timer = setTimeout(function () { finish({ message: 'The TV did not respond. Please try again.' }); }, timeout || 8000);
    function finish(err, value) { if (finished) return; finished = true; clearTimeout(timer); done(err, value); }
    return finish;
  }
  function launchApp(id, done) {
    var input = SOURCE.exec(id);
    if (input) { launchInput(input[1], Number(input[2]), done); return; }
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try { api().launch(id, function () { finish(null); }, function (err) { finish(failure(err)); }); }
    catch (err) { finish(failure(err)); }
  }
  function sources(ok, fail) {
    tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
      ok((info.connected || []).concat(info.disconnected || []));
    }, fail);
  }
  function sourceEntries(list) {
    var seen = {}, count = {}, result = [];
    list.forEach(function (src) { count[src.type] = (count[src.type] || 0) + 1; });
    list.forEach(function (src) {
      var key = src.type + src.number;
      if (seen[key] || !/^[A-Z]+$/.test(src.type) || !(src.number >= 0 && src.number < 100)) return;
      seen[key] = true;
      result.push({ appId: 'input.' + key, name: SOURCE_NAMES[key] || (count[src.type] > 1 ? src.type + ' ' + src.number : src.type), brand: '', icon: '', rank: 25 });
    });
    return result;
  }
  function launchInput(type, number, done) {
    if (!api() || !window.tizen.systeminfo || !window.tizen.tvwindow) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      sources(function (list) {
        var src = list.filter(function (s) { return s.type === type && s.number === number; })[0];
        if (!src) { finish({ message: 'This input is not available on this screen.' }); return; }
        tizen.tvwindow.setSource(src, function () {
          api().launch(INPUT, function () {
            finish(null);
            // The viewer can stay behind CleanFrame when it was already running.
            setTimeout(function () { try { api().getCurrentApplication().hide(); } catch (err) { /* stays visible */ } }, 300);
          }, function (err) { finish(failure(err)); });
        }, function (err) { finish(failure(err)); }, 'MAIN');
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  // Like Samsung's Auto Source Switch: an input plugged in while CleanFrame is in front opens.
  function watchInputs(open) {
    if (!api() || !window.tizen.systeminfo || !window.tizen.tvwindow) return;
    var known = null;
    function keys(info) {
      var out = {};
      (info.connected || []).forEach(function (src) { out[src.type + src.number] = true; });
      return out;
    }
    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) { known = keys(info); }, function () {});
      tizen.systeminfo.addPropertyValueChangeListener('VIDEOSOURCE', function (info) {
        var now = keys(info), added = known ? Object.keys(now).filter(function (key) { return !known[key]; }) : [];
        known = now;
        if (added.length === 1 && !document.hidden && SOURCE.test('input.' + added[0])) open('input.' + added[0]);
      });
    } catch (err) { /* this screen does not report its inputs */ }
  }
  function launch(brand, done) {
    if (!IDS[brand]) { done({message: 'This app has no launch target.'}); return; }
    launchApp(IDS[brand], done);
  }
  function art(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      var data = [new tizen.ApplicationControlData('mode', ['fullscreen']), new tizen.ApplicationControlData('requester', ['mobile'])];
      var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
      api().launchAppControl(control, 'org.tizen.art-app', function () { finish(null); }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function home(done) { launchApp('com.samsung.tv.csfs', done); }
  function settings(done) { launchApp('com.samsung.tv.coba.setting', done); }
  function apps(done) {
    if (!api()) { unavailable(done); return; }
    // Large installed catalogues can take longer than a launch response.
    var finish = bounded(done, 20000);
    try {
      api().getAppsInfo(function (list) {
        var known = {}, seen = {}, result = [], self = selfId();
        Object.keys(IDS).forEach(function (brand) { known[IDS[brand]] = brand; });
        list.forEach(function (a) {
          if (SYSTEM_NAMES[a.id]) {
            if (!seen[a.id]) result.push({ appId: a.id, name: SYSTEM_NAMES[a.id], brand: '', icon: '', rank: 25 });
            seen[a.id] = true;
            return;
          }
          var primary = !!known[a.id], stream = STREAMING.indexOf(a.id) >= 0;
          var consumer = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(a.id) || CONSUMER_SYSTEM.indexOf(a.id) >= 0;
          if (a.id === self || INTERNAL.indexOf(a.id) >= 0 || seen[a.id] || !a.name || (!primary && !stream && (!a.show || !consumer))) return;
          if (!primary && /(?:service|worker|preview|promotion|plugin|launcher|test|sdk|^ep[ -]|factory|daemon)/i.test(a.name + ' ' + a.id)) return;
          if (/-dummy$/.test(a.id) || a.id === 'com.samsung.tv.cobalt-yt') return;
          seen[a.id] = true;
          result.push({ appId: a.id, name: a.name, brand: known[a.id] || EXTRA_BRANDS[a.id] || '', icon: a.iconPath || '', rank: primary ? Object.keys(IDS).indexOf(known[a.id]) : (stream ? 20 : 30) });
        });
        function sorted(list) {
          list.sort(function (a, b) { return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
          finish(null, list);
        }
        // Screens that report their inputs list each one instead of the last-used viewer.
        if (!window.tizen.systeminfo || !window.tizen.tvwindow || !seen[INPUT]) { sorted(result); return; }
        try {
          sources(function (list) {
            var inputs = sourceEntries(list);
            sorted(inputs.length ? result.filter(function (a) { return a.appId !== INPUT; }).concat(inputs) : result);
          }, function () { sorted(result); });
        } catch (err) { sorted(result); }
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  window.FrameDevice = { launch: launch, launchApp: launchApp, art: art, home: home, settings: settings, apps: apps, watchInputs: watchInputs };
}());
