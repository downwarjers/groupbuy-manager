-- Metadata
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 供應商資料表
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

-- 客戶資料表
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

-- 主商品表 (SPU)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  supplier_id TEXT,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 商品規格變體表 (SKU)
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  spec_name TEXT NOT NULL,
  unit_quantity REAL DEFAULT 1,
  unit_name TEXT DEFAULT '個',
  cost_price REAL DEFAULT 0,
  retail_price REAL DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 採購單 (Master)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, ORDERED, RECEIVED, CANCELLED
  total_cost REAL DEFAULT 0,
  order_date TEXT NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 採購明細 (Detail)
CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- 銷售訂單 (Master)
CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  so_number TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, PREPARING, SHIPPED, COMPLETED, CANCELLED
  total_amount REAL DEFAULT 0,
  order_date TEXT NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 銷售明細 (Detail) - 移除 ordered_quantity 靜態記錄欄位
CREATE TABLE IF NOT EXISTS sales_items (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('lastUpdatedTimestamp', '0');