# 每日、每周 24 时段功率与用电量统计

本目录根据阿里 Cluster Trace GPU v2026 的小时级结果，采用**中位 TDP**和 **PUE=1.56**生成统计表和图片。

## 输出内容

- `daily_slot_stats_mid_tdp.csv`：185 天 × 24 个时段的明细；功率单位为 MW，用电量单位为 kWh。
- `daily_summary_mid_tdp.csv`：每天的平均功率和总用电量。
- `weekly_slot_stats_mid_tdp.csv`：27 周 × 24 个时段；功率是该周同一时段的日均功率，用电量是该周同一时段的累计用电量。
- `daily_plots/`：每天一张图，共 185 张；每张图上方为功率，下方为用电量。
- `weekly_plots/`：每周一张图，共 27 张；每张图上方为平均功率，下方为累计用电量。

每张图同时显示 GPU 侧、IT 侧和数据中心侧。数据中心侧为 IT 侧乘以 PUE=1.56。
周分组规则为连续 7 个 relative trace day：第 1 周为 day 0–6，最后一周可以少于 7 天。
