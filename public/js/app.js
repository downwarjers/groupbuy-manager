import { syncData, exportBackup, importBackup } from './core/sync.js';
import { ProductsView } from './views/products-view.js';
import { SalesView } from './views/sales-view.js';
import { PurchasesView } from './views/purchases-view.js';
import { MembersView } from './views/members-view.js';
import { ProductModal } from './modals/modal-product.js';
import { CustomerModal } from './modals/modal-customer.js';
import { SupplierModal } from './modals/modal-supplier.js';
import { SalesModal } from './modals/modal-sales.js';
import { PurchaseModal } from './modals/modal-purchase.js';
import { ReceiveModal } from './modals/modal-receive.js';
import { ShipmentModal } from './modals/modal-shipment.js';

// 提供單一命名空間掛載以供彈性調度
window.Modals = {
  ProductModal,
  CustomerModal,
  SupplierModal,
  SalesModal,
  PurchaseModal,
  ReceiveModal,
  ShipmentModal,
};

const viewRegistry = {
  'view-products': ProductsView,
  'view-orders': SalesView,
  'view-purchases': PurchasesView,
  'view-members': MembersView,
};

let currentTab = 'view-products';

export async function safeRenderView(tabId) {
  const view = viewRegistry[tabId];
  if (!view) {
    return;
  }
  try {
    await view.render();
  } catch (err) {
    console.error(`[App View Error] 渲染 ${tabId} 失敗:`, err);
    const container = document.getElementById(tabId);
    if (container) {
      container.innerHTML = `<div class="p-4 bg-red-50 text-red-500 rounded text-xs">視圖加載錯誤: ${err.message}</div>`;
    }
  }
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-content').forEach((el) => {
    return el.classList.add('hidden');
  });
  document.getElementById(tabId)?.classList.remove('hidden');

  ['view-products', 'view-orders', 'view-purchases', 'view-members'].forEach((t) => {
    const btn = document.getElementById(`nav-btn-${t}`);
    if (btn) {
      if (t === tabId) {
        btn.classList.remove('text-slate-400');
        btn.classList.add('text-blue-600');
      } else {
        btn.classList.remove('text-blue-600');
        btn.classList.add('text-slate-400');
      }
    }
  });

  safeRenderView(tabId);
}

const components = [
  { name: 'ProductModal', target: ProductModal },
  { name: 'CustomerModal', target: CustomerModal },
  { name: 'SupplierModal', target: SupplierModal },
  { name: 'SalesModal', target: SalesModal },
  { name: 'PurchaseModal', target: PurchaseModal },
  { name: 'ReceiveModal', target: ReceiveModal },
  { name: 'ShipmentModal', target: ShipmentModal },
  { name: 'ProductsView', target: ProductsView },
  { name: 'SalesView', target: SalesView },
  { name: 'PurchasesView', target: PurchasesView },
  { name: 'MembersView', target: MembersView },
];

components.forEach(({ name, target }) => {
  try {
    target.init();
  } catch (err) {
    console.error(`[Init Failure] 初始化 ${name} 模組失敗:`, err);
  }
});

document.querySelectorAll('nav button[id^="nav-btn-"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetTab = btn.id.replace('nav-btn-', '');
    switchTab(targetTab);
  });
});

document.getElementById('btn-export-backup')?.addEventListener('click', async () => {
  try {
    await exportBackup();
  } catch (err) {
    alert('備份匯出失敗: ' + err.message);
  }
});

let pendingImportFile = null;
const importModal = document.getElementById('modal-import-mode');

document.getElementById('btn-import-backup')?.addEventListener('click', () => {
  document.getElementById('file-import-backup')?.click();
});

document.getElementById('file-import-backup')?.addEventListener('change', (e) => {
  pendingImportFile = e.target.files?.[0] || null;
  if (!pendingImportFile) {
    return;
  }
  importModal?.classList.remove('hidden');
});

document.getElementById('btn-cancel-import-mode')?.addEventListener('click', () => {
  importModal?.classList.add('hidden');
  pendingImportFile = null;
  const input = document.getElementById('file-import-backup');
  if (input) {
    input.value = '';
  }
});

document.getElementById('btn-confirm-import-mode')?.addEventListener('click', async () => {
  if (!pendingImportFile) {
    return;
  }
  const selectedMode =
    document.querySelector('input[name="import-mode"]:checked')?.value || 'merge-overwrite';
  try {
    await importBackup(pendingImportFile, selectedMode);
    alert('資料備份匯入完成');
    await safeRenderView(currentTab);
  } catch (err) {
    console.error('[Import Error]:', err);
    alert('備份還原失敗: ' + err.message);
  } finally {
    importModal?.classList.add('hidden');
    pendingImportFile = null;
    const input = document.getElementById('file-import-backup');
    if (input) {
      input.value = '';
    }
  }
});

document.getElementById('btn-sync')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-sync');
  btn.textContent = '同步中...';
  btn.disabled = true;
  try {
    await syncData();
    alert('雲端同步成功');
  } catch (err) {
    alert('同步失敗: ' + err.message);
  } finally {
    btn.textContent = '雲端同步';
    btn.disabled = false;
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}

switchTab('view-products');
