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

        // 1. 获取购车日期
        const carInfo = await db.prepare("SELECT purchase_date FROM car_info LIMIT 1").first();
        if (!carInfo) {
            return new Response(JSON.stringify({ error: "请先在“保养日志”页面填入并提交一次购车日期。" }), { status: 400 });
        }
        const purchaseDate = parseDate(carInfo.purchase_date);

        // 2. 获取所有历史保养记录
        const { results: logs } = await db.prepare("SELECT * FROM maintenance_logs ORDER BY maintenance_date DESC").all();

        const suggestions = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to midnight for date-only comparison

        const debugInfo = {
            queryDate: today.toISOString().split('T')[0],
            timeBased: [],
            mileageBased: []
        };

        // 3. 遍历所有规则，生成保养建议
        for (const rule of maintenanceRules) {
            const lastLog = logs.find(log => log.item_name === rule.name);

            if (rule.type === 'time') {
                const baseDate = lastLog ? parseDate(lastLog.maintenance_date) : purchaseDate;
                const lastMaintenanceText = lastLog ? (lastLog.maintenance_date || '').split('T')[0] : '购车日期';
                
                let nextMaintenanceDate;
                let isOverdue = false;

                // Calculate the first theoretical due date from the base date
                let firstDueDate = new Date(baseDate.getTime());
                if (rule.unit === 'year') {
                    firstDueDate.setFullYear(firstDueDate.getFullYear() + rule.value);
                } else if (rule.unit === 'month') {
                    firstDueDate.setMonth(firstDueDate.getMonth() + rule.value);
                }

                // If the first due date is in the future, that's our next maintenance date.
                if (firstDueDate > today) {
                    nextMaintenanceDate = firstDueDate;
                } else {
                    isOverdue = true;
                    // Otherwise, the item is overdue or due today.
                    // Add a suggestion to the list.
                    suggestions.push(`${rule.name} (上次保养: ${lastMaintenanceText}, 已到期)`);
                    
                    // And now we find the *next* due date that is actually in the future.
                    let futureDate = new Date(baseDate.getTime());
                    while (futureDate <= today) {
                        if (rule.unit === 'year') {
                            futureDate.setFullYear(futureDate.getFullYear() + rule.value);
                        } else if (rule.unit === 'month') {
                            futureDate.setMonth(futureDate.getMonth() + rule.value);
                        }
                    }
                    nextMaintenanceDate = futureDate;
                }

                const diffTime = nextMaintenanceDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                debugInfo.timeBased.push(`${rule.name}: 下次保养日期 ${nextMaintenanceDate.toISOString().split('T')[0]}, 还剩 ${isOverdue ? 0 : (diffDays > 0 ? diffDays : 0)} 天`);

            } else if (rule.type === 'mileage') {
                const baseMileage = lastLog ? lastLog.mileage : 0;
                const nextMaintenanceMileage = baseMileage + rule.value;
                const diffMileage = nextMaintenanceMileage - current_mileage;

                if (diffMileage <= 0) {
                    suggestions.push(`${rule.name} (上次保养里程: ${baseMileage}km, 已到期)`);
                }
                debugInfo.mileageBased.push(`${rule.name}: 下次保养里程 ${nextMaintenanceMileage}km, 还差 ${diffMileage > 0 ? diffMileage : 0} km`);
            }
        }

        return new Response(JSON.stringify({ suggestions, debugInfo }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}