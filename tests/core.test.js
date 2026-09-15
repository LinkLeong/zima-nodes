const assert = require('node:assert/strict');
const test = require('node:test');

function createStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        get(keys, callback) {
            const result = {};
            for (const key of keys) result[key] = data[key];
            callback(result);
        },
        set(values, callback) {
            Object.assign(data, values);
            callback();
        },
        remove(keys, callback) {
            for (const key of keys) delete data[key];
            callback();
        }
    };
}

function jsonResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 401 ? 'Unauthorized' : 'OK',
        text: async () => JSON.stringify(payload)
    };
}

test('normalizes device addresses and rejects unsupported protocols', () => {
    global.chrome = { runtime: {}, storage: { local: createStorage(), sync: createStorage() } };
    const store = require('../scripts/device-store.js');

    assert.equal(store.normalizeHost('zimaos.local/'), 'http://zimaos.local');
    assert.equal(store.normalizeHost('https://192.168.1.2:8443/path?q=1'), 'https://192.168.1.2:8443/path');
    assert.throws(() => store.normalizeHost('ftp://zimaos.local'), /HTTP and HTTPS/);
});

test('migrates legacy synced devices into local storage', async () => {
    const local = createStorage();
    const sync = createStorage({
        zimaDevices: [{ id: 'one', name: 'NAS', host: 'http://nas.local', password: 'secret' }],
        zimaCurrentDeviceId: 'one',
        zimaTokens: { accessToken: 'legacy-global-token' }
    });
    global.chrome = { runtime: {}, storage: { local, sync } };
    const store = require('../scripts/device-store.js');

    const state = await store.load();

    assert.equal(state.currentDeviceId, 'one');
    assert.equal(state.devices[0].password, 'secret');
    assert.equal(local.data.zimaDevices[0].id, 'one');
    assert.equal(sync.data.zimaDevices, undefined);
    assert.equal(sync.data.zimaTokens, undefined);
});

test('persists multiple device sessions and the selected device independently', async () => {
    const local = createStorage();
    global.chrome = { runtime: {}, storage: { local, sync: createStorage() } };
    const store = require('../scripts/device-store.js');
    const devices = [
        { id: 'one', host: 'http://one.local', accessToken: 'token-one', status: 'online' },
        { id: 'two', host: 'http://two.local', accessToken: 'token-two', status: 'offline' }
    ];

    await store.save(devices, 'two');
    const state = await store.load();

    assert.equal(state.devices.length, 2);
    assert.equal(state.currentDeviceId, 'two');
    assert.equal(state.devices.find(device => device.id === 'one').accessToken, 'token-one');
    assert.equal(state.devices.find(device => device.id === 'two').accessToken, 'token-two');
});

test('keeps API sessions isolated and refreshes only the matching device', async () => {
    const ZimaOSAPI = require('../scripts/zimaos-api.js');
    const requests = [];
    global.fetch = async (url, options) => {
        requests.push({ url, options });
        if (url.endsWith('/v1/users/refresh')) {
            return jsonResponse(200, {
                access_token: 'new-token-a',
                refresh_token: 'new-refresh-a',
                expires_at: 9999999999
            });
        }
        return jsonResponse(200, { hash: 'device-a', device_name: 'A' });
    };

    const apiA = new ZimaOSAPI();
    apiA.setSession({
        host: 'http://a.local',
        accessToken: 'old-token-a',
        refreshToken: 'refresh-a',
        expiresAt: 1
    });
    const apiB = new ZimaOSAPI();
    apiB.setSession({
        host: 'http://b.local',
        accessToken: 'token-b',
        refreshToken: 'refresh-b',
        expiresAt: 9999999999
    });

    await apiA.getDeviceInfo();
    await apiB.getDeviceInfo();

    assert.equal(apiA.accessToken, 'new-token-a');
    assert.equal(apiB.accessToken, 'token-b');
    const infoRequests = requests.filter(request => request.url.endsWith('/v2/zimaos/device/info'));
    assert.equal(infoRequests[0].options.headers.Authorization, 'new-token-a');
    assert.equal(infoRequests[1].options.headers.Authorization, 'token-b');
});

test('deduplicates concurrent refreshes for one device', async () => {
    const ZimaOSAPI = require('../scripts/zimaos-api.js');
    let refreshes = 0;
    global.fetch = async url => {
        if (url.endsWith('/v1/users/refresh')) {
            refreshes += 1;
            return jsonResponse(200, {
                access_token: 'new-token',
                refresh_token: 'new-refresh',
                expires_at: 9999999999
            });
        }
        return jsonResponse(200, { data: [] });
    };
    const api = new ZimaOSAPI();
    api.setSession({
        host: 'http://nas.local',
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        expiresAt: 1
    });

    await Promise.all([api.getModules(), api.getAppGrid()]);

    assert.equal(refreshes, 1);
});

test('does not treat an HTTP error as a healthy connection', async () => {
    const ZimaOSAPI = require('../scripts/zimaos-api.js');
    global.fetch = async () => jsonResponse(503, { message: 'unavailable' });
    const api = new ZimaOSAPI();
    api.setBaseUrl('http://offline.local');

    const result = await api.testConnection();

    assert.equal(result.success, false);
    assert.match(result.message, /unavailable/);
});
