/**
 * modal_2fa.js - 2FA 6-Digit Auto-Focus, Mobile Autofill & Verification Controller
 */
class TwoFactorModal {
  constructor(containerId, onVerify) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.inputs = this.container.querySelectorAll('.otp-digit');
    this.onVerify = onVerify;
    this.bindEvents();
  }

  bindEvents() {
    this.inputs.forEach((input, idx) => {
      // Auto-select digit on mobile touch / focus
      input.addEventListener('focus', () => {
        try {
          input.select();
        } catch (e) {}
      });

      input.addEventListener('input', (e) => {
        const raw = e.target.value || '';
        const digits = raw.replace(/[^0-9]/g, '');

        if (digits.length > 1) {
          // Mobile keyboard auto-fill / paste suggestion
          const chars = digits.split('');
          chars.forEach((c, offset) => {
            if (this.inputs[idx + offset]) {
              this.inputs[idx + offset].value = c;
            }
          });
          const nextIdx = Math.min(idx + chars.length, this.inputs.length - 1);
          if (this.inputs[nextIdx]) this.inputs[nextIdx].focus();
          this.checkComplete();
          return;
        }

        e.target.value = digits;
        if (digits && idx < this.inputs.length - 1) {
          this.inputs[idx + 1].focus();
        }
        this.checkComplete();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          this.inputs[idx - 1].focus();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim().replace(/[^0-9]/g, '');
        if (pasteData.length > 0) {
          const chars = pasteData.slice(0, 6).split('');
          chars.forEach((char, i) => {
            if (this.inputs[i]) this.inputs[i].value = char;
          });
          this.checkComplete();
          const target = Math.min(chars.length, this.inputs.length - 1);
          if (this.inputs[target]) this.inputs[target].focus();
        }
      });
    });
  }

  checkComplete() {
    const code = Array.from(this.inputs).map(i => i.value).join('');
    if (code.length === 6 && this.onVerify) {
      this.onVerify(code);
    }
  }

  reset() {
    this.inputs.forEach(i => i.value = '');
    if (this.inputs.length > 0) this.inputs[0].focus();
  }
}

window.TwoFactorModal = TwoFactorModal;
