"""将每日、每周中位 TDP CSV 打包为静态网站数据。"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]
STATS = PROJECT / "codex" / "每日每周时段统计_2026-10-26"
POWER = PROJECT / "codex" / "按GPU型号功率估算_2026-10-26"


def json_records(frame: pd.DataFrame) -> list[dict]:
    """通过 pandas JSON 转换，避免 numpy 标量无法序列化。"""
    return json.loads(frame.to_json(orient="records", force_ascii=False))


def main() -> None:
    daily_path = STATS / "daily_slot_stats_mid_tdp.csv"
    daily_summary_path = STATS / "daily_summary_mid_tdp.csv"
    weekly_path = STATS / "weekly_slot_stats_mid_tdp.csv"
    for path in [daily_path, daily_summary_path, weekly_path]:
        if not path.exists():
            raise FileNotFoundError(path)

    daily = pd.read_csv(daily_path, encoding="utf-8-sig")
    daily = daily.rename(columns={
        "gpu_power_mid_mw": "gpu_power_mw",
        "it_power_mid_mw": "it_power_mw",
        "facility_power_mid_mw": "facility_power_mw",
    })
    daily["server_non_gpu_power_mw"] = daily["it_power_mw"] - daily["gpu_power_mw"]
    daily["server_non_gpu_energy_kwh"] = daily["it_energy_mid_kwh"] - daily["gpu_energy_mid_kwh"]
    daily = daily.rename(columns={
        "gpu_energy_mid_kwh": "gpu_energy_kwh",
        "it_energy_mid_kwh": "it_energy_kwh",
    })
    daily = daily[[
        "day", "week_index", "hour", "slot_label", "used_gpu_hours",
        "gpu_power_mw", "server_non_gpu_power_mw", "it_power_mw", "facility_power_mw",
        "gpu_energy_kwh", "server_non_gpu_energy_kwh", "it_energy_kwh", "facility_energy_mid_kwh",
    ]].rename(columns={"facility_energy_mid_kwh": "facility_energy_kwh"})

    weekly = pd.read_csv(weekly_path, encoding="utf-8-sig")
    weekly = weekly.rename(columns={
        "gpu_power_mean_mw": "gpu_power_mw",
        "it_power_mean_mw": "it_power_mw",
        "facility_power_mean_mw": "facility_power_mw",
        "week_index": "week",
    })
    weekly["server_non_gpu_power_mw"] = weekly["it_power_mw"] - weekly["gpu_power_mw"]
    weekly["server_non_gpu_energy_kwh"] = weekly["it_energy_kwh"] - weekly["gpu_energy_kwh"]
    weekly["week_label"] = weekly.apply(
        lambda row: f"第 {int(row['week'])} 周（trace day {int(row['week_start_day'])}–{int(row['week_end_day'])}）", axis=1
    )
    weekly = weekly[[
        "week", "week_start_day", "week_end_day", "week_label", "hour", "slot_label", "day_count",
        "used_gpu_hours", "gpu_power_mw", "server_non_gpu_power_mw", "it_power_mw", "facility_power_mw",
        "gpu_energy_kwh", "server_non_gpu_energy_kwh", "it_energy_kwh", "facility_energy_kwh",
    ]]

    daily_summary = pd.read_csv(daily_summary_path, encoding="utf-8-sig")
    daily_summary = daily_summary.rename(columns={"week_index": "week"})
    daily_summary["server_non_gpu_power_mean_mw"] = daily_summary["it_power_mean_mw"] - daily_summary["gpu_power_mean_mw"]
    daily_summary["server_non_gpu_energy_kwh"] = daily_summary["it_energy_kwh"] - daily_summary["gpu_energy_kwh"]

    weekly_summary = (
        weekly.groupby("week", as_index=False)
        .agg(
            week_start_day=("week_start_day", "min"),
            week_end_day=("week_end_day", "max"),
            observed_days=("day_count", "max"),
            gpu_power_mean_mw=("gpu_power_mw", "mean"),
            server_non_gpu_power_mean_mw=("server_non_gpu_power_mw", "mean"),
            it_power_mean_mw=("it_power_mw", "mean"),
            facility_power_mean_mw=("facility_power_mw", "mean"),
            gpu_energy_kwh=("gpu_energy_kwh", "sum"),
            server_non_gpu_energy_kwh=("server_non_gpu_energy_kwh", "sum"),
            it_energy_kwh=("it_energy_kwh", "sum"),
            facility_energy_kwh=("facility_energy_kwh", "sum"),
        )
        .sort_values("week")
    )

    full = (
        daily.groupby(["hour", "slot_label"], as_index=False)
        .agg(
            observed_days=("day", "nunique"),
            gpu_power_mw=("gpu_power_mw", "mean"),
            server_non_gpu_power_mw=("server_non_gpu_power_mw", "mean"),
            it_power_mw=("it_power_mw", "mean"),
            facility_power_mw=("facility_power_mw", "mean"),
            gpu_energy_kwh=("gpu_energy_kwh", "sum"),
            server_non_gpu_energy_kwh=("server_non_gpu_energy_kwh", "sum"),
            it_energy_kwh=("it_energy_kwh", "sum"),
            facility_energy_kwh=("facility_energy_kwh", "sum"),
        )
        .sort_values("hour")
    )

    payload = {
        "daily": json_records(daily),
        "weekly": json_records(weekly),
        "full_period": json_records(full),
        "daily_summary": json_records(daily_summary),
        "weekly_summary": json_records(weekly_summary),
        "meta": {
            "trace_days": int(daily["day"].nunique()),
            "trace_weeks": int(weekly["week"].nunique()),
            "hour_rows": int(len(daily)),
            "pue": 1.56,
            "tdp_scenario": "mid",
            "facility_energy_gwh": float(daily_summary["facility_energy_kwh"].sum() / 1_000_000),
            "average_facility_power_mw": float(daily_summary["facility_power_mean_mw"].mean()),
        },
    }
    js = "window.dashboardData = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data.js").write_text(js, encoding="utf-8")

    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    files = {
        daily_path: "daily_slot_stats_mid_tdp.csv",
        daily_summary_path: "daily_summary_mid_tdp.csv",
        weekly_path: "weekly_slot_stats_mid_tdp.csv",
        POWER / "model_specific_data_center_power_hourly.csv": "model_specific_data_center_power_hourly.csv",
        POWER / "model_specific_data_center_power_daily.csv": "model_specific_data_center_power_daily.csv",
        POWER / "model_specific_power_parameters.csv": "model_specific_power_parameters.csv",
        STATS / "README.md": "README_每日每周时段统计.md",
        POWER / "README.md": "README_功率模型.md",
    }
    for source, filename in files.items():
        if not source.exists():
            raise FileNotFoundError(source)
        shutil.copy2(source, data_dir / filename)
    (data_dir / "README_数据说明.md").write_text(
        "网页固定采用中位 TDP 和 PUE=1.56。daily_slot_stats_mid_tdp.csv 是 185 天×24 时段明细；weekly_slot_stats_mid_tdp.csv 是 27 周×24 时段统计；功率单位为 MW，用电量单位为 kWh。\n",
        encoding="utf-8",
    )
    print(f"已生成 {ROOT / 'data.js'}，数据记录：daily={len(daily):,}, weekly={len(weekly):,}, full={len(full):,}")


if __name__ == "__main__":
    main()
