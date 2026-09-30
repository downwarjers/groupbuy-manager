import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';

export const CustomerModal = {
  init() {
    document.getElementById('btn-save-customer')?.addEventListener('click', () => {
      return this.save();
    });
    document.getElementById('btn-close-modal-customer')?.addEventListener('click', () => {
      return this.close();
    });
  },

  async open(id = null) {
    try {
      document.getElementById('cust-id').value = id || '';
      const title = document.getElementById('modal-customer-title');

      if (id) {
        title.textContent = '編輯客戶';
        const c = await db.customers.get(id);
        document.getElementById('cust-name').value = c.name;
        document.getElementById('cust-phone').value = c.phone || '';
        document.getElementById('cust-tel').value = c.tel || '';
        document.getElementById('cust-email').value = c.email || '';
        document.getElementById('cust-address').value = c.address || '';
        document.getElementById('cust-birthday').value = c.birthday || '';
        document.getElementById('cust-note').value = c.note || '';
      } else {
        title.textContent = '新增客戶';
        [
          'cust-name',
          'cust-phone',
          'cust-tel',
          'cust-email',
          'cust-address',
          'cust-birthday',
          'cust-note',
        ].forEach((k) => {
          document.getElementById(k).value = '';
        });
      }
      document.getElementById('modal-customer')?.classList.remove('hidden');
    } catch (err) {
      console.error('[CustomerModal] 開啟失敗:', err);
    }
  },

  async save() {
    try {
      const id = document.getElementById('cust-id').value || crypto.randomUUID();
      const name = document.getElementById('cust-name').value.trim();
      const phone = document.getElementById('cust-phone').value.trim();

      if (!name || !phone) {
        return alert('姓名與手機號碼為必填');
      }

      await db.customers.put({
        id,
        name,
        phone,
        tel: document.getElementById('cust-tel').value.trim(),
        email: document.getElementById('cust-email').value.trim(),
        address: document.getElementById('cust-address').value.trim(),
        birthday: document.getElementById('cust-birthday').value,
        note: document.getElementById('cust-note').value.trim(),
        is_deleted: 0,
        updated_at: new Date().toISOString(),
      });

      this.close();
      eventBus.emit('members:changed');
    } catch (err) {
      console.error('[CustomerModal] 儲存失敗:', err);
    }
  },

  close() {
    document.getElementById('modal-customer')?.classList.add('hidden');
  },
};
