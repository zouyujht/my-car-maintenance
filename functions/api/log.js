export async function onRequestPost(context) {
  try {
    // 从请求中获取JSON数据
    const { purchase_date, maintenance_date, mileage, items } = await context.request.json();
    const db = context.env.DB; // 绑定我们在 wrangler.toml 中定义的数据库

    // 如果提供了购车日期，处理购车信息和初始记录
    if (purchase_date) {
      // 检查是否已存在购车信息
      const carInfo = await db.prepare("SELECT purchase_date FROM car_info LIMIT 1").first();
      
      // 使用 INSERT OR IGNORE 插入购车日期，避免重复
      await db.prepare("INSERT OR IGNORE INTO car_info (purchase_date) VALUES (?)")
              .bind(purchase_date)
              .run();

      // 如果是首次记录购车日期，则添加一条“车辆购买”的初始日志
      if (!carInfo) {
        await db.prepare("INSERT INTO maintenance_logs (maintenance_date, mileage, item_name) VALUES (?, ?, ?)")
                .bind(purchase_date, 0, "车辆购买")
                .run();
      }
    }

    // 如果请求中包含保养项目，则批量插入
    if (items && Array.isArray(items) && items.length > 0) {
        // 确保保养日期和里程已提供
        if (!maintenance_date || typeof mileage === 'undefined') {
            return new Response(JSON.stringify({ success: false, message: "保存保养项目时，必须提供 maintenance_date 和 mileage。" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        const stmt = db.prepare("INSERT INTO maintenance_logs (maintenance_date, mileage, item_name) VALUES (?, ?, ?)");
        const batch = items.map(item => stmt.bind(maintenance_date, mileage, item));
        await db.batch(batch);
    }

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

// 添加一个DELETE方法来删除一条记录
export async function onRequestDelete(context) {
    try {
        const url = new URL(context.request.url);
        const id = url.searchParams.get('id');

        if (!id) {
            return new Response(JSON.stringify({ error: 'Log ID is required' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const db = context.env.DB;
        const info = await db.prepare("DELETE FROM maintenance_logs WHERE id = ?").bind(id).run();

        if (info.changes > 0) {
            return new Response(JSON.stringify({ message: '记录已成功删除' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        } else {
            return new Response(JSON.stringify({ error: '未找到要删除的记录' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}