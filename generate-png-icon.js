const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const htmlPath = path.join(__dirname, 'assets', 'generate-png.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('generate-png.html not found!');
    app.quit();
    return;
  }

  win.loadFile(htmlPath);
});

ipcMain.on('png-done', (event, dataUrl) => {
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  fs.writeFileSync(pngPath, base64Data, 'base64');
  console.log('Successfully generated assets/icon.png from assets/icon.svg!');
  
  // Clean up HTML helper
  const htmlPath = path.join(__dirname, 'assets', 'generate-png.html');
  try {
    fs.unlinkSync(htmlPath);
  } catch (e) {}

  app.quit();
});

ipcMain.on('png-failed', (event, error) => {
  console.error('Failed to render SVG to PNG:', error);
  app.quit();
});
