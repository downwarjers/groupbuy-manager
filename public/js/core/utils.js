export function getLocalDatetimeString(dateObj = new Date()) {
  const pad = (n) => {
    return String(n).padStart(2, '0');
  };
  const yyyy = dateObj.getFullYear();
  const mm = pad(dateObj.getMonth() + 1);
  const dd = pad(dateObj.getDate());
  const hh = pad(dateObj.getHours());
  const mi = pad(dateObj.getMinutes());
  const ss = pad(dateObj.getSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

export function escapeHtml(str) {
  if (!str) {
    return '';
  }
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const SALES_STATUS_MAP = {
  PENDING: '待處理',
  PREPARING: '備貨中',
  PARTIALLY_SHIPPED: '部分出貨',
  SHIPPED: '已出貨',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

export const PURCHASE_STATUS_MAP = {
  PENDING: '草稿',
  ORDERED: '已下單 (在途)',
  PARTIALLY_RECEIVED: '部分到貨',
  RECEIVED: '全部到貨',
  CANCELLED: '已取消',
};