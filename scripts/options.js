// Options page script for ZimaOS Client

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('configForm');
    const hostInput = document.getElementById('host');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const saveBtn = document.getElementById('saveBtn');
    const testBtn = document.getElementById('testBtn');
    const statusDiv = document.getElementById('status');
    const debugLogsDiv = document.getElementById('debugLogs');
    const clearLogsBtn = document.getElementById('clearLogsBtn');

    let testController = null; // 用于取消测试请求

    // Load saved configuration
    loadConfiguration();

    // 设置调试日志更新函数
    window.updateDebugLogs = function(logs) {
        debugLogsDiv.innerHTML = logs.map(log => `<div class="log-entry">${log}</div>`).join('');
        debugLogsDiv.scrollTop = debugLogsDiv.scrollHeight;
    };

    // 清空日志按钮
    clearLogsBtn.addEventListener('click', function() {
        window.zimaAPI.clearDebugLogs();
    });

    // Form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        saveConfiguration();
    });

    // Test connection button
    testBtn.addEventListener('click', testConnection);

    // Toggle password visibility
    togglePasswordBtn.addEventListener('click', function() {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            togglePasswordBtn.textContent = 'Hide';
        } else {
            passwordInput.type = 'password';
            togglePasswordBtn.textContent = 'Show';
        }
    });

    let mediaRecorder = null;
    let recordedChunks = [];
    let recordStream = null;

    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const recordStatus = document.getElementById('recordStatus');

    if (startRecordBtn && stopRecordBtn) {
      startRecordBtn.onclick = async function() {
        alert('Clicked Start Recording Button');
        startRecordBtn.disabled = true;
        recordStatus.textContent = 'Requesting recording permission...';
        try {
          alert('Preparing to call getDisplayMedia');
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          alert('getDisplayMedia successful');
          recordedChunks = [];
          alert('Preparing to initialize MediaRecorder');
          mediaRecorder = new MediaRecorder(screenStream, { mimeType: 'video/webm; codecs=vp8,opus' });
          alert('MediaRecorder initialized successfully');
          mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) recordedChunks.push(e.data);
          };
          mediaRecorder.onstop = () => {
            alert('MediaRecorder stopped, preparing to save file');
            screenStream.getTracks().forEach(track => track.stop());
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
            recordStatus.textContent = 'Recording saved locally';
            startRecordBtn.disabled = false;
            stopRecordBtn.style.display = 'none';
            startRecordBtn.style.display = '';
            alert('File saving process completed');
          };
          alert('Preparing to start recording');
          mediaRecorder.start();
          recordStatus.textContent = 'Recording...';
          startRecordBtn.style.display = 'none';
          stopRecordBtn.style.display = '';
          alert('MediaRecorder started recording');
        } catch (err) {
          alert('Caught exception: ' + err.message);
          recordStatus.textContent = 'Recording failed: ' + err.message;
          startRecordBtn.disabled = false;
        }
      };

      stopRecordBtn.onclick = function() {
        alert('Clicked Stop Recording Button');
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          recordStatus.textContent = 'Generating recording file...';
          alert('mediaRecorder.stop() called');
        }
      };
    }

    function loadConfiguration() {
        chrome.storage.sync.get(['zimaDevices', 'zimaCurrentDeviceId'], function(result) {
            const devices = result.zimaDevices || [];
            const currentId = result.zimaCurrentDeviceId || (devices[0] && devices[0].id) || null;
            const currentDevice = devices.find(d => d.id === currentId) || {};
            hostInput.value = currentDevice.host || '';
            usernameInput.value = currentDevice.username || '';
            passwordInput.value = currentDevice.password || '';
        });
    }

    async function saveConfiguration() {
        const config = {
            host: hostInput.value.trim(),
            username: usernameInput.value.trim(),
            password: passwordInput.value,
            configured: true
        };

        // Validate inputs
        if (!config.host || !config.username || !config.password) {
            showStatus('Please fill in all required fields', 'error');
            return;
        }

        // Ensure host has protocol
        if (!config.host.startsWith('http://') && !config.host.startsWith('https://')) {
            config.host = 'http://' + config.host;
        }

        showStatus('Logging in to ZimaOS...', 'info');
        saveBtn.disabled = true;

        try {
            // 设置API基础URL并尝试登录
            window.zimaAPI.setBaseUrl(config.host);
            const loginResult = await window.zimaAPI.login(config.username, config.password);

            if (loginResult.success) {
                // 登录成功，保存配置
                saveCurrentDeviceConfig();
            } else {
                showStatus('Login failed: ' + loginResult.message, 'error');
                saveBtn.disabled = false;
            }
        } catch (error) {
            showStatus('Login error: ' + error.message, 'error');
            saveBtn.disabled = false;
        }
    }

    function saveCurrentDeviceConfig() {
        chrome.storage.sync.get(['zimaDevices', 'zimaCurrentDeviceId'], function(result) {
            let devices = result.zimaDevices || [];
            let currentId = result.zimaCurrentDeviceId || (devices[0] && devices[0].id) || null;
            let currentDevice = devices.find(d => d.id === currentId);
            if (currentDevice) {
                currentDevice.host = hostInput.value.trim();
                currentDevice.username = usernameInput.value.trim();
                currentDevice.password = passwordInput.value;
            } else {
                // 新增设备
                currentDevice = {
                    id: 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    host: hostInput.value.trim(),
                    username: usernameInput.value.trim(),
                    password: passwordInput.value,
                    accessToken: '',
                    refreshToken: '',
                    expiresAt: 0,
                    lastLogin: 0,
                    status: 'offline',
                    icon: ''
                };
                devices.push(currentDevice);
                currentId = currentDevice.id;
            }
            chrome.storage.sync.set({ zimaDevices: devices, zimaCurrentDeviceId: currentId }, function() {
                if (chrome.runtime.lastError) {
                    showStatus('Configuration save failed: ' + chrome.runtime.lastError.message, 'error');
                } else {
                    showStatus('Login successful, configuration saved!', 'success');
                }
                saveBtn.disabled = false;
            });
        });
    }

    async function testConnection() {
        const host = hostInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!host || !username || !password) {
            showStatus('Please fill in all configuration information', 'error');
            return;
        }

        // 如果正在测试，先取消之前的测试
        if (testController) {
            testController.abort();
        }

        showStatus('Testing connection and login...', 'info');
        testBtn.disabled = true;
        testBtn.textContent = 'Cancel Test';

        // 创建新的AbortController
        testController = new AbortController();

        try {
            // Ensure host has protocol
            let testHost = host;
            if (!testHost.startsWith('http://') && !testHost.startsWith('https://')) {
                testHost = 'http://' + testHost;
            }

            // 设置API基础URL
            window.zimaAPI.setBaseUrl(testHost);

            // 先测试基础连接
            const connectionResult = await window.zimaAPI.testConnection();

            if (connectionResult.success) {
                // 连接成功，尝试登录
                const loginResult = await window.zimaAPI.login(username, password);

                if (loginResult.success) {
                    showStatus('Test successful! Connection and login are normal', 'success');
                } else {
                    showStatus('Connection successful but login failed: ' + loginResult.message, 'error');
                }
            } else {
                showStatus('Connection test failed: ' + connectionResult.message, 'error');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                showStatus('Test cancelled', 'info');
            } else {
                showStatus('Test error: ' + error.message, 'error');
            }
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = 'Test Connection';
            testController = null;
        }
    }

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + type;
        statusDiv.classList.remove('hidden');
        
        // Auto-hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.classList.add('hidden');
            }, 5000);
        }
    }
});
