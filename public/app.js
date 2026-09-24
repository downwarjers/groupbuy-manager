// 1. 初始化 Dexie 本地資料庫
const db = new Dexie('GroupBuyLocalDB');
db.version(1).stores({
  suppliers: 'id, name, is_deleted',
  customers: 'id, name, phone, is_deleted',
  products: 'id, name, is_deleted',
  purchase_orders: 'id, po_number, status, is_deleted',
  purchase_items: 'id, purchase_order_id, product_id',
  sales_orders: 'id, so_number, status, is_deleted',
  sales_items: 'id, sales_order_id, product_id',
});

// 2. 認證金鑰管理（長輩一次性帶入）
function checkAuthToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const key = urlParams.get('key');
  if (key) {
    localStorage.setItem('AUTH_SECRET', key);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  return localStorage.getItem('AUTH_SECRET');
}

const AUTH_TOKEN = checkAuthToken();

// 3. Tab 切換機制
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach((el) => {
    return el.classList.add('hidden');
  });
  document.getElementById(tabId).classList.remove('hidden');
  renderCurrentView();
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
  }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('hidden');
  }
}

// 4. 資料庫增刪改查邏輯
async function saveProduct() {
  const name = document.getElementById('prod-name').value.trim();
  const spec = document.getElementById('prod-spec').value.trim();
  const cost = Number(document.getElementById('prod-cost').value) || 0;
  const retail = Number(document.getElementById('prod-retail').value) || 0;
  const stock = Number(document.getElementById('prod-stock').value) || 0;

  if (!name) {
    return alert('請填寫商品名稱');
  }

  const newProduct = {
    id: crypto.randomUUID(),
    name,
    spec,
    cost_price: cost,
    retail_price: retail,
    supplier_id: '',
    current_stock: stock,
    is_deleted: 0,
    updated_at: new Date().toISOString(),
  };

  await db.products.add(newProduct);
  closeModal('modal-product');
  renderProducts();
}

async function renderProducts() {
  const container = document.getElementById('list-products');
  const products = await db.products.where('is_deleted').equals(0).toArray();

  if (products.length === 0) {
    container.innerHTML =
      '<div class="text-center text-slate-400 py-8">目前無商品，請點擊上方新增。</div>';
    return;
  }

  container.innerHTML = products
    .map((p) => {
      return `
    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
      <div>
        <div class="font-bold text-base text-slate-900">${p.name} <span class="text-xs text-slate-500 font-normal">(${p.spec || '無規格'})</span></div>
        <div class="text-xs text-slate-500 mt-1">售價: $${p.retail_price} | 成本: $${p.cost_price}</div>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-right">
          <div class="text-xs text-slate-400">現有庫存</div>
          <div class="text-lg font-bold ${p.current_stock <= 5 ? 'text-red-500' : 'text-blue-600'}">${p.current_stock}</div>
        </div>
        <button onclick="deleteProduct('${p.id}')" class="text-red-400 hover:text-red-600 text-xs px-2 py-1">刪除</button>
      </div>
    </div>
  `;
    })
    .join('');
}

async function deleteProduct(id) {
  if (!confirm('確定要刪除此商品？')) {
    return;
  }
  await db.products.update(id, { is_deleted: 1, updated_at: new Date().toISOString() });
  renderProducts();
}

function renderCurrentView() {
  renderProducts();
}

// 5. 雲端同步引擎 (Pull & Push)
document.getElementById('btn-sync').addEventListener('click', async () => {
  if (!AUTH_TOKEN) {
    return alert('缺少金鑰！請使用長輩專屬開通網址開啟。');
  }

  const btn = document.getElementById('btn-sync');
  btn.textContent = '同步中...';
  btn.disabled = true;

  try {
    // A. 先 Pull
    const pullRes = await fetch('./api/pull', {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    if (!pullRes.ok) {
      throw new Error('拉取失敗: ' + pullRes.statusText);
    }
    const pullData = await pullRes.json();

    // 更新本地快取
    if (pullData.data) {
      await db.transaction('rw', db.tables, async () => {
        for (const [table, rows] of Object.entries(pullData.data)) {
          if (db[table] && rows.length > 0) {
            await db[table].bulkPut(rows);
          }
        }
      });
      localStorage.setItem('lastUpdatedTimestamp', pullData.lastUpdatedTimestamp);
    }

    // B. 再 Push
    const baseTs = Number(localStorage.getItem('lastUpdatedTimestamp') || 0);
    const pushPayload = {
      baseTimestamp: baseTs,
      suppliers: await db.suppliers.toArray(),
      customers: await db.customers.toArray(),
      products: await db.products.toArray(),
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
      throw new Error(pushResult.message || pushResult.error);
    }

    localStorage.setItem('lastUpdatedTimestamp', pushResult.newTimestamp);
    alert('同步成功！');
    renderCurrentView();
  } catch (err) {
    alert('同步失敗: ' + err.message);
  } finally {
    btn.textContent = '立即同步';
    btn.disabled = false;
  }
});

// 6. JSON 本地逃生備份 (Fail-safe Export)
document.getElementById('btn-export-backup').addEventListener('click', async () => {
  const fullBackup = {
    exported_at: new Date().toISOString(),
    products: await db.products.toArray(),
    customers: await db.customers.toArray(),
    suppliers: await db.suppliers.toArray(),
    purchase_orders: await db.purchase_orders.toArray(),
    purchase_items: await db.purchase_items.toArray(),
    sales_orders: await db.sales_orders.toArray(),
    sales_items: await db.sales_items.toArray(),
  };

  const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `團購完整備份_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// 7. 啟動與 Service Worker 註冊
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}
renderCurrentView();
