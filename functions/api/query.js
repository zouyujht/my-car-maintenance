// 保养规则定义
const maintenanceRules = [
    { name: '机油', time: { value: 6, unit: 'month' }, mileage: { value: 7500 } },
    { name: '空气滤芯', time: { value: 1, unit: 'year' }, mileage: { value: 10000 } },
    { name: '火花塞', time: { value: 3, unit: 'year' }, mileage: { value: 40000 } },
    { name: '冷却液', time: { value: 3, unit: 'year' }, mileage: { value: 40000 } },
    { name: '制动液', time: { value: 3, unit: 'year' }, mileage: { value: 40000 } },
    { name: '活性炭罐过滤器', time: { value: 3, unit: 'year' }, mileage: { value: 60000 } },
    { name: '传动皮带', time: { value: 3, unit: 'year' }, mileage: { value: 60000 } },
    { name: '节流阀', time: { value: 2, unit: 'year' }, mileage: { value: 20000 } },
    { name: '四轮对换', time: { value: 1, unit: 'year' }, mileage: { value: 10000 } },
    { name: '空调滤芯', time: { value: 1, unit: 'year' }, mileage: { value: 10000 } },
    { name: '变速箱油与滤芯', time: { value: 5, unit: 'year' }, mileage: { value: 60000 } },
    { name: '燃油滤清器', time: { value: 6, unit: 'year' }, mileage: { value: 60000 } },
    { name: '四轮定位', time: { value: 3, unit: 'year' }, mileage: { value: 30000 } },
    { name: '轮胎', time: { value: 8, unit: 'year' }, mileage: { value: 80000 } },
    { name: '分动器、后主减速器', time: { value: 6, unit: 'year' }, mileage: { value: 100000 } },
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
            const itemLogs = allLogs.filter(log => log.item_name === rule.name);

            let timeSuggestion = null;
            let mileageSuggestion = null;

            // --- Time-based check ---
            if (rule.time) {
                const relevantDates = [purchaseDate, ...itemLogs.map(log => parseDate(log.maintenance_date))];
                relevantDates.sort((a, b) => b.getTime() - a.getTime());
                const lastActionDate = relevantDates[0];

                const dueDate = new Date(lastActionDate);
                if (rule.time.unit === 'year') {
                    dueDate.setFullYear(dueDate.getFullYear() + rule.time.value);
                } else if (rule.time.unit === 'month') {
                    dueDate.setMonth(dueDate.getMonth() + rule.time.value);
                }

                const timeDiff = dueDate.getTime() - today.getTime();
                const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                
                const lastActionText = lastActionDate.getTime() === purchaseDate.getTime() 
                    ? `购车日期 (${purchaseDate.toISOString().split('T')[0]})` 
                    : `上次保养 (${lastActionDate.toISOString().split('T')[0]})`;

                if (daysRemaining <= 0) {
                    timeSuggestion = `${rule.name}: 已到期 (时间), 请立即保养. (基于: ${lastActionText})`;
                }
                
                debugInfo.timeBased.push(
                    `${rule.name}: 下次保养日期 ${dueDate.toISOString().split('T')[0]}. ` +
                    `基于 ${lastActionText}. ` +
                    `还剩 ${daysRemaining > 0 ? daysRemaining : 0} 天.`
                );
            }

            // --- Mileage-based check ---
            if (rule.mileage) {
                const relevantMileages = [0, ...itemLogs.map(log => log.mileage)];
                const lastActionMileage = Math.max(...relevantMileages);

                const dueMileage = lastActionMileage + rule.mileage.value;
                const mileageRemaining = dueMileage - current_mileage;

                const lastActionText = lastActionMileage === 0 
                    ? '购车 (0km)' 
                    : `上次保养 (${lastActionMileage}km)`;

                if (mileageRemaining <= 0) {
                    mileageSuggestion = `${rule.name}: 已到期 (里程), 请立即保养. (基于: ${lastActionText})`;
                }

                debugInfo.mileageBased.push(
                    `${rule.name}: 下次保养里程 ${dueMileage}km. ` +
                    `基于 ${lastActionText}. ` +
                    `还差 ${mileageRemaining > 0 ? mileageRemaining : 0} km.`
                );
            }

            // Add suggestion if either is due. Prioritize mileage if both are due.
            if (mileageSuggestion) {
                suggestions.push(mileageSuggestion);
            } else if (timeSuggestion) {
                suggestions.push(timeSuggestion);
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