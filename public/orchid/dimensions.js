// The illustration is registered to the 1024-pixel width of the source print.
const sheet = document.querySelector('main');
const plate = sheet.querySelector('.specimen');
const overlay = sheet.querySelector('.drafting');
const afterhours = sheet.querySelector('.callout a');
const captionBaseline = afterhours.querySelector('.type-baseline');
const family = sheet.querySelector('.family');
const typeGauge = sheet.querySelector('.type-gauge');

let measurementLayout;
let measurementPhase = 0;

function registerMeasurements() {
  typeGauge.dataset.value = Number(typeGauge.getBoundingClientRect().height.toFixed(1));
  const sheetBox = sheet.getBoundingClientRect();
  const registration = getComputedStyle(plate.querySelector('.plate-origin'));
  const w = sheetBox.width, h = sheetBox.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(w * dpr), height = Math.round(h * dpr);
  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width;
    overlay.height = height;
  }
  const scale = parseFloat(registration.width) / 1024;
  const ox = parseFloat(registration.left), oy = parseFloat(registration.top);
  const mobile = registration.getPropertyValue('--stacked').trim() === '1';
  const crop = (h - oy) / scale;
  const topEdge = -oy / scale;
  const caption = afterhours.getBoundingClientRect();
  const baselineY = captionBaseline.getBoundingClientRect().bottom;
  const underline = parseFloat(getComputedStyle(afterhours).textUnderlineOffset);
  if (mobile) {
    sheet.style.setProperty('--caption-descent', (caption.bottom - baselineY) + 'px');
  }
  const ctx = overlay.getContext('2d');
  const measureFont = size => {
    const css = '400 ' + size + 'px "Courier New", monospace';
    ctx.font = css;
    return {size, css, advance:ctx.measureText('0').width};
  };
  // Register the lowest printed letter, including the y below the surname baseline.
  const familyStyle = getComputedStyle(family);
  ctx.font = familyStyle.fontWeight + ' ' + familyStyle.fontSize + ' ' + familyStyle.fontFamily;
  const descender = ctx.measureText(family.textContent.trim()).actualBoundingBoxDescent;
  const familyBaseline = family.querySelector('.type-baseline').getBoundingClientRect().bottom;
  const nameGap = Math.max(8, Math.min(20, parseFloat(familyStyle.fontSize) * .15));
  const nameStopY = (familyBaseline + descender + nameGap - sheetBox.top - oy) / scale;
  const labelSize = (mobile ? 8 : 10) / scale;
  // Leave a small break in the drafting ink around the actual printed words.
  const clearInk = mobile ? '.given, .family, .callout p, .ring svg' : '.given, .family, .callout p';
  const clearances = Array.from(sheet.querySelectorAll(clearInk), word => {
    const box = word.getBoundingClientRect();
    return [box.left - sheetBox.left - 4, box.top - sheetBox.top - 2, box.width + 8, box.height + 4];
  });
  measurementLayout = {
    clearances,
    dpr, scale, ox, oy, mobile, crop, topEdge, nameStopY,
    mainLabel:measureFont(labelSize),
    fineLabel:measureFont(labelSize * (mobile ? .9 : .82)),
    leftEdge: -ox / scale, rightEdge: (w - ox) / scale,
    captionTop: (afterhours.parentElement.getBoundingClientRect().top - sheetBox.top - oy) / scale,
    ringLeft: (sheet.querySelector('.ring').getBoundingClientRect().left - sheetBox.left - ox) / scale,
    captionRight: (caption.right - sheetBox.left - ox) / scale,
    captionRuleY: (baselineY + underline + .5 - sheetBox.top - oy) / scale
  };

  // Express the torn ink edge and its loose cells on the same square grid.
  const unit = 38;
  const cellSize = unit * scale;
  const gridX = ox + 250 * scale;
  const gridY = oy + 64 * scale;
  // On iOS the ink layer also covers the paper behind the browser controls.
  const bleed = sheetBox.top - plate.querySelector('.reversal').getBoundingClientRect().top;
  const topRow = Math.min(-10, Math.floor((-bleed - gridY) / cellSize) - 1);
  const lastRow = Math.max(35, Math.ceil((h + bleed - gridY) / cellSize) + 2);
  const gridPoint = (column, row) =>
    (gridX + column * cellSize).toFixed(2) + ' ' + (gridY + bleed + row * cellSize).toFixed(2);

  // Each row gives the first dark column. The paper cut and reversed ink share this edge.
  const topSlope = Math.max(0, Math.min(1, (oy / h - .036) / .14));
  // Let the lower diagonal end in a continuous paper margin for the footer.
  const captionEdge = caption.right - sheetBox.left + 16;
  const lastColumn = mobile ? Math.max(-5, Math.ceil((captionEdge - gridX) / cellSize)) : -5;
  function edgeColumn(row) {
    if (row < 0) {
      const shallow = row < -2 ? 2 : row === -2 ? 1 : 0;
      const steep = 1 - 2 * row;
      return Math.round(shallow + topSlope * (steep - shallow));
    }
    return row <= 14 ? row : Math.max(lastColumn, 28 - row);
  }

  const boundary = [gridPoint(edgeColumn(topRow), topRow)];
  for (let row = topRow + 1; row <= lastRow; row++) {
    const before = edgeColumn(row - 1), after = edgeColumn(row);
    if (after !== before) boundary.push(gridPoint(before, row), gridPoint(after, row));
  }
  boundary.push(gridPoint(edgeColumn(lastRow), lastRow));
  const edge = 'M' + (w * 1.1) + ' ' + (-h * .1) + 'L' + boundary.join('L') +
    'L' + (w * 1.1) + ' ' + (h * 1.15 + 2 * bleed) + 'Z';

  /**
   * The even-odd fill adds the loose squares on paper and cuts the holes
   * out of the dark side. Video passes through a single inversion layer.
   */
  function cellPaths(darkSide, placements) {
    return placements.map(([row, gap, size]) => {
      const first = edgeColumn(row), last = edgeColumn(row + size - 1);
      const column = darkSide ? Math.max(first, last) + gap : Math.min(first, last) - gap - size;
      if (mobile && !darkSide && gridX + column * cellSize < captionEdge &&
          gridY + (row + size) * cellSize > caption.top - sheetBox.top - 20) return '';
      const side = (size * cellSize).toFixed(2);
      return 'M' + gridPoint(column, row) + 'h' + side + 'v' + side + 'h-' + side + 'Z';
    }).join('');
  }
  const pieces = cellPaths(false, [[0,1,1],[4,1,1],[7,2,1],[10,1,1],[14,1,2],[20,2,1],[30,1,1]]);
  const cuts = cellPaths(true, [[1,1,1],[6,1,1],[10,2,1],[21,1,2],[29,1,1]]);
  plate.style.setProperty('--steps', 'path("' + edge + '")');
  plate.style.setProperty('--ink-shape', 'path(evenodd, "' + edge + pieces + cuts + '")');

  drawMeasurements();
}

function drawMeasurements(phase = measurementPhase) {
  measurementPhase = phase;
  const {dpr, scale, ox, oy, mobile, crop, leftEdge, rightEdge, topEdge, nameStopY, captionRight, captionRuleY} = measurementLayout;
  const ctx = overlay.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,overlay.width,overlay.height);
  const cap = (mobile ? 3 : 4) / scale;
  const {mainLabel, fineLabel} = measurementLayout;
  const font = mainLabel.size;
  const labels = [];
  const on = (part, x, y) => window.orchidMapLandmark(x, y, phase, part);
  const upper = (x,y) => on('upper',x,y);
  const side = (x,y) => on('side',x,y);
  const lowerPetal = (x,y) => on('lower',x,y);
  const stem = (x,y) => on('stem',x,y);
  const bloom = upper(250,405), fork = stem(409,625), lower = lowerPetal(430,1080);
  const budA = on('bud',811,80), budB = on('tip',941,174);

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  ctx.strokeStyle = ctx.fillStyle = '#fff';
  function line(x1,y1,x2,y2,alpha=.49,weight=.64,dash=[]) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = weight / scale;
    ctx.setLineDash(dash.map(n => n / scale));
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }
  function arc(x,y,r,a,b,alpha=.64,weight=.8) {
    ctx.globalAlpha = alpha; ctx.lineWidth = weight / scale; ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x,y,r,a,b); ctx.stroke();
  }
  function text(value,x,y,angle=0,align='center') {
    labels.push({value,x,y,angle,align});
  }
  function witness(x1,y1,x2,y2) {
    line(x1,y1,x2,y2,.48,.58);
  }
  function section(x,y) {
    line(x - cap,y,x + cap,y,.86,.8);
    line(x,y - cap,x,y + cap,.86,.8);
  }
  function horizontal(left,right,y) {
    const value = String(Math.round(Math.abs(right-left)));
    line(left,y,right,y,.82,.85);
    [left,right].forEach(x => line(x,y-cap,x,y+cap,.89,.9));
    text(value,(left+right)/2,y - font*.38);
  }
  function vertical(x,top,bottom) {
    const value = String(Math.round(Math.abs(bottom-top)));
    line(x,top,x,bottom,.76,.8);
    [top,bottom].forEach(y => line(x-cap,y,x+cap,y,.86,.86));
    text(value,x-font*.45,(top+bottom)/2,-Math.PI/2);
  }

  // Project the extremes of the top petals onto a span above the plate.
  const upperLeft = upper(31,404), upperRight = upper(545,196), crest = upper(312,29);
  const upperY = Math.max(topEdge+font*1.7, crest[1] - (mobile ? 87 : 96));
  for (const [x,y] of [upperLeft,upperRight]) {
    witness(x,y,x,upperY-cap*2);
    section(x,y);
  }
  horizontal(upperLeft[0],upperRight[0],upperY);

  // The rails hold their position on paper while the flower's elevations change.
  const rail = Math.max(leftEdge + 34/scale, -26);
  const outer = Math.max(leftEdge + 11/scale, -208);
  for (const point of [crest,bloom,fork,lower]) {
    const [x,y] = point;
    if (y > crop - 8) continue;
    const start = point === bloom || point === lower ? outer : rail;
    witness(start-cap*2,y,x+cap*2,y);
    section(x,y);
  }
  vertical(rail,crest[1],bloom[1]);
  vertical(rail,bloom[1],fork[1]);
  if (crop > 1090) {
    vertical(rail,fork[1],lower[1]);
    vertical(outer,bloom[1],lower[1]);
  }

  // Dimension the bud spacing parallel to the line joining their centers.
  const dx = budB[0]-budA[0], dy = budB[1]-budA[1];
  const budDistance = Math.hypot(dx,dy);
  const nx = dy/budDistance, ny = -dx/budDistance;
  const offset = mobile ? 98 : 102;
  const ax = budA[0]+nx*offset, ay = budA[1]+ny*offset;
  const bx = budB[0]+nx*offset, by = budB[1]+ny*offset;
  for (const [x,y] of [budA,budB]) {
    witness(x,y,x+nx*(offset+cap*2),y+ny*(offset+cap*2));
    arc(x,y,cap*.7,0,2*Math.PI,.84,.8);
  }
  line(ax,ay,bx,by,.81,.88);
  line(...budA,...budB,.44,.6,[2,3]);
  text(String(Math.round(budDistance)),(ax+bx)/2+nx*font*.45,(ay+by)/2+ny*font*.45,Math.atan2(dy,dx));

  const budRail = Math.min(1056,rightEdge-15/scale);
  witness(budA[0]+cap,budA[1],budRail+cap*2,budA[1]);
  witness(budB[0]+cap,budB[1],budRail+cap*2,budB[1]);
  vertical(budRail,budA[1],budB[1]);

  // A second, offset pair of extensions picks up the side flower.
  const right = Math.min(1082,rightEdge-16/scale);
  const sideTop = side(714,280), sideBottom = side(774,652);
  for (const [x,y] of [sideTop,sideBottom]) {
    witness(x,y,right+cap*2,y);
    section(x,y);
  }
  vertical(right,sideTop[1],sideBottom[1]);

  // Show the flowering branch's present inclination to the horizontal.
  const branchTip = stem(589,551);
  const angle = Math.atan2(fork[1]-branchTip[1],branchTip[0]-fork[0]);
  const angleRadius = mobile ? 215 : 274;
  const arm = mobile ? 270 : 333;
  const cx = fork[0], cy = fork[1];
  line(cx-arm,cy,cx+15,cy,.76,.75);
  line(cx-arm*Math.cos(angle),cy+arm*Math.sin(angle),...branchTip,.76,.78);
  arc(cx,cy,angleRadius,Math.PI-angle,Math.PI,.88,.84);
  text((angle*180/Math.PI).toFixed(1),cx-(angleRadius+font*1.5)*Math.cos(angle/2),cy+(angleRadius+font*1.5)*Math.sin(angle/2));
  arc(cx,cy,cap,0,2*Math.PI,.90,.85);

  // Swing the bloom-center distance through the paper, as a compass would.
  // Open the compass from the fork to the lower bloom along the printed axis
  // as more of the plate fits. Both limits use the rig's actual landmarks.
  const ratio = (rightEdge-leftEdge)/(crop-topEdge);
  const ease = x => {
    const t = Math.max(0, Math.min(1, x));
    return t*t*(3-2*t);
  };
  const room = ease((ratio-.66)/.34) * ease((crop-995)/165);
  const sweepPoint = [fork[0]+room*(lower[0]-fork[0]), fork[1]+room*(lower[1]-fork[1])];
  const compassCap = (3+room)/scale;
  const vx = sweepPoint[0]-bloom[0], vy = sweepPoint[1]-bloom[1];
  const radius = Math.hypot(vx,vy);
  const theta = Math.atan2(vy,vx);
  const signedUnit = value => Math.max(-1, Math.min(1, value));
  const onRadius = (r, angle) => [bloom[0]+r*Math.cos(angle), bloom[1]+r*Math.sin(angle)];

  // Stop at the type's ink datum or the paper margin, whichever the sweep meets first.
  // Account for the projecting end tick as well as the circle's centerline.
  const stopHeight = nameStopY - bloom[1];
  const outerRadius = radius + compassCap;
  const typeStop = Math.PI - Math.asin(signedUnit(stopHeight / (stopHeight < 0 ? outerRadius : radius-compassCap)));
  const leftLimit = (leftEdge + 12/scale - bloom[0]) / outerRadius;
  // Ease past the circle's leftmost point as the whole radius clears the margin.
  const marginStop = Math.acos(signedUnit(leftLimit)) + .2*Math.PI*ease((-1-leftLimit)/.2);
  const end = Math.max(theta, Math.min(typeStop, marginStop));
  const mark = Math.min((158-11*room)*Math.PI/180, theta + .80*(end-theta));
  line(...bloom,...sweepPoint,.46,.68,[4,3]);
  arc(...bloom,radius,theta,end,.67,.86);
  for (const angle of [theta,end,mark]) line(...onRadius(radius-compassCap,angle),...onRadius(radius+compassCap,angle),.82,.84);
  const [lx,ly] = onRadius(radius-font*.9,mark);
  text('R '+Math.round(radius),lx,ly,mark-Math.PI/2);

  // Preserve the short upright on wide sheets. When the caption falls below
  // the circle, angle the leader from its baseline into the visible sweep.
  const startX = captionRight + 7/scale;
  const rise = 18/scale;
  const fromCaption = Math.atan2(captionRuleY-bloom[1], startX-bloom[0]);
  const baselineAngle = Math.PI - Math.asin(signedUnit((captionRuleY-rise-bloom[1])/radius));
  const rightLimit = Math.acos(signedUnit((startX+5/scale-bloom[0])/radius));
  const dockAngle = mobile ? Math.min(130*Math.PI/180, theta + .62*(end-theta)) :
    Math.max(theta, Math.min(end, rightLimit, Math.max(baselineAngle, Math.min(115*Math.PI/180, fromCaption))));
  const [tipX,tipY] = onRadius(radius,dockAngle);
  const leader = [[startX,captionRuleY]];
  if (mobile) {
    // Run around the lower blossom on the paper side before returning to the
    // compact compass. This keeps the leader visually separate from the stalk.
    const foot = lowerPetal(614,1300);
    const petalEdge = lowerPetal(49,1034);
    const outsideX = Math.max(leftEdge+8/scale, Math.min(tipX, petalEdge[0]-9/scale));
    const guardY = measurementLayout.captionTop-5/scale;
    const guardX = captionRight+6/scale;
    const outsideY = Math.min(guardY-18/scale, Math.max(tipY, foot[1]+12/scale));
    // A line through the caption's upper-right clearance corner determines the
    // shoulder. If the webring limits that run, rise first to clear the letters.
    const retreat = Math.max(0, guardX-outsideX);
    const needed = guardX + retreat * (captionRuleY-guardY)/(guardY-outsideY);
    const shoulder = Math.max(startX+6/scale, Math.min(needed, startX+32/scale, measurementLayout.ringLeft-6/scale));
    const exitY = retreat > 0 ? Math.min(captionRuleY, guardY + (shoulder-guardX)*(guardY-outsideY)/retreat) : captionRuleY;
    leader.push([shoulder,captionRuleY]);
    if (exitY < captionRuleY) leader.push([shoulder,exitY]);
    leader.push([outsideX,outsideY]);
  } else {
    const kneeX = Math.max(startX+5/scale, tipX - .75*Math.max(0, captionRuleY-tipY-rise));
    leader.push([kneeX,captionRuleY]);
  }
  leader.push([tipX,tipY]);
  const segments = [];
  for (let i=1; i<leader.length; i++) {
    const [x,y] = leader[i-1], [x2,y2] = leader[i];
    const dx=x2-x, dy=y2-y, length2=dx*dx+dy*dy;
    if (!length2) continue;
    segments.push({x,y,dx,dy,length2});
    line(x,y,x2,y2,.68,.8);
  }

  /**
   * Move a nearby numeral just clear of the leader. Its paper knockout must
   * not erase the junction or leave holes in the route through the calipers.
   */
  function labelPosition(x,y,angle,ink,size) {
    const inset = size*.32;
    const radius = Math.hypot(ink*.5 + size*.2, size*.56) + 2.4/scale;
    for (const segment of segments) {
      const u = x + Math.sin(angle)*inset - segment.x;
      const v = y - Math.cos(angle)*inset - segment.y;
      const t = Math.min(1,Math.max(0,(u*segment.dx + v*segment.dy)/segment.length2));
      const dx = u - t*segment.dx, dy = v - t*segment.dy;
      const distance2 = dx*dx+dy*dy;
      if (distance2 < radius*radius) {
        const distance = Math.sqrt(distance2);
        const nx = distance ? dx/distance : -segment.dy/Math.sqrt(segment.length2);
        const ny = distance ? dy/distance : segment.dx/Math.sqrt(segment.length2);
        x += nx*(radius-distance);
        y += ny*(radius-distance);
      }
    }
    return [x,y];
  }
  ctx.save(); ctx.fillStyle = '#fff'; ctx.globalAlpha = .92;
  ctx.fillRect(tipX-1.4/scale,tipY-1.4/scale,2.8/scale,2.8/scale);
  ctx.restore();

  // The lower flower is cropped differently on the two formats.
  if (crop > 1060) {
    const dimY = Math.min(mobile ? 1428 : 1175,crop-22/scale);
    const axisY = dimY-(mobile ? 59 : 49);
    const leftPetal = lowerPetal(49,1034), rightPetal = lowerPetal(790,1049);
    witness(...leftPetal,leftPetal[0],dimY+cap);
    witness(...rightPetal,rightPetal[0],dimY+cap);
    witness(lower[0],lower[1]+cap,lower[0],axisY+cap);
    horizontal(leftPetal[0],lower[0],axisY);
    horizontal(lower[0],rightPetal[0],axisY);
    horizontal(leftPetal[0],rightPetal[0],dimY);
    section(...leftPetal); section(...rightPetal);
  }

  // Local calipers. Coordinates refer to the same 1024 px source as the large spans.
  {
    const smallType = fineLabel.size;
    const fineCap = cap * .72;
    const localLabels = [];

    function measure(a, b, offset, strong = false, graduations = false) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      const ux = dx / length, uy = dy / length;
      const nx = -uy, ny = ux;
      const pad = Math.sign(offset) * fineCap * 1.5;
      const x1 = a[0] + nx * offset, y1 = a[1] + ny * offset;
      const x2 = b[0] + nx * offset, y2 = b[1] + ny * offset;
      for (const [x,y] of [a,b]) {
        line(x,y,x+nx*(offset+pad),y+ny*(offset+pad),.50,.57);
      }
      line(x1,y1,x2,y2,strong ? .87 : .7,strong ? .92 : .68);
      for (const [x,y] of [[x1,y1],[x2,y2]]) {
        line(x-nx*fineCap,y-ny*fineCap,x+nx*fineCap,y+ny*fineCap,.82,.77);
      }
      if (graduations) {
        const unit = mobile ? 40 : 20;
        for (let k=1; k*unit<length-fineCap; k++) {
          const x=x1+ux*k*unit, y=y1+uy*k*unit;
          const tick=fineCap*(k%5 === 0 ? 1.35 : .67);
          line(x,y,x+nx*tick,y+ny*tick,.64,.62);
        }
      }
      let turn=Math.atan2(dy,dx);
      if (turn > Math.PI/2) turn -= Math.PI;
      if (turn < -Math.PI/2) turn += Math.PI;
      const gap=smallType*.36;
      localLabels.push([String(Math.round(length)), (x1+x2)/2+Math.sin(turn)*gap,
        (y1+y2)/2-Math.cos(turn)*gap,turn,strong]);
    }

    /**
     * Project a horizontal or vertical extremum onto a common datum, so adjacent
     * measurements share the same baseline even when the petal tips are uneven.
     */
    function widthAt(a,b,y,strong=false,graduations=false) {
      const gap=Math.sign(y-a[1])*fineCap;
      line(...a,a[0],y+gap,.49,.58);
      line(...b,b[0],y+Math.sign(y-b[1])*fineCap,.49,.58);
      measure([a[0],y],[b[0],y],0,strong,graduations);
    }
    function heightAt(a,b,x,strong=false) {
      line(...a,x+Math.sign(x-a[0])*fineCap,a[1],.49,.58);
      line(...b,x+Math.sign(x-b[0])*fineCap,b[1],.49,.58);
      measure([x,a[1]],[x,b[1]],0,strong);
    }

    // Read off elevations against the longer of the two projection rails.
    if (crop > 1090 && !mobile) {
      for (let i = 1; bloom[1] + i * 25 < lower[1]; i++) {
        const y = bloom[1] + i * 25;
        const major = i % 4 === 0;
        const extent = (major ? 7.5 : 3.2) / scale;
        line(outer-extent,y,outer,y,major ? .72 : .53,major ? .75 : .55);
        if (major && i % 8 === 0) {
          localLabels.push([String(Math.round(y)), outer-extent-smallType*1.4, y+smallType*.26, 0, false]);
        }
      }
    }
    // Resolve the upper stem into its fork-to-fork length and inclination.
    const stemFork = stem(682,166);
    const stemAngle = Math.atan2(stemFork[0]-fork[0],fork[1]-stemFork[1]);
    const radiusMark = mobile ? 158 : 190;
    line(...fork,...stemFork,.58,.66,[4,3]);
    line(...fork,fork[0],fork[1]-radiusMark-cap*2,.65,.7);
    arc(...fork,radiusMark,-Math.PI/2,-Math.PI/2+stemAngle,.82,.82);
    const bisector = -Math.PI/2+stemAngle/2;
    localLabels.push([(stemAngle*180/Math.PI).toFixed(1),
      fork[0]+(radiusMark+smallType)*Math.cos(bisector),
      fork[1]+(radiusMark+smallType)*Math.sin(bisector), 0, true]);
    measure(fork,stemFork,mobile ? 52 : 85,true,true);

    // Local extension lines follow the petal feature they dimension.
    widthAt(upper(230,144),upper(395,132),crest[1]+54,true,true);
    heightAt(crest,upper(230,148),crest[0]-118);
    const column = upper(244,431);
    widthAt(upper(152,373),column,column[1]+60);
    widthAt(column,upper(309,387),column[1]+60);

    // Each bud is mounted to its own moving joint.
    measure(on('bud',746,99),on('bud',881,72),mobile ? 24 : 18,true);
    measure(on('tip',906,143),on('tip',975,200),mobile ? 31 : 25);
    const tipFork = stem(868,168);
    widthAt(stemFork,tipFork,stemFork[1]+(mobile ? 71 : 60),false,true);
    measure(stem(409,532),stem(441,538),mobile ? -38 : -32);
    measure(stem(414,622),stem(588,550),mobile ? 39 : 32,true,true);

    const sideNotch = side(727,404);
    widthAt(side(576,448),sideNotch,sideNotch[1]-78,false,true);
    widthAt(sideNotch,side(949,601),sideNotch[1]-78,false,true);
    heightAt(side(776,653),side(871,738),sideNotch[0]+(mobile ? 230 : 245));

    const lowerCrest = lowerPetal(434,686);
    if (crop > 820) {
      widthAt(lowerPetal(325,779),lowerCrest,lowerCrest[1]+130);
      widthAt(lowerCrest,lowerPetal(551,781),lowerCrest[1]+130);
    }
    if (crop > 1020) {
      heightAt(lowerCrest,lowerPetal(431,1007),lowerCrest[0]+(mobile ? 177 : 183));
    }

    const pin = (mobile ? 1.15 : 1.45) / scale;
    ctx.save(); ctx.globalAlpha = .84; ctx.fillStyle='#fff';
    for (const [x,y] of [stemFork,tipFork,column,sideNotch,lowerCrest]) {
      ctx.fillRect(x-pin/2,y-pin/2,pin,pin);
    }
    ctx.restore();

    // The subordinate values get a smaller type size than the overall spans.
    ctx.save();
    ctx.font = fineLabel.css;
    ctx.textBaseline='alphabetic'; ctx.textAlign='center';
    for (const [value,x,y,angle,strong] of localLabels) {
      const ink=value.length * fineLabel.advance;
      ctx.save(); ctx.translate(...labelPosition(x,y,angle,ink,smallType)); ctx.rotate(angle);
      ctx.clearRect(-ink/2-smallType*.12,-smallType*.76,ink+smallType*.24,smallType*.89);
      ctx.globalAlpha=strong ? .94 : .85;
      ctx.fillText(value,0,0); ctx.restore();
    }
    ctx.restore();
  }

  // Preserve optical space for the numerals where projection lines cross.
  ctx.font = mainLabel.css;
  ctx.textBaseline = 'alphabetic';
  for (const {value,x,y,angle,align} of labels) {
    const width=value.length * mainLabel.advance;
    ctx.save(); ctx.translate(...labelPosition(x,y,angle,width,font)); ctx.rotate(angle); ctx.textAlign=align;
    ctx.clearRect(-width/2 - font*.18,-font*.77,width+font*.36,font*.94);
    ctx.globalAlpha=.89; ctx.fillText(value,0,0); ctx.restore();
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const rect of measurementLayout.clearances) ctx.clearRect(...rect);
}

const dimensionsObserver = new ResizeObserver(registerMeasurements);
dimensionsObserver.observe(sheet);
dimensionsObserver.observe(afterhours);
dimensionsObserver.observe(typeGauge);
dimensionsObserver.observe(family);
registerMeasurements();
