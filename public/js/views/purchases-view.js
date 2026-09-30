import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';
import { PurchaseModal } from '../modals/modal-purchase.js';
import { ReceiveModal } from '../modals/modal-receive.js';
import { SalesView } from './sales-view.js';
import { escapeHtml, PURCHASE_STATUS_MAP } from '../core/utils.js';

export const PurchasesView = {
  init() {
    document.getElementById('search-purchase')?.addEventListener('input', () => {
      return this.render();
    });
    document.getElementById('filter-purchase-status')?.addEventListener('change', () => {
      return this.render();
    });
    document.getElementById('sort-purchase')?.addEventListener('change', () => {
      return this.render();
    });
    document.getElementById('btn-open-create-purchase')?.addEventListener('click', () => {
      PurchaseModal.open();
    });
    document.getElementById('btn-consolidate-purchase')?.addEventListener('click', () => {
      this.generateConsolidatedPurchase();
    });
    eventBus.on('purchases:changed', () => {
      return this.render();
    });
    eventBus.on('sync:completed', () => {
      return this.render();
    });
  },

  async generateConsolidatedPurchase() {
    try {
      const shortages = await SalesView.computeRealtimeShortages();
      const neededItems = Array.from(shortages.values()).filter((x) => {
        return x.shortage > 0;
      });
      if (neededItems.length === 0) {
        return alert('目前沒有任何品項短缺');
      }
      const suppliers = await db.suppliers.where('is_deleted').equals(0).toArray();
      if (suppliers.length === 0) {
        return alert('請先建立至少一家供應商');
      }

      await PurchaseModal.open();
      const container = document.getElementById('purchase-items-container');
      container.innerHTML = '';
      neededItems.forEach((item) => {
        PurchaseModal.addItemRow(item.variantId, item.shortage, item.costPrice, false);
      });
      PurchaseModal.calculateTotal();
    } catch (err) {
      console.error('[ConsolidatePurchase Error]:', err);
    }
  },

  async render() {
    const container = document.getElementById('list-purchase-orders');
    if (!container) {
      return;
    }

    const searchKeyword = (document.getElementById('search-purchase')?.value || '')
      .toLowerCase()
      .trim();
    const filterStatus = document.getElementById('filter-purchase-status')?.value || 'ALL';
    const sortMode = document.getElementById('sort-purchase')?.value || 'date_desc';

    let [orders, suppliers, items, prods, vars] = await Promise.all([
      db.purchase_orders.where('is_deleted').equals(0).toArray(),
      db.suppliers.toArray(),
      db.purchase_items.toArray(),
      db.products.toArray(),
      db.product_variants.toArray(),
    ]);

    const supMap = new Map(
      suppliers.map((s) => {
        return [s.id, s.name];
      }),
    );

    const pMap = new Map(
      prods.map((p) => {
        return [p.id, p.name];
      }),
    );

    const varMap = new Map(
      vars.map((v) => {
        return [
          v.id,
          `[${pMap.get(v.product_id) || '未知'}] ${v.spec_name} (${v.unit_quantity}${v.unit_name})`,
        ];
      }),
    );

    if (filterStatus !== 'ALL') {
      orders = orders.filter((o) => {
        return o.status === filterStatus;
      });
    }

    if (searchKeyword) {
      orders = orders.filter((o) => {
        const supName = supMap.get(o.supplier_id) || '';
        return (
          o.po_number.toLowerCase().includes(searchKeyword) ||
          supName.toLowerCase().includes(searchKeyword)
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
      container.innerHTML = '<div class="text-center text-slate-400 py-8">查無進貨訂單</div>';
      return;
    }

    const statusColorMap = {
      PENDING: 'bg-slate-100 text-slate-700',
      ORDERED: 'bg-blue-100 text-blue-800',
      PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-800',
      RECEIVED: 'bg-emerald-100 text-emerald-800',
      CANCELLED: 'bg-red-100 text-red-600',
    };

    container.innerHTML = orders
      .map((o) => {
        const orderDetails = items.filter((i) => {
          return i.purchase_order_id === o.id;
        });
        const detailHtml = orderDetails
          .map((d) => {
            const received = d.received_quantity || 0;
            const isFull = received >= d.quantity;
            return `
              <div class="text-xs text-slate-600 flex justify-between items-center py-0.5">
                <span class="font-medium text-slate-800">${escapeHtml(varMap.get(d.variant_id) || '未知品項')}</span>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] px-1.5 py-0.5 rounded ${isFull ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">
                    已收: ${received} / 應收: ${d.quantity}
                  </span>
                  <span class="font-semibold text-slate-700 w-16 text-right">$${d.subtotal}</span>
                </div>
              </div>
            `;
          })
          .join('');

        let actionsHtml = '';
        if (o.status === 'PENDING') {
          actionsHtml += `<button class="btn-action-po-order bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded text-xs font-semibold" data-id="${o.id}">確認叫貨</button>`;
          actionsHtml += `<button class="btn-edit-purchase text-indigo-600 font-semibold text-xs ml-1">編輯草稿</button>`;
          actionsHtml += `<button class="btn-del-purchase text-red-400 hover:text-red-600 text-xs ml-1">刪除</button>`;
        } else if (o.status === 'ORDERED' || o.status === 'PARTIALLY_RECEIVED') {
          actionsHtml += `<button class="btn-receive-purchase bg-emerald-600 text-white px-2 py-0.5 rounded text-xs font-semibold shadow-sm hover:bg-emerald-700">到貨清點</button>`;
          actionsHtml += `<button class="btn-force-complete-po bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded text-xs font-semibold ml-1">缺貨結案</button>`;
          actionsHtml += `<button class="btn-edit-purchase text-indigo-600 font-semibold text-xs ml-1">追加品項</button>`;
        }

        return `
          <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-2" data-id="${o.id}">
            <div class="flex justify-between items-center text-sm">
              <span class="font-bold text-slate-900">${escapeHtml(supMap.get(o.supplier_id) || '未知廠商')} <span class="text-xs text-slate-400">(${o.po_number})</span></span>
              <div class="flex items-center gap-2">
                <span class="text-[11px] px-2 py-0.5 rounded font-bold ${statusColorMap[o.status] || 'bg-slate-100'}">${PURCHASE_STATUS_MAP[o.status] || o.status}</span>
                ${actionsHtml}
              </div>
            </div>
            <div class="border-t border-b py-2 space-y-1">${detailHtml}</div>
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-400">採購時間: ${o.order_date.replace('T', ' ')}</span>
              <span class="text-sm font-bold text-indigo-600">金額: $${o.total_cost}</span>
            </div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('.btn-action-po-order').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        if (
          !confirm(
            '確認向廠商下單叫貨？\n\n下單後現有品項將鎖定無法刪除或縮減數量，且相關客戶待處理訂單將自動轉變為「備貨中」。',
          )
        ) {
          return;
        }

        const now = new Date().toISOString();
        try {
          await db.transaction(
            'rw',
            [db.purchase_orders, db.purchase_items, db.sales_orders, db.sales_items],
            async () => {
              await db.purchase_orders.update(id, { status: 'ORDERED', updated_at: now });
              const poItems = await db.purchase_items
                .where('purchase_order_id')
                .equals(id)
                .toArray();
              const orderedVarIds = new Set(
                poItems.map((i) => {
                  return i.variant_id;
                }),
              );
              const pendingSalesOrders = await db.sales_orders
                .where('status')
                .equals('PENDING')
                .filter((s) => {
                  return s.is_deleted === 0;
                })
                .toArray();
              const allSalesItems = await db.sales_items.toArray();
              for (const so of pendingSalesOrders) {
                const soItems = allSalesItems.filter((i) => {
                  return i.sales_order_id === so.id;
                });
                if (
                  soItems.some((i) => {
                    return orderedVarIds.has(i.variant_id);
                  })
                ) {
                  await db.sales_orders.update(so.id, { status: 'PREPARING', updated_at: now });
                }
              }
            },
          );
          eventBus.emit('purchases:changed');
          eventBus.emit('sales:changed');
          eventBus.emit('products:changed');
        } catch (err) {
          alert('叫貨失敗：' + err.message);
        }
      });
    });

    container.querySelectorAll('.btn-force-complete-po').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        if (!confirm('確認強制缺貨結案？\n\n未到貨的差額將直接終止等待，不會再被視為在途進貨。')) {
          return;
        }
        const now = new Date().toISOString();
        await db.purchase_orders.update(id, { status: 'RECEIVED', updated_at: now });
        eventBus.emit('purchases:changed');
        eventBus.emit('sales:changed');
        eventBus.emit('products:changed');
      });
    });

    container.querySelectorAll('.btn-receive-purchase').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        ReceiveModal.open(id);
      });
    });

    container.querySelectorAll('.btn-edit-purchase').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        PurchaseModal.open(id);
      });
    });

    container.querySelectorAll('.btn-del-purchase').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        const order = await db.purchase_orders.get(id);
        if (order && order.status !== 'PENDING') {
          return alert('已叫貨之訂單不可刪除');
        }
        if (!confirm('確定刪除此筆草稿進貨單？')) {
          return;
        }
        const now = new Date().toISOString();
        await db.transaction('rw', db.purchase_orders, async () => {
          await db.purchase_orders.update(id, { is_deleted: 1, updated_at: now });
        });
        eventBus.emit('purchases:changed');
      });
    });
  },
};
