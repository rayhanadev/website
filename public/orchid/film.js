(() => {
  const sheet = document.querySelector('main');
  const video = sheet.querySelector('.specimen-film');
  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'play-motion';
  playButton.textContent = 'Play motion';
  playButton.setAttribute('aria-label', 'Play orchid animation');
  playButton.hidden = true;
  sheet.append(playButton);
  const tracker = sheet.querySelector('.tracking');
  const registration = sheet.querySelector('.plate-origin');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cycle = 8;
  const trackingFps = 12;
  const [hdSource, source] = video.querySelectorAll('source');
  let loading;
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
  /**
   * Leave playback in charge of fetching the movie. A phone that blocks
   * autoplay can keep the printed frame until its owner presses Play.
   */
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
    if (manual || document.hidden || reduced.matches) {
      playButton.hidden = true;
      video.pause();
      if (reduced.matches && !manual) {
        video.classList.remove('is-ready');
        if (video.readyState >= 2 && video.currentTime > 0) video.currentTime = 0;
        draw(0);
      }
      return;
    }
    setSources();
    // Start inside the click event. Safari can withhold loadeddata until play()
    // and a later promise callback can lose the user's activation.
    // oxlint-disable-next-line rayhanadev/no-promise-catch -- Safari uses NotAllowedError to request a user gesture.
    video.play().then(() => {
      if (attempt !== playAttempt || manual) return;
      playButton.hidden = true;
      video.classList.add('is-ready');
      requestFrame();
    }, error => {
      if (attempt === playAttempt && !manual && error.name === 'NotAllowedError') {
        playButton.hidden = false;
      }
    });
  }
  async function seek(seconds) {
    manual=true;
    playButton.hidden=true;
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
  playButton.addEventListener('click', playback);
  video.addEventListener('playing', requestFrame);
  reduced.addEventListener('change',playback);
  document.addEventListener('visibilitychange',playback);
  playback();
})();
