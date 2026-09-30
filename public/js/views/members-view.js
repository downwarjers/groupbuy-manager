import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';
import { CustomerModal } from '../modals/modal-customer.js';
import { SupplierModal } from '../modals/modal-supplier.js';
import { escapeHtml } from '../core/utils.js';

export const MembersView = {
  init() {
    document.getElementById('search-member')?.addEventListener('input', () => {
      return this.render();
    });
    document.getElementById('sort-member')?.addEventListener('change', () => {
      return this.render();
    });
    document.getElementById('btn-open-create-customer')?.addEventListener('click', () => {
      return CustomerModal.open();
    });
    document.getElementById('btn-open-create-supplier')?.addEventListener('click', () => {
      return SupplierModal.open();
    });

    eventBus.on('members:changed', () => {
      return this.render();
    });
    eventBus.on('sync:completed', () => {
      return this.render();
    });
  },

  async render() {
    const custContainer = document.getElementById('list-customers');
    const supContainer = document.getElementById('list-suppliers');
    if (!custContainer || !supContainer) {
      return;
    }

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

    const sortFn = (a, b) => {
      return sortMode === 'name_asc'
        ? a.name.localeCompare(b.name, 'zh-Hant')
        : b.updated_at.localeCompare(a.updated_at);
    };
    customers.sort(sortFn);
    suppliers.sort(sortFn);

    custContainer.innerHTML =
      customers
        .map((c) => {
          return `
      <div class="bg-white p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-start" data-id="${c.id}">
        <div class="space-y-1">
          <div class="font-bold text-slate-800 text-sm">${escapeHtml(c.name)}</div>
          <div class="text-slate-600">手機: ${escapeHtml(c.phone)} | 電話: ${escapeHtml(c.tel || '無')}</div>
          <div class="text-slate-500">Email: ${escapeHtml(c.email || '無')} | 生日: ${escapeHtml(c.birthday || '未設定')}</div>
          <div class="text-slate-500">地址: ${escapeHtml(c.address || '無')}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-edit-cust text-blue-600 font-semibold px-1">編輯</button>
          <button class="btn-del-cust text-red-500 font-semibold px-1">刪除</button>
        </div>
      </div>
    `;
        })
        .join('') || '<div class="text-slate-400 text-xs">無客戶資料</div>';

    supContainer.innerHTML =
      suppliers
        .map((s) => {
          return `
      <div class="bg-white p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-start" data-id="${s.id}">
        <div class="space-y-1">
          <div class="font-bold text-slate-800 text-sm">${escapeHtml(s.name)} (聯絡人: ${escapeHtml(s.contact_person || '未指定')})</div>
          <div class="text-slate-600">電話: ${escapeHtml(s.tel || '無')} | 手機: ${escapeHtml(s.phone || '無')}</div>
          <div class="text-slate-500">Email: ${escapeHtml(s.email || '無')} | 地址: ${escapeHtml(s.address || '無')}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-edit-sup text-blue-600 font-semibold px-1">編輯</button>
          <button class="btn-del-sup text-red-500 font-semibold px-1">刪除</button>
        </div>
      </div>
    `;
        })
        .join('') || '<div class="text-slate-400 text-xs">無廠商資料</div>';

    custContainer.querySelectorAll('.btn-edit-cust').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        CustomerModal.open(id);
      });
    });

    custContainer.querySelectorAll('.btn-del-cust').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        if (!confirm('確定刪除此客戶？')) {
          return;
        }
        await db.customers.update(id, { is_deleted: 1, updated_at: new Date().toISOString() });
        eventBus.emit('members:changed');
      });
    });

    supContainer.querySelectorAll('.btn-edit-sup').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        SupplierModal.open(id);
      });
    });

    supContainer.querySelectorAll('.btn-del-sup').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-id]').dataset.id;
        if (!confirm('確定刪除此廠商？')) {
          return;
        }
        await db.suppliers.update(id, { is_deleted: 1, updated_at: new Date().toISOString() });
        eventBus.emit('members:changed');
      });
    });
  },
};
