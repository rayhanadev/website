(() => {
  const word = document.querySelector('.family');
  const origin = word.querySelector('.glyph-origin');
  const gauge = origin.querySelector('.a-width');
  const text = word.firstChild;
  const index = text.textContent.indexOf('a');
  const range = document.createRange();
  range.setStart(text, index);
  range.setEnd(text, index + 1);

  function measure() {
    // Locate the letter inside the fully shaped word, preserving its kerning.
    const offset = range.getBoundingClientRect().left - origin.getBoundingClientRect().left;
    const width = gauge.getBoundingClientRect().width;
    gauge.style.setProperty('--glyph-start', offset + 'px');
    gauge.dataset.value = String(Number(width.toFixed(1)));
  }

  new ResizeObserver(measure).observe(word);
  document.fonts.ready.then(measure);
})();
