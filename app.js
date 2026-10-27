(() => {
  "use strict";

  const data = window.dashboardData;
  const $ = (id) => document.getElementById(id);
  const state = { level: "daily", layer: "facility", metric: "power", period: 0 };
  const layerNames = {
    gpu: "GPU 侧",
    server_non_gpu: "服务器非 GPU",
    it: "IT 侧",
    facility: "数据中心侧",
  };
  const series = [
    ["gpu", "GPU 侧", "#64748b"],
    ["server_non_gpu", "服务器非 GPU", "#16a34a"],
    ["it", "IT 侧", "#7c3aed"],
    ["facility", "数据中心侧", "#155eef"],
  ];

  const number = (value, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  };
  const sum = (rows, key) => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
  const mean = (rows, key) => rows.length ? sum(rows, key) / rows.length : 0;
  const sortedByHour = (rows) => rows.slice().sort((a, b) => Number(a.hour) - Number(b.hour));

  function metricConfig() {
    if (state.metric === "energy") {
      return { suffix: "energy_kwh", scale: 0.001, unit: "MWh", label: "用电量", hoverUnit: "MWh" };
    }
    return { suffix: "power_mw", scale: 1, unit: "MW", label: "功率", hoverUnit: "MW" };
  }

  function sourceRows() {
    if (state.level === "daily") return data.daily.filter((row) => Number(row.day) === Number(state.period));
    if (state.level === "weekly") return data.weekly.filter((row) => Number(row.week) === Number(state.period));
    return data.full_period;
  }

  function populatePeriod() {
    const select = $("period");
    const old = String(state.period);
    select.innerHTML = "";
    if (state.level === "daily") {
      const days = [...new Set(data.daily.map((row) => Number(row.day)))].sort((a, b) => a - b);
      days.forEach((day) => {
        const option = document.createElement("option");
        option.value = day;
        option.textContent = `第 ${day} 天（relative trace day）`;
        select.appendChild(option);
      });
      $("periodLabel").firstChild.textContent = "选择日期";
      state.period = days.includes(Number(old)) ? Number(old) : days[0];
    } else if (state.level === "weekly") {
      const weeks = [...new Map(data.weekly.map((row) => [Number(row.week), row])).values()].sort((a, b) => a.week - b.week);
      weeks.forEach((week) => {
        const option = document.createElement("option");
        option.value = week.week;
        option.textContent = week.week_label;
        select.appendChild(option);
      });
      $("periodLabel").firstChild.textContent = "选择周次";
      state.period = weeks.some((row) => Number(row.week) === Number(old)) ? Number(old) : Number(weeks[0].week);
    } else {
      const option = document.createElement("option");
      option.value = "full";
      option.textContent = `${data.meta.trace_days} 天全周期 24 时段`;
      select.appendChild(option);
      $("periodLabel").firstChild.textContent = "统计范围";
      state.period = "full";
    }
    select.value = String(state.period);
  }

  function currentPeriodTitle() {
    if (state.level === "daily") return `第 ${state.period} 天`;
    if (state.level === "weekly") {
      const row = data.weekly.find((item) => Number(item.week) === Number(state.period));
      return row ? row.week_label : `第 ${state.period} 周`;
    }
    return `${data.meta.trace_days} 天全周期`;
  }

  function updateCards(rows) {
    const powerKey = `${state.layer}_power_mw`;
    const energyKey = `${state.layer}_energy_kwh`;
    const energy = sum(rows, energyKey);
    $("totalEnergy").textContent = `${number(energy / 1000000, 3)} GWh`;
    $("totalEnergyHint").textContent = `${layerNames[state.layer]} · 中位 TDP`;
    $("averagePower").textContent = `${number(mean(rows, powerKey), 3)} MW`;
    $("averagePowerHint").textContent = `${layerNames[state.layer]} · 当前范围平均`;
    $("peakPower").textContent = `${number(Math.max(...rows.map((row) => Number(row[powerKey] || 0))), 3)} MW`;
    $("slotCount").textContent = `${rows.length}`;
    $("scopeHint").textContent = state.level === "full" ? "24 个时段" : "当前明细行数";
    $("totalEnergyLabel").textContent = "当前范围总用电量";
    $("averagePowerLabel").textContent = "当前范围平均功率";
  }

  function renderFallbackLineChart(containerId, chartSeries, xValues, yLabel, xLabel) {
    const width = 900;
    const height = 390;
    const pad = { left: 72, right: 24, top: 28, bottom: 55 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const allY = chartSeries.flatMap((item) => item.y).map(Number);
    const maxY = Math.max(...allY, 1) * 1.08;
    const minX = Math.min(...xValues, 0);
    const maxX = Math.max(...xValues, 1);
    const xScale = (x) => pad.left + ((Number(x) - minX) / Math.max(maxX - minX, 1)) * plotWidth;
    const yScale = (y) => pad.top + plotHeight - (Number(y) / maxY) * plotHeight;
    const ticks = [0, maxY / 2, maxY];
    const grid = ticks.map((tick) => {
      const y = yScale(tick);
      return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#e7edf5"/><text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="12">${number(tick, 1)}</text>`;
    }).join("");
    const paths = chartSeries.map((item) => {
      const points = item.y.map((value, index) => `${xScale(xValues[index])},${yScale(value)}`).join(" ");
      const dots = item.y.map((value, index) => `<circle cx="${xScale(xValues[index])}" cy="${yScale(value)}" r="3" fill="${item.color}"/>`).join("");
      return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="${item.width || 2}"/>${dots}`;
    }).join("");
    const legend = chartSeries.map((item, index) => `<g transform="translate(${pad.left + index * 155},14)"><line x1="0" y1="0" x2="24" y2="0" stroke="${item.color}" stroke-width="3"/><text x="31" y="4" fill="#334155" font-size="12">${item.label}</text></g>`).join("");
    const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${yLabel}曲线"><rect width="100%" height="100%" fill="#fff"/>${grid}<line x1="${pad.left}" y1="${pad.top + plotHeight}" x2="${width - pad.right}" y2="${pad.top + plotHeight}" stroke="#9aa8ba"/>${paths}${legend}<text x="${width / 2}" y="${height - 10}" text-anchor="middle" fill="#64748b" font-size="12">${xLabel}</text><text transform="translate(16 ${height / 2}) rotate(-90)" text-anchor="middle" fill="#64748b" font-size="12">${yLabel}</text></svg>`;
    $(containerId).innerHTML = `<div class="plot-fallback-note">交互图表库未加载，已使用静态兼容图；选择器和数据表仍可正常使用。</div>${svg}`;
  }

  function renderPlotOrFallback(containerId, traces, layout, options, fallback) {
    fallback();
    if (typeof Plotly === "undefined" || typeof Plotly.react !== "function") return;
    try {
      $(containerId).innerHTML = "";
      const pending = Plotly.react(containerId, traces, layout, options);
      if (pending && typeof pending.catch === "function") pending.catch((error) => { console.error(error); fallback(); });
      window.setTimeout(() => {
        if (!$(containerId).querySelector(".plotly-graph-div")) fallback();
      }, 3000);
    } catch (error) {
      console.error(error);
      fallback();
    }
  }

  function renderProfile(rows) {
    const config = metricConfig();
    const ordered = sortedByHour(rows);
    const x = ordered.map((row) => Number(row.hour));
    const traces = series.map(([prefix, label, color]) => ({
      x,
      y: ordered.map((row) => Number(row[`${prefix}_${config.suffix}`] || 0) * config.scale),
      type: "scatter",
      mode: "lines+markers",
      name: label,
      line: { color, width: prefix === "facility" ? 3 : 1.8 },
      marker: { size: 6 },
      hovertemplate: `${label}<br>时段 %{x}:00–%{customdata}<br>%{y:,.2f} ${config.hoverUnit}<extra></extra>`,
      customdata: ordered.map((row) => `${String((Number(row.hour) + 1) % 24).padStart(2, "0")}:00`),
    }));
    const title = `${currentPeriodTitle()} · 24 时段${config.label}`;
    $("profileTitle").textContent = title;
    $("profileUnit").textContent = config.unit;
    const fallbackSeries = series.map(([prefix, label, color]) => ({
      label,
      color,
      width: prefix === "facility" ? 3 : 2,
      y: ordered.map((row) => Number(row[`${prefix}_${config.suffix}`] || 0) * config.scale),
    }));
    renderPlotOrFallback("profileChart", traces, {
      margin: { l: 62, r: 20, t: 18, b: 55 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#ffffff",
      hovermode: "x unified",
      legend: { orientation: "h", y: 1.12, x: 0 },
      xaxis: { title: "时间段起始小时（0 = 00:00–01:00）", dtick: 4, range: [0, 23], gridcolor: "#edf1f6" },
      yaxis: { title: config.unit, rangemode: "tozero", gridcolor: "#edf1f6" },
      font: { family: "Segoe UI, Microsoft YaHei, sans-serif", color: "#334155" },
    }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] }, () => renderFallbackLineChart("profileChart", fallbackSeries, x, config.unit, "时间段起始小时"));
  }

  function trendRows() {
    if (state.level === "daily") return data.daily_summary;
    if (state.level === "weekly") return data.weekly_summary;
    return data.full_period;
  }

  function renderTrend() {
    const config = metricConfig();
    const rows = trendRows();
    let x;
    let values;
    let xLabel;
    if (state.level === "daily") {
      x = rows.map((row) => Number(row.day));
      values = rows.map((row) => Number(row[`${state.layer}_${state.metric === "power" ? "power_mean_mw" : "energy_kwh"}`] || 0) * config.scale);
      xLabel = "relative trace day";
      $("trendTitle").textContent = state.metric === "energy" ? `每日${layerNames[state.layer]}用电量趋势` : `每日${layerNames[state.layer]}平均功率趋势`;
    } else if (state.level === "weekly") {
      x = rows.map((row) => Number(row.week));
      values = rows.map((row) => Number(row[`${state.layer}_${state.metric === "power" ? "power_mean_mw" : "energy_kwh"}`] || 0) * config.scale);
      xLabel = "周次";
      $("trendTitle").textContent = state.metric === "energy" ? `每周${layerNames[state.layer]}用电量趋势` : `每周${layerNames[state.layer]}平均功率趋势`;
    } else {
      x = rows.map((row) => Number(row.hour));
      values = rows.map((row) => Number(row[`${state.layer}_${state.metric === "power" ? "power_mw" : "energy_kwh"}`] || 0) * config.scale);
      xLabel = "时间段起始小时";
      $("trendTitle").textContent = `全周期${layerNames[state.layer]}${config.label}趋势`;
    }
    const line = [{ x, y: values, type: "scatter", mode: "lines+markers", line: { color: "#155eef", width: 2 }, marker: { size: 5 }, fill: "tozeroy", fillcolor: "rgba(21,94,239,.10)", hovertemplate: `%{x}<br>%{y:,.2f} ${config.hoverUnit}<extra></extra>` }];
    const fallback = () => renderFallbackLineChart("trendChart", [{ label: layerNames[state.layer], color: "#155eef", width: 3, y: values }], x, config.unit, xLabel);
    renderPlotOrFallback("trendChart", line, {
      margin: { l: 62, r: 18, t: 18, b: 50 },
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "#fff",
      xaxis: { title: xLabel, gridcolor: "#edf1f6" },
      yaxis: { title: config.unit, rangemode: "tozero", gridcolor: "#edf1f6" },
      font: { family: "Segoe UI, Microsoft YaHei, sans-serif", color: "#334155" },
    }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] }, fallback);
  }

  function renderTable(rows) {
    const ordered = sortedByHour(rows);
    const config = metricConfig();
    const unit = config.unit;
    const head = $("detailTable").querySelector("thead");
    const body = $("detailTable").querySelector("tbody");
    head.innerHTML = `<tr><th>时段</th><th>GPU 侧</th><th>服务器非 GPU</th><th>IT 侧</th><th>数据中心侧</th><th>单位</th></tr>`;
    body.innerHTML = ordered.map((row) => `<tr><td>${row.slot_label}</td>${series.map(([prefix]) => `<td${prefix === state.layer ? " class=\"selected-cell\"" : ""}><strong>${number(Number(row[`${prefix}_${config.suffix}`] || 0) * config.scale, 2)}</strong></td>`).join("")}<td>${unit}</td></tr>`).join("");
    $("tableHint").textContent = state.level === "weekly" ? "周表中的功率是该周同一时段的日均功率，用电量是该周同一时段的累计值。" : "功率和用电量对应同一个小时区间；数据中心侧已经包含 PUE=1.56。";
  }

  function setupDownloads() {
    const files = [
      ["每日 24 时段统计", "data/daily_slot_stats_mid_tdp.csv", "185 天 × 24 时段，含 GPU、IT 和数据中心侧"],
      ["每日汇总", "data/daily_summary_mid_tdp.csv", "185 天的平均功率和总用电量"],
      ["每周 24 时段统计", "data/weekly_slot_stats_mid_tdp.csv", "27 周 × 24 时段"],
      ["GPU 型号小时级功率结果", "data/model_specific_data_center_power_hourly.csv", "4,440 个小时记录"],
      ["GPU 型号日级功率结果", "data/model_specific_data_center_power_daily.csv", "185 天日级结果"],
      ["GPU TDP 参数与来源", "data/model_specific_power_parameters.csv", "含公开来源 URL 和低中高参数"],
      ["数据说明", "data/README_数据说明.md", "网页数据字段与单位说明"],
    ];
    $("datasetList").innerHTML = files.map(([title, href, desc]) => `<article class="data-item"><h3>${title}</h3><p>${desc}</p><a href="${href}" download>下载文件</a></article>`).join("");
  }

  function update() {
    const rows = sourceRows();
    if (!rows.length) return;
    updateCards(rows);
    renderProfile(rows);
    renderTrend();
    renderTable(rows);
    $("statusText").textContent = `已加载 ${data.meta.trace_days} 天 · ${data.meta.trace_weeks} 周 · 中位 TDP`;
  }

  function setup() {
    ["viewLevel", "layer", "metric", "period"].forEach((id) => {
      $(id).addEventListener("change", (event) => {
        if (id === "viewLevel") { state.level = event.target.value; populatePeriod(); }
        else if (id === "layer") state.layer = event.target.value;
        else if (id === "metric") state.metric = event.target.value;
        else state.period = event.target.value === "full" ? "full" : Number(event.target.value);
        update();
      });
    });
    document.querySelectorAll(".nav-btn").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".page-section").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.section).classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
    setupDownloads();
    populatePeriod();
    update();
  }

  if (!data) {
    $("statusText").textContent = "数据文件未加载，请确认 data.js 已上传";
  } else {
    setup();
  }
})();
