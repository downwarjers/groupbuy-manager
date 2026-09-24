-- 系統 Metadata
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 供應商
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  website TEXT,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 團購會員
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  birthday TEXT,
  note TEXT,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 商品
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  spec TEXT,
  cost_price REAL DEFAULT 0,
  retail_price REAL DEFAULT 0,
  supplier_id TEXT,
  current_stock INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 叫貨訂單 (Purchase Order)
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

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- 出貨訂單 (Sales Order)
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

CREATE TABLE IF NOT EXISTS sales_items (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- 庫存流水帳 (審計對帳用)
CREATE TABLE IF NOT EXISTS inventory_logs (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  change_quantity INTEGER NOT NULL,
  type TEXT NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL
);

-- 初始化時間戳
INSERT OR IGNORE INTO meta (key, value) VALUES ('lastUpdatedTimestamp', '0');