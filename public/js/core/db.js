export const db = new window.Dexie('GroupBuyLocalDB');

db.version(4)
  .stores({
    suppliers: 'id, name, phone, tel, is_deleted',
    customers: 'id, name, phone, tel, is_deleted',
    products: 'id, name, is_deleted',
    product_variants: 'id, product_id, spec_name, is_deleted',
    purchase_orders: 'id, po_number, supplier_id, status, order_date, is_deleted',
    purchase_items: 'id, purchase_order_id, variant_id',
    sales_orders: 'id, so_number, customer_id, status, order_date, is_deleted',
    sales_items: 'id, sales_order_id, variant_id',
    fulfillments: 'id, sales_order_id, shipment_number, status, shipped_at',
    fulfillment_items: 'id, fulfillment_id, sales_item_id, variant_id',
  })
  .upgrade((tx) => {
    tx.table('sales_items')
      .toCollection()
      .modify((item) => {
        if (typeof item.fulfilled_quantity === 'undefined') {
          item.fulfilled_quantity = 0;
        }
      });
    return tx
      .table('purchase_items')
      .toCollection()
      .modify((item) => {
        if (typeof item.received_quantity === 'undefined') {
          item.received_quantity = 0;
        }
      });
  });
