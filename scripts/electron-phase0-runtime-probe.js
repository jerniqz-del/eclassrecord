const { app, BrowserWindow } = require('electron');
const { performance } = require('perf_hooks');

const launchedAt = performance.now();

app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  const readyMs = performance.now() - launchedAt;
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const rows = Array.from({ length: 250 }, (_, index) =>
    `<tr><td>TEST-${String(index + 1).padStart(3, '0')}</td><td>${index % 21}</td><td>${(index * 3) % 21}</td></tr>`
  ).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{font:12px Arial}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px}</style><table><thead><tr><th>Fixture</th><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`;
  const loadStartedAt = performance.now();
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const renderReadyMs = performance.now() - loadStartedAt;
  const mainWorkingSetKb = Math.round(process.memoryUsage().rss / 1024);
  const rendererPid = window.webContents.getOSProcessId();
  const rendererMetric = app.getAppMetrics().find(metric => metric.pid === rendererPid);
  const rendererWorkingSetKb = rendererMetric?.memory?.workingSetSize || 0;
  const pdfStartedAt = performance.now();
  const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  const pdfMs = performance.now() - pdfStartedAt;
  console.log('PHASE0_RUNTIME_PROBE ' + JSON.stringify({
    electronReadyMs: Number(readyMs.toFixed(2)),
    rendererReadyMs: Number(renderReadyMs.toFixed(2)),
    mainWorkingSetKb,
    rendererWorkingSetKb,
    pdfMs: Number(pdfMs.toFixed(2)),
    pdfBytes: pdf.length,
  }));
  window.destroy();
  app.exit(0);
}).catch(error => {
  console.error('PHASE0_RUNTIME_PROBE_ERROR', error);
  app.exit(1);
});
