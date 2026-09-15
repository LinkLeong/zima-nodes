document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('configForm');
    const nameInput = document.getElementById('name');
    const hostInput = document.getElementById('host');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');
    const saveButton = document.getElementById('saveBtn');
    const testButton = document.getElementById('testBtn');
    const status = document.getElementById('status');
    const debugLogs = document.getElementById('debugLogs');
    const clearLogs = document.getElementById('clearLogsBtn');

    let devices = [];
    let currentDeviceId = null;

    window.updateDebugLogs = logs => {
        debugLogs.replaceChildren(...logs.map(message => {
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.textContent = message;
            return entry;
        }));
        debugLogs.scrollTop = debugLogs.scrollHeight;
    };

    form.addEventListener('submit', saveConfiguration);
    testButton.addEventListener('click', testConfiguration);
    clearLogs.addEventListener('click', () => window.zimaAPI.clearDebugLogs());
    togglePassword.addEventListener('click', () => {
        const showing = passwordInput.type === 'text';
        passwordInput.type = showing ? 'password' : 'text';
        togglePassword.textContent = showing ? 'Show' : 'Hide';
    });

    loadConfiguration();

    async function loadConfiguration() {
        try {
            const state = await window.ZimaDeviceStore.load();
            devices = state.devices;
            currentDeviceId = state.currentDeviceId;
            const current = devices.find(device => device.id === currentDeviceId);
            if (!current) {
                showStatus('No current device. Saving this form will create one.', 'info');
                return;
            }
            nameInput.value = current.name || '';
            hostInput.value = current.host || '';
            usernameInput.value = current.username || '';
            passwordInput.value = current.password || '';
        } catch (error) {
            showStatus(`Could not load configuration: ${error.message}`, 'error');
        }
    }

    function readForm() {
        if (!hostInput.value.trim() || !usernameInput.value.trim() || !passwordInput.value) {
            throw new Error('Please fill in address, username, and password');
        }
        return {
            name: nameInput.value.trim(),
            host: window.ZimaDeviceStore.normalizeHost(hostInput.value),
            username: usernameInput.value.trim(),
            password: passwordInput.value
        };
    }

    async function connect(config) {
        const api = window.zimaAPI;
        api.setBaseUrl(config.host);
        const login = await api.login(config.username, config.password);
        if (!login.success) throw new Error(login.message || 'Login failed');
        const infoPayload = await api.getDeviceInfo();
        const info = infoPayload && infoPayload.data ? infoPayload.data : infoPayload;
        return { api, info: info || {} };
    }

    async function saveConfiguration(event) {
        event.preventDefault();
        saveButton.disabled = true;
        showStatus('Connecting and saving...', 'info');
        try {
            const config = readForm();
            const current = devices.find(device => device.id === currentDeviceId);
            const { api, info } = await connect(config);
            const id = String(info.hash || currentDeviceId || `device-${Date.now()}`);
            const session = api.getSession();
            const updated = {
                ...(current || {}),
                ...config,
                ...session,
                id,
                name: config.name || info.device_name || (current && current.name) || 'ZimaOS',
                customName: config.name,
                icon: info.device_image_path
                    ? new URL(info.device_image_path, config.host + '/').href
                    : ((current && current.icon) || ''),
                status: 'online',
                lastLogin: Date.now(),
                lastChecked: Date.now()
            };
            devices = devices.filter(device => device.id !== currentDeviceId && device.id !== id);
            devices.push(updated);
            currentDeviceId = id;
            await window.ZimaDeviceStore.save(devices, currentDeviceId);
            nameInput.value = updated.name;
            hostInput.value = updated.host;
            showStatus('Current device updated.', 'success');
        } catch (error) {
            showStatus(error.message, 'error');
        } finally {
            saveButton.disabled = false;
        }
    }

    async function testConfiguration() {
        testButton.disabled = true;
        showStatus('Testing connection and login...', 'info');
        try {
            const config = readForm();
            await connect(config);
            showStatus('Connection and login succeeded.', 'success');
        } catch (error) {
            showStatus(`Test failed: ${error.message}`, 'error');
        } finally {
            testButton.disabled = false;
        }
    }

    function showStatus(message, type) {
        status.textContent = message;
        status.className = `status ${type}`;
    }
});
