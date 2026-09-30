import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';

export const ProductModal = {
  init() {
    document.getElementById('btn-add-variant')?.addEventListener('click', () => {
      this.addVariantRow();
    });
    document.getElementById('btn-save-product')?.addEventListener('click', () => {
      this.save();
    });
    document.getElementById('btn-close-modal-product')?.addEventListener('click', () => {
      this.close();
    });
  },

  async open(prodId = null) {
    try {
      const modal = document.getElementById('modal-product');
      const title = document.getElementById('modal-product-title');
      const prodIdInput = document.getElementById('prod-id');
      const prodNameInput = document.getElementById('prod-name');
      const prodDescInput = document.getElementById('prod-desc');
      const container = document.getElementById('product-variants-container');

      prodIdInput.value = prodId || '';
      container.innerHTML = '';

      if (prodId) {
        title.textContent = '編輯商品';
        const [prod, variants] = await Promise.all([
          db.products.get(prodId),
          db.product_variants
            .where('product_id')
            .equals(prodId)
            .filter((v) => {
              return v.is_deleted === 0;
            })
            .toArray(),
        ]);
        prodNameInput.value = prod.name;
        prodDescInput.value = prod.description || '';
        variants.forEach((v) => {
          this.addVariantRow(
            v.spec_name,
            v.unit_quantity,
            v.unit_name,
            v.cost_price,
            v.retail_price,
            v.current_stock,
            v.id,
          );
        });
      } else {
        title.textContent = '新增商品';
        prodNameInput.value = '';
        prodDescInput.value = '';
        this.addVariantRow('標準', 1, '件', 0, 0, 0);
      }
      modal.classList.remove('hidden');
    } catch (err) {
      console.error('[ProductModal] 開啟異常:', err);
      alert('無法開啟商品編輯視窗');
    }
  },

  addVariantRow(name = '', qty = 1, unit = '件', cost = 0, retail = 0, stock = 0, variantId = '') {
    const container = document.getElementById('product-variants-container');
    const rowId = `v-row-${crypto.randomUUID()}`;
    const html = `
      <div id="${rowId}" class="p-2 border rounded-lg bg-slate-50 space-y-1 text-xs" data-variant-id="${variantId}">
        <div class="flex gap-2 items-center">
          <input type="text" placeholder="規格名稱 (例: 紅色 / XL)" value="${name}" class="var-name border p-1 rounded flex-1">
          <input type="number" placeholder="內含數量" value="${qty}" class="var-unit-qty border p-1 rounded w-16">
          <input list="common-units" placeholder="單位" value="${unit}" class="var-unit border p-1 rounded w-16">
          <button type="button" class="btn-del-var text-red-500 font-bold px-1">刪除</button>
        </div>
        <div class="flex gap-2">
          <input type="number" placeholder="成本價" value="${cost || ''}" class="var-cost border p-1 rounded flex-1">
          <input type="number" placeholder="零售價" value="${retail || ''}" class="var-retail border p-1 rounded flex-1">
          <input type="number" placeholder="目前庫存" value="${stock || ''}" class="var-stock border p-1 rounded w-20">
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    document.querySelector(`#${rowId} .btn-del-var`).addEventListener('click', () => {
      document.getElementById(rowId).remove();
    });
  },

  async save() {
    try {
      const prodId = document.getElementById('prod-id').value || crypto.randomUUID();
      const name = document.getElementById('prod-name').value.trim();
      const desc = document.getElementById('prod-desc').value.trim();

      if (!name) {
        return alert('請輸入商品名稱');
      }
      const variantRows = document.querySelectorAll('#product-variants-container > div');
      if (variantRows.length === 0) {
        return alert('請至少新增一個規格 (SKU)');
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

        const existingVariants = await db.product_variants
          .where('product_id')
          .equals(prodId)
          .toArray();
        const keptVariantIds = [];

        for (const row of variantRows) {
          const vId = row.dataset.variantId || crypto.randomUUID();
          keptVariantIds.push(vId);
          await db.product_variants.put({
            id: vId,
            product_id: prodId,
            spec_name: row.querySelector('.var-name').value.trim() || '標準',
            unit_quantity: Number(row.querySelector('.var-unit-qty').value) || 1,
            unit_name: row.querySelector('.var-unit').value.trim() || '件',
            cost_price: Number(row.querySelector('.var-cost').value) || 0,
            retail_price: Number(row.querySelector('.var-retail').value) || 0,
            current_stock: Number(row.querySelector('.var-stock').value) || 0,
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

      this.close();
      eventBus.emit('products:changed');
    } catch (err) {
      console.error('[ProductModal] 儲存失敗:', err);
      alert('儲存失敗: ' + err.message);
    }
  },

  close() {
    document.getElementById('modal-product')?.classList.add('hidden');
  },
};
