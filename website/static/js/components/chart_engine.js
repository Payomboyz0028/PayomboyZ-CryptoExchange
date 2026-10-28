/**
 * chart_engine.js - Pure HTML5 Canvas Financial Area & Donut Chart Renderer
 * High-DPI / Retina Crisp Display & Dynamic Responsive Auto-Resize
 * Zero external CDN dependencies - 100% self-contained, air-gapped secure.
 */

class PureChartEngine {
  static _activeCharts = new Map();
  static _resizeBound = false;

  static initResizeListener() {
    if (this._resizeBound) return;
    this._resizeBound = true;

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.reRenderAll();
      }, 150);
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.reRenderAll();
      }, 200);
    });
  }

  static reRenderAll() {
    this._activeCharts.forEach((config, canvasId) => {
      const el = document.getElementById(canvasId);
      if (!el || el.offsetParent === null) return;
      if (config.type === 'area') {
        this.renderAreaChart(canvasId, config.labels, config.dataPoints, config.strokeColor, config.fillColor, false);
      } else if (config.type === 'donut') {
        this.renderDonutChart(canvasId, config.segments, false);
      }
    });
  }

  static renderAreaChart(canvasId, labels, dataPoints, strokeColor = '#ffdf73', fillColor = 'rgba(212, 175, 55, 0.15)', cache = true) {
    this.initResizeListener();
    if (cache) {
      this._activeCharts.set(canvasId, {
        type: 'area',
        labels: labels ? [...labels] : [],
        dataPoints: dataPoints ? [...dataPoints] : [],
        strokeColor,
        fillColor
      });
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const containerWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 600;
    const width = Math.max(containerWidth, 200);
    
    // Responsive height
    const isMobile = window.innerWidth <= 600;
    const height = isMobile ? 200 : 240;

    // High DPI Canvas Scaling
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);
    if (!dataPoints || dataPoints.length === 0) return;

    const paddingLeft = isMobile ? 32 : 40;
    const paddingRight = isMobile ? 12 : 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const chartW = width - (paddingLeft + paddingRight);
    const chartH = height - (paddingTop + paddingBottom);
    const maxVal = Math.max(...dataPoints, 100);
    const minVal = 0;

    // Draw horizontal grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = paddingTop + (chartH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      const val = Math.round(maxVal - (maxVal / 3) * i);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      const labelText = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toString();
      ctx.fillText(labelText, paddingLeft - 6, y + 3);
    }

    const count = dataPoints.length;

    if (count === 1) {
      // Single data point resilience: draw horizontal plateau line and area fill across chart
      const val = dataPoints[0];
      const ptY = paddingTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

      ctx.beginPath();
      ctx.moveTo(paddingLeft, paddingTop + chartH);
      ctx.lineTo(paddingLeft, ptY);
      ctx.lineTo(width - paddingRight, ptY);
      ctx.lineTo(width - paddingRight, paddingTop + chartH);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartH);
      grad.addColorStop(0, fillColor);
      grad.addColorStop(1, 'rgba(5, 11, 20, 0)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(paddingLeft, ptY);
      ctx.lineTo(width - paddingRight, ptY);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isMobile ? 2 : 2.5;
      ctx.stroke();

      const midX = paddingLeft + chartW / 2;
      ctx.beginPath();
      ctx.arc(midX, ptY, isMobile ? 3 : 4, 0, Math.PI * 2);
      ctx.fillStyle = '#050b14';
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      if (labels && labels[0]) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = isMobile ? '9px Inter, sans-serif' : '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[0], midX, height - 8);
      }
      return;
    }

    const stepX = chartW / Math.max(count - 1, 1);
    const points = dataPoints.map((val, idx) => ({
      x: paddingLeft + idx * stepX,
      y: paddingTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH
    }));

    // Area Gradient Fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, paddingTop + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, paddingTop + chartH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartH);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(1, 'rgba(5, 11, 20, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line Stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isMobile ? 2 : 2.5;
    ctx.stroke();

    // Adaptive label & milestone dot skipping (handles 7-day, 15-day, or 31-day data without overlapping)
    let stepLabelSkip = 1;
    if (count > 20) {
      stepLabelSkip = Math.max(2, Math.floor(count / 6));
    } else if (count > 10) {
      stepLabelSkip = 2;
    } else if (isMobile && count > 5) {
      stepLabelSkip = 2;
    }

    points.forEach((p, idx) => {
      const isMilestone = (idx % stepLabelSkip === 0 || idx === count - 1 || (dataPoints[idx] === maxVal && maxVal > 0));
      
      // Draw point dot on milestones and peak values
      if (isMilestone) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, isMobile ? 3 : 4, 0, Math.PI * 2);
        ctx.fillStyle = '#050b14';
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      if (labels && labels[idx] && (idx % stepLabelSkip === 0 || idx === count - 1)) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = isMobile ? '9px Inter, sans-serif' : '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[idx], p.x, height - 8);
      }
    });
  }

  static renderDonutChart(canvasId, segments, cache = true) {
    this.initResizeListener();
    if (cache) {
      this._activeCharts.set(canvasId, {
        type: 'donut',
        segments: segments ? JSON.parse(JSON.stringify(segments)) : []
      });
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const containerW = canvas.parentElement ? canvas.parentElement.clientWidth : 240;
    const size = Math.min(Math.max(containerW, 160), 220);

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, size, size);

    const total = segments ? segments.reduce((sum, s) => sum + s.value, 0) : 0;
    if (total === 0) return;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size * 0.42;
    const innerRadius = radius * 0.65;

    let currentAngle = -Math.PI / 2;

    segments.forEach(seg => {
      const sliceAngle = (seg.value / total) * (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      currentAngle += sliceAngle;
    });

    // Inner Cutout
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius - 1, 0, Math.PI * 2);
    ctx.fillStyle = '#0b192c';
    ctx.fill();

    // Center Percentage
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('100%', centerX, centerY);
  }
}

window.PureChartEngine = PureChartEngine;
