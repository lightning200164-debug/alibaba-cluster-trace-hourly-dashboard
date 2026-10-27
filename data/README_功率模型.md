# 按实际 GPU 型号的功率估算

本目录把 Alibaba Cluster Trace GPU v2026 中的 `gpu_spec_public` 用于功率建模。结果是**型号特定的参考估算**，不是阿里数据中心电表实测值：原始数据提供 GPU 型号、`used_gpu_hours` 和 `avg_gpu_sm_util`，但没有 GPU 板卡功率、服务器 PDU 功率或设施电表。

## 数据覆盖

训练 GPU-hours 的主要型号为：

| 型号 | GPU-hours 占比 |
|---|---:|
| XPU-E | 56.31% |
| H20 | 27.73% |
| A100 | 6.09% |
| XPU-A | 2.68% |
| XPU-D | 2.40% |
| H800 | 2.27% |

前六种合计约 97.49%。因此 XPU-E 和 H20 的功率参数对总结果影响最大。

## 计算方法

利用率按数据集字段计算：

```text
u = avg_gpu_sm_util / gpu_request / 100
```

GPU 板卡功率采用按型号 TDP 缩放的训练曲线：

```text
P_gpu = TDP × [0.20 + 0.80 × g(u)]
```

其中 `g(u)` 在 `u=0、0.25、0.5、0.75、1` 处的值为 `0、0.5、0.75、0.9、1`。缺失利用率的记录取 `g=0.30`。这个曲线形式参考了公开的 GPU 利用率—功率建模配置，但 TDP 仍按本目录参数表逐型号设置。

服务器非 GPU 功率采用透明的工程近似：

```text
E_server_non_gpu = active_gpu_capacity_hours × (0.80 × TDP) / 1000
```

由于没有服务器电表，当前快速版本把训练 `used_gpu_hours` 作为 active capacity 的近似。IT 侧和数据中心侧分别为：

```text
E_IT = E_GPU + E_server_non_gpu
E_facility = PUE × E_IT
```

## 结果

在中位 TDP 情景、PUE=1.56 下，185 天训练负荷得到：

- 平均数据中心功率：约 **23.33 MW**；
- 最大小时功率：约 **30.68 MW**；
- 总设施侧用电量：约 **103.59 GWh**。

将型号 TDP 和 PUE 同时作为敏感性范围时：

| 情景 | 平均功率 | 峰值功率 | 总用电量 |
|---|---:|---:|---:|
| TDP 低端 + PUE 1.40 | 15.54 MW | 20.48 MW | 68.99 GWh |
| TDP 中位 + PUE 1.56 | 23.33 MW | 30.68 MW | 103.59 GWh |
| TDP 高端 + PUE 1.56 | 33.92 MW | 45.92 MW | 150.61 GWh |

这三个值是参数敏感性边界，不是置信区间。

## 重要限制

1. A100、A800、H800 在数据中没有区分 PCIe/SXM，功率表保留了变体范围。
2. XPU-A～XPU-E 是脱敏型号，没有公开 TDP；本目录采用 250–700 W 的敏感性区间，中心值 400 W 仅是计算占位值。
3. H20-141GB 的具体功率也没有公开稳定资料，单独标记为低置信度。
4. TDP 是板卡设计功率或功率上限，不等于每小时实际功率；服务器非 GPU 功率和 PUE 也都是模型参数。

## 文件

- `model_specific_power_parameters.csv`：逐型号 TDP、范围、来源和置信度；
- `model_specific_power_summary_by_gpu.csv`：逐型号 GPU-hours 和利用率覆盖；
- `model_specific_data_center_summary_by_gpu.csv`：逐型号 GPU、服务器非 GPU、IT 和设施侧汇总；
- `model_specific_power_hourly_by_gpu.csv`：逐日、逐小时、逐型号的 GPU 功率估算；
- `model_specific_data_center_power_hourly.csv`：185 天 × 24 小时的总功率；
- `model_specific_data_center_power_daily.csv`：每日平均功率和每日用电量；
- `calculate_model_specific_power.py`：可重跑脚本。

原始字段定义见 Alibaba [schema.md](https://github.com/alibaba/clusterdata/blob/master/cluster-trace-gpu-v2026/docs/schema.md)。参数来源包括 NVIDIA A10、A30、A100 官方资料，A800/H800 OEM 规格，以及 H20 的公开规格报告；所有来源和置信度已写入 `model_specific_power_parameters.csv`。
