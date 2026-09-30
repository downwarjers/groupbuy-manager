import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';
import { getLocalDatetimeString } from '../core/utils.js';

export const SalesModal = {
  currentStatus: 'PENDING',
  cachedVariants: [],
  init() {
    document.getElementById('sales-customer-input')?.addEventListener('input', () => {
      return this.handleCustomerSelect();
    });
    document.getElementById('btn-add-sales-item')?.addEventListener('click', () => {
      return this.addItemRow();
    });
    document.getElementById('btn-save-sales')?.addEventListener('click', () => {
      return this.save();
    });
    document.getElementById('btn-close-modal-sales')?.addEventListener('click', () => {
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

  handleCustomerSelect() {
    const input = document.getElementById('sales-customer-input');
    const hidden = document.getElementById('sales-customer-id');
    const datalist = document.getElementById('sales-customer-datalist');
    const matched = Array.from(datalist.options).find((o) => {
      return o.value === input.value;
    });
    hidden.value = matched ? matched.dataset.id : '';
  },

  async open(soId = null) {
    try {
      await this.refreshVariants();
      const customers = await db.customers.where('is_deleted').equals(0).toArray();
      customers.sort((a, b) => {
        return a.name.localeCompare(b.name, 'zh-Hant');
      });

      const customerDatalist = document.getElementById('sales-customer-datalist');
      customerDatalist.innerHTML = customers
        .map((c) => {
          return `<option data-id="${c.id}" value="${c.name} (${c.phone})"></option>`;
        })
        .join('');

      const custInput = document.getElementById('sales-customer-input');
      const custIdHidden = document.getElementById('sales-customer-id');
      const itemsContainer = document.getElementById('sales-items-container');

      custInput.value = '';
      custIdHidden.value = '';
      itemsContainer.innerHTML = '';

      if (soId) {
        document.getElementById('modal-sales-title').textContent = '編輯客戶訂單';
        document.getElementById('sales-order-id').value = soId;
        const [order, items] = await Promise.all([
          db.sales_orders.get(soId),
          db.sales_items.where('sales_order_id').equals(soId).toArray(),
        ]);
        custIdHidden.value = order.customer_id;
        const targetCust = customers.find((c) => {
          return c.id === order.customer_id;
        });
        if (targetCust) {
          custInput.value = `${targetCust.name} (${targetCust.phone})`;
        }
        document.getElementById('sales-order-datetime').value = order.order_date;
        this.currentStatus = order.status;
        items.forEach((i) => {
          return this.addItemRow(i.variant_id, i.quantity, i.unit_price);
        });
        this.calculateTotal();
      } else {
        document.getElementById('modal-sales-title').textContent = '新增客戶訂單';
        document.getElementById('sales-order-id').value = '';
        document.getElementById('sales-order-datetime').value = getLocalDatetimeString();
        this.currentStatus = 'PENDING';
        this.addItemRow();
        this.calculateTotal();
      }
      document.getElementById('modal-sales')?.classList.remove('hidden');
    } catch (err) {
      console.error('[SalesModal Open Error]:', err);
    }
  },

  getSelectedVariantIds(excludeRowId = null) {
    const ids = [];
    document.querySelectorAll('#sales-items-container > div').forEach((r) => {
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
    const rows = document.querySelectorAll('#sales-items-container > div');
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
          return `<option value="${v.fullLabel} [售價:$${v.retail_price}]" data-id="${v.id}" data-price="${v.retail_price}"></option>`;
        })
        .join('');
    });
  },

  addItemRow(selectedVariantId = '', qty = 1, price = null) {
    const container = document.getElementById('sales-items-container');
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
      const labelText = `${v.fullLabel} [售價:$${v.retail_price}]`;
      if (v.id === selectedVariantId) {
        selectedText = labelText;
        if (price === null) {
          defaultPrice = v.retail_price;
        }
      }
      optionsHtml += `<option value="${labelText}" data-id="${v.id}" data-price="${v.retail_price}"></option>`;
    });

    const initialSubtotal = qty * defaultPrice;
    const html = `
      <div id="${rowId}" class="flex gap-2 items-center text-xs">
        <input type="hidden" class="item-variant-id" value="${selectedVariantId}">
        <input type="text" list="${datalistId}" value="${selectedText}" placeholder="搜尋商品規格..." class="item-variant-search border p-1.5 rounded flex-1 min-w-0">
        <datalist id="${datalistId}">${optionsHtml}</datalist>
        <input type="number" value="${qty}" min="1" class="item-qty border p-1.5 rounded w-16">
        <input type="number" value="${defaultPrice}" class="item-price border p-1.5 rounded w-20">
        <span class="item-subtotal font-semibold w-16 text-right">$${initialSubtotal}</span>
        <button type="button" class="btn-del-item text-red-500 font-bold px-1">✕</button>
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
        row.querySelector('.item-price').value = matched.dataset.price || 0;
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
    row.querySelector('.btn-del-item').addEventListener('click', () => {
      row.remove();
      this.refreshRowDatalists();
      this.calculateTotal();
    });

    this.calculateTotal();
  },

  calculateTotal() {
    const rows = document.querySelectorAll('#sales-items-container > div');
    let sum = 0;
    rows.forEach((r) => {
      const qty = Number(r.querySelector('.item-qty').value) || 0;
      const price = Number(r.querySelector('.item-price').value) || 0;
      const subtotal = qty * price;
      r.querySelector('.item-subtotal').textContent = `$${subtotal}`;
      sum += subtotal;
    });
    document.getElementById('sales-total-amount').textContent = sum;
  },

  async save() {
    try {
      const soId = document.getElementById('sales-order-id').value || crypto.randomUUID();
      const isEditing = !!document.getElementById('sales-order-id').value;
      const customerId = document.getElementById('sales-customer-id').value;
      if (!customerId) {
        return alert('請確實選擇客戶');
      }

      if (this.currentStatus === 'SHIPPED' || this.currentStatus === 'COMPLETED') {
        return alert('已出貨或結案的訂單禁止再修改品項內容');
      }

      const rows = document.querySelectorAll('#sales-items-container > div');
      if (rows.length === 0) {
        return alert('請至少加入一項商品');
      }

      let totalAmount = 0;
      const detailItems = [];
      const seenVariantIds = new Set();

      for (const r of rows) {
        const variantId = r.querySelector('.item-variant-id').value;
        const qty = Number(r.querySelector('.item-qty').value) || 0;
        const price = Number(r.querySelector('.item-price').value) || 0;

        if (!variantId || qty <= 0) {
          continue;
        }
        if (seenVariantIds.has(variantId)) {
          return alert('訂單中含有重複規格的商品');
        }
        seenVariantIds.add(variantId);
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
        return alert('明細中沒有有效商品');
      }

      const now = new Date().toISOString();
      await db.transaction(
        'rw',
        [db.sales_orders, db.sales_items, db.product_variants],
        async () => {
          let soNumber = `SO-${Date.now().toString().slice(-6)}`;
          let currentOrderState = 'PENDING';

          if (isEditing) {
            const old = await db.sales_orders.get(soId);
            if (old) {
              soNumber = old.so_number;
              currentOrderState = old.status;
            }
          }

          await db.sales_orders.put({
            id: soId,
            so_number: soNumber,
            customer_id: customerId,
            status: currentOrderState,
            total_amount: totalAmount,
            order_date:
              document.getElementById('sales-order-datetime').value || getLocalDatetimeString(),
            is_deleted: 0,
            updated_at: now,
          });

          await db.sales_items.where('sales_order_id').equals(soId).delete();
          await db.sales_items.bulkAdd(detailItems);
        },
      );

      this.close();
      eventBus.emit('sales:changed');
      eventBus.emit('products:changed');
    } catch (err) {
      console.error('[SalesModal Save Error]:', err);
      alert('儲存失敗: ' + err.message);
    }
  },

  close() {
    document.getElementById('modal-sales')?.classList.add('hidden');
  },
};
