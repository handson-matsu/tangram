import {ACCESS_CONFIG, createAccessRecorder} from '../access-counter.js';

export function runAccessTests(test, assert) {
  test('アクセス設定：共通GAS・app=tangram・不変の設定', () => {
    assert.equal(ACCESS_CONFIG.endpoint, 'https://script.google.com/macros/s/AKfycbxssCIHsD-N97SHxNC_GN0ihYeC0qy-lb-EY0KmSs6Gnztaph1sITMerLVEnNWOGkYc/exec');
    assert.equal(ACCESS_CONFIG.app, 'tangram');
    assert.ok(Object.isFrozen(ACCESS_CONFIG));
  });
  test('アクセス：繰り返し呼んでも正しいGETを1回だけ送る', async () => {
    const calls = [];
    const record = createAccessRecorder((...args) => {calls.push(args); return Promise.resolve();});
    for (let i = 0; i < 20; i++) record();
    await Promise.resolve();
    assert.equal(calls.length, 1);
    const [url, options] = calls[0];
    assert.equal(url, ACCESS_CONFIG.endpoint + '?app=tangram');
    assert.equal(JSON.stringify(options), JSON.stringify({method:'GET', mode:'no-cors', cache:'no-store', credentials:'omit', keepalive:true}));
  });
  test('アクセス：新しい文書のレコーダーはさらに1回だけ送る', () => {
    let count = 0;
    const send = () => {count++; return Promise.resolve();};
    const first = createAccessRecorder(send);
    first(); first();
    assert.equal(count, 1);
    const reloaded = createAccessRecorder(send);
    reloaded(); reloaded();
    assert.equal(count, 2);
  });
  test('アクセス：同期通信エラーを隔離し再送しない', () => {
    let count = 0;
    const record = createAccessRecorder(() => {count++; throw Error('offline');});
    record(); record();
    assert.equal(count, 1);
  });
  test('アクセス：非同期通信エラーを隔離し再送しない', async () => {
    let count = 0;
    const record = createAccessRecorder(() => {count++; return Promise.reject(Error('offline'));});
    record();
    await Promise.resolve(); await Promise.resolve();
    record();
    assert.equal(count, 1);
  });
}
