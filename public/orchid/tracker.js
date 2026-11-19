(() => {
  // Three contours from the print, each on a separate blossom. The rig maps
  // these same vertices into every detector frame.
  const petals = [
    { id: 1, name: 'PETAL L', contour: [[31,401],[60,313],[141,215],[207,156],[249,164],[277,204],[274,281],[251,304],[166,359],[148,431],[99,492],[61,475],[37,439]] },
    { id: 6, name: 'DORSAL SEPAL', contour: [[325,779],[350,732],[388,700],[433,685],[479,687],[516,721],[550,778],[510,813],[490,900],[462,976],[413,989],[393,944],[383,849]] },
    { id: 5, name: 'SIDE PETAL', reversed: true, contour: [[720,417],[751,382],[788,372],[820,382],[867,420],[905,487],[941,563],[949,602],[942,651],[905,696],[874,708],[843,656],[830,593],[801,541],[732,514]] }
  ];
  const paper = '#fbfbf7', black = '#171816', cobalt = '#2447d6';
  const cycle = 8;
  const scoreHold = 2;

  function extent(petal, seconds, view) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const [u, v] of petal.contour) {
      const [x, y] = view.mapPoint(u, v, seconds / cycle, petal.id);
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, y);
      b = Math.max(b, y);
    }
    return {
      l: view.ox + l * view.scale, t: view.oy + t * view.scale,
      r: view.ox + r * view.scale, b: view.oy + b * view.scale
    };
  }

  function area(box) {
    return Math.max(0, box.r - box.l) * Math.max(0, box.b - box.t);
  }

  function overlap(a, b) {
    return area({
      l: Math.max(a.l, b.l), t: Math.max(a.t, b.t),
      r: Math.min(a.r, b.r), b: Math.min(a.b, b.b)
    });
  }

  /**
   * Measure how much of the contour's envelope is in view, and how well it
   * overlaps the one detected three samples earlier. Reading from film time
   * also reproduces the same score after seeking or looping.
   */
  function quality(petal, seconds, view) {
    const current = extent(petal, seconds, view);
    const previous = extent(petal, (seconds + cycle - .25) % cycle, view);
    const common = overlap(current, previous);
    const continuity = common / (area(current) + area(previous) - common);
    const onPaper = overlap(current, {l:0, t:0, r:view.width, b:view.height}) / area(current);
    return Math.sqrt(continuity * onPaper).toFixed(2);
  }

  function displayBounds(box, view) {
    const l = Math.max(1, Math.round(box.l) - 1);
    const r = Math.min(view.width - 1, Math.round(box.r) + 1);
    const t = Math.max(1, Math.round(box.t) - 1);
    const b = Math.min(view.height - 1, Math.round(box.b) + 1);
    return {l,r,t,b};
  }

  function traceCorners(ctx, {l,r,t,b}) {
    const length = Math.min(13, Math.min(r-l,b-t) * .17);
    ctx.beginPath();
    for (const [x, y, sx, sy] of [[l,t,1,1],[r,t,-1,1],[r,b,-1,-1],[l,b,1,-1]]) {
      ctx.moveTo(x + sx * length, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * length);
    }
  }

  function drawTrack(ctx, petal, box, score, view, primary) {
    const {l,r,t,b} = box;
    const ink = petal.reversed ? paper : black;
    const counter = petal.reversed ? black : paper;
    if (primary) {
      ctx.strokeStyle = paper;
      ctx.globalAlpha = .55;
      ctx.lineWidth = 2;
      ctx.strokeRect(l, t, r-l, b-t);
      ctx.strokeStyle = cobalt;
      ctx.globalAlpha = .95;
      ctx.lineWidth = 1;
      ctx.strokeRect(l, t, r-l, b-t);
    } else {
      traceCorners(ctx, box);
      ctx.strokeStyle = counter;
      ctx.globalAlpha = .7;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const font = view.mobile ? 9 : 10;
    const height = font + 4;
    const label = petal.name + '  ' + score;
    ctx.font = '500 ' + font + 'px "SFMono-Regular", Consolas, monospace';
    ctx.textBaseline = 'middle';
    const width = Math.ceil(ctx.measureText(label).width) + 8;
    const x = Math.max(1, Math.min(l, view.width - width - 1));
    const y = t > height ? t - height : t;
    ctx.globalAlpha = 1;
    ctx.fillStyle = primary ? cobalt : counter;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = primary ? paper : ink;
    ctx.fillText(label, x + 4, y + height * .52);
  }

  let lastLayout, lastRead, scores;
  window.drawOrchidTracks = (canvas, sampleTime, view) => {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    const read = Math.floor(sampleTime / scoreHold) * scoreHold;
    if (view !== lastLayout || read !== lastRead) {
      scores = petals.map(petal => quality(petal, read, view));
      lastLayout = view;
      lastRead = read;
    }
    const limit = view.mobile ? 2 : 3;
    let drawn = 0;
    for (const [index, petal] of petals.entries()) {
      const box = displayBounds(extent(petal, sampleTime, view), view);
      if (box.r - box.l < 10 || box.b - box.t < 10) continue;
      drawTrack(ctx, petal, box, scores[index], view, drawn === 0);
      if (++drawn === limit) break;
    }
  };
})();
