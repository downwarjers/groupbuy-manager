export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const authHeader = request.headers.get('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : url.searchParams.get('key');

  if (!token || token !== env.AUTH_SECRET) {
    return new Response(JSON.stringify({ error: '未經授權的存取' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const meta = await env.DB.prepare(
      "SELECT value FROM meta WHERE key = 'lastUpdatedTimestamp'",
    ).first();
    const suppliers = await env.DB.prepare('SELECT * FROM suppliers').all();
    const customers = await env.DB.prepare('SELECT * FROM customers').all();
    const products = await env.DB.prepare('SELECT * FROM products').all();
    const productVariants = await env.DB.prepare('SELECT * FROM product_variants').all();
    const purchaseOrders = await env.DB.prepare('SELECT * FROM purchase_orders').all();
    const purchaseItems = await env.DB.prepare('SELECT * FROM purchase_items').all();
    const salesOrders = await env.DB.prepare('SELECT * FROM sales_orders').all();
    const salesItems = await env.DB.prepare('SELECT * FROM sales_items').all();

    return new Response(
      JSON.stringify({
        status: 'success',
        lastUpdatedTimestamp: Number(meta ? meta.value : 0),
        data: {
          suppliers: suppliers.results,
          customers: customers.results,
          products: products.results,
          product_variants: productVariants.results,
          purchaseOrders: purchaseOrders.results,
          purchaseItems: purchaseItems.results,
          salesOrders: salesOrders.results,
          salesItems: salesItems.results,
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
