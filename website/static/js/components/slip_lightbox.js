/**
 * slip_lightbox.js - High-Resolution Slip Inspector (Gallery Style)
 */
class SlipLightbox {
  constructor() {
    this.modal = document.getElementById('slip-lightbox-modal');
    this.image = document.getElementById('lightbox-slip-img');
    this.refText = document.getElementById('lightbox-slip-ref');
    this.adminText = document.getElementById('lightbox-slip-admin');
    this.amountText = document.getElementById('lightbox-slip-amount');
    this.dateText = document.getElementById('lightbox-slip-date');
  }

  open(slipData) {
    if (!this.modal) return;
    if (this.image) this.image.src = slipData.slip_image_path || '/static/assets/slip_placeholder.png';
    if (this.refText) this.refText.textContent = slipData.slip_ref || 'N/A';
    if (this.adminText) this.adminText.textContent = `${slipData.admin_name || 'Admin'} (ID: ${slipData.claimed_admin_id})`;
    if (this.amountText) this.amountText.textContent = `฿${parseFloat(slipData.amount || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}`;
    if (this.dateText) this.dateText.textContent = new Date((slipData.closed_at || Date.now()/1000) * 1000).toLocaleString('th-TH');
    this.modal.classList.add('active');
  }

  close() {
    if (this.modal) this.modal.classList.remove('active');
  }

  copyRef() {
    if (!this.refText) return;
    navigator.clipboard.writeText(this.refText.textContent);
    alert('คัดลอกเลขอ้างอิงสลิปแล้ว: ' + this.refText.textContent);
  }
}

window.slipLightbox = new SlipLightbox();
