document.addEventListener('DOMContentLoaded', () => {
    const refs = {
        configPrompt: document.getElementById('configPrompt'),
        mainContent: document.getElementById('mainContent'),
        loading: document.getElementById('loadingIndicator'),
        settings: document.getElementById('settingsBtn'),
        configure: document.getElementById('configureBtn'),
        openZima: document.getElementById('openZimaBtn'),
        statusIndicator: document.getElementById('statusIndicator'),
        statusText: document.getElementById('statusText'),
        hostInfo: document.getElementById('hostInfo'),
        currentDeviceName: document.getElementById('currentDeviceName'),
        currentDeviceIcon: document.getElementById('currentDeviceIcon'),
        appsGrid: document.getElementById('appsGrid'),
        theme: document.getElementById('themeSelect'),
        deviceListPage: document.getElementById('deviceListPage'),
        deviceList: document.getElementById('deviceList'),
        deviceSummary: document.getElementById('deviceSummary'),
        refreshDevices: document.getElementById('refreshDevicesBtn'),
        back: document.getElementById('backToMainBtn'),
        addDevice: document.getElementById('addDeviceBtn'),
        modal: document.getElementById('deviceEditModal'),
        modalTitle: document.getElementById('deviceEditTitle'),
        modalForm: document.getElementById('deviceEditForm'),
        modalSave: document.getElementById('modalSaveBtn'),
        modalCancel: document.getElementById('modalCancelBtn'),
        deviceId: document.getElementById('deviceId'),
        deviceName: document.getElementById('deviceName'),
        deviceHost: document.getElementById('deviceHost'),
        deviceUsername: document.getElementById('deviceUsername'),
        devicePassword: document.getElementById('devicePassword')
    };

    let devices = [];
    let currentDeviceId = null;
    let refreshingDevices = false;

    refs.settings.addEventListener('click', openDeviceList);
    refs.configure.addEventListener('click', () => openDeviceModal());
    refs.openZima.addEventListener('click', () => openDashboard(getCurrentDevice()));
    refs.back.addEventListener('click', showMainPage);
    refs.addDevice.addEventListener('click', () => openDeviceModal());
    refs.refreshDevices.addEventListener('click', refreshAllDeviceStatus);
    refs.modalCancel.addEventListener('click', closeDeviceModal);
    refs.modalForm.addEventListener('submit', saveDeviceFromModal);
    refs.appsGrid.addEventListener('click', event => {
        const item = event.target.closest('.app-item');
        if (!item || item.dataset.running === 'false') return;
        openUrl(item.dataset.url);
    });

    refs.theme.value = localStorage.getItem('zimaos_theme') || 'auto';
    refs.theme.addEventListener('change', () => {
        localStorage.setItem('zimaos_theme', refs.theme.value);
        updateTheme();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);
    updateTheme();
    init();

    async function init() {
        showLoading(true);
        try {
            const state = await window.ZimaDeviceStore.load();
            devices = state.devices;
            currentDeviceId = state.currentDeviceId;
            if (devices.length) {
                await loadCurrentDevice();
            } else {
                showDeviceList();
            }
        } catch (error) {
            showEmptyState(`Could not load devices: ${error.message}`);
        } finally {
            showLoading(false);
        }
    }

    function getCurrentDevice() {
        return devices.find(device => device.id === currentDeviceId) || null;
    }

    function createApi(device) {
        const api = new window.ZimaOSAPI();
        api.setSession(device);
        return api;
    }

    function applySession(device, api) {
        Object.assign(device, api.getSession());
        device.lastLogin = Date.now();
    }

    function applyDeviceInfo(device, payload) {
        const info = payload && payload.data ? payload.data : payload;
        if (!info || typeof info !== 'object') return;
        if (device.customName) {
            device.name = device.customName;
        } else if (info.device_name) {
            device.name = info.device_name;
        }
        if (info.device_image_path) {
            device.icon = absoluteUrl(info.device_image_path, device.host);
        }
    }

    async function authenticateDevice(device) {
        const api = createApi(device);
        let info;
        try {
            info = await api.getDeviceInfo();
        } catch (firstError) {
            if (!device.username || !device.password) throw firstError;
            const login = await api.login(device.username, device.password);
            if (!login.success) throw new Error(login.message || 'Login failed');
            info = await api.getDeviceInfo();
        }
        applySession(device, api);
        applyDeviceInfo(device, info);
        device.status = 'online';
        device.lastChecked = Date.now();
        return api;
    }

    async function loadCurrentDevice() {
        const device = getCurrentDevice();
        if (!device) {
            showDeviceList();
            return;
        }

        showMainPage();
        renderCurrentDevice(device);
        setConnectionStatus('checking', 'Checking...');
        try {
            const api = await authenticateDevice(device);
            await persist();
            renderCurrentDevice(device);
            setConnectionStatus('online', 'Online');
            await loadApps(device, api);
        } catch (error) {
            device.status = 'offline';
            device.lastChecked = Date.now();
            await persist();
            setConnectionStatus('offline', 'Offline');
            renderAppMessage(`Device unavailable: ${error.message}`, 'error');
        }
    }

    function renderCurrentDevice(device) {
        refs.currentDeviceName.textContent = device.name || 'ZimaOS';
        refs.hostInfo.textContent = device.host.replace(/^https?:\/\//, '');
        renderImage(refs.currentDeviceIcon, device.icon, defaultIcon(device));
    }

    async function loadApps(device, api) {
        renderAppMessage('Loading apps...');
        try {
            const [modulesResult, appsResult] = await Promise.allSettled([
                api.getModules(),
                api.getAppGrid()
            ]);
            applySession(device, api);
            await persist();

            const modules = modulesResult.status === 'fulfilled' ? modulesResult.value : [];
            const apps = appsResult.status === 'fulfilled' ? appsResult.value : [];
            const entries = [
                ...modules.filter(module => module.ui && module.ui.entry).map(module => ({
                    title: localizedTitle(module.ui.title, module.name),
                    icon: absoluteUrl(module.ui.icon, device.host),
                    url: absoluteUrl(module.ui.entry, device.host),
                    running: true
                })),
                ...apps.filter(app => app.app_type === 'v2app').map(app => ({
                    title: localizedTitle(app.title, app.name),
                    icon: absoluteUrl(app.icon, device.host),
                    url: appUrl(app, device),
                    running: app.status === 'running'
                }))
            ].filter(entry => entry.url);

            refs.appsGrid.replaceChildren();
            if (!entries.length) {
                renderAppMessage('No available apps');
                return;
            }
            entries.forEach(entry => refs.appsGrid.appendChild(createAppItem(entry, device)));
        } catch (error) {
            renderAppMessage(`Failed to load apps: ${error.message}`, 'error');
        }
    }

    function createAppItem(app, device) {
        const item = element('button', 'app-item');
        item.type = 'button';
        item.dataset.url = app.url;
        item.dataset.running = String(app.running);
        if (!app.running) {
            item.classList.add('not-running');
            item.title = 'This app is not running';
        }
        const icon = element('span', 'app-icon');
        renderImage(icon, app.icon, defaultIcon(device));
        item.append(icon, element('span', 'app-name', app.title));
        return item;
    }

    function showDeviceList() {
        refs.mainContent.classList.add('hidden');
        refs.configPrompt.classList.add('hidden');
        refs.deviceListPage.classList.remove('hidden');
        renderDeviceList();
    }

    async function openDeviceList() {
        showDeviceList();
        if (devices.length) await refreshAllDeviceStatus();
    }

    function showMainPage() {
        if (!getCurrentDevice()) {
            showDeviceList();
            return;
        }
        refs.deviceListPage.classList.add('hidden');
        refs.configPrompt.classList.add('hidden');
        refs.mainContent.classList.remove('hidden');
    }

    function showEmptyState(message) {
        refs.mainContent.classList.add('hidden');
        refs.deviceListPage.classList.add('hidden');
        refs.configPrompt.classList.remove('hidden');
        refs.configPrompt.querySelector('p').textContent = message;
    }

    function renderDeviceList() {
        refs.deviceList.replaceChildren();
        const online = devices.filter(device => device.status === 'online').length;
        refs.deviceSummary.textContent = `${devices.length} devices · ${online} online`;
        refs.back.disabled = !getCurrentDevice();

        if (!devices.length) {
            refs.deviceList.appendChild(element('div', 'empty-devices', 'No devices yet. Add your first ZimaOS.'));
            return;
        }
        devices.forEach(device => refs.deviceList.appendChild(createDeviceCard(device)));
    }

    function createDeviceCard(device) {
        const isCurrent = device.id === currentDeviceId;
        const card = element('article', `device-item${isCurrent ? ' selected' : ''}`);
        const icon = element('div', 'device-icon');
        renderImage(icon, device.icon, defaultIcon(device));

        const info = element('div', 'device-info');
        const name = element('div', 'device-name', device.name || 'ZimaOS');
        if (isCurrent) name.appendChild(element('span', 'current-device-tag', 'Current'));
        info.append(name, element('div', 'device-host', device.host));
        if (device.lastChecked) {
            info.appendChild(element('div', 'device-checked', `Checked ${formatRelativeTime(device.lastChecked)}`));
        }

        const statusLabel = device.status === 'checking'
            ? 'Checking'
            : (device.status === 'online' ? 'Online' : 'Offline');
        const status = element('span', `device-status ${device.status}`, statusLabel);
        const actions = element('div', 'device-actions');
        actions.append(
            actionButton('Open', 'btn-secondary', () => openDashboard(device)),
            actionButton('Edit', 'btn-secondary', () => openDeviceModal(device)),
            isCurrent ? document.createDocumentFragment() : actionButton('Switch', 'btn-primary', () => switchDevice(device.id)),
            actionButton('Delete', 'btn-danger', () => deleteDevice(device.id))
        );
        card.append(icon, info, status, actions);
        return card;
    }

    async function refreshAllDeviceStatus() {
        if (!devices.length || refreshingDevices) return;
        refreshingDevices = true;
        refs.refreshDevices.disabled = true;
        refs.refreshDevices.textContent = 'Checking...';
        devices.forEach(device => { device.status = 'checking'; });
        renderDeviceList();
        try {
            await Promise.all(devices.map(async device => {
                try {
                    await authenticateDevice(device);
                } catch (error) {
                    device.status = 'offline';
                    device.lastChecked = Date.now();
                }
            }));
            await persist();
            renderDeviceList();
        } finally {
            refreshingDevices = false;
            refs.refreshDevices.disabled = false;
            refs.refreshDevices.textContent = 'Refresh All';
        }
    }

    function openDeviceModal(device = null) {
        refs.modal.classList.remove('hidden');
        refs.modalTitle.textContent = device ? 'Edit Device' : 'Add Device';
        refs.deviceId.value = device ? device.id : '';
        refs.deviceName.value = device ? device.name : '';
        refs.deviceHost.value = device ? device.host : '';
        refs.deviceUsername.value = device ? device.username : '';
        refs.devicePassword.value = device ? device.password : '';
        refs.deviceHost.focus();
    }

    function closeDeviceModal() {
        refs.modal.classList.add('hidden');
        refs.modalForm.reset();
    }

    async function saveDeviceFromModal(event) {
        event.preventDefault();
        const originalId = refs.deviceId.value;
        const original = devices.find(device => device.id === originalId);
        let host;
        try {
            host = window.ZimaDeviceStore.normalizeHost(refs.deviceHost.value);
        } catch (error) {
            alert(error.message);
            return;
        }

        refs.modalSave.disabled = true;
        refs.modalSave.textContent = 'Connecting...';
        try {
            const requestedName = refs.deviceName.value.trim();
            const draft = {
                ...(original || {}),
                id: originalId || `device-${Date.now()}`,
                name: requestedName || 'ZimaOS',
                customName: requestedName,
                host,
                username: refs.deviceUsername.value.trim(),
                password: refs.devicePassword.value,
                accessToken: '',
                refreshToken: '',
                expiresAt: 0,
                status: 'offline'
            };
            const api = createApi(draft);
            const login = await api.login(draft.username, draft.password);
            if (!login.success) throw new Error(login.message || 'Login failed');
            const infoPayload = await api.getDeviceInfo();
            const info = infoPayload && infoPayload.data ? infoPayload.data : infoPayload;
            if (info && info.hash) draft.id = String(info.hash);
            applySession(draft, api);
            applyDeviceInfo(draft, infoPayload);
            draft.status = 'online';
            draft.lastChecked = Date.now();

            devices = devices.filter(device => device.id !== originalId && device.id !== draft.id);
            devices.push(draft);
            if (!currentDeviceId || currentDeviceId === originalId) currentDeviceId = draft.id;
            await persist();
            closeDeviceModal();
            renderDeviceList();
            if (currentDeviceId === draft.id) await loadCurrentDevice();
        } catch (error) {
            alert(`Could not save device: ${error.message}`);
        } finally {
            refs.modalSave.disabled = false;
            refs.modalSave.textContent = 'Save';
        }
    }

    async function switchDevice(id) {
        currentDeviceId = id;
        await persist();
        showLoading(true);
        try {
            await loadCurrentDevice();
        } finally {
            showLoading(false);
        }
    }

    async function deleteDevice(id) {
        const device = devices.find(item => item.id === id);
        if (!device || !confirm(`Delete ${device.name || 'this device'}?`)) return;
        devices = devices.filter(item => item.id !== id);
        if (currentDeviceId === id) currentDeviceId = devices[0] ? devices[0].id : null;
        await persist();
        if (getCurrentDevice()) {
            renderDeviceList();
        } else {
            showDeviceList();
        }
    }

    async function openDashboard(device) {
        if (!device) return;
        try {
            const api = await authenticateDevice(device);
            applySession(device, api);
            await persist();
        } catch (error) {
            const proceed = confirm(`Could not refresh ${device.name}. Open it anyway?`);
            if (!proceed) return;
        }
        const params = new URLSearchParams();
        if (device.accessToken) params.set('token', device.accessToken);
        if (device.refreshToken) params.set('refresh_token', device.refreshToken);
        const query = params.toString();
        openUrl(`${device.host}/#/login${query ? '?' + query : ''}`);
    }

    async function persist() {
        const state = await window.ZimaDeviceStore.save(devices, currentDeviceId);
        currentDeviceId = state.currentDeviceId;
    }

    function setConnectionStatus(status, text) {
        refs.statusIndicator.className = `status-indicator ${status}`;
        refs.statusText.textContent = text;
    }

    function renderAppMessage(message, type = '') {
        const node = element('div', `apps-message ${type}`.trim(), message);
        refs.appsGrid.replaceChildren(node);
    }

    function renderImage(container, source, fallback) {
        container.replaceChildren();
        const image = document.createElement('img');
        image.alt = '';
        image.src = safeHttpUrl(source) || fallback;
        image.addEventListener('error', () => {
            if (image.src !== fallback) image.src = fallback;
        }, { once: true });
        container.appendChild(image);
    }

    function defaultIcon(device) {
        return `${device.host}/modules/icewhale_app/img/default.0a7cfbf2.svg`;
    }

    function absoluteUrl(value, base) {
        if (!value) return '';
        try {
            const url = new URL(value, base + '/');
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch (error) {
            return '';
        }
    }

    function safeHttpUrl(value) {
        return absoluteUrl(value, window.location.origin);
    }

    function appUrl(app, device) {
        if (!app.scheme || !app.port) return '';
        try {
            const deviceUrl = new URL(device.host);
            if (!['http', 'https'].includes(app.scheme)) return '';
            return `${app.scheme}://${deviceUrl.hostname}:${app.port}${app.index || ''}`;
        } catch (error) {
            return '';
        }
    }

    function localizedTitle(title, fallback) {
        if (typeof title === 'string') return title;
        return (title && (title.en_us || title.zh_cn)) || fallback || 'App';
    }

    function openUrl(url) {
        if (!safeHttpUrl(url)) return;
        chrome.tabs.create({ url });
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function actionButton(label, className, handler) {
        const button = element('button', `btn btn-sm ${className}`, label);
        button.type = 'button';
        button.addEventListener('click', handler);
        return button;
    }

    function formatRelativeTime(timestamp) {
        const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    function updateTheme() {
        const preference = localStorage.getItem('zimaos_theme') || 'auto';
        const theme = preference === 'auto'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : preference;
        document.documentElement.setAttribute('data-theme', theme);
    }

    setInterval(() => {
        if (getCurrentDevice() && !refs.mainContent.classList.contains('hidden')) loadCurrentDevice();
    }, 60000);
});
