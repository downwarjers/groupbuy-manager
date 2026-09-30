import { db } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';

export const SupplierModal = {
  init() {
    document.getElementById('btn-save-supplier')?.addEventListener('click', () => {
      return this.save();
    });
    document.getElementById('btn-close-modal-supplier')?.addEventListener('click', () => {
      return this.close();
    });
  },

  async open(id = null) {
    try {
      document.getElementById('sup-id').value = id || '';
      const title = document.getElementById('modal-supplier-title');

      if (id) {
        title.textContent = '編輯廠商';
        const s = await db.suppliers.get(id);
        document.getElementById('sup-name').value = s.name;
        document.getElementById('sup-contact').value = s.contact_person || '';
        document.getElementById('sup-tel').value = s.tel || '';
        document.getElementById('sup-phone').value = s.phone || '';
        document.getElementById('sup-email').value = s.email || '';
        document.getElementById('sup-address').value = s.address || '';
      } else {
        title.textContent = '新增廠商';
        ['sup-name', 'sup-contact', 'sup-tel', 'sup-phone', 'sup-email', 'sup-address'].forEach(
          (k) => {
            document.getElementById(k).value = '';
          },
        );
      }
      document.getElementById('modal-supplier')?.classList.remove('hidden');
    } catch (err) {
      console.error('[SupplierModal] 開啟失敗:', err);
    }
  },

  async save() {
    try {
      const id = document.getElementById('sup-id').value || crypto.randomUUID();
      const name = document.getElementById('sup-name').value.trim();
      const tel = document.getElementById('sup-tel').value.trim();
      const phone = document.getElementById('sup-phone').value.trim();

      if (!name) {
        return alert('廠商名稱為必填');
      }
      if (!tel && !phone) {
        return alert('電話或手機請至少填寫一項');
      }

      await db.suppliers.put({
        id,
        name,
        contact_person: document.getElementById('sup-contact').value.trim(),
        tel,
        phone,
        email: document.getElementById('sup-email').value.trim(),
        address: document.getElementById('sup-address').value.trim(),
        website: '',
        is_deleted: 0,
        updated_at: new Date().toISOString(),
      });

      this.close();
      eventBus.emit('members:changed');
    } catch (err) {
      console.error('[SupplierModal] 儲存失敗:', err);
    }
  },

  close() {
    document.getElementById('modal-supplier')?.classList.add('hidden');
  },
};
