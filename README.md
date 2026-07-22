# Lorenz Chaos Sonification

This desktop application simulates the famous **Lorenz Attractor** differential equations in real-time using the Runge-Kutta 4 (RK4) method, and sonifies the motion coordinates by converting them into musical notes (using the Additive Synthesis method).

---

## 🎨 Design Aesthetic (Pen-Plotter / Scientific Notebook)

The visual design of the application is based on a **scientific notebook aesthetic** inspired by traditional technical engineering notebooks and pen-plotters, rather than dark neon/glassmorphism.

*   **Background (Vintage Cream Paper):** `#F1EEE3` (Secondary gray-cream: `#E8E4D5`)
*   **Ink / Line (Dark Blue):** `#1B2A44` (Technical drawing pen color)
*   **Highlights & Markers (Amber):** `#C0763B` (Active simulation tip and accent color)
*   **Typography:** **Fraunces** serif font for headings, **Inter** sans-serif font for body text, and **JetBrains Mono** monospace font for numerical telemetry displays and code blocks.

---

## 📦 Packaging, Distribution, and Release Management

The packaging, signing (Code Signing), versioning, and auto-updating (Auto-Update) processes of the application using `electron-builder` are detailed below.

### 1. SemVer (Semantic Versioning) Management

Application versions are managed in compliance with **Semantic Versioning (SemVer)** rules (`MAJOR.MINOR.PATCH`):
*   **MAJOR:** Incremented for breaking API/interface changes (e.g., `1.0.0` -> `2.0.0`).
*   **MINOR:** Incremented for backward-compatible new features (e.g., `1.0.0` -> `1.1.0`).
*   **PATCH:** Incremented for backward-compatible bug fixes (e.g., `1.0.0` -> `1.0.1`).

The following commands are used in the project's Git repository to automate version updates:
```bash
# Increments version for bug fixes, updates package.json, and creates a git tag:
npm version patch

# For new backward-compatible features:
npm version minor

# For major structural changes:
npm version major
```
These commands automatically update the version, create a `git commit`, and assign a new Git tag in the format `v1.0.1`. They are then pushed to the repository using `git push origin main --tags`.

---

### 2. Code Signing

Signing applications is mandatory to prevent users from receiving security warnings (such as SmartScreen or Gatekeeper blocks) on their operating systems.

#### A. Windows (Authenticode)
An **Authenticode Certificate** (preferably EV - Extended Validation) is required to sign Windows installer files (.exe / .msi).

To configure Windows code signing on `electron-builder`:
1.  **Certificate Preparation:** Save your certificate as a `.pfx` file.
2.  **Environment Variables:** For security reasons, do not write the certificate password directly in the code. Define these environment variables in your CI/CD pipeline (e.g., GitHub Actions Secrets) or your local terminal:
    *   `CSC_LINK`: Local path or base64-encoded content of the `.pfx` file.
    *   `CSC_KEY_PASSWORD`: Password for the PFX file.
3.  **electron-builder Configuration (`package.json`):**
    ```json
    "build": {
      "win": {
        "target": "nsis",
        "publisherName": "Publisher Company Name"
      }
    }
    ```
4.  During build, `electron-builder` will automatically detect these environment variables and sign the application using `signtool.exe`.

#### B. macOS (Signing & Notarization)
To run smoothly on macOS, the application must be signed with an Apple Developer certificate and approved by Apple's notarization servers (**Notarization**).

1.  **Requirements:**
    *   Annual Apple Developer Account.
    *   Xcode CLI tools installed (`xcode-select --install`).
    *   "Developer ID Application" certificate installed in Keychain.
2.  **Required Packages:** The `@electron/notarize` package must be installed in the project.
3.  **Environment Variables:**
    *   `APPLE_ID`: Your Apple Developer account email.
    *   `APPLE_ID_PASSWORD`: An app-specific password generated for your Apple ID.
    *   `APPLE_TEAM_ID`: Your Apple Team ID code (obtained from the developer portal).
4.  **Notarization Script (`build/notarize.js`):**
    ```javascript
    const { notarize } = require('@electron/notarize');
    const path = require('path');

    exports.default = async function notarizing(context) {
      const { electronPlatformName, appOutDir } = context;  
      if (electronPlatformName !== 'darwin') return;

      const appName = context.packager.appInfo.productFilename;

      console.log(`Notarizing ${appName}...`);

      return await notarize({
        appPath: `${appOutDir}/${appName}.app`,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      });
    };
    ```
5.  **electron-builder macOS Configuration (`package.json`):**
    ```json
    "build": {
      "mac": {
        "hardenedRuntime": true,
        "gatekeeperAssess": false,
        "entitlements": "build/entitlements.mac.plist",
        "entitlementsInherit": "build/entitlements.mac.plist"
      },
      "afterPack": "./build/notarize.js"
    }
    ```
    *Note: The `entitlements.mac.plist` file defines security sandbox entitlements (e.g., accessing microphone or audio hardware) on macOS.*

---

### 3. GitHub Releases and `electron-updater` Integration

The `electron-updater` library is used to ensure users automatically receive updates when a new version is published.

#### A. electron-builder Publish Configuration (`package.json`)
Configuration for publishing releases to GitHub Releases:
```json
"build": {
  "publish": [
    {
      "provider": "github",
      "owner": "antigravity",
      "repo": "lorenz-sonification"
    }
  ]
}
```

#### B. Distribution / Publishing Process
To publish a new version:
1.  Update the version number: `npm version patch`.
2.  Define the **GitHub Personal Access Token (GH_TOKEN)**:
    ```powershell
    # Windows PowerShell
    $env:GH_TOKEN="ghp_YourGithubTokenHere..."
    ```
3.  Build and publish the application to GitHub Releases:
    ```bash
    # Builds the application and automatically creates and uploads a draft release:
    npx electron-builder --win --mac --publish always
    ```
4.  Review the generated **Draft Release** on your GitHub repository and click "Publish Release" to make it available to users.

#### C. Code Integration (Background - `main.js`)
The main process code that manages automatic updates:
```javascript
const { autoUpdater } = require('electron-updater');

// Start update checks
app.whenReady().then(() => {
  createWindow();
  
  // Checks for updates 3 seconds after application launch
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
});

// Sends update status events to the Renderer (UI) process
autoUpdater.on('update-available', (info) => {
  mainWindow.webContents.send('lorenz:update-status', { state: 'available', version: info.version });
});

autoUpdater.on('update-downloaded', (info) => {
  mainWindow.webContents.send('lorenz:update-status', { state: 'downloaded', version: info.version });
});

// IPC handler triggered from UI to "Restart and Install Update"
ipcMain.handle('lorenz:restart-and-update', () => {
  autoUpdater.quitAndInstall();
});
```

#### D. UI Integration (Renderer - `app.js`)
UI implementation that notifies the user and applies the update:
```javascript
const updateNotification = document.getElementById('updateNotification');
const restartBtn = document.getElementById('restartBtn');

window.lorenzAPI?.onUpdateStatus((status) => {
  switch (status.state) {
    case 'available':
      // Show update notification alert
      updateNotification.classList.remove('hidden');
      updateNotification.querySelector('.toast-message').innerText = `New Update Available: v${status.version}`;
      break;
      
    case 'downloading':
      // Update download percentage
      updateNotification.querySelector('.toast-message').innerText = `Downloading Update: ${Math.round(status.percent)}%`;
      break;
      
    case 'downloaded':
      // Enable restart button when download completes
      updateNotification.querySelector('.toast-message').innerText = 'Update Ready! Restart the application to apply.';
      restartBtn.classList.remove('hidden');
      break;
  }
});

// Send update execution command to main process when restart button is clicked
restartBtn.addEventListener('click', () => {
  window.lorenzAPI?.restartAndUpdate();
});
```

---

## 🛠️ Local Development

To run the project on your local machine:

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Start the application in development mode:
    ```bash
    npm start
    ```
3.  To generate desktop app icons:
    ```bash
    npm run generate-icons
    ```
