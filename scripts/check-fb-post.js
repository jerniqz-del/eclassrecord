const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '../dist/last-fb-version.txt');

// Ensure dist directory exists
const distDir = path.dirname(outputPath);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function writeResultAndQuit(result) {
  try {
    fs.writeFileSync(outputPath, result, 'utf8');
    console.log(`Saved result to ${outputPath}: ${result}`);
  } catch (err) {
    console.error('Failed to write result file:', err);
  }
  app.quit();
}

// Timeout after 20 seconds in case page loading hangs
const fallbackTimeout = setTimeout(() => {
  console.log('Timeout reached. Saving "none" and quitting.');
  writeResultAndQuit('none');
}, 20000);

app.whenReady().then(() => {
  // Disable output logs we don't care about
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  console.log('Loading Facebook Page to check latest post...');
  win.loadURL('https://www.facebook.com/profile.php?id=61591204673647');

  win.webContents.on('did-finish-load', () => {
    console.log('Page loaded. Waiting for client-side rendering...');
    setTimeout(async () => {
      clearTimeout(fallbackTimeout);
      try {
        const text = await win.webContents.executeJavaScript('document.body.innerText');
        
        // Find all version strings (e.g. v1.0.6, v1.0, 1.0.6)
        const regex = /v?\d+\.\d+(?:\.\d+)?/gi;
        const matches = text.match(regex) || [];
        
        // Filter out versions from metadata or templates if any
        // Since the posts show chronologically, the first occurrence of vX.Y.Z in post text is the latest
        let latestVersion = 'none';
        
        // We only consider matches found in the posts/intro section
        // Let's filter out any matches that are part of other terms or just keep the first one
        if (matches.length > 0) {
          // Find the first match that is likely the version
          const cleanMatches = matches.map(m => m.toLowerCase().replace(/^v/, '').trim());
          // Remove duplicates
          const uniqueMatches = [...new Set(cleanMatches)];
          if (uniqueMatches.length > 0) {
            latestVersion = uniqueMatches[0];
          }
        }
        
        writeResultAndQuit(latestVersion);
      } catch (err) {
        console.error('Failed to extract version:', err);
        writeResultAndQuit('none');
      }
    }, 5000); // 5 seconds delay for React/AJAX posts to load
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.warn(`Failed to load page: ${errorDescription} (${errorCode})`);
    clearTimeout(fallbackTimeout);
    writeResultAndQuit('none');
  });
});
