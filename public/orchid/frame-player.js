/** @fileoverview Keep the orchid and its tracking ink on one decoded frame clock. */
import { avc, compact as small, hevc, mobile } from './frame-index.js';

/** Decode the existing film samples and paint each frame with its annotations. */
export async function playOrchidFrames(canvas, { compact, signal, present }) {
  // oxlint-disable-next-line rayhanadev/no-throw -- The caller switches playback engines when this browser lacks WebCodecs.
  if (!window.VideoDecoder) throw new Error('Frame decoding is unavailable');
  let lastError;
  for (const track of [compact ? small : mobile, hevc, avc]) {
    signal.throwIfAborted();
    // oxlint-disable-next-line rayhanadev/no-try-catch -- A codec can report support and still fail to decode this particular stream.
    try {
      const config = {
        codec: track.codec, codedWidth: track.width, codedHeight: track.height,
        optimizeForLatency: true,
      };
      if (track.description) config.description = Uint8Array.from(atob(track.description), byte => byte.charCodeAt(0));
      const { supported } = await VideoDecoder.isConfigSupported(config);
      if (!supported) continue;
      // oxlint-disable-next-line rayhanadev/wrap-throwing-api -- The codec boundary catches network and URL failures and tries the next representation.
      const response = await fetch(new URL(track.file, import.meta.url), { signal });
      // oxlint-disable-next-line rayhanadev/no-throw -- A missing representation should select the next codec.
      if (!response.ok) throw new Error(`Could not load ${track.file}: ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.length < track.sizes.reduce((length, size) => length + size, track.offset)) {
        // oxlint-disable-next-line rayhanadev/no-throw -- Reject truncated data before passing samples to the native decoder.
        throw new Error(`Incomplete orchid film: ${track.file}`);
      }
      signal.throwIfAborted();
      canvas.width = track.width;
      canvas.height = track.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      await paint(ctx, track, config, data, { signal, present });
      return;
    } catch (error) {
      signal.throwIfAborted();
      lastError = error;
    }
  }
  // oxlint-disable-next-line rayhanadev/no-throw -- The caller handles a terminal codec failure as a rejected promise.
  throw lastError ?? new Error('No supported orchid codec');
}

function paint(ctx, track, config, data, { signal, present }) {
  const count = track.sizes.length;
  const interval = 1000 / track.fps;
  const keys = new Set(track.keys);
  // oxlint-disable-next-line rayhanadev/no-promise-reject -- Native decoder and drawing callbacks must reject the same playback promise.
  return new Promise((resolve, reject) => {
    const ready = [];
    let decoder, raf = 0, due, stopped = false;
    let packet = 0, offset = track.offset, cycle = 0, outstanding = 0;

    function stop(error) {
      if (stopped) return;
      stopped = true;
      signal.removeEventListener('abort', abort);
      cancelAnimationFrame(raf);
      for (const frame of ready) frame.close();
      ready.length = 0;
      if (decoder && decoder.state !== 'closed') decoder.close();
      if (error) reject(error);
      else resolve();
    }

    function abort() { stop(signal.reason); }

    function fill() {
      // Bound both decoded surfaces and compressed chunks awaiting output. Leave
      // enough frames for the H.264 decoder to reorder B-frames into display order.
      while (outstanding < 12) {
        const size = track.sizes[packet];
        const index = track.order ? track.order[packet] : packet;
        const timestamp = Math.round((cycle * count + index) * interval * 1000);
        decoder.decode(new EncodedVideoChunk({
          type: keys.has(packet) ? 'key' : 'delta', timestamp,
          data: data.subarray(offset, offset + size),
        }));
        offset += size;
        packet++;
        outstanding++;
        if (packet === count) {
          packet = 0;
          offset = track.offset;
          cycle++;
        }
      }
    }

    function tick(now) {
      raf = 0;
      // oxlint-disable-next-line rayhanadev/no-try-catch -- Frame submission can fail asynchronously after the player promise starts.
      try {
        due ??= now;
        if (now >= due) {
          const elapsed = Math.floor((now - due) / interval) + 1;
          const take = Math.min(elapsed, ready.length);
          for (let i = 1; i < take; i++) ready.shift().close();
          const frame = ready.shift();
          try {
            ctx.drawImage(frame, 0, 0);
            const index = Math.round(frame.timestamp / (1000 * interval)) % count;
            present(index / track.fps);
          } finally {
            frame.close();
          }
          outstanding -= take;
          due = elapsed > take ? now + interval : due + take * interval;
          if (!stopped) fill();
        }
        if (!stopped && ready.length) raf = requestAnimationFrame(tick);
      } catch (error) {
        stop(error);
      }
    }

    // oxlint-disable-next-line rayhanadev/no-try-catch -- A WebCodecs initialization failure must release the decoder and its pending frames.
    try {
      decoder = new VideoDecoder({
        output(frame) {
          if (stopped) { frame.close(); return; }
          ready.push(frame);
          if (!raf) raf = requestAnimationFrame(tick);
        },
        error: stop,
      });
      signal.addEventListener('abort', abort, { once: true });
      decoder.configure(config);
      fill();
    } catch (error) {
      stop(error);
    }
  });
}
