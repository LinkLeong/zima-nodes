// Popup script for ZimaOS Client


window.ZIMA_DEBUG_LANG = null //'zh-cn'; // 手动设置语言，调试用

// Remove all multi-language logic, keep only English text for all UI, labels, buttons, placeholders, and messages.

// 录制相关变量
let mediaRecorder = null;
let recordedChunks = [];
let recordStream = null;

window.addEventListener('DOMContentLoaded', function() {
    const configPrompt = document.getElementById('configPrompt');
    const mainContent = document.getElementById('mainContent');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const settingsBtn = document.getElementById('settingsBtn');
    const configureBtn = document.getElementById('configureBtn');
    const editConfigBtn = document.getElementById('editConfigBtn');
    const openZimaBtn = document.getElementById('openZimaBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const hostInfo = document.getElementById('hostInfo');
    const appsGrid = document.getElementById('appsGrid');
    const debugBtn = document.getElementById('debugBtn');
    const debugPanel = document.getElementById('debugPanel');
    const closeDebugBtn = document.getElementById('closeDebugBtn');
    const popupDebugLogs = document.getElementById('popupDebugLogs');
    const clearPopupLogsBtn = document.getElementById('clearPopupLogsBtn');
    const themeSelect = document.getElementById('themeSelect');
    const backToMainBtn = document.getElementById('backToMainBtn');

    let currentConfig = null;

    // 多设备管理相关
    const deviceListPage = document.getElementById('deviceListPage');
    const deviceListDiv = document.getElementById('deviceList');
    const addDeviceBtn = document.getElementById('addDeviceBtn');
    const deviceEditModal = document.getElementById('deviceEditModal');
    const deviceEditForm = document.getElementById('deviceEditForm');
    const deviceEditTitle = document.getElementById('deviceEditTitle');
    const cancelEditDeviceBtn = document.getElementById('cancelEditDeviceBtn');
    const deviceIdInput = document.getElementById('deviceId');
    const deviceNameInput = document.getElementById('deviceName');
    const deviceHostInput = document.getElementById('deviceHost');
    const deviceUsernameInput = document.getElementById('deviceUsername');
    const devicePasswordInput = document.getElementById('devicePassword');

    let zimaDevices = [];
    let zimaCurrentDeviceId = null;

    // 设备存储结构: {id, name, host, username, password, accessToken, refreshToken, expiresAt, lastLogin, status}

    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const recordStatus = document.getElementById('recordStatus');

    if (startRecordBtn && stopRecordBtn) {
      startRecordBtn.onclick = async function() {
        startRecordBtn.disabled = true;
        recordStatus.textContent = '正在请求录制权限...';
        try {
          // 获取屏幕+系统音频
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          // 获取麦克风音频
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

          // 合并音频轨道
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const destination = audioContext.createMediaStreamDestination();

          if (screenStream.getAudioTracks().length > 0) {
            const systemSource = audioContext.createMediaStreamSource(screenStream);
            systemSource.connect(destination);
          }
          if (micStream.getAudioTracks().length > 0) {
            const micSource = audioContext.createMediaStreamSource(micStream);
            micSource.connect(destination);
          }

          // 合成最终流
          const tracks = [
            ...screenStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
          ];
          recordStream = new MediaStream(tracks);

          // 录制
          recordedChunks = [];
          mediaRecorder = new MediaRecorder(recordStream, { mimeType: 'video/webm; codecs=vp8,opus' });
          mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) recordedChunks.push(e.data);
          };
          mediaRecorder.onstop = () => {
            // 释放资源
            recordStream.getTracks().forEach(track => track.stop());
            audioContext.close();

            // 生成文件并下载
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'meeting-record.webm';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 100);

            recordStatus.textContent = '录制已保存到本地';
            startRecordBtn.disabled = false;
            stopRecordBtn.style.display = 'none';
            startRecordBtn.style.display = '';
          };

          mediaRecorder.start();
          recordStatus.textContent = '录制中...';
          startRecordBtn.style.display = 'none';
          stopRecordBtn.style.display = '';
        } catch (err) {
          recordStatus.textContent = '录制失败: ' + err.message;
          startRecordBtn.disabled = false;
        }
      };

      stopRecordBtn.onclick = function() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          recordStatus.textContent = '正在生成录制文件...';
        }
      };
    }

    // Initialize popup
    init();

    // Event listeners
    if (settingsBtn) settingsBtn.addEventListener('click', showDeviceListPage);
    if (configureBtn) configureBtn.addEventListener('click', openSettings);
    if (typeof editConfigBtn !== 'undefined' && editConfigBtn) editConfigBtn.addEventListener('click', openSettings);
    if (openZimaBtn) openZimaBtn.addEventListener('click', openZimaOS);
    if (typeof refreshBtn !== 'undefined' && refreshBtn) refreshBtn.addEventListener('click', checkConnection);
    if (typeof debugBtn !== 'undefined' && debugBtn) debugBtn.addEventListener('click', toggleDebugPanel);
    if (closeDebugBtn) closeDebugBtn.addEventListener('click', hideDebugPanel);
    if (clearPopupLogsBtn) clearPopupLogsBtn.addEventListener('click', clearDebugLogs);
    if (backToMainBtn) backToMainBtn.onclick = showMainContentPage;

    // App items click handlers
    appsGrid.addEventListener('click', function(e) {
        const appItem = e.target.closest('.app-item');
        if (appItem && currentConfig) {
            const appUrl = appItem.dataset.url;
            openApp(appUrl);
        }
    });

    // 设置调试日志更新函数
    window.updateDebugLogs = function(logs) {
        if (popupDebugLogs) {
            popupDebugLogs.innerHTML = logs.map(log => `<div class="log-entry">${log}</div>`).join('');
            popupDebugLogs.scrollTop = popupDebugLogs.scrollHeight;
        }
    };

    function init() {
        showLoading(true);
        loadConfiguration();
    }

    // 获取当前设备信息
    function getCurrentDevice() {
        return zimaDevices.find(d => d.id === zimaCurrentDeviceId) || null;
    }

    // 修正loadConfiguration，始终用当前设备，切换设备时自动重登
    async function loadConfiguration() {
        const device = getCurrentDevice();
        if (device) {
            currentConfig = device;
            if (window.zimaAPI && typeof window.zimaAPI.setBaseUrl === 'function') {
                window.zimaAPI.setBaseUrl(currentConfig.host);
                window.zimaAPI.accessToken = currentConfig.accessToken || '';
                window.zimaAPI.refreshToken = currentConfig.refreshToken || '';
                window.zimaAPI.expiresAt = currentConfig.expiresAt || 0;
                console.log('[loadConfiguration] zimaAPI token 赋值:', {
                    accessToken: window.zimaAPI.accessToken,
                    refreshToken: window.zimaAPI.refreshToken,
                    expiresAt: window.zimaAPI.expiresAt
                });
                // 直接刷新 token
                let refreshed = false;
                try {
                    refreshed = await window.zimaAPI.refreshAccessToken();
                    console.log('[loadConfiguration] refreshAccessToken 结果:', refreshed);
                } catch (e) {
                    refreshed = false;
                }
                if (!refreshed && currentConfig.username && currentConfig.password) {
                    try {
                        const loginResult = await window.zimaAPI.login(currentConfig.username, currentConfig.password);
                        console.log('[loadConfiguration] 自动登录结果:', loginResult);
                        if (loginResult.success) {
                            currentConfig.accessToken = window.zimaAPI.accessToken;
                            currentConfig.refreshToken = window.zimaAPI.refreshToken;
                            currentConfig.expiresAt = window.zimaAPI.expiresAt;
                            saveDevicesToStorage();
                        } else {
                            alert('自动登录失败，请在设备管理中重新登录该设备');
                        }
                    } catch (err) {
                        console.error('[loadConfiguration] 自动登录异常:', err);
                        alert('自动登录失败，请在设备管理中重新登录该设备');
                    }
                }
            } else {
            }
            showMainContent();
            updateHostInfo();
            checkConnection();
            loadAppGrid();
        } else {
            showDeviceListPage();
        }
        showLoading(false);
    }

    function showConfigPrompt() {
        configPrompt.classList.remove('hidden');
        mainContent.classList.add('hidden');
    }

    function showMainContent() {
        configPrompt.classList.add('hidden');
        mainContent.classList.remove('hidden');
    }

    function showLoading(show) {
        if (show) {
            loadingIndicator.classList.remove('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
        }
    }

    function updateHostInfo() {
        const device = getCurrentDevice();
        if (device) {
            // 图标
            const iconDiv = document.getElementById('currentDeviceIcon');
            if (iconDiv) {
                iconDiv.innerHTML = device.icon ? `<img src='${device.icon}' onerror="this.onerror=null;this.src='${device.host.replace(/\/$/, '')}/modules/icewhale_app/img/default.0a7cfbf2.svg'">` : `<img src='${device.host.replace(/\/$/, '')}/modules/icewhale_app/img/default.0a7cfbf2.svg'>`;
            }
            // 设备名
            const nameSpan = document.getElementById('currentDeviceName');
            if (nameSpan) nameSpan.textContent = device.name || '';
            // 地址
            const hostDisplay = device.host.replace(/^https?:\/\//, '');
            const hostInfoSpan = document.getElementById('hostInfo');
            if (hostInfoSpan) hostInfoSpan.textContent = 'Connect to: ' + hostDisplay;
        }
    }

    async function checkConnection() {
        if (!currentConfig) return;

        updateConnectionStatus('checking', 'Checking...');

        try {
            // 能登录才算在线，否则离线
            await window.zimaAPI.loadTokens();
            const refreshed = await window.zimaAPI.refreshAccessToken();
            if (refreshed || window.zimaAPI.accessToken) {
                updateConnectionStatus('online', 'Online');
            } else {
                updateConnectionStatus('offline', 'Offline');
            }
        } catch (error) {
            updateConnectionStatus('offline', 'Offline');
        }
    }

    function updateConnectionStatus(status, text) {
        statusIndicator.className = `status-indicator ${status}`;
        statusText.textContent = text;
    }

    function openSettings() {
        chrome.runtime.openOptionsPage();
    }

    async function openZimaOS() {
        if (currentConfig) {
            await window.zimaAPI.loadTokens();
            const token = window.zimaAPI.accessToken;
            const refreshToken = window.zimaAPI.refreshToken;
            let baseUrl = currentConfig.host.replace(/[#?].*$/, ''); // 去掉已有hash和参数
            let hashPath = '#/login';
            let params = [];
            if (token) params.push('token=' + encodeURIComponent(token));
            if (refreshToken) params.push('refresh_token=' + encodeURIComponent(refreshToken));
            let url = baseUrl + '/' + hashPath;
            if (params.length > 0) {
                url += '?' + params.join('&');
            }
            chrome.tabs.create({ url });
        }
    }

    function openApp(appPath) {
        if (currentConfig) {
            // 判断是否为未运行应用
            const appItem = Array.from(document.querySelectorAll('.app-item')).find(item => item.dataset.url === appPath);
            let isNotRunning = false;
            if (appItem) {
                const idx = appItem.dataset.idx;
                // allApps 只在loadAppGrid作用域内，这里无法直接访问，但可以通过appItem的图标样式判断
                const iconDiv = document.getElementById(`app-icon-${idx}`);
                if (iconDiv && iconDiv.querySelector('img') && iconDiv.querySelector('img').style.filter.includes('grayscale')) {
                    isNotRunning = true;
                }
            }
            if (isNotRunning) {
                alert('The app is not running');
                return;
            }
            // modules模块的应用直接用完整url
            let fullUrl = appPath;
            if (!/^https?:\/\//.test(appPath) && !appPath.includes('/modules/')) {
                fullUrl = currentConfig.host + appPath;
            }
            console.log('openApp called, fullUrl:', fullUrl);
            try {
                chrome.tabs.create({ url: fullUrl }, function(tab) {
                    if (chrome.runtime.lastError) {
                        console.error('chrome.tabs.create error:', chrome.runtime.lastError.message);
                    } else {
                        console.log('Tab created:', tab);
                    }
                });
            } catch (e) {
                console.error('Exception in chrome.tabs.create:', e);
            }
        } else {
        }
    }

    function toggleDebugPanel() {
        if (debugPanel.classList.contains('hidden')) {
            showDebugPanel();
        } else {
            hideDebugPanel();
        }
    }

    function showDebugPanel() {
        debugPanel.classList.remove('hidden');
        // 更新日志显示
        if (window.zimaAPI) {
            const logs = window.zimaAPI.getDebugLogs();
            window.updateDebugLogs(logs);
        }
    }

    function hideDebugPanel() {
        debugPanel.classList.add('hidden');
    }

    function clearDebugLogs() {
        if (window.zimaAPI) {
            window.zimaAPI.clearDebugLogs();
        }
    }

    async function loadAppGrid() {
        if (!currentConfig) return;
        appsGrid.innerHTML = `<div style="grid-column: span 3;text-align:center;color:#888;">${'Loading apps...'}</div>`;
        try {
            // 先请求模块数据
            let modules = [];
            try {
                modules = await window.zimaAPI.getModules();
            } catch (e) {
                modules = [];
            }
            // 过滤有ui和icon的模块
            const moduleApps = (modules || []).filter(m => m.ui && m.ui.icon && m.ui.entry && m.ui.title).map((m, idx) => {
                let icon = m.ui.icon;
                if (icon.startsWith('/')) {
                    icon = currentConfig.host.replace(/\/$/, '') + icon;
                }
                const title = m.ui.title.zh_cn || m.ui.title.en_us || m.name;
                const url = currentConfig.host.replace(/\/$/, '') + m.ui.entry;
                const grayStyle = '';
                return { icon, title, url, grayStyle, isModule: true, idx };
            });

            // 再请求原有应用
            const apps = await window.zimaAPI.getAppGrid();
            const v2apps = apps.filter(app => app.app_type === 'v2app').map((app, idx) => {
                const icon = app.icon || '/modules/icewhale_app/img/default.0a7cfbf2.svg';
                const title = app.title.zh_cn || app.title.en_us || app.name;
                let url = '';
                if (app.scheme && app.port) {
                    url = `${app.scheme}://${currentConfig.host.replace(/^https?:\/\//, '').replace(/[:/].*$/, '')}:${app.port}${app.index || ''}`;
                } else {
                    url = '#';
                }
                const grayStyle = app.status !== 'running' ? 'filter: grayscale(1) brightness(0.7);' : '';
                return { icon, title, url, grayStyle, isModule: false, idx };
            });

            const allApps = [...moduleApps, ...v2apps];
            if (allApps.length === 0) {
                appsGrid.innerHTML = `<div style="grid-column: span 3;text-align:center;color:#888;">${'No available apps'}</div>`;
                return;
            }
            // 先渲染占位，后异步检测icon
            appsGrid.innerHTML = allApps.map((app, idx) => {
                return `<div class="app-item" data-url="${app.url}" data-idx="${idx}">
                    <div class="app-icon" id="app-icon-${idx}"></div>
                    <div class="app-name">${app.title}</div>
                </div>`;
            }).join('');
            // 动态检测icon
            allApps.forEach((app, idx) => {
                const icon = app.icon;
                const title = app.title;
                const grayStyle = app.grayStyle;
                const defaultIcon = `${currentConfig.host.replace(/\/$/, '')}/modules/icewhale_app/img/default.0a7cfbf2.svg`;
                const iconImg = new window.Image();
                iconImg.src = icon;
                iconImg.onload = function() {
                    const iconDiv = document.getElementById(`app-icon-${idx}`);
                    if (iconDiv) {
                        iconDiv.innerHTML = `<img src='${icon}' style='width:32px;height:32px;border-radius:6px;${grayStyle}'>`;
                    }
                };
                iconImg.onerror = function() {
                    const iconDiv = document.getElementById(`app-icon-${idx}`);
                    if (iconDiv) {
                        iconDiv.innerHTML = `<img src='${defaultIcon}' style='width:32px;height:32px;border-radius:6px;${grayStyle}'>`;
                    }
                };
            });
        } catch (e) {
            appsGrid.innerHTML = `<div style='grid-column: span 3;text-align:center;color:#e53e3e;'>${'Failed to load apps'}：${e.message || e}</div>`;
        }
    }

    // Auto-refresh connection status every 30 seconds
    setInterval(() => {
        if (currentConfig && !mainContent.classList.contains('hidden')) {
            checkConnection();
        }
    }, 30000);

    // 主题切换逻辑
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        } else if (theme === 'light') {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.remove('light');
        }
    }
    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function updateTheme() {
        let theme = localStorage.getItem('zimaos_theme') || 'auto';
        if (theme === 'auto') {
            theme = getSystemTheme();
        }
        applyTheme(theme);
    }
    if (themeSelect) {
        themeSelect.value = localStorage.getItem('zimaos_theme') || 'auto';
        themeSelect.addEventListener('change', function() {
            localStorage.setItem('zimaos_theme', themeSelect.value);
            updateTheme();
        });
    }
    // 跟随系统变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
        if ((localStorage.getItem('zimaos_theme') || 'auto') === 'auto') {
            updateTheme();
        }
    });
    // 初始化主题
    updateTheme();

    // ===== 弹窗多语言支持 BEGIN =====
    // Remove all multi-language logic, keep only English text for all UI, labels, buttons, placeholders, and messages.

    // ===== 弹窗多语言支持 END =====

    function showDeviceListPage() {
        deviceListPage.classList.remove('hidden');
        mainContent.classList.add('hidden');
        configPrompt.classList.add('hidden');
        renderDeviceList();
        refreshAllDeviceStatus();
    }
    function showMainContentPage() {
        deviceListPage.classList.add('hidden');
        mainContent.classList.remove('hidden');
    }
    function renderDeviceList() {
        deviceListDiv.innerHTML = '';
        if (!zimaDevices.length) {
            deviceListDiv.innerHTML = `<div style="color:#888;text-align:center;">${'No device, please add'}</div>`;
            return;
        }
        zimaDevices.forEach(device => {
            const div = document.createElement('div');
            const isCurrent = device.id === zimaCurrentDeviceId;
            div.className = 'device-item' + (isCurrent ? ' selected' : '');
            div.innerHTML = `
                <div class="device-icon">${device.icon ? `<img src='${device.icon}' onerror="this.onerror=null;this.src='${device.host.replace(/\/$/, '')}/modules/icewhale_app/img/default.0a7cfbf2.svg'">` : `<img src='${device.host.replace(/\/$/, '')}/modules/icewhale_app/img/default.0a7cfbf2.svg'>`}</div>
                <div class="device-info">
                    <div class="device-name">${device.name}${isCurrent ? ` <span class=\"current-device-tag\">${'（Current）'}</span>` : ''}</div>
                    <div class="device-host">${device.host}</div>
                </div>
                <span class="device-status ${device.status}">${device.status === 'online' ? 'Online' : 'Offline'}</span>
                <div class="device-actions">
                    <button class="btn btn-danger btn-sm" data-action="delete">${'Delete'}</button>
                    ${!isCurrent ? `<button class="btn btn-primary btn-sm" data-action="switch">${'Switch'}</button>` : ''}
                </div>
            `;
            if (!isCurrent) div.querySelector('[data-action="switch"]').onclick = () => switchDevice(device.id);
            div.querySelector('[data-action="delete"]').onclick = () => deleteDevice(device.id);
            deviceListDiv.appendChild(div);
        });
    }
    function openEditDeviceModal(device) {
        deviceEditModal.classList.remove('hidden');
        // Remove all multi-language logic, keep only English text for all UI, labels, buttons, placeholders, and messages.
        if (device) {
            deviceEditTitle.textContent = 'Edit Device';
            if (deviceIdInput) deviceIdInput.value = device.id;
            if (deviceNameInput) deviceNameInput.value = device.name;
            if (deviceHostInput) deviceHostInput.value = device.host;
            if (deviceUsernameInput) deviceUsernameInput.value = device.username;
            if (devicePasswordInput) devicePasswordInput.value = device.password;
        } else {
            deviceEditTitle.textContent = 'Add Device';
            if (deviceIdInput) deviceIdInput.value = '';
            if (deviceNameInput) deviceNameInput.value = '';
            if (deviceHostInput) deviceHostInput.value = '';
            if (deviceUsernameInput) deviceUsernameInput.value = '';
            if (devicePasswordInput) devicePasswordInput.value = '';
        }
    }
    function closeEditDeviceModal() {
        deviceEditModal.classList.add('hidden');
    }
    function saveDevicesToStorage() {
        chrome.storage.sync.get(['zimaDevices', 'zimaCurrentDeviceId'], function(result) {
            let devices = result.zimaDevices || [];
            let currentId = zimaCurrentDeviceId || (devices[0] && devices[0].id) || null;
            let currentDevice = devices.find(d => d.id === currentId);
            // 合并逻辑：以本地 zimaDevices 为准
            if (Array.isArray(zimaDevices) && zimaDevices.length > 0) {
                devices = zimaDevices;
            }
            console.log(devices)
            console.log(currentId)
            chrome.storage.sync.set({ zimaDevices: devices, zimaCurrentDeviceId: zimaCurrentDeviceId }, function() {
                // 可加日志
            });
        });
    }
    function loadDevicesFromStorage(cb) {
        chrome.storage.sync.get(['zimaDevices', 'zimaCurrentDeviceId'], result => {
            zimaDevices = result.zimaDevices || [];
            // 优先使用 storage 里的 zimaCurrentDeviceId，只在没有时才用第一条
            if (result.zimaCurrentDeviceId && zimaDevices.find(d => d.id === result.zimaCurrentDeviceId)) {
                zimaCurrentDeviceId = result.zimaCurrentDeviceId;
            } else {
                zimaCurrentDeviceId = zimaDevices[0] && zimaDevices[0].id || null;
            }
            if (cb) cb();
        });
    }
    function addOrUpdateDevice(device) {
        if (!device.id) {
            device.id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            zimaDevices.push(device);
        } else {
            const idx = zimaDevices.findIndex(d => d.id === device.id);
            if (idx !== -1) zimaDevices[idx] = device;
        }
        saveDevicesToStorage();
        renderDeviceList();
    }
    function deleteDevice(id) {
        if (!confirm('Are you sure to delete this device?')) return;
        zimaDevices = zimaDevices.filter(d => d.id !== id);
        if (zimaCurrentDeviceId === id) {
            zimaCurrentDeviceId = zimaDevices[0] ? zimaDevices[0].id : null;
        }
        saveDevicesToStorage();
        renderDeviceList();
    }
    // 切换设备逻辑，切换后刷新主界面和API
    function switchDevice(id) {
        zimaCurrentDeviceId = id;
        saveDevicesToStorage();
        showMainContentPage();
        loadConfiguration();
    }
    // 设备编辑表单提交
    if (deviceEditForm) {
        deviceEditForm.onsubmit = async function(e) {
            e.preventDefault();
            let host = deviceHostInput.value.trim();
            if (!host.startsWith('http://') && !host.startsWith('https://')) {
                host = 'http://' + host;
            }
            let device = {
                id: '', // hash
                name: '', // device_name
                host: host,
                username: deviceUsernameInput.value.trim(),
                password: devicePasswordInput.value,
                accessToken: '',
                refreshToken: '',
                expiresAt: 0,
                lastLogin: 0,
                status: 'offline',
                icon: ''
            };
            // 保存时自动登录，只有成功才保存
            window.zimaAPI.setBaseUrl(device.host);
            try {
                const loginResult = await window.zimaAPI.login(device.username, device.password);
                if (loginResult.success) {
                    device.accessToken = window.zimaAPI.accessToken;
                    device.refreshToken = window.zimaAPI.refreshToken;
                    device.expiresAt = window.zimaAPI.expiresAt;
                    device.lastLogin = Date.now();
                    device.status = 'online';
                    // 登录后获取设备信息
                    const infoRes = await fetch(device.host.replace(/\/$/, '') + '/v2/zimaos/device/info', {
                        method: 'GET',
                        headers: { 'Authorization': device.accessToken }
                    });
                    if (infoRes.ok) {
                        const info = await infoRes.json();
                        device.id = info.hash;
                        device.name = info.device_name;
                        if (info.device_image_path) {
                            device.icon = device.host.replace(/\/$/, '') + info.device_image_path + (info.device_image_path.includes('?') ? '&' : '?') + 'type=web';
                        }
                    } else {
                        alert('Failed to get device info');
                        return;
                    }
                    // 检查是否已存在同hash设备，存在则更新
                    const idx = zimaDevices.findIndex(d => d.id === device.id);
                    if (idx !== -1) {
                        zimaDevices[idx] = device;
                    } else {
                        zimaDevices.push(device);
                    }
                    // 不自动切换新设备，保留当前设备
                    saveDevicesToStorage();
                    closeEditDeviceModal();
                    refreshAllDeviceStatus();
                    renderDeviceList();
                } else {
                    alert('Login failed: ' + (loginResult.message || 'Unknown error'));
                }
            } catch (err) {
                alert('Login failed: ' + (err.message || 'Unknown error') + '\n' + 'Failed to add, please check device address, username, and password');
            }
        };
    }
    if (addDeviceBtn) addDeviceBtn.onclick = () => openEditDeviceModal();
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    if (modalCancelBtn) modalCancelBtn.onclick = closeEditDeviceModal;

    // 设备状态检测
    async function refreshAllDeviceStatus() {
        for (const device of zimaDevices) {
            // 检查token是否有效，尝试刷新
            window.zimaAPI.setBaseUrl(device.host);
            window.zimaAPI.accessToken = device.accessToken || '';
            window.zimaAPI.refreshToken = device.refreshToken || '';
            window.zimaAPI.expiresAt = device.expiresAt || 0;
            let online = false;
            try {
                await window.zimaAPI.loadTokens();
                const refreshed = await window.zimaAPI.refreshAccessToken();
                if (refreshed || window.zimaAPI.accessToken) {
                    online = true;
                    // 保存最新token
                    device.accessToken = window.zimaAPI.accessToken;
                    device.refreshToken = window.zimaAPI.refreshToken;
                    device.expiresAt = window.zimaAPI.expiresAt;
                    device.lastLogin = Date.now();
                }
            } catch (e) {
                online = false;
            }
            device.status = online ? 'online' : 'offline';
        }
        saveDevicesToStorage();
        renderDeviceList();
    }

    // 页面初始化逻辑
    function showInitialPage() {
        loadDevicesFromStorage(() => {
            // 移除调试用的当前语言显示
            const langInfoDiv = document.getElementById('currentLangInfo');
            if (langInfoDiv) langInfoDiv.remove();
            if (zimaDevices.length) {
                if (!zimaCurrentDeviceId || !zimaDevices.find(d => d.id === zimaCurrentDeviceId)) {
                    zimaCurrentDeviceId = zimaDevices[0].id;
                    saveDevicesToStorage();
                }
                showMainContentPage();
                loadConfiguration();
            } else {
                showDeviceListPage();
            }
        });
    }
    // 入口
    showInitialPage();

    window.getCurrentLang = () => {
        if (window.ZIMA_DEBUG_LANG) return window.ZIMA_DEBUG_LANG.toLowerCase();
        return (navigator.language || 'en').toLowerCase();
    };

    // 多语言动态赋值
    if (document.getElementById('openZimaBtn')) document.getElementById('openZimaBtn').textContent = 'Open ZimaOS';
    if (document.getElementById('settingsBtn')) document.getElementById('settingsBtn').textContent = 'Device Management';
    if (document.getElementById('backToMainBtn')) document.getElementById('backToMainBtn').textContent = 'Back to Main';
    if (document.getElementById('addDeviceBtn')) document.getElementById('addDeviceBtn').textContent = 'Add Device';
    if (document.getElementById('themeLabel')) document.getElementById('themeLabel').textContent = 'Theme';
    if (document.getElementById('themeOptionLight')) document.getElementById('themeOptionLight').textContent = 'Light';
    if (document.getElementById('themeOptionAuto')) document.getElementById('themeOptionAuto').textContent = 'Auto';
    if (document.getElementById('themeOptionDark')) document.getElementById('themeOptionDark').textContent = 'Dark';
    // 自动替换所有内容为"设备管理"的元素
    Array.from(document.querySelectorAll('*')).forEach(e => {
        if (e.childNodes.length === 1 && e.childNodes[0].nodeType === 3 && e.textContent.trim() === 'Device Management') {
            e.textContent = 'Device Management';
        }
    });
});
