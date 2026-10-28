/**
 * number_ticker.js - Number Ticker Animation (MagicUI Style)
 */
function animateValue(element, start, end, duration = 1200, isCurrency = true) {
  if (!element) return;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease Out Cubic
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * easeProgress;

    if (isCurrency) {
      element.textContent = '฿' + current.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      element.textContent = Math.floor(current).toLocaleString('th-TH');
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

window.animateValue = animateValue;
