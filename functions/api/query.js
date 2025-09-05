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

export async function onRequestPost(context) {
    try {
        const { current_mileage } = await context.request.json();
        const db = context.env.DB;

        // 1. 获取购车日期
        const carInfo = await db.prepare("SELECT purchase_date FROM car_info LIMIT 1").first();
        if (!carInfo) {
            return new Response(JSON.stringify({ error: "请先在“保养日志”页面填入并提交一次购车日期。" }), { status: 400 });
        }
        const purchaseDate = new Date(carInfo.purchase_date);

        // 2. 获取所有历史保养记录
        const { results: logs } = await db.prepare("SELECT * FROM maintenance_logs ORDER BY maintenance_date DESC").all();

        const suggestions = [];
        const today = new Date();
        const debugInfo = {
            queryDate: today.toISOString().split('T')[0],
            timeBased: [],
            mileageBased: []
        };

        // 3. 遍历所有规则，生成保养建议
        for (const rule of maintenanceRules) {
            const lastLog = logs.find(log => log.item_name === rule.name);

            if (rule.type === 'time') {
                // 统一逻辑：无论有无保养记录，都计算下一个保养日期
                const baseDate = lastLog ? new Date(lastLog.maintenance_date) : purchaseDate;
                const lastMaintenanceText = lastLog ? lastLog.maintenance_date : '购车日期';
                
                let nextMaintenanceDate = new Date(baseDate);

                // 计算下一次保养日期
                if (rule.unit === 'year') {
                    nextMaintenanceDate.setFullYear(nextMaintenanceDate.getFullYear() + rule.value);
                } else if (rule.unit === 'month') {
                    nextMaintenanceDate.setMonth(nextMaintenanceDate.getMonth() + rule.value);
                }
                
                const diffTime = nextMaintenanceDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 0) {
                    suggestions.push(`${rule.name} (上次保养: ${lastMaintenanceText}, 已到期)`);
                }
                
                debugInfo.timeBased.push(`${rule.name}: 下次保养日期 ${nextMaintenanceDate.toISOString().split('T')[0]}, 还剩 ${diffDays > 0 ? diffDays : 0} 天`);

            } else if (rule.type === 'mileage') {
                // 如果有保养记录，从最后一次保养里程开始计算；否则从0开始
                const baseMileage = lastLog ? lastLog.mileage : 0;
                const nextMaintenanceMileage = baseMileage + rule.value;
                const diffMileage = nextMaintenanceMileage - current_mileage;

                // 如果当前里程超过了下次保养里程，则添加建议
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