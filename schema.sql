-- Metadata
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  tel TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  website TEXT,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tel TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  birthday TEXT,
  note TEXT,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 商品主表 (SPU)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  supplier_id TEXT,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 商品規格 (SKU)
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  spec_name TEXT NOT NULL,
  unit_quantity REAL DEFAULT 1,
  unit_name TEXT DEFAULT '個',
  cost_price REAL DEFAULT 0,
  retail_price REAL DEFAULT 0,
  current_stock INTEGER DEFAULT 0, -- 實體貨架在手庫存 (On-Hand)
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 採購單主表 (Master)
-- status: PENDING (草稿), ORDERED (已下單/在途), PARTIALLY_RECEIVED (部分到貨), RECEIVED (全部到貨), CANCELLED (已取消)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  total_cost REAL DEFAULT 0,
  order_date TEXT NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 採購單明細 (Detail)
CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,            -- 預計採購總量
  received_quantity INTEGER DEFAULT 0, -- 實際已清點入庫總量
  unit_cost REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- 銷售單主表 (Master)
-- status: PENDING (待處理), PREPARING (備貨中), PARTIALLY_SHIPPED (部分出貨), SHIPPED (已出貨), COMPLETED (已結案), CANCELLED (已取消)
CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  so_number TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  total_amount REAL DEFAULT 0,
  order_date TEXT NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 銷售單明細 (Detail)
CREATE TABLE IF NOT EXISTS sales_items (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  fulfilled_quantity INTEGER DEFAULT 0, -- 累計已出貨數量
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- 出貨單主表 (Fulfillments)
CREATE TABLE IF NOT EXISTS fulfillments (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL,
  shipment_number TEXT NOT NULL,
  shipping_carrier TEXT,
  tracking_number TEXT,
  status TEXT DEFAULT 'SHIPPED',
  shipped_at TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL
);

-- 出貨單明細 (Fulfillment Items)
CREATE TABLE IF NOT EXISTS fulfillment_items (
  id TEXT PRIMARY KEY,
  fulfillment_id TEXT NOT NULL,
  sales_item_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('lastUpdatedTimestamp', '0');