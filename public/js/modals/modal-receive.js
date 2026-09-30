import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';
import { escapeHtml } from '../core/utils.js';

export const ReceiveModal = {
  currentPoId: null,
  init() {
    document.getElementById('btn-close-modal-receive')?.addEventListener('click', () => {
      return this.close();
    });
    document.getElementById('btn-confirm-receive')?.addEventListener('click', () => {
      return this.confirmReceive();
    });
  },

  async open(poId) {
    this.currentPoId = poId;
    const modal = document.getElementById('modal-receive');
    const container = document.getElementById('receive-items-container');
    if (!modal || !container) {
      return;
    }

    const [order, items, variants, products] = await Promise.all([
      db.purchase_orders.get(poId),
      db.purchase_items.where('purchase_order_id').equals(poId).toArray(),
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

    document.getElementById('modal-receive-title').textContent = `到貨清點 (${order.po_number})`;

    // 每次開啟直接呈現「目前累計到貨數量」供直接調整，不分多個按鈕混淆
    container.innerHTML = items
      .map((item) => {
        const vInfo = vMap.get(item.variant_id) || { name: '未知品項', stock: 0 };
        const currentRec = item.received_quantity || 0;

        return `
        <div class="border rounded-lg p-3 bg-slate-50 space-y-2 text-xs receive-row" 
             data-item-id="${item.id}" 
             data-variant-id="${item.variant_id}" 
             data-order-qty="${item.quantity}" 
             data-original-rec="${currentRec}">
          <div class="flex justify-between items-center">
            <span class="font-bold text-slate-800 text-sm">${escapeHtml(vInfo.name)}</span>
            <span class="text-slate-500">庫存現有: <b class="text-blue-600">${vInfo.stock}</b></span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-slate-600 bg-white p-2 rounded border">
            <div>訂購總量: <b class="text-slate-800">${item.quantity}</b></div>
            <div>目前累計收貨: <b class="text-emerald-600 text-sm">${currentRec}</b></div>
          </div>
          <div class="flex items-center gap-2 pt-1">
            <label class="font-semibold text-slate-700 whitespace-nowrap">修正/更新累計已收量:</label>
            <input 
               type="number" 
               min="0" 
               max="${item.quantity}" 
               value="${currentRec}" 
               class="input-cumulative-qty border p-1.5 rounded w-24 text-center font-bold text-emerald-600 bg-white"
            />
            <span class="text-[11px] text-slate-400">件</span>
            <button type="button" class="btn-fill-all text-xs text-blue-600 underline ml-auto">全數到齊</button>
            <button type="button" class="btn-fill-clear text-xs text-slate-400 underline">歸零</button>
          </div>
        </div>
      `;
      })
      .join('');

    container.querySelectorAll('.receive-row').forEach((row) => {
      const input = row.querySelector('.input-cumulative-qty');
      const maxQty = Number(row.dataset.orderQty);
      row.querySelector('.btn-fill-all')?.addEventListener('click', () => {
        input.value = maxQty;
      });
      row.querySelector('.btn-fill-clear')?.addEventListener('click', () => {
        input.value = 0;
      });
    });

    modal.classList.remove('hidden');
  },

  async confirmReceive() {
    if (!this.currentPoId) {
      return;
    }
    const rows = document.querySelectorAll('#receive-items-container .receive-row');
    const updateRecords = [];

    for (const r of rows) {
      const itemId = r.dataset.itemId;
      const variantId = r.dataset.variantId;
      const orderQty = Number(r.dataset.orderQty) || 0;
      const originalRec = Number(r.dataset.originalRec) || 0;
      const newRec = Number(r.querySelector('.input-cumulative-qty').value);

      if (isNaN(newRec) || newRec < 0) {
        return alert('到貨數量格式錯誤或小於 0');
      }
      if (newRec > orderQty) {
        return alert(`累計收貨量不能大於訂購量 (${orderQty})`);
      }

      updateRecords.push({
        itemId,
        variantId,
        delta: newRec - originalRec,
        targetRec: newRec,
        orderQty,
      });
    }

    if (!confirm('確認儲存本次清點數量？庫存將根據累計差額進行同步增減。')) {
      return;
    }

    const now = new Date().toISOString();
    try {
      await db.transaction(
        'rw',
        [db.purchase_orders, db.purchase_items, db.product_variants],
        async () => {
          let allCompleted = true;
          let anyReceived = false;

          for (const rec of updateRecords) {
            // 1. 更新進貨項目已收數量
            await db.purchase_items.update(rec.itemId, {
              received_quantity: rec.targetRec,
            });

            // 2. 差額增減實體在庫 (delta > 0 補入庫, delta < 0 扣減校正)
            if (rec.delta !== 0) {
              const variant = await db.product_variants.get(rec.variantId);
              if (variant) {
                const nextStock = Math.max(0, (variant.current_stock || 0) + rec.delta);
                await db.product_variants.update(variant.id, {
                  current_stock: nextStock,
                  updated_at: now,
                });
              }
            }

            if (rec.targetRec < rec.orderQty) {
              allCompleted = false;
            }
            if (rec.targetRec > 0) {
              anyReceived = true;
            }
          }

          // 3. 自動更新狀態：全數到貨 -> RECEIVED；部分到貨 -> PARTIALLY_RECEIVED；未有到貨 -> ORDERED
          let nextStatus = 'ORDERED';
          if (allCompleted) {
            nextStatus = 'RECEIVED';
          } else if (anyReceived) {
            nextStatus = 'PARTIALLY_RECEIVED';
          }

          await db.purchase_orders.update(this.currentPoId, {
            status: nextStatus,
            updated_at: now,
          });
        },
      );

      this.close();
      eventBus.emit('purchases:changed');
      eventBus.emit('products:changed');
      eventBus.emit('sales:changed');
    } catch (err) {
      console.error('[ReceiveModal Error]:', err);
      alert('清點失敗: ' + err.message);
    }
  },

  close() {
    this.currentPoId = null;
    document.getElementById('modal-receive')?.classList.add('hidden');
  },
};
