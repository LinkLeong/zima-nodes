// ZimaOS API管理模块

class ZimaOSAPI {
    constructor() {
        this.baseUrl = '';
        this.accessToken = '';
        this.refreshToken = '';
        this.expiresAt = 0;
        this.debugLogs = [];
    }

    // 设置基础URL
    setBaseUrl(url) {
        // 确保URL格式正确
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }
        this.baseUrl = url.replace(/\/$/, ''); // 移除末尾的斜杠
        this.log('设置基础URL: ' + this.baseUrl);
    }

    // 添加调试日志
    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        this.debugLogs.push(logEntry);
        console.log(logEntry);
        
        // 保持最多50条日志
        if (this.debugLogs.length > 50) {
            this.debugLogs.shift();
        }
        
        // 触发日志更新事件
        if (typeof window !== 'undefined' && window.updateDebugLogs) {
            window.updateDebugLogs(this.debugLogs);
        }
    }

    // 获取调试日志
    getDebugLogs() {
        return this.debugLogs;
    }

    // 清空调试日志
    clearDebugLogs() {
        this.debugLogs = [];
        if (typeof window !== 'undefined' && window.updateDebugLogs) {
            window.updateDebugLogs(this.debugLogs);
        }
    }

    // 登录到ZimaOS
    async login(username, password) {
        this.log(`开始登录，用户名: ${username}`);
        
        try {
            const response = await this.makeRequest('/v1/users/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            if (response.success === 200) {
                this.accessToken = response.data.token.access_token;
                this.refreshToken = response.data.token.refresh_token;
                this.expiresAt = response.data.token.expires_at;
                
                this.log('登录成功');
                this.log(`Access Token: ${this.accessToken.substring(0, 20)}...`);
                this.log(`Refresh Token: ${this.refreshToken.substring(0, 20)}...`);
                this.log(`Token过期时间: ${new Date(this.expiresAt * 1000).toLocaleString()}`);
                
                // 保存token到存储
                await this.saveTokens();
                
                return {
                    success: true,
                    data: response.data
                };
            } else {
                this.log(`登录失败: ${response.message}`);
                return {
                    success: false,
                    message: response.message || '登录失败'
                };
            }
        } catch (error) {
            this.log(`登录错误: ${error.message}`);
            return {
                success: false,
                message: error.message
            };
        }
    }

    // 刷新token
    async refreshAccessToken() {
        if (!this.refreshToken) {
            this.log('没有refresh token，无法刷新');
            return false;
        }

        this.log('开始刷新access token');
        
        try {
            const response = await this.makeRequest('/v1/users/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    refresh_token: this.refreshToken
                })
            });

            if (response.refresh_token && response.access_token) {
                this.accessToken = response.access_token;
                this.refreshToken = response.refresh_token;
                this.expiresAt = response.expires_at;
                
                this.log('Token刷新成功');
                this.log(`新Access Token: ${this.accessToken.substring(0, 20)}...`);
                this.log(`新过期时间: ${new Date(this.expiresAt * 1000).toLocaleString()}`);
                
                // 保存新token
                await this.saveTokens();
                
                return true;
            } else {
                this.log('Token刷新失败: 响应格式不正确');
                return false;
            }
        } catch (error) {
            this.log(`Token刷新错误: ${error.message}`);
            return false;
        }
    }

    // 检查token是否即将过期（提前5分钟刷新）
    isTokenExpiringSoon() {
        const now = Math.floor(Date.now() / 1000);
        const fiveMinutes = 5 * 60;
        return this.expiresAt > 0 && (this.expiresAt - now) < fiveMinutes;
    }

    // 保存tokens到Chrome存储
    async saveTokens() {
        const tokenData = {
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            expiresAt: this.expiresAt
        };
        
        return new Promise((resolve) => {
            chrome.storage.sync.set({ zimaTokens: tokenData }, () => {
                this.log('Tokens已保存到存储');
                resolve();
            });
        });
    }

    // 从Chrome存储加载tokens
    async loadTokens() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['zimaTokens'], (result) => {
                if (result.zimaTokens) {
                    this.accessToken = result.zimaTokens.accessToken || '';
                    this.refreshToken = result.zimaTokens.refreshToken || '';
                    this.expiresAt = result.zimaTokens.expiresAt || 0;
                    this.log('Tokens已从存储加载');
                    this.log(`Token过期时间: ${new Date(this.expiresAt * 1000).toLocaleString()}`);
                }
                resolve();
            });
        });
    }

    // 发起HTTP请求（带超时控制）
    async makeRequest(path, options = {}, timeout = 10000) {
        const url = this.baseUrl + path;
        this.log(`发起请求: ${options.method || 'GET'} ${url}`);
        
        // 创建AbortController用于超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            this.log(`请求超时 (${timeout}ms): ${url}`);
        }, timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.log(`请求成功: ${url}`);
            return data;
            
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('请求超时');
            }
            throw error;
        }
    }

    // 发起带认证的请求
    async makeAuthenticatedRequest(path, options = {}, timeout = 10000) {
        // 检查token是否即将过期
        if (this.isTokenExpiringSoon()) {
            this.log('Token即将过期，尝试刷新');
            await this.refreshAccessToken();
        }

        // 添加认证头
        const authOptions = {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${this.accessToken}`
            }
        };

        try {
            return await this.makeRequest(path, authOptions, timeout);
        } catch (error) {
            // 如果是401错误，尝试刷新token
            if (error.message.includes('401')) {
                this.log('收到401错误，尝试刷新token');
                const refreshed = await this.refreshAccessToken();
                
                if (refreshed) {
                    // 重新添加认证头
                    authOptions.headers['Authorization'] = `Bearer ${this.accessToken}`;
                    return await this.makeRequest(path, authOptions, timeout);
                } else {
                    throw new Error('Token刷新失败，请重新登录');
                }
            }
            throw error;
        }
    }

    // 测试连接
    async testConnection() {
        this.log('开始测试连接');
        try {
            const url = this.baseUrl + '/v1/health';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            await fetch(url, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);
            this.log('连接测试成功');
            return { success: true };
        } catch (error) {
            this.log(`连接测试失败: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    // 获取应用列表
    async getAppGrid() {
        await this.loadTokens();
        const url = this.baseUrl + '/v2/app_management/web/appgrid';
        let token = this.accessToken;
        this.log(`[getAppGrid] token: ${token ? token.substring(0, 16) + '...' : '空'}`);
        let response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': token
            }
        });
        if (response.status === 401 && this.refreshToken) {
            this.log('getAppGrid遇到401，尝试刷新token');
            const refreshed = await this.refreshAccessToken();
            if (refreshed) {
                token = this.accessToken;
                response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': token
                    }
                });
            }
        }
        if (!response.ok) throw new Error('获取应用失败: ' + response.status);
        const result = await response.json();
        return result.data || [];
    }

    // 获取模块列表
    async getModules() {
        await this.loadTokens();
        const url = this.baseUrl + '/v2/mod_management/modules';
        let token = this.accessToken;
        this.log(`[getModules] token: ${token ? token.substring(0, 16) + '...' : '空'}`);
        let response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': token
            }
        });
        if (response.status === 401 && this.refreshToken) {
            this.log('getModules遇到401，尝试刷新token');
            const refreshed = await this.refreshAccessToken();
            if (refreshed) {
                token = this.accessToken;
                response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': token
                    }
                });
            }
        }
        if (!response.ok) throw new Error('获取模块失败: ' + response.status);
        const result = await response.json();
        return result.data || [];
    }

    // 打开应用
    async openApp(appPath) {
        console.log('openApp', appPath);
        // 实现打开应用的逻辑
    }
}

// 创建全局实例
window.zimaAPI = new ZimaOSAPI();
