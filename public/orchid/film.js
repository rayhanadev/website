(() => {
  const sheet = document.querySelector('main');
  const video = sheet.querySelector('.specimen-film');
  const tracker = sheet.querySelector('.tracking');
  const registration = sheet.querySelector('.plate-origin');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cycle = 8;
  const trackingFps = 12;
  const [hdSource, source] = video.querySelectorAll('source');
  let loading;
  const imageFirst = matchMedia('(pointer: coarse)').matches;
  let videoUnavailable = false;
  let frameDecoderFailed = false;
  let loopController;
  let playAttempt = 0;
  let lastTrackingFrame = -1;
  let layout, presentedAt = 0, callbackId = 0, manual = false;
  const nativeFrames = Boolean(video.requestVideoFrameCallback && video.cancelVideoFrameCallback);
  video.defaultMuted = video.muted = true;

  function register() {
    const box = sheet.getBoundingClientRect();
    const art = getComputedStyle(registration);
    const artWidth = parseFloat(art.width);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    layout = {width:box.width, height:box.height, dpr,
      ox:parseFloat(art.left), oy:parseFloat(art.top), scale:artWidth/1024,
      mobile:art.getPropertyValue('--stacked').trim() === '1' || artWidth < 330,
      mapPoint:window.orchidMapPoint};
    const width = Math.round(box.width*dpr), height = Math.round(box.height*dpr);
    if (tracker.width!==width || tracker.height!==height) {
      tracker.width=width;
      tracker.height=height;
    }
    draw(presentedAt, true);
  }
  function draw(seconds, force = false) {
    presentedAt=seconds;
    // Media timestamps are rounded to microseconds. Sample once per pair of 24 fps frames.
    const index = Math.floor(seconds * trackingFps + .00001) % (cycle * trackingFps);
    if (!layout || (!force && index === lastTrackingFrame)) return;
    const sampleTime = index / trackingFps;
    drawMeasurements(sampleTime / cycle);
    window.drawOrchidTracks(tracker, sampleTime, layout);
    lastTrackingFrame = index;
  }
  function cancelFrame() {
    if (callbackId) {
      if (nativeFrames) video.cancelVideoFrameCallback(callbackId);
      else cancelAnimationFrame(callbackId);
      callbackId=0;
    }
  }
  function requestFrame() {
    if (callbackId || manual || video.paused || reduced.matches || document.hidden) return;
    if (nativeFrames) {
      callbackId=video.requestVideoFrameCallback((_now, frame) => {
        callbackId=0;
        draw(frame.mediaTime);
        requestFrame();
      });
    } else {
      callbackId=requestAnimationFrame(() => {
        callbackId=0;
        draw(video.currentTime);
        requestFrame();
      });
    }
  }
  function stopImageLoop() {
    if (!loopController) return;
    loopController.abort();
    loopController = null;
    draw(0);
  }

  async function startImageLoop() {
    const controller = new AbortController();
    const { signal } = controller;
    loopController = controller;
    const canvas = document.createElement('canvas');
    canvas.className = 'specimen-loop';
    video.classList.remove('is-ready');
    draw(0);
    signal.addEventListener('abort', () => canvas.remove(), { once: true });
    function present(seconds) {
      if (!canvas.isConnected) video.after(canvas);
      draw(seconds);
    }
    if (!frameDecoderFailed) {
      // oxlint-disable-next-line rayhanadev/no-try-catch -- Switch to native playback if the browser cannot decode the indexed frames.
      try {
        // oxlint-disable-next-line rayhanadev/wrap-throwing-api -- The surrounding catch also handles failure to load the optional player.
        const { playOrchidFrames } = await import('./frame-player.js');
        if (signal.aborted) return;
        await playOrchidFrames(canvas, {
          compact: !imageFirst || Boolean(navigator.connection?.saveData), signal, present,
        });
        return;
      } catch {
        if (signal.aborted) return;
        frameDecoderFailed = true;
        if (!videoUnavailable) {
          playback();
          return;
        }
      }
    }

    // Older engines can decode a paused film on seek even when autoplay is disabled.
    // Copy the decoded image and its timestamp together, just as on the WebCodecs path.
    // oxlint-disable-next-line rayhanadev/no-try-catch -- Keep the still on screen if the native media loader also fails.
    try { await loadFilm(); } catch { return; }
    if (signal.aborted) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let timer;
    function copyFrame() {
      ctx.drawImage(video, 0, 0);
      present(video.currentTime);
      timer = setTimeout(() => {
        const next = Math.round(video.currentTime * trackingFps) + 1;
        video.currentTime = (next / trackingFps) % cycle;
      }, 1000 / trackingFps);
    }
    video.addEventListener('seeked', copyFrame, { signal });
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    if (!video.seeking) copyFrame();
  }

  function setSources() {
    if (source.hasAttribute('src')) return;
    const displayPixels = registration.getBoundingClientRect().width * (window.devicePixelRatio || 1);
    if (displayPixels > 1024 && !navigator.connection?.saveData) {
      hdSource.src = hdSource.dataset.src;
    }
    source.src = source.dataset.src;
    video.load();
  }

  /** Load a frame for export even when the film is paused. */
  function loadFilm() {
    if (video.readyState >= 2) return Promise.resolve();
    if (loading) return loading;
    // oxlint-disable-next-line rayhanadev/no-promise-reject -- Failed decoding must reject the public ready and seek promises.
    loading = new Promise((resolve, reject) => {
      const loaded = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error('Orchid film failed to decode'));
      };
      function cleanup() {
        video.removeEventListener('loadeddata', loaded);
        video.removeEventListener('canplay', loaded);
        video.removeEventListener('error', failed);
        source.removeEventListener('error', failed);
      }
      video.addEventListener('loadeddata', loaded);
      video.addEventListener('canplay', loaded);
      video.addEventListener('error', failed);
      source.addEventListener('error', failed);
      video.preload = 'auto';
      setSources();
    });
    return loading;
  }

  function playback() {
    const attempt = ++playAttempt;
    cancelFrame();
    stopImageLoop();
    if (manual || document.hidden || reduced.matches) {
      video.pause();
      if (reduced.matches && !manual) {
        video.classList.remove('is-ready');
        if (video.readyState >= 2 && video.currentTime > 0) video.currentTime = 0;
        draw(0);
      }
      return;
    }
    if ((imageFirst && !frameDecoderFailed) || videoUnavailable) {
      void startImageLoop();
      return;
    }
    setSources();
    // oxlint-disable-next-line rayhanadev/no-promise-catch -- A rejected media promise selects the image version of the film.
    video.play().then(() => {
      if (attempt !== playAttempt || manual) return;
      video.classList.add('is-ready');
      requestFrame();
    }, error => {
      if (attempt === playAttempt && !manual && (error.name === 'NotAllowedError' || error.name === 'NotSupportedError')) {
        videoUnavailable = true;
        void startImageLoop();
      }
    });
  }
  async function seek(seconds) {
    manual=true;
    stopImageLoop();
    cancelFrame(); video.pause();
    await loadFilm();
    video.classList.add('is-ready');
    const t=(seconds%cycle+cycle)%cycle;
    if (Math.abs(video.currentTime-t)>.0001 || video.seeking) {
      const settled=new Promise(resolve => video.addEventListener('seeked',resolve,{once:true}));
      video.currentTime=t;
      await settled;
    }
    draw(t);
  }

  function restart() {
    manual=false;
    cancelFrame();
    if (video.readyState>=2) video.currentTime=0;
    draw(0);
    playback();
  }
  window.orchidFilm = {
    get ready() { return reduced.matches && !manual ? Promise.resolve() : loadFilm(); },
    seek, restart, duration: cycle
  };
  register();
  new ResizeObserver(register).observe(sheet);
  video.addEventListener('playing', requestFrame);
  reduced.addEventListener('change',playback);
  document.addEventListener('visibilitychange',playback);
  playback();
})();
