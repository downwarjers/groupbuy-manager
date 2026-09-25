// 1. 初始化 Dexie 本地資料庫
const db = new Dexie('GroupBuyLocalDB');
db.version(2).stores({
  suppliers: 'id, name, phone, tel, is_deleted',
  customers: 'id, name, phone, tel, is_deleted',
  products: 'id, name, is_deleted',
  product_variants: 'id, product_id, spec_name, is_deleted',
  purchase_orders: 'id, po_number, supplier_id, status, order_date, is_deleted',
  purchase_items: 'id, purchase_order_id, variant_id',
  sales_orders: 'id, so_number, customer_id, status, order_date, is_deleted',
  sales_items: 'id, sales_order_id, variant_id',
});

const AUTH_TOKEN = (() => {
  const urlParams = new URLSearchParams(window.location.search);
  const key = urlParams.get('key');
  if (key) {
    localStorage.setItem('AUTH_SECRET', key);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  return localStorage.getItem('AUTH_SECRET');
})();

const SALES_STATUS_MAP = {
  PENDING: '待處理',
  PREPARING: '配貨中',
  SHIPPED: '已出貨',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const PURCHASE_STATUS_MAP = {
  PENDING: '待採購',
  ORDERED: '已下單',
  RECEIVED: '已到貨',
  CANCELLED: '已取消',
};

function getLocalDatetimeString(dateObj = new Date()) {
  const pad = (n) => {
    return String(n).padStart(2, '0');
  };
  const yyyy = dateObj.getFullYear();
  const mm = pad(dateObj.getMonth() + 1);
  const dd = pad(dateObj.getDate());
  const hh = pad(dateObj.getHours());
  const mi = pad(dateObj.getMinutes());
  const ss = pad(dateObj.getSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach((el) => {
    return el.classList.add('hidden');
  });
  document.getElementById(tabId).classList.remove('hidden');

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

// ==========================================
// 2. 商品模組 (新增 / 編輯 / 刪除 / 搜尋 / 排序)
// ==========================================
function openProductModal(prodId = null) {
  document.getElementById('prod-id').value = prodId || '';
  document.getElementById('product-variants-container').innerHTML = '';

  if (prodId) {
    document.getElementById('modal-product-title').textContent = '修改商品資料';
    Promise.all([
      db.products.get(prodId),
      db.product_variants
        .where('product_id')
        .equals(prodId)
        .filter((v) => {
          return v.is_deleted === 0;
        })
        .toArray(),
    ]).then(([prod, variants]) => {
      document.getElementById('prod-name').value = prod.name;
      document.getElementById('prod-desc').value = prod.description || '';
      variants.forEach((v) => {
        addProductVariantRow(
          v.spec_name,
          v.unit_quantity,
          v.unit_name,
          v.cost_price,
          v.retail_price,
          v.current_stock,
          v.id,
        );
      });
      openModal('modal-product');
    });
  } else {
    document.getElementById('modal-product-title').textContent = '新增商品資料';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-desc').value = '';
    addProductVariantRow('預設規格', 1, '個', 0, 0, 0);
    openModal('modal-product');
  }
}

function addProductVariantRow(
  name = '',
  qty = 1,
  unit = '個',
  cost = 0,
  retail = 0,
  stock = 0,
  variantId = '',
) {
  const container = document.getElementById('product-variants-container');
  const rowId = `v-row-${crypto.randomUUID()}`;
  const html = `
    <div id="${rowId}" class="p-2 border rounded-lg bg-slate-50 space-y-1 text-xs" data-variant-id="${variantId}">
      <div class="flex gap-2 items-center">
        <input type="text" placeholder="規格名稱 (例: 紅 / XL)" value="${name}" class="var-name border p-1 rounded flex-1">
        <input type="number" placeholder="數量" value="${qty}" class="var-unit-qty border p-1 rounded w-16">
        <input list="common-units" placeholder="單位" value="${unit}" class="var-unit border p-1 rounded w-16">
        <datalist id="common-units">
          <option value="個"><option value="包"><option value="箱"><option value="瓶"><option value="條"><option value="罐">
        </datalist>
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="text-red-500 font-bold px-1">✕</button>
      </div>
      <div class="flex gap-2">
        <input type="number" placeholder="進價" value="${cost || ''}" class="var-cost border p-1 rounded flex-1">
        <input type="number" placeholder="售價" value="${retail || ''}" class="var-retail border p-1 rounded flex-1">
        <input type="number" placeholder="現有庫存" value="${stock || ''}" class="var-stock border p-1 rounded w-20">
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', html);
}

async function saveProduct() {
  const prodId = document.getElementById('prod-id').value || crypto.randomUUID();
  const name = document.getElementById('prod-name').value.trim();
  const desc = document.getElementById('prod-desc').value.trim();
  if (!name) {
    return alert('商品名稱必填');
  }

  const variantRows = document.querySelectorAll('#product-variants-container > div');
  if (variantRows.length === 0) {
    return alert('請至少保留一個商品規格');
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.products, db.product_variants, async () => {
    await db.products.put({
      id: prodId,
      name,
      description: desc,
      supplier_id: '',
      is_deleted: 0,
      updated_at: now,
    });

    const existingVariants = await db.product_variants.where('product_id').equals(prodId).toArray();
    const keptVariantIds = [];

    for (const row of variantRows) {
      const vId = row.dataset.variantId || crypto.randomUUID();
      keptVariantIds.push(vId);

      const vName = row.querySelector('.var-name').value.trim() || '預設規格';
      const unitQty = Number(row.querySelector('.var-unit-qty').value) || 1;
      const unitName = row.querySelector('.var-unit').value.trim() || '個';
      const cost = Number(row.querySelector('.var-cost').value) || 0;
      const retail = Number(row.querySelector('.var-retail').value) || 0;
      const stock = Number(row.querySelector('.var-stock').value) || 0;

      await db.product_variants.put({
        id: vId,
        product_id: prodId,
        spec_name: vName,
        unit_quantity: unitQty,
        unit_name: unitName,
        cost_price: cost,
        retail_price: retail,
        current_stock: stock,
        is_deleted: 0,
        updated_at: now,
      });
    }

    for (const oldV of existingVariants) {
      if (!keptVariantIds.includes(oldV.id)) {
        await db.product_variants.update(oldV.id, { is_deleted: 1, updated_at: now });
      }
    }
  });

  closeModal('modal-product');
  renderProducts();
}

async function renderProducts() {
  const container = document.getElementById('list-products');
  const searchKeyword = (document.getElementById('search-product')?.value || '')
    .toLowerCase()
    .trim();
  const sortMode = document.getElementById('sort-product')?.value || 'name_asc';

  let products = await db.products.where('is_deleted').equals(0).toArray();

  if (searchKeyword) {
    products = products.filter((p) => {
      return (
        p.name.toLowerCase().includes(searchKeyword) ||
        (p.description && p.description.toLowerCase().includes(searchKeyword))
      );
    });
  }

  products.sort((a, b) => {
    if (sortMode === 'name_asc') {
      return a.name.localeCompare(b.name, 'zh-Hant');
    }
    if (sortMode === 'name_desc') {
      return b.name.localeCompare(a.name, 'zh-Hant');
    }
    if (sortMode === 'date_desc') {
      return b.updated_at.localeCompare(a.updated_at);
    }
    return 0;
  });

  if (products.length === 0) {
    container.innerHTML = '<div class="text-center text-slate-400 py-8">無符合條件商品</div>';
    return;
  }

  const variants = await db.product_variants.where('is_deleted').equals(0).toArray();
  const variantMap = new Map();
  variants.forEach((v) => {
    if (!variantMap.has(v.product_id)) {
      variantMap.set(v.product_id, []);
    }
    variantMap.get(v.product_id).push(v);
  });

  container.innerHTML = products
    .map((p) => {
      const pVariants = variantMap.get(p.id) || [];
      const variantListHtml = pVariants
        .map((v) => {
          return `
      <div class="text-xs bg-slate-50 border border-slate-200 rounded p-1.5 flex justify-between mt-1">
        <span><b>${v.spec_name}</b> (${v.unit_quantity}${v.unit_name}) - 售: $${v.retail_price} / 本: $${v.cost_price}</span>
        <span class="font-bold ${v.current_stock <= 3 ? 'text-red-500' : 'text-slate-600'}">庫存: ${v.current_stock}</span>
      </div>
    `;
        })
        .join('');

      return `
      <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div class="flex justify-between items-start">
          <div>
            <div class="font-bold text-base text-slate-900">${p.name}</div>
            ${p.description ? `<div class="text-xs text-slate-500 mt-0.5">${p.description}</div>` : ''}
          </div>
          <div class="flex gap-2">
            <button onclick="openProductModal('${p.id}')" class="text-blue-500 hover:text-blue-700 text-xs font-semibold">修改</button>
            <button onclick="deleteProduct('${p.id}')" class="text-red-400 hover:text-red-600 text-xs">刪除</button>
          </div>
        </div>
        <div class="mt-2 space-y-1">${variantListHtml}</div>
      </div>
    `;
    })
    .join('');
}

async function deleteProduct(id) {
  if (!confirm('確認刪除該商品及其所有規格？')) {
    return;
  }
  const now = new Date().toISOString();
  await db.transaction('rw', db.products, db.product_variants, async () => {
    await db.products.update(id, { is_deleted: 1, updated_at: now });
    const variants = await db.product_variants.where('product_id').equals(id).toArray();
    for (const v of variants) {
      await db.product_variants.update(v.id, { is_deleted: 1, updated_at: now });
    }
  });
  renderProducts();
}

// ==========================================
// 3. 客戶與供應商名錄模組 (含修改、刪除)
// ==========================================
function openCustomerModal(id = null) {
  document.getElementById('cust-id').value = id || '';
  if (id) {
    document.getElementById('modal-customer-title').textContent = '修改客戶資料';
    db.customers.get(id).then((c) => {
      document.getElementById('cust-name').value = c.name;
      document.getElementById('cust-phone').value = c.phone || '';
      document.getElementById('cust-tel').value = c.tel || '';
      document.getElementById('cust-email').value = c.email || '';
      document.getElementById('cust-address').value = c.address || '';
      document.getElementById('cust-birthday').value = c.birthday || '';
      document.getElementById('cust-note').value = c.note || '';
      openModal('modal-customer');
    });
  } else {
    document.getElementById('modal-customer-title').textContent = '新增客戶資料';
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-tel').value = '';
    document.getElementById('cust-email').value = '';
    document.getElementById('cust-address').value = '';
    document.getElementById('cust-birthday').value = '';
    document.getElementById('cust-note').value = '';
    openModal('modal-customer');
  }
}

async function saveCustomer() {
  const id = document.getElementById('cust-id').value || crypto.randomUUID();
  const name = document.getElementById('cust-name').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const tel = document.getElementById('cust-tel').value.trim();
  const email = document.getElementById('cust-email').value.trim();
  const address = document.getElementById('cust-address').value.trim();
  const birthday = document.getElementById('cust-birthday').value;
  const note = document.getElementById('cust-note').value.trim();

  if (!name || !phone) {
    return alert('姓名與手機號碼為必填');
  }

  await db.customers.put({
    id,
    name,
    phone,
    tel,
    email,
    address,
    birthday,
    note,
    is_deleted: 0,
    updated_at: new Date().toISOString(),
  });

  closeModal('modal-customer');
  renderMembers();
}

async function deleteCustomer(id) {
  if (!confirm('確認刪除此客戶資料？')) {
    return;
  }
  await db.customers.update(id, { is_deleted: 1, updated_at: new Date().toISOString() });
  renderMembers();
}

function openSupplierModal(id = null) {
  document.getElementById('sup-id').value = id || '';
  if (id) {
    document.getElementById('modal-supplier-title').textContent = '修改供應商資料';
    db.suppliers.get(id).then((s) => {
      document.getElementById('sup-name').value = s.name;
      document.getElementById('sup-contact').value = s.contact_person || '';
      document.getElementById('sup-tel').value = s.tel || '';
      document.getElementById('sup-phone').value = s.phone || '';
      document.getElementById('sup-email').value = s.email || '';
      document.getElementById('sup-address').value = s.address || '';
      openModal('modal-supplier');
    });
  } else {
    document.getElementById('modal-supplier-title').textContent = '新增供應商資料';
    document.getElementById('sup-name').value = '';
    document.getElementById('sup-contact').value = '';
    document.getElementById('sup-tel').value = '';
    document.getElementById('sup-phone').value = '';
    document.getElementById('sup-email').value = '';
    document.getElementById('sup-address').value = '';
    openModal('modal-supplier');
  }
}

async function saveSupplier() {
  const id = document.getElementById('sup-id').value || crypto.randomUUID();
  const name = document.getElementById('sup-name').value.trim();
  const contact = document.getElementById('sup-contact').value.trim();
  const tel = document.getElementById('sup-tel').value.trim();
  const phone = document.getElementById('sup-phone').value.trim();
  const email = document.getElementById('sup-email').value.trim();
  const address = document.getElementById('sup-address').value.trim();

  if (!name) {
    return alert('廠商名稱必填');
  }
  if (!tel && !phone) {
    return alert('市話或手機請至少填寫一項');
  }

  await db.suppliers.put({
    id,
    name,
    contact_person: contact,
    tel,
    phone,
    email,
    address,
    website: '',
    is_deleted: 0,
    updated_at: new Date().toISOString(),
  });

  closeModal('modal-supplier');
  renderMembers();
}

async function deleteSupplier(id) {
  if (!confirm('確認刪除此供應商資料？')) {
    return;
  }
  await db.suppliers.update(id, { is_deleted: 1, updated_at: new Date().toISOString() });
  renderMembers();
}

async function renderMembers() {
  const searchKeyword = (document.getElementById('search-member')?.value || '')
    .toLowerCase()
    .trim();
  const sortMode = document.getElementById('sort-member')?.value || 'name_asc';

  let [customers, suppliers] = await Promise.all([
    db.customers.where('is_deleted').equals(0).toArray(),
    db.suppliers.where('is_deleted').equals(0).toArray(),
  ]);

  if (searchKeyword) {
    customers = customers.filter((c) => {
      return (
        c.name.toLowerCase().includes(searchKeyword) ||
        (c.phone && c.phone.includes(searchKeyword)) ||
        (c.tel && c.tel.includes(searchKeyword)) ||
        (c.address && c.address.toLowerCase().includes(searchKeyword))
      );
    });
    suppliers = suppliers.filter((s) => {
      return (
        s.name.toLowerCase().includes(searchKeyword) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(searchKeyword)) ||
        (s.tel && s.tel.includes(searchKeyword)) ||
        (s.phone && s.phone.includes(searchKeyword)) ||
        (s.address && s.address.toLowerCase().includes(searchKeyword))
      );
    });
  }

  customers.sort((a, b) => {
    return sortMode === 'name_asc'
      ? a.name.localeCompare(b.name, 'zh-Hant')
      : b.updated_at.localeCompare(a.updated_at);
  });
  suppliers.sort((a, b) => {
    return sortMode === 'name_asc'
      ? a.name.localeCompare(b.name, 'zh-Hant')
      : b.updated_at.localeCompare(a.updated_at);
  });

  document.getElementById('list-customers').innerHTML =
    customers
      .map((c) => {
        return `
    <div class="bg-white p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-start">
      <div class="space-y-1">
        <div class="font-bold text-slate-800 text-sm">${c.name}</div>
        <div class="text-slate-600">手機: ${c.phone} | 市話: ${c.tel || '無'}</div>
        <div class="text-slate-500">信箱: ${c.email || '無'} | 生日: ${c.birthday || '無'}</div>
        <div class="text-slate-500">地址: ${c.address || '無'}</div>
      </div>
      <div class="flex gap-2">
        <button onclick="openCustomerModal('${c.id}')" class="text-blue-600 font-semibold px-1">修改</button>
        <button onclick="deleteCustomer('${c.id}')" class="text-red-500 font-semibold px-1">刪除</button>
      </div>
    </div>
  `;
      })
      .join('') || '<div class="text-slate-400 text-xs">無客戶資料</div>';

  document.getElementById('list-suppliers').innerHTML =
    suppliers
      .map((s) => {
        return `
    <div class="bg-white p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-start">
      <div class="space-y-1">
        <div class="font-bold text-slate-800 text-sm">${s.name} (聯絡人: ${s.contact_person || '無'})</div>
        <div class="text-slate-600">市話: ${s.tel || '無'} | 手機: ${s.phone || '無'}</div>
        <div class="text-slate-500">信箱: ${s.email || '無'} | 地址: ${s.address || '無'}</div>
      </div>
      <div class="flex gap-2">
        <button onclick="openSupplierModal('${s.id}')" class="text-blue-600 font-semibold px-1">修改</button>
        <button onclick="deleteSupplier('${s.id}')" class="text-red-500 font-semibold px-1">刪除</button>
      </div>
    </div>
  `;
      })
      .join('') || '<div class="text-slate-400 text-xs">無供應商資料</div>';
}

// ==========================================
// 4. 即時供需缺額計算引擎 (Real-time Computed)
// ==========================================
let activeVariantsCache = [];

async function refreshVariantsCache() {
  const [products, variants] = await Promise.all([
    db.products.where('is_deleted').equals(0).toArray(),
    db.product_variants.where('is_deleted').equals(0).toArray(),
  ]);
  const pMap = new Map(
    products.map((p) => {
      return [p.id, p.name];
    }),
  );
  activeVariantsCache = variants.map((v) => {
    const pName = pMap.get(v.product_id) || '未知商品';
    return {
      ...v,
      productName: pName,
      displayName: `【${pName}】${v.spec_name} (${v.unit_quantity}${v.unit_name})`,
    };
  });
}

async function getVariantDisplayMap() {
  const [products, variants] = await Promise.all([
    db.products.toArray(),
    db.product_variants.toArray(),
  ]);
  const pMap = new Map(
    products.map((p) => {
      return [p.id, p.name];
    }),
  );
  const displayMap = new Map();
  variants.forEach((v) => {
    const pName = pMap.get(v.product_id) || '未知商品';
    displayMap.set(v.id, `【${pName}】${v.spec_name} (${v.unit_quantity}${v.unit_name})`);
  });
  return displayMap;
}

/**
 * 即時計算所有規格的供需平衡與全域缺額
 * 缺額 = max(0, 客戶需求總量 - 採購叫貨總量 - 現有庫存)
 */
async function computeRealtimeShortages() {
  const [salesOrders, salesItems, purchaseOrders, purchaseItems, variants, products] =
    await Promise.all([
      db.sales_orders.where('is_deleted').equals(0).toArray(),
      db.sales_items.toArray(),
      db.purchase_orders.where('is_deleted').equals(0).toArray(),
      db.purchase_items.toArray(),
      db.product_variants.where('is_deleted').equals(0).toArray(),
      db.products.where('is_deleted').equals(0).toArray(),
    ]);

  const pMap = new Map(
    products.map((p) => {
      return [p.id, p.name];
    }),
  );
  const balanceMap = new Map();

  variants.forEach((v) => {
    const pName = pMap.get(v.product_id) || '未知商品';
    balanceMap.set(v.id, {
      variantId: v.id,
      displayName: `【${pName}】${v.spec_name} (${v.unit_quantity}${v.unit_name})`,
      costPrice: v.cost_price,
      stock: v.current_stock || 0,
      demand: 0,
      supply: 0,
      shortage: 0,
    });
  });

  // 聚合有效銷售需求 (排除已取消與已完成的訂單)
  const activeSoIds = new Set(
    salesOrders
      .filter((o) => {
        return o.status !== 'CANCELLED' && o.status !== 'COMPLETED';
      })
      .map((o) => {
        return o.id;
      }),
  );

  salesItems.forEach((item) => {
    if (activeSoIds.has(item.sales_order_id) && balanceMap.has(item.variant_id)) {
      balanceMap.get(item.variant_id).demand += item.quantity;
    }
  });

  // 聚合有效採購供給量 (排除已取消的叫貨單)
  const activePoIds = new Set(
    purchaseOrders
      .filter((o) => {
        return o.status !== 'CANCELLED';
      })
      .map((o) => {
        return o.id;
      }),
  );

  purchaseItems.forEach((item) => {
    if (activePoIds.has(item.purchase_order_id) && balanceMap.has(item.variant_id)) {
      balanceMap.get(item.variant_id).supply += item.quantity;
    }
  });

  // 動態推算缺額
  balanceMap.forEach((item) => {
    const net = item.demand - item.supply - item.stock;
    item.shortage = Math.max(0, net);
  });

  return balanceMap;
}

function addOrderItemRow(type, selectedVariantId = '', qty = 1, price = null) {
  const container = document.getElementById(`${type}-items-container`);
  const rowId = `item-${crypto.randomUUID()}`;

  const grouped = {};
  activeVariantsCache.forEach((v) => {
    if (!grouped[v.productName]) {
      grouped[v.productName] = [];
    }
    grouped[v.productName].push(v);
  });

  let optionsHtml = '<option value="">-- 請選擇商品與規格 --</option>';
  for (const [prodName, vars] of Object.entries(grouped)) {
    optionsHtml += `<optgroup label="📦 ${prodName}">`;
    vars.forEach((v) => {
      optionsHtml += `<option value="${v.id}" data-cost="${v.cost_price}" data-retail="${v.retail_price}" ${v.id === selectedVariantId ? 'selected' : ''}>
        ${v.spec_name} (${v.unit_quantity}${v.unit_name})
      </option>`;
    });
    optionsHtml += `</optgroup>`;
  }

  const initialPrice = price !== null ? price : 0;
  const initialSubtotal = qty * initialPrice;

  const html = `
    <div id="${rowId}" class="flex gap-2 items-center text-xs">
      <select class="item-variant border p-1.5 rounded flex-1" onchange="updateRowPrice('${rowId}', '${type}')">
        ${optionsHtml}
      </select>
      <input type="number" value="${qty}" min="1" class="item-qty border p-1.5 rounded w-16" oninput="calculateTotal('${type}')">
      <input type="number" value="${initialPrice}" class="item-price border p-1.5 rounded w-20" oninput="calculateTotal('${type}')">
      <span class="item-subtotal font-semibold w-16 text-right">$${initialSubtotal}</span>
      <button type="button" onclick="document.getElementById('${rowId}').remove(); calculateTotal('${type}');" class="text-red-500 font-bold px-1">✕</button>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', html);

  if (price === null && selectedVariantId) {
    updateRowPrice(rowId, type);
  } else {
    calculateTotal(type);
  }
}

function updateRowPrice(rowId, type) {
  const row = document.getElementById(rowId);
  const select = row.querySelector('.item-variant');
  const selectedOpt = select.options[select.selectedIndex];
  const priceInput = row.querySelector('.item-price');

  if (selectedOpt && selectedOpt.dataset) {
    priceInput.value =
      type === 'sales' ? selectedOpt.dataset.retail || 0 : selectedOpt.dataset.cost || 0;
  }
  calculateTotal(type);
}

function calculateTotal(type) {
  const rows = document.querySelectorAll(`#${type}-items-container > div`);
  let sum = 0;
  rows.forEach((r) => {
    const qty = Number(r.querySelector('.item-qty').value) || 0;
    const price = Number(r.querySelector('.item-price').value) || 0;
    const subtotal = qty * price;
    r.querySelector('.item-subtotal').textContent = `$${subtotal}`;
    sum += subtotal;
  });
  document.getElementById(
    type === 'sales' ? 'sales-total-amount' : 'purchase-total-cost',
  ).textContent = sum;
}

// ==========================================
// 5. 出貨訂單維護 (Master-Detail、修改、刪除)
// ==========================================
async function openSalesModal(soId = null) {
  await refreshVariantsCache();
  const customers = await db.customers.where('is_deleted').equals(0).toArray();
  const select = document.getElementById('sales-customer-select');
  select.innerHTML =
    '<option value="">選擇客戶 *</option>' +
    customers
      .map((c) => {
        return `<option value="${c.id}">${c.name} (${c.phone})</option>`;
      })
      .join('');
  document.getElementById('sales-items-container').innerHTML = '';

  if (soId) {
    document.getElementById('modal-sales-title').textContent = '修改客戶出貨訂單';
    document.getElementById('sales-order-id').value = soId;
    const [order, items] = await Promise.all([
      db.sales_orders.get(soId),
      db.sales_items.where('sales_order_id').equals(soId).toArray(),
    ]);
    select.value = order.customer_id;
    document.getElementById('sales-order-datetime').value = order.order_date;
    document.getElementById('sales-order-status').value = order.status;

    items.forEach((i) => {
      addOrderItemRow('sales', i.variant_id, i.quantity, i.unit_price);
    });
    calculateTotal('sales');
  } else {
    document.getElementById('modal-sales-title').textContent = '建立客戶出貨訂單';
    document.getElementById('sales-order-id').value = '';
    document.getElementById('sales-order-datetime').value = getLocalDatetimeString();
    document.getElementById('sales-order-status').value = 'PENDING';
    addOrderItemRow('sales');
    calculateTotal('sales');
  }

  openModal('modal-sales');
}

async function saveSalesOrder() {
  const soId = document.getElementById('sales-order-id').value || crypto.randomUUID();
  const isEditing = !!document.getElementById('sales-order-id').value;
  const customerId = document.getElementById('sales-customer-select').value;
  const orderDatetime =
    document.getElementById('sales-order-datetime').value || getLocalDatetimeString();
  const status = document.getElementById('sales-order-status').value;

  if (!customerId) {
    return alert('必須選擇客戶');
  }

  const rows = document.querySelectorAll('#sales-items-container > div');
  if (rows.length === 0) {
    return alert('訂單品項不可為空');
  }

  let totalAmount = 0;
  const detailItems = [];

  for (const r of rows) {
    const variantId = r.querySelector('.item-variant').value;
    const qty = Number(r.querySelector('.item-qty').value) || 0;
    const price = Number(r.querySelector('.item-price').value) || 0;
    if (!variantId || qty <= 0) {
      continue;
    }

    const subtotal = qty * price;
    totalAmount += subtotal;
    detailItems.push({
      id: crypto.randomUUID(),
      sales_order_id: soId,
      variant_id: variantId,
      quantity: qty,
      unit_price: price,
      subtotal,
    });
  }

  if (detailItems.length === 0) {
    return alert('請選擇正確品項與數量');
  }

  await db.transaction('rw', db.sales_orders, db.sales_items, async () => {
    let soNumber = `SO-${Date.now().toString().slice(-6)}`;
    if (isEditing) {
      const old = await db.sales_orders.get(soId);
      if (old) {
        soNumber = old.so_number;
      }
    }

    await db.sales_orders.put({
      id: soId,
      so_number: soNumber,
      customer_id: customerId,
      status,
      total_amount: totalAmount,
      order_date: orderDatetime,
      is_deleted: 0,
      updated_at: new Date().toISOString(),
    });

    await db.sales_items.where('sales_order_id').equals(soId).delete();
    await db.sales_items.bulkAdd(detailItems);
  });

  closeModal('modal-sales');
  renderSalesOrders();
}

async function deleteSalesOrder(id) {
  if (!confirm('確認刪除此筆出貨訂單？')) {
    return;
  }
  const now = new Date().toISOString();
  await db.transaction('rw', db.sales_orders, async () => {
    await db.sales_orders.update(id, { is_deleted: 1, updated_at: now });
  });
  renderSalesOrders();
}

async function renderSalesOrders() {
  const container = document.getElementById('list-sales-orders');
  const searchKeyword = (document.getElementById('search-sales')?.value || '').toLowerCase().trim();
  const filterStatus = document.getElementById('filter-sales-status')?.value || 'ALL';
  const sortMode = document.getElementById('sort-sales')?.value || 'date_desc';

  let [orders, customers, items, balanceMap] = await Promise.all([
    db.sales_orders.where('is_deleted').equals(0).toArray(),
    db.customers.toArray(),
    db.sales_items.toArray(),
    computeRealtimeShortages(),
  ]);

  const custMap = new Map(
    customers.map((c) => {
      return [c.id, c.name];
    }),
  );
  const varMap = await getVariantDisplayMap();

  if (filterStatus !== 'ALL') {
    orders = orders.filter((o) => {
      return o.status === filterStatus;
    });
  }

  if (searchKeyword) {
    orders = orders.filter((o) => {
      return (
        o.so_number.toLowerCase().includes(searchKeyword) ||
        (custMap.get(o.customer_id) &&
          custMap.get(o.customer_id).toLowerCase().includes(searchKeyword))
      );
    });
  }

  orders.sort((a, b) => {
    if (sortMode === 'date_desc') {
      return b.order_date.localeCompare(a.order_date);
    }
    if (sortMode === 'date_asc') {
      return a.order_date.localeCompare(b.order_date);
    }
    if (sortMode === 'amount_desc') {
      return b.total_amount - a.total_amount;
    }
    return 0;
  });

  if (orders.length === 0) {
    container.innerHTML = '<div class="text-center text-slate-400 py-8">無符合條件的出貨訂單</div>';
    return;
  }

  const statusColorMap = {
    PENDING: 'bg-amber-100 text-amber-800',
    PREPARING: 'bg-blue-100 text-blue-800',
    SHIPPED: 'bg-purple-100 text-purple-800',
    COMPLETED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-slate-200 text-slate-600',
  };

  container.innerHTML = orders
    .map((o) => {
      const orderDetails = items.filter((i) => {
        return i.sales_order_id === o.id;
      });
      const detailHtml = orderDetails
        .map((d) => {
          const balance = balanceMap.get(d.variant_id);
          const isShort = balance && balance.shortage > 0;
          return `
        <div class="text-xs text-slate-600 flex justify-between items-center py-0.5">
          <span class="font-medium text-slate-800">${varMap.get(d.variant_id) || '未知商品'}</span>
          <div class="flex gap-2 items-center">
            <span>數量: ${d.quantity}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded ${isShort ? 'bg-red-50 text-red-600 font-semibold' : 'bg-slate-100 text-slate-500'}">
              ${isShort ? `全域缺 ${balance.shortage}` : '供貨足'}
            </span>
            <span class="font-semibold text-slate-700">$${d.subtotal}</span>
          </div>
        </div>
      `;
        })
        .join('');

      const statusText = SALES_STATUS_MAP[o.status] || o.status;

      return `
      <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
        <div class="flex justify-between items-center text-sm">
          <span class="font-bold text-slate-900">${custMap.get(o.customer_id) || '未知客戶'} <span class="text-xs text-slate-400">(${o.so_number})</span></span>
          <div class="flex items-center gap-2">
            <span class="text-[11px] px-2 py-0.5 rounded font-bold ${statusColorMap[o.status] || 'bg-slate-100'}">${statusText}</span>
            <button onclick="openSalesModal('${o.id}')" class="text-blue-600 font-semibold text-xs">修改</button>
            <button onclick="deleteSalesOrder('${o.id}')" class="text-red-400 hover:text-red-600 text-xs">刪除</button>
          </div>
        </div>
        <div class="border-t border-b py-2 space-y-1">${detailHtml}</div>
        <div class="flex justify-between items-center text-xs">
          <span class="text-slate-400">時間: ${o.order_date.replace('T', ' ')}</span>
          <span class="text-sm font-bold text-emerald-600">總額: $${o.total_amount}</span>
        </div>
      </div>
    `;
    })
    .join('');
}

// ==========================================
// 6. 叫貨單維護 (Master-Detail、修改、刪除)
// ==========================================
async function openPurchaseModal(poId = null) {
  await refreshVariantsCache();
  const suppliers = await db.suppliers.where('is_deleted').equals(0).toArray();
  const select = document.getElementById('purchase-supplier-select');
  select.innerHTML =
    '<option value="">選擇供應商 *</option>' +
    suppliers
      .map((s) => {
        return `<option value="${s.id}">${s.name}</option>`;
      })
      .join('');
  document.getElementById('purchase-items-container').innerHTML = '';

  if (poId) {
    document.getElementById('modal-purchase-title').textContent = '修改供應商叫貨單';
    document.getElementById('purchase-order-id').value = poId;
    const [order, items] = await Promise.all([
      db.purchase_orders.get(poId),
      db.purchase_items.where('purchase_order_id').equals(poId).toArray(),
    ]);
    select.value = order.supplier_id;
    document.getElementById('purchase-order-datetime').value = order.order_date;
    document.getElementById('purchase-order-status').value = order.status;

    items.forEach((i) => {
      addOrderItemRow('purchase', i.variant_id, i.quantity, i.unit_cost);
    });
    calculateTotal('purchase');
  } else {
    document.getElementById('modal-purchase-title').textContent = '建立供應商叫貨單';
    document.getElementById('purchase-order-id').value = '';
    document.getElementById('purchase-order-datetime').value = getLocalDatetimeString();
    document.getElementById('purchase-order-status').value = 'PENDING';
    addOrderItemRow('purchase');
    calculateTotal('purchase');
  }

  openModal('modal-purchase');
}

async function savePurchaseOrder() {
  const poId = document.getElementById('purchase-order-id').value || crypto.randomUUID();
  const isEditing = !!document.getElementById('purchase-order-id').value;
  const supplierId = document.getElementById('purchase-supplier-select').value;
  const orderDatetime =
    document.getElementById('purchase-order-datetime').value || getLocalDatetimeString();
  const status = document.getElementById('purchase-order-status').value;

  if (!supplierId) {
    return alert('必須選擇供應商');
  }

  const rows = document.querySelectorAll('#purchase-items-container > div');
  let totalCost = 0;
  const detailItems = [];

  for (const r of rows) {
    const variantId = r.querySelector('.item-variant').value;
    const qty = Number(r.querySelector('.item-qty').value) || 0;
    const price = Number(r.querySelector('.item-price').value) || 0;
    if (!variantId || qty <= 0) {
      continue;
    }

    const subtotal = qty * price;
    totalCost += subtotal;
    detailItems.push({
      id: crypto.randomUUID(),
      purchase_order_id: poId,
      variant_id: variantId,
      quantity: qty,
      unit_cost: price,
      subtotal,
    });
  }

  if (detailItems.length === 0) {
    return alert('叫貨明細不可為空');
  }

  await db.transaction('rw', [db.purchase_orders, db.purchase_items], async () => {
    let poNumber = `PO-${Date.now().toString().slice(-6)}`;
    if (isEditing) {
      const old = await db.purchase_orders.get(poId);
      if (old) {
        poNumber = old.po_number;
      }
    }

    await db.purchase_orders.put({
      id: poId,
      po_number: poNumber,
      supplier_id: supplierId,
      status,
      total_cost: totalCost,
      order_date: orderDatetime,
      is_deleted: 0,
      updated_at: new Date().toISOString(),
    });

    await db.purchase_items.where('purchase_order_id').equals(poId).delete();
    await db.purchase_items.bulkAdd(detailItems);
  });

  closeModal('modal-purchase');
  renderPurchaseOrders();
  renderSalesOrders(); // 畫面重繪時自動反映最新全域供需平衡
}

async function deletePurchaseOrder(id) {
  if (!confirm('確認刪除此筆叫貨單？')) {
    return;
  }
  const now = new Date().toISOString();
  await db.transaction('rw', db.purchase_orders, async () => {
    await db.purchase_orders.update(id, { is_deleted: 1, updated_at: now });
  });
  renderPurchaseOrders();
  renderSalesOrders();
}

async function renderPurchaseOrders() {
  const container = document.getElementById('list-purchase-orders');
  const searchKeyword = (document.getElementById('search-purchase')?.value || '')
    .toLowerCase()
    .trim();
  const filterStatus = document.getElementById('filter-purchase-status')?.value || 'ALL';
  const sortMode = document.getElementById('sort-purchase')?.value || 'date_desc';

  let [orders, suppliers, items] = await Promise.all([
    db.purchase_orders.where('is_deleted').equals(0).toArray(),
    db.suppliers.toArray(),
    db.purchase_items.toArray(),
  ]);

  const supMap = new Map(
    suppliers.map((s) => {
      return [s.id, s.name];
    }),
  );
  const varMap = await getVariantDisplayMap();

  if (filterStatus !== 'ALL') {
    orders = orders.filter((o) => {
      return o.status === filterStatus;
    });
  }

  if (searchKeyword) {
    orders = orders.filter((o) => {
      return (
        o.po_number.toLowerCase().includes(searchKeyword) ||
        (supMap.get(o.supplier_id) &&
          supMap.get(o.supplier_id).toLowerCase().includes(searchKeyword))
      );
    });
  }

  orders.sort((a, b) => {
    if (sortMode === 'date_desc') {
      return b.order_date.localeCompare(a.order_date);
    }
    if (sortMode === 'date_asc') {
      return a.order_date.localeCompare(b.order_date);
    }
    if (sortMode === 'cost_desc') {
      return b.total_cost - a.total_cost;
    }
    return 0;
  });

  if (orders.length === 0) {
    container.innerHTML = '<div class="text-center text-slate-400 py-8">無符合條件的叫貨單</div>';
    return;
  }

  const statusColorMap = {
    PENDING: 'bg-amber-100 text-amber-800',
    ORDERED: 'bg-blue-100 text-blue-800',
    RECEIVED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-slate-200 text-slate-600',
  };

  container.innerHTML = orders
    .map((o) => {
      const orderDetails = items.filter((i) => {
        return i.purchase_order_id === o.id;
      });
      const detailHtml = orderDetails
        .map((d) => {
          return `
      <div class="text-xs text-slate-600 flex justify-between items-center py-0.5">
        <span class="font-medium text-slate-800">${varMap.get(d.variant_id) || '未知商品'}</span>
        <div>
          <span class="mr-2">× ${d.quantity}</span>
          <span class="font-semibold text-slate-700">$${d.subtotal}</span>
        </div>
      </div>
    `;
        })
        .join('');

      const statusText = PURCHASE_STATUS_MAP[o.status] || o.status;

      return `
      <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
        <div class="flex justify-between items-center text-sm">
          <span class="font-bold text-slate-900">${supMap.get(o.supplier_id) || '未知廠商'} <span class="text-xs text-slate-400">(${o.po_number})</span></span>
          <div class="flex items-center gap-2">
            <span class="text-[11px] px-2 py-0.5 rounded font-bold ${statusColorMap[o.status] || 'bg-slate-100'}">${statusText}</span>
            <button onclick="openPurchaseModal('${o.id}')" class="text-indigo-600 font-semibold text-xs">修改</button>
            <button onclick="deletePurchaseOrder('${o.id}')" class="text-red-400 hover:text-red-600 text-xs">刪除</button>
          </div>
        </div>
        <div class="border-t border-b py-2 space-y-1">${detailHtml}</div>
        <div class="flex justify-between items-center text-xs">
          <span class="text-slate-400">時間: ${o.order_date.replace('T', ' ')}</span>
          <span class="text-sm font-bold text-indigo-600">採購額: $${o.total_cost}</span>
        </div>
      </div>
    `;
    })
    .join('');
}

// ==========================================
// 7. 團購一鍵彙總叫貨 (純動態缺額結算)
// ==========================================
async function generateConsolidatedPurchase() {
  const balanceMap = await computeRealtimeShortages();
  const neededItems = Array.from(balanceMap.values()).filter((x) => {
    return x.shortage > 0;
  });

  if (neededItems.length === 0) {
    return alert('目前所有有效訂單的品項數量均已滿足（已有叫貨或有現有庫存），無任何缺額！');
  }

  const suppliers = await db.suppliers.where('is_deleted').equals(0).toArray();
  if (suppliers.length === 0) {
    return alert('請先建立至少一位供應商資料');
  }

  await refreshVariantsCache();
  await openPurchaseModal();

  const container = document.getElementById('purchase-items-container');
  container.innerHTML = '';

  neededItems.forEach((item) => {
    addOrderItemRow('purchase', item.variantId, item.shortage, item.costPrice);
  });

  calculateTotal('purchase');
}

// ==========================================
// 8. 視圖全量渲染與雲端同步
// ==========================================
function renderCurrentView() {
  renderProducts();
  renderSalesOrders();
  renderPurchaseOrders();
  renderMembers();
}

document.getElementById('btn-sync').addEventListener('click', async () => {
  if (!AUTH_TOKEN) {
    return alert('未授權：缺少 AUTH_SECRET');
  }
  const btn = document.getElementById('btn-sync');
  btn.textContent = '同步中...';
  btn.disabled = true;

  try {
    const pullRes = await fetch('./api/pull', {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    if (!pullRes.ok) {
      throw new Error('拉取失敗: ' + pullRes.statusText);
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
      throw new Error(pushResult.message || pushResult.error);
    }

    localStorage.setItem('lastUpdatedTimestamp', pushResult.newTimestamp);
    alert('同步成功');
    renderCurrentView();
  } catch (err) {
    alert('同步失敗: ' + err.message);
  } finally {
    btn.textContent = '雲端同步';
    btn.disabled = false;
  }
});

document.getElementById('btn-export-backup').addEventListener('click', async () => {
  const fullBackup = {
    exported_at: new Date().toISOString(),
    products: await db.products.toArray(),
    product_variants: await db.product_variants.toArray(),
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
  a.download = `團購系統備份_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}

renderCurrentView();
