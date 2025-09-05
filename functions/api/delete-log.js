// functions/api/delete-log.js

export async function onRequestPost(context) {
    try {
        // 从 POST 请求的 JSON 正文中获取 id
        const { id } = await context.request.json();

        if (!id) {
            return new Response(JSON.stringify({ success: false, error: 'Log ID is required' }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const db = context.env.DB;
        await db.prepare("DELETE FROM maintenance_logs WHERE id = ?").bind(id).run();

        // 只要 run() 没有抛出异常，我们就认为操作是成功的。
        // D1 的 .changes 在某些情况下可能不会立即反映更改，但操作本身已成功。
        return new Response(JSON.stringify({ success: true, message: '记录已成功删除' }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        // 捕获其他潜在错误
        return new Response(JSON.stringify({ success: false, error: "删除失败: " + error.message }), {
            status: 500, 
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// 为了安全起见，只允许 POST 方法
export async function onRequest(context) {
  if (context.request.method === 'POST') {
    return await onRequestPost(context);
  }
  return new Response('Method Not Allowed', { status: 405 });
}
