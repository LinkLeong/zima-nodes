(function(root) {
    const DEVICES_KEY = 'zimaDevices';
    const CURRENT_DEVICE_KEY = 'zimaCurrentDeviceId';
    const LEGACY_TOKENS_KEY = 'zimaTokens';

    function normalizeHost(value) {
        let host = String(value || '').trim();
        if (!host) throw new Error('Device address is required');
        if (/^[a-z][a-z\d+.-]*:\/\//i.test(host) && !/^https?:\/\//i.test(host)) {
            throw new Error('Only HTTP and HTTPS addresses are supported');
        }
        if (!/^https?:\/\//i.test(host)) host = 'http://' + host;

        let parsed;
        try {
            parsed = new URL(host);
        } catch (error) {
            throw new Error('Enter a valid HTTP or HTTPS address');
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Only HTTP and HTTPS addresses are supported');
        }
        parsed.hash = '';
        parsed.search = '';
        return parsed.toString().replace(/\/$/, '');
    }

    function storageCall(area, method, value) {
        return new Promise((resolve, reject) => {
            area[method](value, result => {
                const runtimeError = root.chrome && root.chrome.runtime && root.chrome.runtime.lastError;
                if (runtimeError) {
                    reject(new Error(runtimeError.message));
                    return;
                }
                resolve(result);
            });
        });
    }

    function sanitizeDevices(devices) {
        if (!Array.isArray(devices)) return [];
        return devices.filter(device => device && device.id && device.host).map(device => ({
            id: String(device.id),
            name: String(device.name || device.host),
            customName: String(device.customName || ''),
            host: String(device.host).replace(/\/$/, ''),
            username: String(device.username || ''),
            password: String(device.password || ''),
            accessToken: String(device.accessToken || ''),
            refreshToken: String(device.refreshToken || ''),
            expiresAt: Number(device.expiresAt || 0),
            lastLogin: Number(device.lastLogin || 0),
            lastChecked: Number(device.lastChecked || 0),
            status: device.status === 'online' ? 'online' : 'offline',
            icon: String(device.icon || '')
        }));
    }

    async function load() {
        const keys = [DEVICES_KEY, CURRENT_DEVICE_KEY];
        const localResult = await storageCall(root.chrome.storage.local, 'get', keys);
        let devices = sanitizeDevices(localResult[DEVICES_KEY]);
        let currentDeviceId = localResult[CURRENT_DEVICE_KEY] || null;

        if (!devices.length && root.chrome.storage.sync) {
            const syncResult = await storageCall(root.chrome.storage.sync, 'get', [...keys, LEGACY_TOKENS_KEY]);
            devices = sanitizeDevices(syncResult[DEVICES_KEY]);
            currentDeviceId = syncResult[CURRENT_DEVICE_KEY] || null;
            if (devices.length) {
                await save(devices, currentDeviceId);
            }
            await storageCall(root.chrome.storage.sync, 'remove', [...keys, LEGACY_TOKENS_KEY]);
        }

        if (!devices.some(device => device.id === currentDeviceId)) {
            currentDeviceId = devices[0] ? devices[0].id : null;
        }
        return { devices, currentDeviceId };
    }

    async function save(devices, currentDeviceId) {
        const sanitized = sanitizeDevices(devices);
        const selectedId = sanitized.some(device => device.id === currentDeviceId)
            ? currentDeviceId
            : (sanitized[0] ? sanitized[0].id : null);
        await storageCall(root.chrome.storage.local, 'set', {
            [DEVICES_KEY]: sanitized,
            [CURRENT_DEVICE_KEY]: selectedId
        });
        return { devices: sanitized, currentDeviceId: selectedId };
    }

    const api = { normalizeHost, sanitizeDevices, load, save };
    root.ZimaDeviceStore = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
