import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';
import { getLocalDatetimeString } from '../core/utils.js';

export const PurchaseModal = {
  currentStatus: 'PENDING',
  existingItemSnapshot: new Map(),
  cachedVariants: [],
  init() {
    document.getElementById('purchase-supplier-input')?.addEventListener('input', () => {
      return this.handleSupplierSelect();
    });
    document.getElementById('btn-add-purchase-item')?.addEventListener('click', () => {
      return this.addItemRow();
    });
    document.getElementById('btn-save-purchase')?.addEventListener('click', () => {
      return this.save();
    });
    document.getElementById('btn-close-modal-purchase')?.addEventListener('click', () => {
      return this.close();
    });
  },

  async refreshVariants() {
    const [products, variants] = await Promise.all([
      db.products.where('is_deleted').equals(0).toArray(),
      db.product_variants.where('is_deleted').equals(0).toArray(),
    ]);
    const pMap = new Map(
      products.map((p) => {
        return [p.id, p.name];
      }),
    );
    this.cachedVariants = variants.map((v) => {
      const pName = pMap.get(v.product_id) || '未知商品';
      return {
        ...v,
        productName: pName,
        fullLabel: `[${pName}] ${v.spec_name} (${v.unit_quantity}${v.unit_name})`,
      };
    });
  },

  handleSupplierSelect() {
    const input = document.getElementById('purchase-supplier-input');
    const hidden = document.getElementById('purchase-supplier-id');
    const datalist = document.getElementById('purchase-supplier-datalist');
    const matched = Array.from(datalist.options).find((o) => {
      return o.value === input.value;
    });
    hidden.value = matched ? matched.dataset.id : '';
  },

  async open(poId = null) {
    try {
      await this.refreshVariants();
      const suppliers = await db.suppliers.where('is_deleted').equals(0).toArray();
      suppliers.sort((a, b) => {
        return a.name.localeCompare(b.name, 'zh-Hant');
      });

      const supplierDatalist = document.getElementById('purchase-supplier-datalist');
      supplierDatalist.innerHTML = suppliers
        .map((s) => {
          return `<option data-id="${s.id}" value="${s.name} (${s.tel || s.phone || '無電話'})"></option>`;
        })
        .join('');

      const supInput = document.getElementById('purchase-supplier-input');
      const supIdHidden = document.getElementById('purchase-supplier-id');
      const itemsContainer = document.getElementById('purchase-items-container');

      supInput.value = '';
      supIdHidden.value = '';
      itemsContainer.innerHTML = '';
      this.existingItemSnapshot.clear();

      if (poId) {
        document.getElementById('modal-purchase-title').textContent = '編輯進貨單';
        document.getElementById('purchase-order-id').value = poId;
        const [order, items] = await Promise.all([
          db.purchase_orders.get(poId),
          db.purchase_items.where('purchase_order_id').equals(poId).toArray(),
        ]);
        supIdHidden.value = order.supplier_id;
        const targetSup = suppliers.find((s) => {
          return s.id === order.supplier_id;
        });
        if (targetSup) {
          supInput.value = `${targetSup.name} (${targetSup.tel || targetSup.phone || '無電話'})`;
        }
        document.getElementById('purchase-order-datetime').value = order.order_date;
        this.currentStatus = order.status;
        items.forEach((i) => {
          this.existingItemSnapshot.set(i.variant_id, i.quantity);
          const isLocked = this.currentStatus !== 'PENDING';
          return this.addItemRow(i.variant_id, i.quantity, i.unit_cost, isLocked);
        });
        this.calculateTotal();
      } else {
        document.getElementById('modal-purchase-title').textContent = '新增進貨單';
        document.getElementById('purchase-order-id').value = '';
        document.getElementById('purchase-order-datetime').value = getLocalDatetimeString();
        this.currentStatus = 'PENDING';
        this.addItemRow();
        this.calculateTotal();
      }
      document.getElementById('modal-purchase')?.classList.remove('hidden');
    } catch (err) {
      console.error('[PurchaseModal Open Error]:', err);
    }
  },

  getSelectedVariantIds(excludeRowId = null) {
    const ids = [];
    document.querySelectorAll('#purchase-items-container > div').forEach((r) => {
      if (excludeRowId && r.id === excludeRowId) {
        return;
      }
      const vId = r.querySelector('.item-variant-id')?.value;
      if (vId) {
        ids.push(vId);
      }
    });
    return ids;
  },

  refreshRowDatalists() {
    const rows = document.querySelectorAll('#purchase-items-container > div');
    rows.forEach((row) => {
      const curVId = row.querySelector('.item-variant-id').value;
      const excluded = new Set(this.getSelectedVariantIds(row.id));
      const datalist = row.querySelector('datalist');
      if (!datalist) {
        return;
      }
      const avail = this.cachedVariants.filter((v) => {
        return v.id === curVId || !excluded.has(v.id);
      });
      datalist.innerHTML = avail
        .map((v) => {
          return `<option value="${v.fullLabel} [成本:$${v.cost_price}]" data-id="${v.id}" data-cost="${v.cost_price}"></option>`;
        })
        .join('');
    });
  },

  addItemRow(selectedVariantId = '', qty = 1, price = null, isLocked = false) {
    const container = document.getElementById('purchase-items-container');
    const uuid = crypto.randomUUID();
    const rowId = `item-${uuid}`;
    const datalistId = `dl-${uuid}`;
    const excludedIds = new Set(this.getSelectedVariantIds());

    const sortedVariants = [...this.cachedVariants].sort((a, b) => {
      return a.fullLabel.localeCompare(b.fullLabel, 'zh-Hant');
    });

    let selectedText = '';
    let defaultPrice = price !== null ? price : 0;
    let optionsHtml = '';

    sortedVariants.forEach((v) => {
      if (v.id !== selectedVariantId && excludedIds.has(v.id)) {
        return;
      }
      const labelText = `${v.fullLabel} [成本:$${v.cost_price}]`;
      if (v.id === selectedVariantId) {
        selectedText = labelText;
        if (price === null) {
          defaultPrice = v.cost_price;
        }
      }
      optionsHtml += `<option value="${labelText}" data-id="${v.id}" data-cost="${v.cost_price}"></option>`;
    });

    const initialSubtotal = qty * defaultPrice;
    const html = `
      <div id="${rowId}" class="flex gap-2 items-center text-xs">
        <input type="hidden" class="item-variant-id" value="${selectedVariantId}">
        <input type="text" list="${datalistId}" value="${selectedText}" placeholder="搜尋商品規格..." class="item-variant-search border p-1.5 rounded flex-1 min-w-0" ${isLocked ? 'disabled' : ''}>
        <datalist id="${datalistId}">${optionsHtml}</datalist>
        <input type="number" value="${qty}" min="${isLocked ? qty : 1}" class="item-qty border p-1.5 rounded w-16">
        <input type="number" value="${defaultPrice}" class="item-price border p-1.5 rounded w-20" ${isLocked ? 'readonly' : ''}>
        <span class="item-subtotal font-semibold w-16 text-right">$${initialSubtotal}</span>
        ${isLocked ? '<span class="text-slate-400 px-1" title="叫貨後不可刪除">🔒</span>' : '<button type="button" class="btn-del-item text-red-500 font-bold px-1">✕</button>'}
      </div>
    `;

    container.insertAdjacentHTML('beforeend', html);
    const row = document.getElementById(rowId);

    row.querySelector('.item-variant-search').addEventListener('input', (e) => {
      const matched = Array.from(document.getElementById(datalistId).options).find((opt) => {
        return opt.value === e.target.value;
      });
      if (matched) {
        row.querySelector('.item-variant-id').value = matched.dataset.id;
        row.querySelector('.item-price').value = matched.dataset.cost || 0;
      } else {
        row.querySelector('.item-variant-id').value = '';
      }
      this.refreshRowDatalists();
      this.calculateTotal();
    });

    this.refreshRowDatalists();

    row.querySelector('.item-qty').addEventListener('input', () => {
      return this.calculateTotal();
    });
    row.querySelector('.item-price').addEventListener('input', () => {
      return this.calculateTotal();
    });
    row.querySelector('.btn-del-item')?.addEventListener('click', () => {
      row.remove();
      this.refreshRowDatalists();
      this.calculateTotal();
    });

    this.calculateTotal();
  },

  calculateTotal() {
    const rows = document.querySelectorAll('#purchase-items-container > div');
    let sum = 0;
    rows.forEach((r) => {
      const qty = Number(r.querySelector('.item-qty').value) || 0;
      const price = Number(r.querySelector('.item-price').value) || 0;
      const subtotal = qty * price;
      r.querySelector('.item-subtotal').textContent = `$${subtotal}`;
      sum += subtotal;
    });
    document.getElementById('purchase-total-cost').textContent = sum;
  },

  async save() {
    try {
      const poId = document.getElementById('purchase-order-id').value || crypto.randomUUID();
      const isEditing = !!document.getElementById('purchase-order-id').value;
      const supplierId = document.getElementById('purchase-supplier-id').value;

      if (!supplierId) {
        return alert('請選擇供應商');
      }

      const rows = document.querySelectorAll('#purchase-items-container > div');
      if (rows.length === 0) {
        return alert('請至少加入一項商品');
      }

      let totalCost = 0;
      const detailItems = [];
      const targetVariantIds = new Set();

      for (const r of rows) {
        const variantId = r.querySelector('.item-variant-id').value;
        const qty = Number(r.querySelector('.item-qty').value) || 0;
        const price = Number(r.querySelector('.item-price').value) || 0;

        if (!variantId || qty <= 0) {
          continue;
        }

        if (this.currentStatus !== 'PENDING' && this.existingItemSnapshot.has(variantId)) {
          const originalQty = this.existingItemSnapshot.get(variantId);
          if (qty < originalQty) {
            return alert('已叫貨品項的數量不可縮減，只能追加');
          }
        }

        if (targetVariantIds.has(variantId)) {
          return alert('進貨明細包含重複品項');
        }
        targetVariantIds.add(variantId);
        const subtotal = qty * price;
        totalCost += subtotal;
        detailItems.push({
          id: crypto.randomUUID(),
          purchase_order_id: poId,
          variant_id: variantId,
          quantity: qty,
          received_quantity: 0,
          unit_cost: price,
          subtotal,
        });
      }

      if (detailItems.length === 0) {
        return alert('明細中沒有有效商品');
      }

      if (this.currentStatus !== 'PENDING') {
        for (const [vId] of this.existingItemSnapshot.entries()) {
          if (!targetVariantIds.has(vId)) {
            return alert('已叫貨商品無法從明細中移除');
          }
        }
      }

      const now = new Date().toISOString();
      await db.transaction(
        'rw',
        [db.purchase_orders, db.purchase_items, db.sales_orders, db.sales_items],
        async () => {
          let poNumber = `PO-${Date.now().toString().slice(-6)}`;
          let currentOrderState = 'PENDING';
          if (isEditing) {
            const old = await db.purchase_orders.get(poId);
            if (old) {
              poNumber = old.po_number;
              currentOrderState = old.status;
              const existingDetails = await db.purchase_items
                .where('purchase_order_id')
                .equals(poId)
                .toArray();
              const recMap = new Map(
                existingDetails.map((i) => {
                  return [i.variant_id, i.received_quantity || 0];
                }),
              );
              detailItems.forEach((item) => {
                item.received_quantity = recMap.get(item.variant_id) || 0;
              });
            }
          }

          await db.purchase_orders.put({
            id: poId,
            po_number: poNumber,
            supplier_id: supplierId,
            status: currentOrderState,
            total_cost: totalCost,
            order_date:
              document.getElementById('purchase-order-datetime').value || getLocalDatetimeString(),
            is_deleted: 0,
            updated_at: now,
          });

          await db.purchase_items.where('purchase_order_id').equals(poId).delete();
          await db.purchase_items.bulkAdd(detailItems);
        },
      );

      this.close();
      eventBus.emit('purchases:changed');
      eventBus.emit('sales:changed');
    } catch (err) {
      console.error('[PurchaseModal Save Error]:', err);
      alert('儲存失敗: ' + err.message);
    }
  },

  close() {
    document.getElementById('modal-purchase')?.classList.add('hidden');
  },
};
