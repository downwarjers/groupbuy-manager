import { db } from './db.js';
import { eventBus } from './event-bus.js';

export const AUTH_TOKEN = (() => {
  const urlParams = new URLSearchParams(window.location.search);
  const key = urlParams.get('key');
  if (key) {
    localStorage.setItem('AUTH_SECRET', key);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  return localStorage.getItem('AUTH_SECRET');
})();

export async function syncData() {
  if (!AUTH_TOKEN) {
    throw new Error('缺少認證金鑰，請在 URL 帶入 ?key=YOUR_SECRET');
  }

  const pullRes = await fetch('./api/pull', {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });

  if (!pullRes.ok) {
    throw new Error(`同步失敗: ${pullRes.statusText}`);
  }

  const pullData = await pullRes.json();
  if (pullData.data) {
    await db.transaction('rw', db.tables, async () => {
      for (const [table, rows] of Object.entries(pullData.data)) {
        if (db[table] && rows && rows.length > 0) {
          await db[table].bulkPut(rows);
        }
      }
    });
    localStorage.setItem('lastUpdatedTimestamp', pullData.lastUpdatedTimestamp);
  }

  const baseTs = Number(localStorage.getItem('lastUpdatedTimestamp') || 0);
  const pushPayload = {
    baseTimestamp: baseTs,
    suppliers: await db.suppliers.toArray(),
    customers: await db.customers.toArray(),
    products: await db.products.toArray(),
    productVariants: await db.product_variants.toArray(),
    purchaseOrders: await db.purchase_orders.toArray(),
    purchaseItems: await db.purchase_items.toArray(),
    salesOrders: await db.sales_orders.toArray(),
    salesItems: await db.sales_items.toArray(),
  };

  const pushRes = await fetch('./api/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pushPayload),
  });

  const pushResult = await pushRes.json();
  if (!pushRes.ok) {
    throw new Error(pushResult.message || pushResult.error || '推播失敗');
  }

  localStorage.setItem('lastUpdatedTimestamp', pushResult.newTimestamp);
  eventBus.emit('sync:completed');
}

export async function exportBackup() {
  const backupData = {
    exported_at: new Date().toISOString(),
    lastUpdatedTimestamp: localStorage.getItem('lastUpdatedTimestamp') || '0',
  };

  // 動態走訪所有 Dexie 資料表進行完整資料傾印
  for (const table of db.tables) {
    backupData[table.name] = await table.toArray();
  }

  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `團購資料備份_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {File} file
 * @param {'replace' | 'merge-overwrite' | 'merge-skip'} mode
 */
export async function importBackup(file, mode = 'merge-overwrite') {
  const text = await file.text();
  const json = JSON.parse(text);

  // 雙向相容 snake_case 與 camelCase 欄位名稱
  const tablePayloadMap = {
    suppliers: json.suppliers,
    customers: json.customers,
    products: json.products,
    product_variants: json.product_variants || json.productVariants,
    purchase_orders: json.purchase_orders || json.purchaseOrders,
    purchase_items: json.purchase_items || json.purchaseItems,
    sales_orders: json.sales_orders || json.salesOrders,
    sales_items: json.sales_items || json.salesItems,
  };

  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      for (const table of db.tables) {
        await table.clear();
      }
    }

    for (const [table, rows] of Object.entries(tablePayloadMap)) {
      if (!db[table] || !Array.isArray(rows) || rows.length === 0) {
        continue;
      }

      if (mode === 'replace' || mode === 'merge-overwrite') {
        await db[table].bulkPut(rows);
      } else if (mode === 'merge-skip') {
        const existingKeys = new Set(await db[table].toCollection().primaryKeys());
        const toAdd = rows.filter((r) => {
          return !existingKeys.has(r.id);
        });
        if (toAdd.length > 0) {
          await db[table].bulkAdd(toAdd);
        }
      }
    }
  });

  if (json.lastUpdatedTimestamp) {
    localStorage.setItem('lastUpdatedTimestamp', json.lastUpdatedTimestamp);
  }

  eventBus.emit('products:changed');
  eventBus.emit('sales:changed');
  eventBus.emit('purchases:changed');
  eventBus.emit('members:changed');
}
