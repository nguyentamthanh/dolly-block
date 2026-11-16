// Playgama Bridge glue for the WebGL build; Platform/PlatformSdk.cs is the C# side.
// The page (Assets/WebGLTemplates/CozyBlocks/index.html) loads playgama-bridge.js with a plain <script> tag and
// initialises window.bridge before Unity starts; these functions only talk to that ready object. Events go back to
// C# with SendMessage on the "CozyBlocks" GameObject (PlatformBridgeReceiver).
var CozyBridgeLib = {
  $CozyBridge: {
    go: 'CozyBlocks',
    saving: false,
    pendingSave: null,

    b: function () {
      var b = window.bridge;
      return b && b.EVENT_NAME ? b : null;
    },

    send: function (method, value) {
      try {
        if (typeof SendMessage === 'function') SendMessage(CozyBridge.go, method, value);
        else if (Module.SendMessage) Module.SendMessage(CozyBridge.go, method, value);
      } catch (e) {
        console.warn('CozyBridge: SendMessage ' + method + ' failed', e);
      }
    },

    str: function (s) {
      return stringToNewUTF8(s == null ? '' : String(s));
    },

    save: function (key, text) {
      var b = CozyBridge.b();
      if (!b) return;
      // storage.set drops calls made while a write is in flight: keep only the latest and write it afterwards.
      if (CozyBridge.saving) {
        CozyBridge.pendingSave = { key: key, text: text };
        return;
      }
      CozyBridge.saving = true;
      var done = function () {
        CozyBridge.saving = false;
        var next = CozyBridge.pendingSave;
        CozyBridge.pendingSave = null;
        if (next) CozyBridge.save(next.key, next.text);
      };
      try {
        Promise.resolve(b.storage.set(key, text))
          .catch(function (err) { console.warn('CozyBridge: Bridge.storage rejected a progress save', err); })
          .then(done, done);
      } catch (err) {
        console.warn('CozyBridge: storage.set failed', err);
        done();
      }
    },
  },

  /** 1 when the Bridge is up; also subscribes to its audio / pause / ad events. Call once. */
  CozyBridge_Init: function () {
    var b = CozyBridge.b();
    if (!b) return 0;
    var E = b.EVENT_NAME;
    try {
      b.on(E.AUDIO_STATE_CHANGED, function (enabled) { CozyBridge.send('OnBridgeAudio', enabled ? '1' : '0'); });
      b.on(E.PAUSE_STATE_CHANGED, function (paused) { CozyBridge.send('OnBridgePause', paused ? '1' : '0'); });
      b.on(E.INTERSTITIAL_STATE_CHANGED, function (state) { CozyBridge.send('OnBridgeInterstitial', String(state)); });
      b.on(E.REWARDED_STATE_CHANGED, function (state) { CozyBridge.send('OnBridgeRewarded', String(state)); });
    } catch (err) {
      console.warn('CozyBridge: subscribing to events failed', err);
    }
    return 1;
  },

  CozyBridge_PlatformId: function () {
    var b = CozyBridge.b();
    return CozyBridge.str(b && b.platform ? b.platform.id : '');
  },

  CozyBridge_Language: function () {
    var b = CozyBridge.b();
    return CozyBridge.str(b && b.platform ? b.platform.language : '');
  },

  /** 1 = on, 0 = off, -1 = unknown. */
  CozyBridge_AudioEnabled: function () {
    var b = CozyBridge.b();
    if (!b || !b.platform || typeof b.platform.isAudioEnabled !== 'boolean') return -1;
    return b.platform.isAudioEnabled ? 1 : 0;
  },

  CozyBridge_RewardedSupported: function () {
    var b = CozyBridge.b();
    return b && b.advertisement && b.advertisement.isRewardedSupported ? 1 : 0;
  },

  CozyBridge_SetLoadingProgress: function (percent) {
    var b = CozyBridge.b();
    try {
      if (b && typeof b.setGameLoadingProgress === 'function') b.setGameLoadingProgress(percent);
    } catch (e) {}
  },

  /** name: a PLATFORM_MESSAGE key such as GAME_READY, GAMEPLAY_STARTED, GAMEPLAY_STOPPED. */
  CozyBridge_SendMessage: function (namePtr) {
    var b = CozyBridge.b();
    var name = UTF8ToString(namePtr);
    if (!b) return;
    try {
      var msg = b.PLATFORM_MESSAGE && b.PLATFORM_MESSAGE[name];
      if (msg) b.platform.sendMessage(msg);
    } catch (err) {
      console.warn('CozyBridge: ' + name + ' failed', err);
    }
  },

  CozyBridge_ShowInterstitial: function () {
    var b = CozyBridge.b();
    try {
      if (b) b.advertisement.showInterstitial();
    } catch (err) {
      console.warn('CozyBridge: showInterstitial failed', err);
    }
  },

  /** Returns 0 when the call threw (the C# side then reports a failed ad itself). */
  CozyBridge_ShowRewarded: function () {
    var b = CozyBridge.b();
    try {
      if (!b) return 0;
      b.advertisement.showRewarded();
      return 1;
    } catch (err) {
      console.warn('CozyBridge: showRewarded failed', err);
      return 0;
    }
  },

  /** Answers with OnBridgeStorage("1" + data) or OnBridgeStorage("0") within timeoutMs, exactly once. */
  CozyBridge_StorageGet: function (keyPtr, timeoutMs) {
    var key = UTF8ToString(keyPtr);
    var b = CozyBridge.b();
    var answered = false;
    var answer = function (data) {
      if (answered) return;
      answered = true;
      CozyBridge.send('OnBridgeStorage', typeof data === 'string' && data.length > 0 ? '1' + data : '0');
    };
    if (!b) return answer(null);
    // A platform whose SDK never came up can leave this promise pending forever; don't hold the game hostage.
    setTimeout(function () { answer(null); }, timeoutMs);
    try {
      Promise.resolve(b.storage.get(key, false)).then(answer, function (err) {
        console.warn('CozyBridge: Bridge.storage.get failed', err);
        answer(null);
      });
    } catch (err) {
      console.warn('CozyBridge: storage.get threw', err);
      answer(null);
    }
  },

  CozyBridge_StorageSet: function (keyPtr, textPtr) {
    CozyBridge.save(UTF8ToString(keyPtr), UTF8ToString(textPtr));
  },
};

autoAddDeps(CozyBridgeLib, '$CozyBridge');
mergeInto(LibraryManager.library, CozyBridgeLib);
