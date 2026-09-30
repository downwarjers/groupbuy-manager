import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';
import { escapeHtml } from '../core/utils.js';

export const ShipmentModal = {
  currentOrderId: null,

  init() {
    document.getElementById('btn-close-modal-shipment')?.addEventListener('click', () => {
      this.close();
    });
    document.getElementById('btn-confirm-shipment')?.addEventListener('click', () => {
      this.confirmShipment();
    });
  },

  async open(salesOrderId) {
    this.currentOrderId = salesOrderId;
    const modal = document.getElementById('modal-shipment');
    const container = document.getElementById('shipment-items-container');
    if (!modal || !container) {
      return;
    }

    const [order, salesItems, variants, products] = await Promise.all([
      db.sales_orders.get(salesOrderId),
      db.sales_items.where('sales_order_id').equals(salesOrderId).toArray(),
      db.product_variants.toArray(),
      db.products.toArray(),
    ]);

    if (!order) {
      return;
    }

    const pMap = new Map(
      products.map((p) => {
        return [p.id, p.name];
      }),
    );
    const vMap = new Map(
      variants.map((v) => {
        return [
          v.id,
          {
            name: `[${pMap.get(v.product_id) || '未知'}] ${v.spec_name}`,
            stock: v.current_stock || 0,
          },
        ];
      }),
    );

    document.getElementById('modal-shipment-title').textContent =
      `訂單出貨處理 (${order.so_number})`;
    document.getElementById('shipment-carrier').value = '';
    document.getElementById('shipment-tracking').value = '';
    document.getElementById('shipment-note').value = '';

    const unfulfilledItems = salesItems.filter((i) => {
      return (i.fulfilled_quantity || 0) < i.quantity;
    });

    if (unfulfilledItems.length === 0) {
      container.innerHTML = `<div class="text-xs text-center text-slate-400 py-4">此訂單所有品項均已全數出貨</div>`;
      document.getElementById('btn-confirm-shipment').classList.add('hidden');
    } else {
      document.getElementById('btn-confirm-shipment').classList.remove('hidden');
      container.innerHTML = unfulfilledItems
        .map((item) => {
          const vInfo = vMap.get(item.variant_id) || { name: '未知品項', stock: 0 };
          const fulfilled = item.fulfilled_quantity || 0;
          const remain = item.quantity - fulfilled;
          const maxDeliverable = Math.min(remain, Math.max(0, vInfo.stock));

          return `
          <div class="border rounded-lg p-3 bg-slate-50 space-y-2 text-xs shipment-row"
               data-sales-item-id="${item.id}"
               data-variant-id="${item.variant_id}"
               data-remain-qty="${remain}"
               data-current-stock="${vInfo.stock}">
            <div class="flex justify-between items-center">
              <span class="font-bold text-slate-800 text-sm">${escapeHtml(vInfo.name)}</span>
              <span class="text-slate-500">庫存現有: <b class="${vInfo.stock > 0 ? 'text-blue-600' : 'text-red-500'}">${vInfo.stock}</b></span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-slate-600 bg-white p-2 rounded border">
              <div>訂單需求: <b>${item.quantity}</b> (尚欠 <b>${remain}</b>)</div>
              <div>累計已出: <b class="text-emerald-600">${fulfilled}</b></div>
            </div>
            <div class="flex items-center gap-2 pt-1">
              <label class="font-semibold text-slate-700 whitespace-nowrap">本次出貨量:</label>
              <input
                type="number"
                min="0"
                max="${remain}"
                value="${maxDeliverable}"
                class="input-ship-qty border p-1.5 rounded w-24 text-center font-bold text-blue-600 bg-white"
              />
              <span class="text-[11px] text-slate-400">件</span>
              <button type="button" class="btn-ship-max text-xs text-blue-600 underline ml-auto">現貨出齊</button>
              <button type="button" class="btn-ship-zero text-xs text-slate-400 underline">暫不出</button>
            </div>
          </div>
        `;
        })
        .join('');

      container.querySelectorAll('.shipment-row').forEach((row) => {
        const input = row.querySelector('.input-ship-qty');
        const remainQty = Number(row.dataset.remainQty);
        const stockQty = Number(row.dataset.currentStock);
        row.querySelector('.btn-ship-max')?.addEventListener('click', () => {
          input.value = Math.min(remainQty, Math.max(0, stockQty));
        });
        row.querySelector('.btn-ship-zero')?.addEventListener('click', () => {
          input.value = 0;
        });
      });
    }

    modal.classList.remove('hidden');
  },

  async confirmShipment() {
    if (!this.currentOrderId) {
      return;
    }
    const rows = document.querySelectorAll('#shipment-items-container .shipment-row');
    const shipList = [];
    let hasQuantity = false;

    for (const r of rows) {
      const salesItemId = r.dataset.salesItemId;
      const variantId = r.dataset.variantId;
      const remainQty = Number(r.dataset.remainQty);
      const stock = Number(r.dataset.currentStock);
      const shipQty = Number(r.querySelector('.input-ship-qty').value) || 0;

      if (shipQty < 0) {
        return alert('出貨數量不能小於 0');
      }
      if (shipQty > remainQty) {
        return alert(`出貨數量不能超過剩餘欠量 (${remainQty})`);
      }
      if (shipQty > stock) {
        return alert(`庫存不足！現有庫存僅剩 ${stock} 件`);
      }

      if (shipQty > 0) {
        hasQuantity = true;
        shipList.push({ salesItemId, variantId, quantity: shipQty });
      }
    }

    if (!hasQuantity) {
      return alert('請至少指定一項商品的實際出貨數量');
    }

    if (!confirm('確認執行本次分批出貨？系統將扣減商品實體庫存並產生成出貨單。')) {
      return;
    }

    const now = new Date().toISOString();
    const fulfillmentId = crypto.randomUUID();
    const carrier = document.getElementById('shipment-carrier').value.trim();
    const tracking = document.getElementById('shipment-tracking').value.trim();
    const note = document.getElementById('shipment-note').value.trim();

    try {
      await db.transaction(
        'rw',
        [
          db.sales_orders,
          db.sales_items,
          db.product_variants,
          db.fulfillments,
          db.fulfillment_items,
        ],
        async () => {
          await db.fulfillments.add({
            id: fulfillmentId,
            sales_order_id: this.currentOrderId,
            shipment_number: `SH-${Date.now().toString().slice(-6)}`,
            shipping_carrier: carrier,
            tracking_number: tracking,
            status: 'SHIPPED',
            shipped_at: now,
            note: note,
            updated_at: now,
          });

          for (const item of shipList) {
            await db.fulfillment_items.add({
              id: crypto.randomUUID(),
              fulfillment_id: fulfillmentId,
              sales_item_id: item.salesItemId,
              variant_id: item.variantId,
              quantity: item.quantity,
            });

            const v = await db.product_variants.get(item.variantId);
            if (v) {
              await db.product_variants.update(item.variantId, {
                current_stock: Math.max(0, (v.current_stock || 0) - item.quantity),
                updated_at: now,
              });
            }

            const sItem = await db.sales_items.get(item.salesItemId);
            if (sItem) {
              await db.sales_items.update(item.salesItemId, {
                fulfilled_quantity: (sItem.fulfilled_quantity || 0) + item.quantity,
              });
            }
          }

          const allItems = await db.sales_items
            .where('sales_order_id')
            .equals(this.currentOrderId)
            .toArray();

          const allFulfilled = allItems.every((i) => {
            return (i.fulfilled_quantity || 0) >= i.quantity;
          });
          const anyFulfilled = allItems.some((i) => {
            return (i.fulfilled_quantity || 0) > 0;
          });

          let nextOrderStatus = 'PREPARING';
          if (allFulfilled) {
            nextOrderStatus = 'COMPLETED';
          } else if (anyFulfilled) {
            nextOrderStatus = 'PARTIALLY_SHIPPED';
          }

          await db.sales_orders.update(this.currentOrderId, {
            status: nextOrderStatus,
            updated_at: now,
          });
        },
      );

      this.close();
      eventBus.emit('sales:changed');
      eventBus.emit('products:changed');
    } catch (err) {
      console.error('[ShipmentModal Error]:', err);
      alert('出貨失敗: ' + err.message);
    }
  },

  close() {
    this.currentOrderId = null;
    document.getElementById('modal-shipment')?.classList.add('hidden');
  },
};
