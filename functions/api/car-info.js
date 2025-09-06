// functions/api/car-info.js

export async function onRequest(context) {
  if (context.request.method === 'DELETE') {
    return await onRequestDelete(context);
  }
  return new Response('Method Not Allowed', { status: 405 });
}

async function onRequestDelete(context) {
    try {
        const db = context.env.DB;

        // Use a transaction to ensure both operations succeed or fail together
        const results = await db.batch([
            db.prepare("DELETE FROM car_info"),
            db.prepare("DELETE FROM maintenance_logs")
        ]);

        // Basic check to see if the batch executed without throwing an error
        // For more complex scenarios, you might inspect the 'results' array
        
        return new Response(JSON.stringify({ success: true, message: '购车日期及所有相关记录已删除。' }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: "删除失败: " + error.message }), {
            status: 500, 
            headers: { 'Content-Type': 'application/json' },
        });
    }
}