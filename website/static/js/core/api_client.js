/**
 * api_client.js - Secure Request Wrapper with Sliding HMAC Signatures
 */
class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async _generateSignature(payload, timestamp) {
    const raw = `${JSON.stringify(payload)}:${timestamp}:PAYOMB0YZ_VAULT_KEY`;
    const enc = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async request(endpoint, options = {}) {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyObj = options.body ? JSON.parse(options.body) : {};
    const signature = await this._generateSignature(bodyObj, timestamp);

    const headers = {
      'Content-Type': 'application/json',
      'X-Request-Timestamp': timestamp.toString(),
      'X-Signature': signature,
      ...(options.headers || {})
    };

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      if (!endpoint.includes('/login')) {
        window.location.href = '/login?expired=1';
      }
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.message || `Request failed with status ${res.status}`);
    }

    return data;
  }

  get(endpoint) { return this.request(endpoint, { method: 'GET' }); }
  post(endpoint, data) { return this.request(endpoint, { method: 'POST', body: JSON.stringify(data) }); }
  put(endpoint, data) { return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data) }); }
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }
}

window.api = new ApiClient();
