export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader ? authHeader.replace("Bearer ", "") : null;

  if (!token || token !== env.AUTH_SECRET) {
    return new Response(JSON.stringify({ error: "未經授權的存取" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await request.json();
    const { baseTimestamp, suppliers, customers, products, purchaseOrders, purchaseItems, salesOrders, salesItems } = body;

    // 1. 版本衝突檢查 (Pull-then-Push)
    const meta = await env.DB.prepare("SELECT value FROM meta WHERE key = 'lastUpdatedTimestamp'").first();
    const currentRemoteTs = Number(meta ? meta.value : 0);

    if (baseTimestamp < currentRemoteTs) {
      return new Response(JSON.stringify({
        status: "conflict",
        message: "遠端已有更新版本，請先拉取最新資料！"
      }), { status: 409 });
    }

    const stmts = [];

    // 2. Suppliers
    if (suppliers) {
      for (const s of suppliers) {
        stmts.push(env.DB.prepare(`
          INSERT INTO suppliers (id, name, contact_person, phone, address, website, is_deleted, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, contact_person=excluded.contact_person, phone=excluded.phone,
            address=excluded.address, website=excluded.website, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at
        `).bind(s.id, s.name, s.contact_person, s.phone, s.address, s.website, s.is_deleted ? 1 : 0, s.updated_at));
      }
    }

    // 3. Customers
    if (customers) {
      for (const c of customers) {
        stmts.push(env.DB.prepare(`
          INSERT INTO customers (id, name, phone, address, birthday, note, is_deleted, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, phone=excluded.phone, address=excluded.address,
            birthday=excluded.birthday, note=excluded.note, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at
        `).bind(c.id, c.name, c.phone, c.address, c.birthday, c.note, c.is_deleted ? 1 : 0, c.updated_at));
      }
    }

    // 4. Products (同步更新 current_stock)
    if (products) {
      for (const p of products) {
        stmts.push(env.DB.prepare(`
          INSERT INTO products (id, name, spec, cost_price, retail_price, supplier_id, current_stock, is_deleted, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, spec=excluded.spec, cost_price=excluded.cost_price,
            retail_price=excluded.retail_price, supplier_id=excluded.supplier_id,
            current_stock=excluded.current_stock, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at
        `).bind(p.id, p.name, p.spec, p.cost_price, p.retail_price, p.supplier_id, p.current_stock, p.is_deleted ? 1 : 0, p.updated_at));
      }
    }

    // 5. Purchase Orders & Items
    if (purchaseOrders) {
      for (const po of purchaseOrders) {
        stmts.push(env.DB.prepare(`
          INSERT INTO purchase_orders (id, po_number, supplier_id, status, total_cost, order_date, is_deleted, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            po_number=excluded.po_number, supplier_id=excluded.supplier_id, status=excluded.status,
            total_cost=excluded.total_cost, order_date=excluded.order_date, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at
        `).bind(po.id, po.po_number, po.supplier_id, po.status, po.total_cost, po.order_date, po.is_deleted ? 1 : 0, po.updated_at));
      }
    }

    if (purchaseItems) {
      for (const pi of purchaseItems) {
        stmts.push(env.DB.prepare(`
          INSERT INTO purchase_items (id, purchase_order_id, product_id, quantity, unit_cost, subtotal)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            quantity=excluded.quantity, unit_cost=excluded.unit_cost, subtotal=excluded.subtotal
        `).bind(pi.id, pi.purchase_order_id, pi.product_id, pi.quantity, pi.unit_cost, pi.subtotal));
      }
    }

    // 6. Sales Orders & Items
    if (salesOrders) {
      for (const so of salesOrders) {
        stmts.push(env.DB.prepare(`
          INSERT INTO sales_orders (id, so_number, customer_id, status, total_amount, order_date, is_deleted, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            so_number=excluded.so_number, customer_id=excluded.customer_id, status=excluded.status,
            total_amount=excluded.total_amount, order_date=excluded.order_date, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at
        `).bind(so.id, so.so_number, so.customer_id, so.status, so.total_amount, so.order_date, so.is_deleted ? 1 : 0, so.updated_at));
      }
    }

    if (salesItems) {
      for (const si of salesItems) {
        stmts.push(env.DB.prepare(`
          INSERT INTO sales_items (id, sales_order_id, product_id, quantity, unit_price, subtotal)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            quantity=excluded.quantity, unit_price=excluded.unit_price, subtotal=excluded.subtotal
        `).bind(si.id, si.sales_order_id, si.product_id, si.quantity, si.unit_price, si.subtotal));
      }
    }

    // 7. 更新 Timestamp
    const newTimestamp = Date.now();
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('lastUpdatedTimestamp', ?)").bind(String(newTimestamp)));

    // 原子性執行全部 SQL
    await env.DB.batch(stmts);

    return new Response(JSON.stringify({ status: "success", newTimestamp }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}