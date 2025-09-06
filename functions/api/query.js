// 保养规则定义
const maintenanceRules = [
    { name: '冷却液', type: 'time', value: 3, unit: 'year' },
    { name: '机油', type: 'time', value: 6, unit: 'month' },
    { name: '制动液', type: 'time', value: 3, unit: 'year' },
    { name: '活性炭罐过滤器', type: 'time', value: 3, unit: 'year' },
    { name: '四轮对换', type: 'time', value: 2, unit: 'year' },
    { name: '空气滤芯', type: 'time', value: 1, unit: 'year' },
    { name: '传动皮带', type: 'time', value: 3, unit: 'year' },
    { name: '火花塞', type: 'mileage', value: 30000 },
    { name: '节流阀', type: 'mileage', value: 20000 },
];

// Helper to parse YYYY-MM-DD to avoid timezone issues
function parseDate(dateString) {
    if (!dateString) return null;
    // Handles both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm:ss...'
    const datePart = dateString.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    // Create date in local time zone at midnight
    return new Date(year, month - 1, day);
}

export async function onRequestPost(context) {
    try {
        const { current_mileage } = await context.request.json();
        const db = context.env.DB;

        // 1. Get purchase date
        const carInfo = await db.prepare("SELECT purchase_date FROM car_info LIMIT 1").first();
        if (!carInfo) {
            return new Response(JSON.stringify({ error: "请先在“保养日志”页面填入并提交一次购车日期。" }), { status: 400 });
        }
        const purchaseDate = parseDate(carInfo.purchase_date);

        // 2. Get all historical maintenance records
        const { results: allLogs } = await db.prepare("SELECT * FROM maintenance_logs ORDER BY maintenance_date DESC, mileage DESC").all();

        const suggestions = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const debugInfo = {
            queryDate: today.toISOString().split('T')[0],
            timeBased: [],
            mileageBased: []
        };

        // 3. Iterate through all rules to generate maintenance suggestions
        for (const rule of maintenanceRules) {
            // Find all logs for the current item
            const itemLogs = allLogs.filter(log => log.item_name === rule.name);

            // --- Time-based check ---
            if (rule.type === 'time') {
                // Collate all relevant dates: purchase date + all maintenance dates for this item
                const relevantDates = [purchaseDate, ...itemLogs.map(log => parseDate(log.maintenance_date))];
                // Find the most recent date
                relevantDates.sort((a, b) => b.getTime() - a.getTime());
                const lastActionDate = relevantDates[0];

                // Calculate the due date based on the last action
                const dueDate = new Date(lastActionDate);
                if (rule.unit === 'year') {
                    dueDate.setFullYear(dueDate.getFullYear() + rule.value);
                } else if (rule.unit === 'month') {
                    dueDate.setMonth(dueDate.getMonth() + rule.value);
                }

                const timeDiff = dueDate.getTime() - today.getTime();
                const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                
                const lastActionText = lastActionDate.getTime() === purchaseDate.getTime() 
                    ? `购车日期 (${purchaseDate.toISOString().split('T')[0]})` 
                    : `上次保养 (${lastActionDate.toISOString().split('T')[0]})`;

                if (daysRemaining <= 0) {
                    suggestions.push(`${rule.name}: 已到期, 请立即保养. (基于: ${lastActionText})`);
                }
                
                // Always add to debug info
                debugInfo.timeBased.push(
                    `${rule.name}: 下次保养日期 ${dueDate.toISOString().split('T')[0]}. ` +
                    `基于 ${lastActionText}. ` +
                    `还剩 ${daysRemaining > 0 ? daysRemaining : 0} 天.`
                );
            }

            // --- Mileage-based check ---
            if (rule.type === 'mileage') {
                // Collate all relevant mileages: 0 (for purchase) + all maintenance mileages for this item
                const relevantMileages = [0, ...itemLogs.map(log => log.mileage)];
                // Find the highest mileage
                const lastActionMileage = Math.max(...relevantMileages);

                const dueMileage = lastActionMileage + rule.value;
                const mileageRemaining = dueMileage - current_mileage;

                const lastActionText = lastActionMileage === 0 
                    ? '购车 (0km)' 
                    : `上次保养 (${lastActionMileage}km)`;

                if (mileageRemaining <= 0) {
                    suggestions.push(`${rule.name}: 已到期, 请立即保养. (基于: ${lastActionText})`);
                }

                // Add to debug info, as per user request to have it for every item.
                debugInfo.mileageBased.push(
                    `${rule.name}: 下次保养里程 ${dueMileage}km. ` +
                    `基于 ${lastActionText}. ` +
                    `还差 ${mileageRemaining > 0 ? mileageRemaining : 0} km.`
                );
            }
        }

        return new Response(JSON.stringify({ suggestions, debugInfo }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        // Log the full error for debugging on the server side
        console.error("Query API Error:", error);
        return new Response(JSON.stringify({ error: "查询时发生内部错误: " + error.message }), { status: 500 });
    }
}