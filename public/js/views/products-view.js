import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';
import { ProductModal } from '../modals/modal-product.js';
import { escapeHtml } from '../core/utils.js';

export const ProductsView = {
  init() {
    document.getElementById('search-product')?.addEventListener('input', () => {
      return this.render();
    });
    document.getElementById('sort-product')?.addEventListener('change', () => {
      return this.render();
    });
    document.getElementById('btn-open-create-product')?.addEventListener('click', () => {
      ProductModal.open();
    });

    eventBus.on('products:changed', () => {
      return this.render();
    });
    eventBus.on('sales:changed', () => {
      return this.render();
    });
    eventBus.on('purchases:changed', () => {
      return this.render();
    });
    eventBus.on('sync:completed', () => {
      return this.render();
    });
  },

  async render() {
    const container = document.getElementById('list-products');
    if (!container) {
      return;
    }

    const searchKeyword = (document.getElementById('search-product')?.value || '')
      .toLowerCase()
      .trim();
    const sortMode = document.getElementById('sort-product')?.value || 'name_asc';

    const [rawProducts, rawVariants, salesOrders, salesItems, purchaseOrders, purchaseItems] =
      await Promise.all([
        db.products.where('is_deleted').equals(0).toArray(),
        db.product_variants.where('is_deleted').equals(0).toArray(),
        db.sales_orders.where('is_deleted').equals(0).toArray(),
        db.sales_items.toArray(),
        db.purchase_orders.where('is_deleted').equals(0).toArray(),
        db.purchase_items.toArray(),
      ]);

    let products = rawProducts;
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
      container.innerHTML = '<div class="text-center text-slate-400 py-8">查無商品資料</div>';
      return;
    }

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

    const inboundPoIds = new Set(
      purchaseOrders
        .filter((o) => {
          return o.status === 'ORDERED' || o.status === 'PARTIALLY_RECEIVED';
        })
        .map((o) => {
          return o.id;
        }),
    );

    const statsMap = new Map();
    rawVariants.forEach((v) => {
      statsMap.set(v.id, { allocated: 0, inbound: 0 });
    });

    salesItems.forEach((si) => {
      if (activeSoIds.has(si.sales_order_id) && statsMap.has(si.variant_id)) {
        const remainingNeed = Math.max(0, si.quantity - (si.fulfilled_quantity || 0));
        statsMap.get(si.variant_id).allocated += remainingNeed;
      }
    });

    purchaseItems.forEach((pi) => {
      if (inboundPoIds.has(pi.purchase_order_id) && statsMap.has(pi.variant_id)) {
        const remainingInbound = Math.max(0, pi.quantity - (pi.received_quantity || 0));
        statsMap.get(pi.variant_id).inbound += remainingInbound;
      }
    });

    const variantMap = new Map();
    rawVariants.forEach((v) => {
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
            const stat = statsMap.get(v.id) || { allocated: 0, inbound: 0 };
            const onHand = Number(v.current_stock) || 0;
            const available = onHand - stat.allocated;

            const availColor =
              available < 0
                ? 'text-red-600'
                : available === 0
                  ? 'text-amber-600'
                  : 'text-emerald-600';

            return `
              <div class="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5 mt-1.5">
                <div class="flex justify-between items-center">
                  <span class="font-bold text-slate-800">${escapeHtml(v.spec_name)} (${v.unit_quantity}${escapeHtml(v.unit_name)})</span>
                  <span class="text-slate-500">售價: $${v.retail_price} | 進價: $${v.cost_price}</span>
                </div>
                <div class="grid grid-cols-4 gap-1 text-center bg-white p-1.5 rounded border text-[11px]">
                  <div>
                    <div class="text-slate-400">實體貨架</div>
                    <div class="font-bold text-slate-800">${onHand}</div>
                  </div>
                  <div>
                    <div class="text-slate-400">客訂鎖定</div>
                    <div class="font-bold text-blue-600">${stat.allocated}</div>
                  </div>
                  <div>
                    <div class="text-slate-400">在途未到</div>
                    <div class="font-bold text-indigo-600">${stat.inbound}</div>
                  </div>
                  <div>
                    <div class="text-slate-400">可用餘額</div>
                    <div class="font-bold ${availColor}">${available}</div>
                  </div>
                </div>
              </div>
            `;
          })
          .join('');

        return `
          <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200" data-id="${p.id}">
            <div class="flex justify-between items-start">
              <div>
                <div class="font-bold text-base text-slate-900">${escapeHtml(p.name)}</div>
                ${p.description ? `<div class="text-xs text-slate-500 mt-0.5">${escapeHtml(p.description)}</div>` : ''}
              </div>
              <div class="flex gap-2">
                <button class="btn-edit-prod text-blue-500 hover:text-blue-700 text-xs font-semibold">編輯</button>
                <button class="btn-del-prod text-red-400 hover:text-red-600 text-xs">刪除</button>
              </div>
            </div>
            <div class="mt-2 space-y-1">${variantListHtml}</div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('.btn-edit-prod').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        ProductModal.open(id);
      });
    });

    container.querySelectorAll('.btn-del-prod').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        if (!confirm('確定要刪除此商品及所有規格？')) {
          return;
        }
        const now = new Date().toISOString();
        await db.transaction('rw', db.products, db.product_variants, async () => {
          await db.products.update(id, { is_deleted: 1, updated_at: now });
          const vars = await db.product_variants.where('product_id').equals(id).toArray();
          for (const v of vars) {
            await db.product_variants.update(v.id, { is_deleted: 1, updated_at: now });
          }
        });
        eventBus.emit('products:changed');
      });
    });
  },
};
