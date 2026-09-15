(function(root) {
    class ZimaOSAPI {
        constructor() {
            this.baseUrl = '';
            this.accessToken = '';
            this.refreshToken = '';
            this.expiresAt = 0;
            this.debugLogs = [];
            this.refreshPromise = null;
        }

        setBaseUrl(url) {
            this.baseUrl = root.ZimaDeviceStore
                ? root.ZimaDeviceStore.normalizeHost(url)
                : String(url || '').replace(/\/$/, '');
        }

        setSession(device) {
            this.setBaseUrl(device.host);
            this.accessToken = device.accessToken || '';
            this.refreshToken = device.refreshToken || '';
            this.expiresAt = Number(device.expiresAt || 0);
        }

        getSession() {
            return {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                expiresAt: this.expiresAt
            };
        }

        log(message) {
            const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
            this.debugLogs.push(entry);
            if (this.debugLogs.length > 50) this.debugLogs.shift();
            console.log(entry);
            if (typeof root.updateDebugLogs === 'function') root.updateDebugLogs(this.debugLogs);
        }

        getDebugLogs() {
            return [...this.debugLogs];
        }

        clearDebugLogs() {
            this.debugLogs = [];
            if (typeof root.updateDebugLogs === 'function') root.updateDebugLogs([]);
        }

        async makeRequest(path, options = {}, timeout = 10000) {
            if (!this.baseUrl) throw new Error('Device address is not configured');
            const url = this.baseUrl + path;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            this.log(`${options.method || 'GET'} ${url}`);

            try {
                const response = await fetch(url, { ...options, signal: controller.signal });
                const text = await response.text();
                let data = null;
                if (text) {
                    try {
                        data = JSON.parse(text);
                    } catch (error) {
                        data = text;
                    }
                }
                if (!response.ok) {
                    const message = data && typeof data === 'object' && data.message
                        ? data.message
                        : `${response.status} ${response.statusText}`.trim();
                    const requestError = new Error(message || 'Request failed');
                    requestError.status = response.status;
                    throw requestError;
                }
                return data;
            } catch (error) {
                if (error.name === 'AbortError') throw new Error('Request timed out');
                throw error;
            } finally {
                clearTimeout(timeoutId);
            }
        }

        extractToken(payload) {
            const candidate = payload && payload.data && payload.data.token
                ? payload.data.token
                : (payload && payload.data ? payload.data : payload);
            if (!candidate || !candidate.access_token) return null;
            return {
                accessToken: candidate.access_token,
                refreshToken: candidate.refresh_token || this.refreshToken,
                expiresAt: Number(candidate.expires_at || 0)
            };
        }

        applyToken(token) {
            this.accessToken = token.accessToken;
            this.refreshToken = token.refreshToken || '';
            this.expiresAt = token.expiresAt || 0;
        }

        async login(username, password) {
            try {
                const response = await this.makeRequest('/v1/users/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const token = this.extractToken(response);
                if (!token) {
                    return { success: false, message: (response && response.message) || 'Unexpected login response' };
                }
                this.applyToken(token);
                this.log('Login succeeded');
                return { success: true, data: response && response.data };
            } catch (error) {
                this.log(`Login failed: ${error.message}`);
                return { success: false, message: error.message };
            }
        }

        isTokenExpiringSoon() {
            if (!this.expiresAt) return false;
            return this.expiresAt - Math.floor(Date.now() / 1000) < 300;
        }

        async refreshAccessToken() {
            if (!this.refreshToken) return false;
            if (this.refreshPromise) return this.refreshPromise;
            this.refreshPromise = this.performTokenRefresh();
            try {
                return await this.refreshPromise;
            } finally {
                this.refreshPromise = null;
            }
        }

        async performTokenRefresh() {
            try {
                const response = await this.makeRequest('/v1/users/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: this.refreshToken })
                });
                const token = this.extractToken(response);
                if (!token) return false;
                this.applyToken(token);
                this.log('Session refreshed');
                return true;
            } catch (error) {
                this.log(`Session refresh failed: ${error.message}`);
                return false;
            }
        }

        async makeAuthenticatedRequest(path, options = {}, timeout = 10000) {
            if (this.isTokenExpiringSoon()) await this.refreshAccessToken();
            if (!this.accessToken) throw new Error('Not authenticated');

            const withToken = () => ({
                ...options,
                headers: { ...options.headers, Authorization: this.accessToken }
            });
            try {
                return await this.makeRequest(path, withToken(), timeout);
            } catch (error) {
                if (error.status !== 401 || !(await this.refreshAccessToken())) throw error;
                return this.makeRequest(path, withToken(), timeout);
            }
        }

        async testConnection() {
            try {
                await this.makeRequest('/v1/health');
                return { success: true };
            } catch (error) {
                return { success: false, message: error.message };
            }
        }

        async getDeviceInfo() {
            return this.makeAuthenticatedRequest('/v2/zimaos/device/info');
        }

        async getAppGrid() {
            const result = await this.makeAuthenticatedRequest('/v2/app_management/web/appgrid');
            return (result && result.data) || [];
        }

        async getModules() {
            const result = await this.makeAuthenticatedRequest('/v2/mod_management/modules');
            return (result && result.data) || [];
        }
    }

    root.ZimaOSAPI = ZimaOSAPI;
    root.zimaAPI = new ZimaOSAPI();
    if (typeof module !== 'undefined' && module.exports) module.exports = ZimaOSAPI;
})(typeof globalThis !== 'undefined' ? globalThis : window);
