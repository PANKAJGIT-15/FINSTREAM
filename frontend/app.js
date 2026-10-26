let ws;
const prices = [];
const maxDataPoints = 48;
const recordedAnomalies = [];
let anomalyCount = 0;

let dayHigh = 65000;
let dayLow = 65000;

const chartCanvas = document.getElementById('marketChart');
const chartCtx = chartCanvas.getContext('2d');

const graphCanvas = document.getElementById('graphCanvas');
const graphCtx = graphCanvas.getContext('2d');

let washAlertActive = false;

// Scaled nodes with glowing pulses
const nodes = [
  { id: "W1", label: "0x71A...3bF", x: 120, y: 90, volume: "148.2 BTC", risk: "CRITICAL (Loop Origin)" },
  { id: "W2", label: "0x98E...11A", x: 480, y: 90, volume: "112.5 BTC", risk: "HIGH (Relay Buffer)" },
  { id: "W3", label: "0x44C...89D", x: 480, y: 260, volume: "135.0 BTC", risk: "CRITICAL (Exit Colluder)" },
  { id: "W4", label: "0x12F...99E", x: 120, y: 260, volume: "121.8 BTC", risk: "HIGH (Re-injector)" }
];

function resizeCanvases() {
  if (chartCanvas.parentElement) {
    chartCanvas.width = chartCanvas.parentElement.clientWidth;
    chartCanvas.height = chartCanvas.parentElement.clientHeight;
  }
  if (graphCanvas.parentElement) {
    graphCanvas.width = graphCanvas.parentElement.clientWidth;
    graphCanvas.height = graphCanvas.parentElement.clientHeight;
  }
}
window.addEventListener("resize", resizeCanvases);

function initWebSocket() {
  ws = new WebSocket("ws://127.0.0.1:8000/ws/market");

  ws.onopen = () => {
    document.getElementById("stat-latency").innerText = "1.4ms";
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.event === "MARKET_DATA") {
      handleMarketData(msg);
    } else if (msg.event === "ANOMALY") {
      anomalyCount++;
      document.getElementById("metric-anomalies").innerText = anomalyCount;
      const record = { type: "FLASH CRASH", detail: `Drop: -${msg.data.drop_percent}% | Z: ${msg.data.z_score}σ`, time: new Date().toLocaleTimeString() };
      recordedAnomalies.unshift(record);
      logAnomaly(`FLASH CRASH: -${msg.data.drop_percent}% (Z-Score: ${msg.data.z_score}σ)`, "CRITICAL");
    } else if (msg.event === "WHALE") {
      anomalyCount++;
      document.getElementById("metric-anomalies").innerText = anomalyCount;
      const record = { type: "WHALE INFLOW", detail: `${msg.data.volume} BTC ($${msg.data.notional_usd.toLocaleString()})`, time: new Date().toLocaleTimeString() };
      recordedAnomalies.unshift(record);
      logAnomaly(`WHALE SURGE: ${msg.data.volume} BTC ($${msg.data.notional_usd.toLocaleString()})`, "WHALE");
    } else if (msg.event === "WASH_TRADE") {
      anomalyCount++;
      document.getElementById("metric-anomalies").innerText = anomalyCount;
      washAlertActive = true;
      setTimeout(() => { washAlertActive = false; }, 4500);
      const record = { type: "WASH COLLUSION", detail: `4-Address Cyclic Loop | Vol: ${msg.data.volume} BTC`, time: new Date().toLocaleTimeString() };
      recordedAnomalies.unshift(record);
      logAnomaly(`CIRCULAR COLLUSION: 4-Wallet Loop (${msg.data.volume} BTC)`, "WASH");
    }
  };

  ws.onclose = () => {
    document.getElementById("stat-latency").innerText = "OFFLINE";
    setTimeout(initWebSocket, 2000);
  };
}

function handleMarketData(data) {
  const tick = data.tick;
  const price = tick.price;
  document.getElementById("current-price").innerText = `$${price.toFixed(2)}`;
  
  if (price > dayHigh) { dayHigh = price; document.getElementById("metric-high").innerText = `$${dayHigh.toFixed(2)}`; }
  if (price < dayLow || dayLow === 65000) { dayLow = price; document.getElementById("metric-low").innerText = `$${dayLow.toFixed(2)}`; }

  const zBadge = document.getElementById("z-score");
  zBadge.innerText = `Z-SCORE: ${data.z_score}σ`;
  if (Math.abs(data.z_score) > 2.5) {
    zBadge.style.background = "rgba(239, 68, 68, 0.15)";
    zBadge.style.borderColor = "#ef4444";
    zBadge.style.color = "#ef4444";
    document.getElementById("metric-vola").innerText = `${data.z_score}σ (High Volatility)`;
    document.getElementById("metric-vola").className = "m-val red";
  } else {
    zBadge.style.background = "rgba(0, 242, 254, 0.1)";
    zBadge.style.borderColor = "rgba(0, 242, 254, 0.3)";
    zBadge.style.color = "#00f2fe";
    document.getElementById("metric-vola").innerText = "0.78% (Normal)";
    document.getElementById("metric-vola").className = "m-val cyan";
  }

  prices.push(price);
  if (prices.length > maxDataPoints) prices.shift();
  drawChart();

  updateOrderbook(data.orderbook);
}

function updateOrderbook(ob) {
  const asksDiv = document.getElementById("asks-list");
  const bidsDiv = document.getElementById("bids-list");

  const maxSize = Math.max(
    ...ob.asks.map(a => a.size),
    ...ob.bids.map(b => b.size),
    3.0
  );

  asksDiv.innerHTML = ob.asks.slice().reverse().map(a => {
    const widthPct = Math.min((a.size / maxSize) * 100, 100);
    return `
      <div class="ob-row">
        <div class="ob-depth-bar" style="width: ${widthPct}%;"></div>
        <span>${a.price.toFixed(2)}</span>
        <span>${a.size.toFixed(3)}</span>
      </div>
    `;
  }).join("");

  bidsDiv.innerHTML = ob.bids.map(b => {
    const widthPct = Math.min((b.size / maxSize) * 100, 100);
    return `
      <div class="ob-row">
        <div class="ob-depth-bar" style="width: ${widthPct}%;"></div>
        <span>${b.price.toFixed(2)}</span>
        <span>${b.size.toFixed(3)}</span>
      </div>
    `;
  }).join("");
}

function drawChart() {
  const w = chartCanvas.width;
  const h = chartCanvas.height;
  chartCtx.clearRect(0, 0, w, h);

  if (prices.length < 2) return;

  const min = Math.min(...prices) * 0.9995;
  const max = Math.max(...prices) * 1.0005;

  // Grid
  chartCtx.strokeStyle = "#131a26";
  chartCtx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) {
    const y = (h / 6) * i;
    chartCtx.beginPath();
    chartCtx.moveTo(0, y);
    chartCtx.lineTo(w, y);
    chartCtx.stroke();
  }

  const step = w / (maxDataPoints - 1);

  // Gradient area fill under price line
  const grad = chartCtx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(0, 242, 254, 0.22)");
  grad.addColorStop(1, "rgba(0, 242, 254, 0.0)");

  chartCtx.beginPath();
  prices.forEach((p, idx) => {
    const x = idx * step;
    const y = h - ((p - min) / (max - min)) * (h - 40) - 20;
    if (idx === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  chartCtx.lineTo((prices.length - 1) * step, h);
  chartCtx.lineTo(0, h);
  chartCtx.closePath();
  chartCtx.fillStyle = grad;
  chartCtx.fill();

  // Price stroke with glow
  chartCtx.shadowColor = "#00f2fe";
  chartCtx.shadowBlur = 10;
  chartCtx.strokeStyle = "#00f2fe";
  chartCtx.lineWidth = 2.5;
  chartCtx.beginPath();

  prices.forEach((p, idx) => {
    const x = idx * step;
    const y = h - ((p - min) / (max - min)) * (h - 40) - 20;
    if (idx === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  chartCtx.stroke();
  chartCtx.shadowBlur = 0; // Reset
}

function drawWashGraph() {
  const w = graphCanvas.width;
  const h = graphCanvas.height;
  graphCtx.clearRect(0, 0, w, h);

  // Calculate coordinates relative to canvas size
  const coords = [
    { x: w * 0.25, y: h * 0.28 },
    { x: w * 0.75, y: h * 0.28 },
    { x: w * 0.75, y: h * 0.72 },
    { x: w * 0.25, y: h * 0.72 }
  ];

  graphCtx.strokeStyle = washAlertActive ? "#ef4444" : "#1e293b";
  graphCtx.lineWidth = washAlertActive ? 4 : 2;

  if (washAlertActive) {
    graphCtx.shadowColor = "#ef4444";
    graphCtx.shadowBlur = 12;
  }

  // Draw cycle loop
  graphCtx.beginPath();
  graphCtx.moveTo(coords[0].x, coords[0].y);
  graphCtx.lineTo(coords[1].x, coords[1].y);
  graphCtx.lineTo(coords[2].x, coords[2].y);
  graphCtx.lineTo(coords[3].x, coords[3].y);
  graphCtx.closePath();
  graphCtx.stroke();
  graphCtx.shadowBlur = 0;

  // Render nodes
  nodes.forEach((n, idx) => {
    const c = coords[idx];
    n.currX = c.x;
    n.currY = c.y;

    graphCtx.fillStyle = washAlertActive ? "#ef4444" : "#00f2fe";
    graphCtx.beginPath();
    graphCtx.arc(c.x, c.y, 16, 0, Math.PI * 2);
    graphCtx.fill();

    graphCtx.fillStyle = "#fff";
    graphCtx.font = "bold 11px 'JetBrains Mono'";
    graphCtx.fillText(n.id, c.x - 8, c.y + 4);

    graphCtx.fillStyle = "#94a3b8";
    graphCtx.font = "10px 'JetBrains Mono'";
    graphCtx.fillText(n.label, c.x - 34, c.y - 24);
  });

  requestAnimationFrame(drawWashGraph);
}

// Click on Graph canvas
graphCanvas.addEventListener("click", (e) => {
  const rect = graphCanvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  nodes.forEach(n => {
    if (!n.currX) return;
    const dist = Math.hypot(n.currX - clickX, n.currY - clickY);
    if (dist < 26) {
      document.getElementById("inspector-data").innerHTML = `
        <div style="background:#090c13; padding:12px; border-radius:6px; border:1px solid #1c2436; margin-top:10px;">
          <p><b style="color:#fff;">Node ID:</b> ${n.id}</p>
          <p><b style="color:#fff;">Address:</b> ${n.label}</p>
          <p><b style="color:#fff;">Cumulative Volume:</b> ${n.volume}</p>
          <p><b style="color:#fff;">Risk Profile:</b> <span style="color:#ef4444">${n.risk}</span></p>
          <p style="margin-top:8px; font-size:10px; color:#10b981;">Telemetry: Active Ingestion into Parquet Lake</p>
        </div>
      `;
    }
  });
});

function logAnomaly(text, level = "NORMAL") {
  const empty = document.getElementById("empty-state");
  if (empty) empty.style.display = "none";

  const container = document.getElementById("logs-container");
  const row = document.createElement("div");
  row.className = `log-item ${level}`;
  row.innerHTML = `<span>[${new Date().toLocaleTimeString()}]</span> <span>${text}</span>`;
  container.prepend(row);
  if (container.children.length > 20) container.removeChild(container.lastChild);
}

function clearLogs() {
  document.getElementById("logs-container").innerHTML = `<div class="empty-log-state" id="empty-state">Stream listening... No anomalous deviations intercepted in active window.</div>`;
}

function triggerEvent(actionType) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: actionType }));
  }
}

function switchTab(tabName, btnElement) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  
  document.getElementById(`tab-${tabName}`).classList.add("active");
  btnElement.classList.add("active");
  setTimeout(resizeCanvases, 50);
}

function simulateOrder() {
  const wallet = document.getElementById("sim-wallet").value;
  const size = parseFloat(document.getElementById("sim-size").value);
  const banner = document.getElementById("sim-verdict");

  banner.innerHTML = `<span style="color:#00f2fe">Processing order through PySpark Streaming state buffer...</span>`;

  setTimeout(() => {
    if (wallet.includes("0x71A") || size > 25) {
      banner.innerHTML = `
        <span style="color:#ef4444; font-weight:bold;">🚨 BLOCKED BY COMPLEX EVENT ENGINE:</span><br>
        Cyclic Collusion match on address ${wallet}. Size (${size} BTC) triggers anomaly threshold ($Z > 3.0\\sigma$). Incident dumped to forensic parquet sink.
      `;
    } else {
      banner.innerHTML = `
        <span style="color:#10b981; font-weight:bold;">✅ ORDER CLEARED & ROUTED:</span><br>
        Clean execution pass. Latency: 1.2ms. Broadcasted to Apache Kafka topic: market-ticks.
      `;
    }
  }, 400);
}

function openReportModal() {
  const modal = document.getElementById("report-modal");
  const content = document.getElementById("report-content");
  modal.style.display = "flex";

  if (recordedAnomalies.length === 0) {
    content.innerHTML = `<p style="padding:16px; text-align:center;">No market anomalies captured in this session yet. Trigger events via top toolbar buttons first.</p>`;
    return;
  }

  let html = `<table style="width:100%; border-collapse:collapse; margin-top:8px;">
    <tr style="border-bottom:1px solid #28354d; text-align:left;">
      <th style="padding:8px;">Time</th><th>Anomaly Classification</th><th>Stream Forensic Telemetry</th>
    </tr>`;

  recordedAnomalies.forEach(a => {
    html += `<tr style="border-bottom:1px solid #141b27;">
      <td style="padding:8px;">${a.time}</td>
      <td style="color:#00f2fe; font-weight:bold;">${a.type}</td>
      <td>${a.detail}</td>
    </tr>`;
  });

  html += `</table>`;
  content.innerHTML = html;
}

function closeReportModal() {
  document.getElementById("report-modal").style.display = "none";
}

// Startup
setTimeout(() => {
  resizeCanvases();
  initWebSocket();
  drawWashGraph();
}, 100);