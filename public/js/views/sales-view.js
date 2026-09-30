import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';
import { SalesModal } from '../modals/modal-sales.js';
import { ShipmentModal } from '../modals/modal-shipment.js';
import { escapeHtml, SALES_STATUS_MAP } from '../core/utils.js';

export const SalesView = {
  init() {
    document.getElementById('search-sales')?.addEventListener('input', () => {
      return this.render();
    });
    document.getElementById('filter-sales-status')?.addEventListener('change', () => {
      return this.render();
    });
    document.getElementById('sort-sales')?.addEventListener('change', () => {
      return this.render();
    });
    document.getElementById('btn-open-create-sales')?.addEventListener('click', () => {
      SalesModal.open();
    });
    eventBus.on('sales:changed', () => {
      return this.render();
    });
    eventBus.on('purchases:changed', () => {
      return this.render();
    });
    eventBus.on('products:changed', () => {
      return this.render();
    });
    eventBus.on('sync:completed', () => {
      return this.render();
    });
  },

  async computeRealtimeShortages() {
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
        displayName: `[${pName}] ${v.spec_name} (${v.unit_quantity}${v.unit_name})`,
        costPrice: v.cost_price,
        stock: v.current_stock || 0,
        demand: 0,
        inbound: 0,
        shortage: 0,
      });
    });

    const activeSoIds = new Set(
      salesOrders
        .filter((o) => {
          return (
            o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'PARTIALLY_SHIPPED'
          );
        })
        .map((o) => {
          return o.id;
        }),
    );

    salesItems.forEach((item) => {
      if (activeSoIds.has(item.sales_order_id) && balanceMap.has(item.variant_id)) {
        const remainingNeed = Math.max(0, item.quantity - (item.fulfilled_quantity || 0));
        balanceMap.get(item.variant_id).demand += remainingNeed;
      }
    });

    const activePoIds = new Set(
      purchaseOrders
        .filter((o) => {
          return o.status === 'ORDERED' || o.status === 'PARTIALLY_RECEIVED';
        })
        .map((o) => {
          return o.id;
        }),
    );

    purchaseItems.forEach((item) => {
      if (activePoIds.has(item.purchase_order_id) && balanceMap.has(item.variant_id)) {
        const remaining = Math.max(0, item.quantity - (item.received_quantity || 0));
        balanceMap.get(item.variant_id).inbound += remaining;
      }
    });

    balanceMap.forEach((item) => {
      const netShortage = item.demand - (item.stock + item.inbound);
      item.shortage = Math.max(0, netShortage);
    });

    return balanceMap;
  },

  async render() {
    const container = document.getElementById('list-sales-orders');
    if (!container) {
      return;
    }

    const searchKeyword = (document.getElementById('search-sales')?.value || '')
      .toLowerCase()
      .trim();
    const filterStatus = document.getElementById('filter-sales-status')?.value || 'ALL';
    const sortMode = document.getElementById('sort-sales')?.value || 'date_desc';

    let [orders, customers, items, prods, vars] = await Promise.all([
      db.sales_orders.where('is_deleted').equals(0).toArray(),
      db.customers.toArray(),
      db.sales_items.toArray(),
      db.products.toArray(),
      db.product_variants.where('is_deleted').equals(0).toArray(),
    ]);

    const custMap = new Map(
      customers.map((c) => {
        return [c.id, c.name];
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

    const availablePool = new Map();
    vars.forEach((v) => {
      return availablePool.set(v.id, v.current_stock || 0);
    });

    const sortedForFulfillment = [...orders]
      .filter((o) => {
        return (
          o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'PARTIALLY_SHIPPED'
        );
      })
      .sort((a, b) => {
        return a.order_date.localeCompare(b.order_date);
      });

    const orderFulfillmentMap = new Map();
    sortedForFulfillment.forEach((so) => {
      const soItems = items.filter((i) => {
        return i.sales_order_id === so.id;
      });
      let canFulfillAll = true;
      const lineStatus = new Map();
      soItems.forEach((item) => {
        const needed = Math.max(0, item.quantity - (item.fulfilled_quantity || 0));
        const currentAvail = availablePool.get(item.variant_id) || 0;
        if (currentAvail >= needed) {
          availablePool.set(item.variant_id, currentAvail - needed);
          lineStatus.set(item.id, { ready: true, missing: 0 });
        } else {
          canFulfillAll = false;
          const missing = needed - Math.max(0, currentAvail);
          availablePool.set(item.variant_id, 0);
          lineStatus.set(item.id, { ready: false, missing });
        }
      });
      orderFulfillmentMap.set(so.id, { canFulfillAll, lineStatus });
    });

    if (filterStatus !== 'ALL') {
      orders = orders.filter((o) => {
        return o.status === filterStatus;
      });
    }

    if (searchKeyword) {
      orders = orders.filter((o) => {
        const custName = custMap.get(o.customer_id) || '';
        return (
          o.so_number.toLowerCase().includes(searchKeyword) ||
          custName.toLowerCase().includes(searchKeyword)
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
      container.innerHTML = '<div class="text-center text-slate-400 py-8">查無客戶訂單</div>';
      return;
    }

    const statusColorMap = {
      PENDING: 'bg-amber-100 text-amber-800',
      PREPARING: 'bg-blue-100 text-blue-800',
      PARTIALLY_SHIPPED: 'bg-cyan-100 text-cyan-800',
      SHIPPED: 'bg-purple-100 text-purple-800',
      COMPLETED: 'bg-emerald-100 text-emerald-800',
      CANCELLED: 'bg-slate-200 text-slate-600',
    };

    container.innerHTML = orders
      .map((o) => {
        const orderDetails = items.filter((i) => {
          return i.sales_order_id === o.id;
        });
        const fulfillInfo = orderFulfillmentMap.get(o.id);
        let fulfillmentBadgeHtml = '';
        if (
          o.status === 'PENDING' ||
          o.status === 'PREPARING' ||
          o.status === 'PARTIALLY_SHIPPED'
        ) {
          if (fulfillInfo && fulfillInfo.canFulfillAll) {
            fulfillmentBadgeHtml = `<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-500 text-white">現貨充足</span>`;
          } else {
            fulfillmentBadgeHtml = `<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500 text-white">等待叫貨進貨</span>`;
          }
        }

        const detailHtml = orderDetails
          .map((d) => {
            let lineTag = '';
            const fulfilled = d.fulfilled_quantity || 0;
            if (fulfillInfo && fulfillInfo.lineStatus.has(d.id)) {
              const st = fulfillInfo.lineStatus.get(d.id);
              if (fulfilled >= d.quantity) {
                lineTag = `<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">已全出</span>`;
              } else {
                lineTag = st.ready
                  ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold">在庫足</span>`
                  : `<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-semibold">缺 ${st.missing}</span>`;
              }
            }
            return `
              <div class="text-xs text-slate-600 flex justify-between items-center py-0.5">
                <span class="font-medium text-slate-800">${escapeHtml(varMap.get(d.variant_id) || '未知品項')}</span>
                <div class="flex gap-2 items-center">
                  <span>數量: ${d.quantity}</span>
                  <span class="text-[11px] text-slate-400">(已出: ${fulfilled})</span>
                  ${lineTag}
                  <span class="font-semibold text-slate-700 w-16 text-right">$${d.subtotal}</span>
                </div>
              </div>
            `;
          })
          .join('');

        let actionsHtml = '';
        if (o.status === 'PENDING') {
          actionsHtml += `<button class="btn-edit-sales text-blue-600 font-semibold text-xs ml-1">修改訂單</button>`;
          actionsHtml += `<button class="btn-del-sales text-red-500 hover:text-red-700 text-xs ml-1">刪除訂單</button>`;
        } else if (o.status === 'PREPARING' || o.status === 'PARTIALLY_SHIPPED') {
          actionsHtml += `<button class="btn-open-shipment bg-purple-600 hover:bg-purple-700 text-white px-2 py-0.5 rounded text-xs font-semibold" data-id="${o.id}">分批/整批出貨</button>`;
          if (o.status === 'PREPARING') {
            actionsHtml += `<button class="btn-action-status bg-rose-500 hover:bg-rose-600 text-white px-2 py-0.5 rounded text-xs ml-1 font-semibold" data-status="CANCELLED" data-msg="確認取消這筆備貨中訂單嗎？取消後不可復原。">取消訂單</button>`;
          }
          actionsHtml += `<button class="btn-edit-sales text-blue-600 font-semibold text-xs ml-1">追加/編輯明細</button>`;
        } else if (o.status === 'SHIPPED') {
          actionsHtml += `<button class="btn-action-status bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded text-xs font-semibold" data-status="COMPLETED" data-msg="確認完成該筆訂單並結案嗎？">確認結案</button>`;
        }

        return `
          <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-2" data-id="${o.id}">
            <div class="flex justify-between items-center text-sm">
              <span class="font-bold text-slate-900">${escapeHtml(custMap.get(o.customer_id) || '未知客戶')} <span class="text-xs text-slate-400">(${o.so_number})</span></span>
              <div class="flex items-center gap-1.5">
                ${fulfillmentBadgeHtml}
                <span class="text-[11px] px-2 py-0.5 rounded font-bold ${statusColorMap[o.status] || 'bg-slate-100'}">${SALES_STATUS_MAP[o.status] || o.status}</span>
                ${actionsHtml}
              </div>
            </div>
            <div class="border-t border-b py-2 space-y-1">${detailHtml}</div>
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-400">下單時間: ${o.order_date.replace('T', ' ')}</span>
              <span class="text-sm font-bold text-emerald-600">金額: $${o.total_amount}</span>
            </div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('.btn-open-shipment').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        ShipmentModal.open(id);
      });
    });

    container.querySelectorAll('.btn-action-status').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        const nextStatus = e.target.dataset.status;
        const confirmMsg =
          e.target.dataset.msg ||
          `確認將訂單狀態更新為「${SALES_STATUS_MAP[nextStatus] || nextStatus}」？`;

        if (!confirm(confirmMsg)) {
          return;
        }

        const now = new Date().toISOString();
        try {
          await db.transaction(
            'rw',
            [db.sales_orders, db.sales_items, db.product_variants],
            async () => {
              const order = await db.sales_orders.get(id);
              if (!order) {
                return;
              }

              if (nextStatus === 'SHIPPED') {
                const items = await db.sales_items.where('sales_order_id').equals(id).toArray();
                for (const item of items) {
                  const v = await db.product_variants.get(item.variant_id);
                  if (v) {
                    await db.product_variants.update(v.id, {
                      current_stock: Math.max(0, (v.current_stock || 0) - item.quantity),
                      updated_at: now,
                    });
                  }
                }
              }
              await db.sales_orders.update(id, { status: nextStatus, updated_at: now });
            },
          );
          eventBus.emit('sales:changed');
          eventBus.emit('products:changed');
        } catch (err) {
          alert('狀態變更失敗：' + err.message);
        }
      });
    });

    container.querySelectorAll('.btn-edit-sales').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        SalesModal.open(id);
      });
    });

    container.querySelectorAll('.btn-del-sales').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        const order = await db.sales_orders.get(id);
        if (order && order.status !== 'PENDING') {
          return alert('非待處理狀態之訂單無法刪除');
        }
        if (!confirm('警告：確定要永久刪除此筆待處理訂單？')) {
          return;
        }
        const now = new Date().toISOString();
        await db.transaction('rw', db.sales_orders, async () => {
          await db.sales_orders.update(id, { is_deleted: 1, updated_at: now });
        });
        eventBus.emit('sales:changed');
      });
    });
  },
};
