// functions/api/delete-log.js

export async function onRequestPost(context) {
    try {
        // 从 POST 请求的 body 中获取 id
        const { id } = await context.request.json();

        if (!id) {
            return new Response(JSON.stringify({ error: 'Log ID is required in the request body' }), { 
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
        return new Response(JSON.stringify({ error: "删除失败: " + error.message }), {
            status: 500, 
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
