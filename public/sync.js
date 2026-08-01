// ======== SyncDB - 离线优先数据同步层 ========
// 使用 IndexedDB 本地存储，所有写入先到本地，再异步同步到服务器
(function() {
  'use strict';
  
  const DB_NAME = 'workbuddy_sync';
  const DB_VERSION = 1;
  const SYNC_API = '/api/sync';
  
  let db = null;
  let syncing = false;
  let pendingChanges = [];
  let syncTimer = null;
  
  // ===== IndexedDB 初始化 =====
  function initDB() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        const d = e.target.result;
        // 为每个数据表创建 object store
        const stores = ['tasks', 'finances', 'fitness', 'korean_progress', 'books', 'book_files', 
                        'reading_notes', 'menu_items', 'recipes', 'shopping', 'health_habits',
                        'health_checkins', 'period', 'mood', 'pomodoro', 'game_scores', 'match3_progress',
                        'exam', 'notes'];
        stores.forEach(s => {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: false });
        });
        // 通用键值存储（用于配置、进度等）
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' });
        // 待同步队列
        if (!d.objectStoreNames.contains('sync_queue')) {
          const sq = d.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          sq.createIndex('time', 'time');
        }
      };
      req.onsuccess = function(e) { db = e.target.result; resolve(db); };
      req.onerror = reject;
    });
  }
  
  // ===== 本地读写 =====
  function localRead(store, id) {
    return new Promise((resolve, reject) => {
      initDB().then(db => {
        const tx = db.transaction(store, 'readonly');
        if (id) {
          const req = tx.objectStore(store).get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = reject;
        } else {
          const req = tx.objectStore(store).getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = reject;
        }
      });
    });
  }
  
  function localWrite(store, data) {
    return new Promise((resolve, reject) => {
      initDB().then(db => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(data);
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    });
  }
  
  function localDelete(store, id) {
    return new Promise((resolve, reject) => {
      initDB().then(db => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    });
  }
  
  function localReadAll(store) {
    return new Promise((resolve, reject) => {
      initDB().then(db => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
      });
    });
  }
  
  // ===== 同步队列 =====
  function queueChange(store, action, data, id) {
    initDB().then(db => {
      const tx = db.transaction('sync_queue', 'readwrite');
      tx.objectStore('sync_queue').add({ store, action, data, id, time: Date.now() });
    });
  }
  
  function getPendingChanges() {
    return new Promise((resolve, reject) => {
      initDB().then(db => {
        const tx = db.transaction('sync_queue', 'readonly');
        const req = tx.objectStore('sync_queue').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
      });
    });
  }
  
  function clearPendingChanges(upToId) {
    return new Promise((resolve, reject) => {
      initDB().then(db => {
        const tx = db.transaction('sync_queue', 'readwrite');
        const req = tx.objectStore('sync_queue').getAll();
        req.onsuccess = () => {
          const all = req.result;
          let delCount = 0;
          all.forEach(r => {
            if (r.id <= upToId) {
              tx.objectStore('sync_queue').delete(r.id);
              delCount++;
            }
          });
          tx.oncomplete = () => resolve(delCount);
        };
        req.onerror = reject;
      });
    });
  }
  
  // ===== 暴露的 API =====
  window.SyncDB = {
    // 读取
    read: localRead,
    readAll: localReadAll,
    // 写入（本地立即写 + 加入同步队列）
    write: async function(store, data) {
      await localWrite(store, data);
      queueChange(store, 'put', data, data.id);
      return data;
    },
    // 删除
    delete: async function(store, id) {
      await localDelete(store, id);
      queueChange(store, 'delete', null, id);
    },
    // 键值存储
    getKV: function(key) {
      return localRead('kv', key);
    },
    setKV: async function(key, value) {
      await localWrite('kv', { key, value });
    },
    // 同步
    sync: function() {
      return new Promise((resolve, reject) => {
        if (syncing) return resolve({ status: 'already_syncing' });
        syncing = true;
        getPendingChanges().then(async changes => {
          if (changes.length === 0) { syncing = false; return resolve({ status: 'no_changes' }); }
          try {
            const resp = await fetch(SYNC_API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ changes, deviceId: getDeviceId() })
            });
            const result = await resp.json();
            if (result.applied) {
              let maxId = 0;
              changes.forEach(c => { if (c.id > maxId) maxId = c.id; });
              await clearPendingChanges(maxId);
            }
            syncing = false;
            resolve({ status: 'synced', count: changes.length });
          } catch(e) {
            syncing = false;
            resolve({ status: 'error', message: e.message });
          }
        });
      });
    },
    // 拉取远程数据
    pull: async function(store) {
      try {
        const resp = await fetch(SYNC_API + '?store=' + store + '&deviceId=' + getDeviceId());
        const data = await resp.json();
        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            await localWrite(store, item);
          }
          return { count: data.items.length };
        }
        return { count: 0 };
      } catch(e) { return { count: 0, error: e.message }; }
    },
    // 全量拉取
    pullAll: async function() {
      const stores = ['tasks', 'finances', 'fitness', 'korean_progress', 'books', 'menu_items',
                      'recipes', 'shopping', 'health_habits', 'period', 'mood', 'pomodoro', 'notes'];
      let total = 0;
      for (const s of stores) {
        const r = await SyncDB.pull(s);
        total += r.count;
      }
      return total;
    },
    // 获取待同步数量
    pendingCount: async function() {
      const pending = await getPendingChanges();
      return pending.length;
    },
    // 初始化
    init: initDB
  };
  
  function getDeviceId() {
    let id = localStorage.getItem('_wb_device_id');
    if (!id) {
      id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('_wb_device_id', id);
    }
    return id;
  }
  
  // 自动同步（每30秒）
  function startAutoSync() {
    if (syncTimer) return;
    syncTimer = setInterval(async () => {
      try {
        const result = await SyncDB.sync();
        if (result.status === 'synced' && result.count > 0) {
          // 通过自定义事件通知界面
          window.dispatchEvent(new CustomEvent('wb-sync', { detail: result }));
        }
      } catch(e) {}
    }, 30000);
  }
  
  // 初始化同步
  initDB().then(() => {
    startAutoSync();
    console.log('🐱 SyncDB 就绪');
  });
  
})();
