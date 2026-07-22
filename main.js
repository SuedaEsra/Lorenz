const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let mainWindow;
const SETTINGS_FILE = path.join(app.getPath('userData'), 'lorenz-settings.json');

// Configure auto updater logging
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    title: 'Lorenz Sonification',
    backgroundColor: '#F1EEE3',
    icon: path.join(__dirname, 'assets', 'icon.ico') // Fallback for Windows
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Setup auto-updater event links to renderer
  setupUpdaterEvents();
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.send('lorenz:menu-action', 'new-session');
          }
        },
        {
          label: 'Export Audio as WAV...',
          click: () => {
            mainWindow?.webContents.send('lorenz:menu-action', 'export-audio-trigger');
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Randomize Parameters',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow?.webContents.send('lorenz:menu-action', 'randomize-params');
          }
        },
        {
          label: 'Reset to Defaults',
          click: () => {
            mainWindow?.webContents.send('lorenz:menu-action', 'reset-defaults');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleFullscreen' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            mainWindow?.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            autoUpdater.checkForUpdatesAndNotify();
          }
        },
        {
          label: 'About Lorenz Sonification',
          click: () => {
            const version = app.getVersion();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Lorenz Sonification',
              message: `Lorenz Sonification v${version}`,
              detail: 'A chaotic attractor synthesizer built with Electron & Tone.js.\nCreated using fourth-order Runge-Kutta physics integration.',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Report an Issue',
          click: async () => {
            await shell.openExternal('https://github.com/antigravity/lorenz-sonification/issues');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handling
ipcMain.handle('lorenz:save-settings', async (event, settings) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Failed to save settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('lorenz:load-settings', async () => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { success: true, settings: JSON.parse(data) };
    }
    return { success: true, settings: null };
  } catch (error) {
    console.error('Failed to load settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('lorenz:export-wav', async (event, arrayBuffer) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Sonification Session',
      defaultPath: path.join(app.getPath('music'), 'lorenz-session.wav'),
      filters: [{ name: 'WAVE Audio', extensions: ['wav'] }]
    });

    if (!filePath) {
      return { success: false, cancelled: true };
    }

    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to export WAV:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('lorenz:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('lorenz:check-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
  return { success: true };
});

ipcMain.handle('lorenz:restart-and-update', () => {
  autoUpdater.quitAndInstall();
});

function setupUpdaterEvents() {
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('lorenz:update-status', { state: 'checking' });
  });
  
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('lorenz:update-status', { state: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('lorenz:update-status', { state: 'not-available' });
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('lorenz:update-status', { state: 'error', message: err?.message || 'Unknown error' });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('lorenz:update-status', { 
      state: 'downloading', 
      percent: progressObj.percent 
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('lorenz:update-status', { state: 'downloaded', version: info.version });
  });
}

app.whenReady().then(() => {
  createWindow();
  createMenu();
  
  // Trigger update check on startup
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
