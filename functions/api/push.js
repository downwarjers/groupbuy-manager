export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : null;
  if (!token || token !== env.AUTH_SECRET) {
    return new Response(JSON.stringify({ error: '未授權訪問' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const {
      baseTimestamp,
      suppliers,
      customers,
      products,
      productVariants,
      purchaseOrders,
      purchaseItems,
      salesOrders,
      salesItems,
      fulfillments,
      fulfillmentItems,
    } = body;

    const meta = await env.DB.prepare(
      "SELECT value FROM meta WHERE key = 'lastUpdatedTimestamp'",
    ).first();
    const currentRemoteTs = Number(meta ? meta.value : 0);

    if (baseTimestamp < currentRemoteTs) {
      return new Response(
        JSON.stringify({
          status: 'conflict',
          message: '遠端資料已被修改，請先點擊「雲端同步」拉取最新資料',
        }),
        { status: 409 },
      );
    }

    const stmts = [];

    // Suppliers
    if (suppliers) {
      for (const s of suppliers) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO suppliers (id, name, contact_person, tel, phone, email, address, website, is_deleted, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, contact_person=excluded.contact_person, tel=excluded.tel, phone=excluded.phone, email=excluded.email, address=excluded.address, website=excluded.website, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at`,
          ).bind(
            s.id,
            s.name,
            s.contact_person,
            s.tel,
            s.phone,
            s.email,
            s.address,
            s.website,
            s.is_deleted ? 1 : 0,
            s.updated_at,
          ),
        );
      }
    }

    // Customers
    if (customers) {
      for (const c of customers) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO customers (id, name, tel, phone, email, address, birthday, note, is_deleted, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, tel=excluded.tel, phone=excluded.phone, email=excluded.email, address=excluded.address, birthday=excluded.birthday, note=excluded.note, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at`,
          ).bind(
            c.id,
            c.name,
            c.tel,
            c.phone,
            c.email,
            c.address,
            c.birthday,
            c.note,
            c.is_deleted ? 1 : 0,
            c.updated_at,
          ),
        );
      }
    }

    // Products
    if (products) {
      for (const p of products) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO products (id, name, description, supplier_id, is_deleted, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, description=excluded.description, supplier_id=excluded.supplier_id, 
               is_deleted=excluded.is_deleted, updated_at=excluded.updated_at`,
          ).bind(p.id, p.name, p.description, p.supplier_id, p.is_deleted ? 1 : 0, p.updated_at),
        );
      }
    }

    // Product Variants
    if (productVariants) {
      for (const pv of productVariants) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO product_variants (id, product_id, spec_name, unit_quantity, unit_name, cost_price, retail_price, current_stock, is_deleted, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
             ON CONFLICT(id) DO UPDATE SET 
               product_id=excluded.product_id, spec_name=excluded.spec_name, unit_quantity=excluded.unit_quantity, 
               unit_name=excluded.unit_name, cost_price=excluded.cost_price, retail_price=excluded.retail_price, 
               current_stock=excluded.current_stock, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at`,
          ).bind(
            pv.id,
            pv.product_id,
            pv.spec_name,
            pv.unit_quantity,
            pv.unit_name,
            pv.cost_price,
            pv.retail_price,
            pv.current_stock,
            pv.is_deleted ? 1 : 0,
            pv.updated_at,
          ),
        );
      }
    }

    // Purchase Orders & Items
    if (purchaseOrders) {
      for (const po of purchaseOrders) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO purchase_orders (id, po_number, supplier_id, status, total_cost, order_date, is_deleted, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               po_number=excluded.po_number, supplier_id=excluded.supplier_id, status=excluded.status,
               total_cost=excluded.total_cost, order_date=excluded.order_date, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at`,
          ).bind(
            po.id,
            po.po_number,
            po.supplier_id,
            po.status,
            po.total_cost,
            po.order_date,
            po.is_deleted ? 1 : 0,
            po.updated_at,
          ),
        );
      }
    }

    if (purchaseItems) {
      for (const pi of purchaseItems) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO purchase_items (id, purchase_order_id, variant_id, quantity, received_quantity, unit_cost, subtotal)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               variant_id=excluded.variant_id, quantity=excluded.quantity, received_quantity=excluded.received_quantity, unit_cost=excluded.unit_cost, subtotal=excluded.subtotal`,
          ).bind(
            pi.id,
            pi.purchase_order_id,
            pi.variant_id,
            pi.quantity,
            pi.received_quantity || 0,
            pi.unit_cost,
            pi.subtotal,
          ),
        );
      }
    }

    // Sales Orders & Items
    if (salesOrders) {
      for (const so of salesOrders) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO sales_orders (id, so_number, customer_id, status, total_amount, order_date, is_deleted, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               so_number=excluded.so_number, customer_id=excluded.customer_id, status=excluded.status,
               total_amount=excluded.total_amount, order_date=excluded.order_date, is_deleted=excluded.is_deleted, updated_at=excluded.updated_at`,
          ).bind(
            so.id,
            so.so_number,
            so.customer_id,
            so.status,
            so.total_amount,
            so.order_date,
            so.is_deleted ? 1 : 0,
            so.updated_at,
          ),
        );
      }
    }

    if (salesItems) {
      for (const si of salesItems) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO sales_items (id, sales_order_id, variant_id, quantity, fulfilled_quantity, unit_price, subtotal)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               variant_id=excluded.variant_id, quantity=excluded.quantity, fulfilled_quantity=excluded.fulfilled_quantity, unit_price=excluded.unit_price, subtotal=excluded.subtotal`,
          ).bind(
            si.id,
            si.sales_order_id,
            si.variant_id,
            si.quantity,
            si.fulfilled_quantity || 0,
            si.unit_price,
            si.subtotal,
          ),
        );
      }
    }

    // Fulfillments
    if (fulfillments) {
      for (const f of fulfillments) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO fulfillments (id, sales_order_id, shipment_number, shipping_carrier, tracking_number, status, shipped_at, note, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               sales_order_id=excluded.sales_order_id, shipment_number=excluded.shipment_number, shipping_carrier=excluded.shipping_carrier,
               tracking_number=excluded.tracking_number, status=excluded.status, shipped_at=excluded.shipped_at, note=excluded.note, updated_at=excluded.updated_at`,
          ).bind(
            f.id,
            f.sales_order_id,
            f.shipment_number,
            f.shipping_carrier,
            f.tracking_number,
            f.status,
            f.shipped_at,
            f.note,
            f.updated_at,
          ),
        );
      }
    }

    if (fulfillmentItems) {
      for (const fi of fulfillmentItems) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO fulfillment_items (id, fulfillment_id, sales_item_id, variant_id, quantity)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               fulfillment_id=excluded.fulfillment_id, sales_item_id=excluded.sales_item_id, variant_id=excluded.variant_id, quantity=excluded.quantity`,
          ).bind(fi.id, fi.fulfillment_id, fi.sales_item_id, fi.variant_id, fi.quantity),
        );
      }
    }

    const newTimestamp = Date.now();
    stmts.push(
      env.DB.prepare(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('lastUpdatedTimestamp', ?)",
      ).bind(String(newTimestamp)),
    );

    await env.DB.batch(stmts);
    return new Response(JSON.stringify({ status: 'success', newTimestamp }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
