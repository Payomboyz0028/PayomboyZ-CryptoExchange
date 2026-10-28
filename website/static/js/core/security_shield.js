/**
 * security_shield.js - Client-Side Fortress Defense
 * Layer 1: Anti-Console & DevTools Trapping (Debugger timing loop, keyboard blocking, console poisoning)
 */
(function() {
  'use strict';

  // 1. Block Keyboard Inspection Shortcuts
  window.addEventListener('keydown', function(e) {
    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      triggerDefense("F12 shortcut blocked");
      return false;
    }
    // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      e.stopPropagation();
      triggerDefense("DevTools inspection combination blocked");
      return false;
    }
    // Ctrl+U (View Source)
    if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
      e.preventDefault();
      e.stopPropagation();
      triggerDefense("View source blocked");
      return false;
    }
  }, true);

  // 2. Disable Right-Click Context Menu
  window.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
  }, true);

  // 3. Poison Console APIs in Global Scope (Production Only)
  try {
    const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    if (!isLocal) {
      const noop = function() {};
      ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace', 'dir'].forEach(function(m) {
        window.console[m] = noop;
      });
    }
  } catch (err) {}

  // 4. Debugger Timing Loop Trap
  let trapTriggered = false;
  function runDebuggerTrap() {
    if (trapTriggered) return;
    const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    if (isLocal) return; // Do not interrupt local operations

    const start = performance.now();
    // Inline debugger check
    (function() {
      const fn = function() {};
      fn.constructor("debugger")();
    })();
    const elapsed = performance.now() - start;
    if (elapsed > 500) {
      triggerDefense("Debugger pause detected (" + elapsed.toFixed(1) + "ms)");
    }
  }

  setInterval(runDebuggerTrap, 3000);

  // 5. Whiteout Screen and Sever Session
  function triggerDefense(reason) {
    if (trapTriggered) return;
    trapTriggered = true;
    document.body.innerHTML = `
      <div style="position:fixed;inset:0;background:#050b14;color:#ff3d71;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;z-index:999999;text-align:center;padding:24px;">
        <h1 style="color:#d4af37;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span class="material-symbols-outlined" style="font-size:32px;color:#d4af37;">shield</span>
          <span>PAYOMBØYZ VAULT SECURITY ALERT</span>
        </h1>
        <p style="color:#ffffff;font-size:16px;max-width:500px;margin-bottom:20px;">
          ตรวจพบพฤติกรรมพยายามส่องโค้ดหรือเปิดเครื่องมือพัฒนา (${reason}) ระบบได้ตัดการเชื่อมต่อและทำลายเซสชันเพื่อความปลอดภัยเรียบร้อยแล้ว
        </p>
        <button onclick="window.location.href='/login'" style="padding:10px 24px;background:#d4af37;color:#050b14;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">
          กลับสู่หน้าล็อกอิน
        </button>
      </div>
    `;
    // Attempt to tell server
    try {
      navigator.sendBeacon('/api/v1/internal_keys', JSON.stringify({ reason: reason }));
    } catch(e) {}
  }

})();
