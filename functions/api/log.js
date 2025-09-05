export async function onRequestPost(context) {
  try {
    // 从请求中获取JSON数据
    const { purchase_date, maintenance_date, mileage, items } = await context.request.json();
    const db = context.env.DB; // 绑定我们在 wrangler.toml 中定义的数据库

    // 如果提供了购车日期，尝试插入它。UNIQUE约束会防止重复插入。
    if (purchase_date) {
      await db.prepare("INSERT OR IGNORE INTO car_info (purchase_date) VALUES (?)")
              .bind(purchase_date)
              .run();
    }

    // 为每个保养项目准备插入语句
    const stmt = db.prepare("INSERT INTO maintenance_logs (maintenance_date, mileage, item_name) VALUES (?, ?, ?)");

    // 批量插入所有保养项目
    const batch = items.map(item => stmt.bind(maintenance_date, mileage, item));
    await db.batch(batch);

    return new Response(JSON.stringify({ success: true, message: "保养记录已成功保存！" }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: "保存失败: " + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 添加一个GET方法来获取所有历史记录
export async function onRequestGet(context) {
    try {
        const db = context.env.DB;
        const { results } = await db.prepare("SELECT * FROM maintenance_logs ORDER BY maintenance_date DESC, mileage DESC").all();
        return new Response(JSON.stringify(results), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}