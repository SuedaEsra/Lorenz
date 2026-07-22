# Lorenz Chaos Sonification

Bu masaüstü uygulaması, ünlü **Lorenz Çekeri (Lorenz Attractor)** diferansiyel denklemlerini Runge-Kutta 4 (RK4) yöntemiyle gerçek zamanlı simüle eder ve hareket koordinatlarını müzikal notalara (Additive Synthesis / Toplamsal Sentez yöntemiyle) dönüştürerek işitselleştirir (sonification).

---

## 🎨 Tasarım Estetiği (Pen-Plotter / Bilimsel Defter)

Uygulamanın görsel tasarımı, karanlık neon/cam morfizim (dark glassmorphism) yerine geleneksel teknik mühendislik defterleri ve pen-plotter çizicilerinden ilham alan bir **bilimsel defter estetiğine** dayanır.

*   **Arka Plan (Vintage Krem Kağıt):** `#F1EEE3` (İkincil gri-krem: `#E8E4D5`)
*   **Mürekkep / Çizgi (Lacivert):** `#1B2A44` (Teknik çizim kalemi rengi)
*   **Vurgular & İşaretçiler (Amber):** `#C0763B` (Aktif simülasyon ucu ve vurgu rengi)
*   **Tipografi:** Başlıklar için **Fraunces** şerif yazı tipi, gövde metinleri için **Inter** sans-serif yazı tipi ve sayısal veri göstergeleri/kod yapıları için **JetBrains Mono** monospace yazı tipi kullanılır.

---

## 📦 Paketleme, Dağıtım ve Sürüm Yönetimi (Packaging & Release)

Uygulamanın `electron-builder` kullanılarak derlenmesi, imzalanması (Code Signing), sürümlendirilmesi ve otomatik güncellenmesi (Auto-Update) süreçleri aşağıda detaylandırılmıştır.

### 1. SemVer (Semantic Versioning) Yönetimi

Uygulama sürümleri **Semantic Versioning (SemVer)** kurallarına (`MAJOR.MINOR.PATCH`) uygun olarak yönetilir:
*   **MAJOR (Ana Sürüm):** Geriye dönük uyumsuz API/arayüz değişikliklerinde artırılır (örn: `1.0.0` -> `2.0.0`).
*   **MINOR (Yama Sürümü):** Geriye dönük uyumlu yeni özellikler eklendiğinde artırılır (örn: `1.0.0` -> `1.1.0`).
*   **PATCH (Düzeltme Sürümü):** Geriye dönük uyumlu hata düzeltmeleri yapıldığında artırılır (örn: `1.0.0` -> `1.0.1`).

Sürüm güncellemelerini otomatikleştirmek için projenin Git reposunda aşağıdaki komutlar kullanılır:
```bash
# Hata düzeltmeleri için sürümü artırır, package.json'ı günceller ve git tag oluşturur:
npm version patch

# Yeni geriye dönük uyumlu özellikler için:
npm version minor

# Ana mimari değişiklikleri için:
npm version major
```
Bu komutlar otomatik olarak sürümü günceller, `git commit` oluşturur ve `v1.0.1` formatında yeni bir Git etiketi (tag) atar. Ardından `git push origin main --tags` ile repoya gönderilir.

---

### 2. Kod İmzalama (Code Signing)

Kullanıcıların işletim sistemlerinde güvenlik uyarıları (SmartScreen veya Gatekeeper engelleri) almasını önlemek için uygulamaların imzalanması zorunludur.

#### A. Windows (Authenticode)
Windows kurulum dosyalarını (.exe / .msi) imzalamak için bir **Authenticode Sertifikası** (tercihen EV - Extended Validation) gereklidir.

`electron-builder` üzerinde Windows kod imzalamayı yapılandırmak için şu adımlar izlenir:
1.  **Sertifika Hazırlığı:** Sertifikanızı `.pfx` dosyası olarak kaydedin.
2.  **Ortam Değişkenleri:** Güvenlik nedeniyle sertifika şifresini doğrudan kod içerisine yazmayın. CI/CD (örn. GitHub Actions Secrets) veya yerel terminalinizde şu ortam değişkenlerini tanımlayın:
    *   `CSC_LINK`: `.pfx` dosyasının yerel yolu veya base64 kodlu içeriği.
    *   `CSC_KEY_PASSWORD`: PFX dosyasının şifresi.
3.  **electron-builder Yapılandırması (`package.json`):**
    ```json
    "build": {
      "win": {
        "target": "nsis",
        "publisherName": "Yayinici Sirket Adi"
      }
    }
    ```
4.  Derleme sırasında `electron-builder` bu ortam değişkenlerini otomatik olarak algılayıp `signtool.exe` yardımıyla imzalamayı gerçekleştirecektir.

#### B. macOS (Signing & Notarization)
macOS üzerinde uygulamanın sorunsuz çalışması için uygulamanın hem Apple Developer sertifikası ile imzalanması hem de Apple Noterlik sunucularına onaylatılması (**Notarization**) gerekir.

1.  **Gereksinimler:**
    *   Yıllık Apple Developer Hesabı.
    *   Xcode CLI araçlarının yüklü olması (`xcode-select --install`).
    *   Keychain üzerinde "Developer ID Application" sertifikasının bulunması.
2.  **Gerekli Paketler:** Projede `@electron/notarize` paketi kurulu olmalıdır (kuruludur).
3.  **Ortam Değişkenleri:**
    *   `APPLE_ID`: Apple Developer hesabınızın e-postası.
    *   `APPLE_ID_PASSWORD`: Apple ID hesabınız için oluşturulmuş uygulama şifresi (App-Specific Password).
    *   `APPLE_TEAM_ID`: Apple Team ID kodunuz (Portaldan alınır).
4.  **Noterlik Betiği (`build/notarize.js`):**
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
5.  **electron-builder macOS Yapılandırması (`package.json`):**
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
    *Not: `entitlements.mac.plist` dosyası macOS üzerinde güvenlik sandbox yetkilerini (örneğin mikrofon veya ses donanımına erişim) tanımlar.*

---

### 3. GitHub Releases ve `electron-updater` Entegrasyonu

Uygulamanın yeni sürümlerini yayınladığınızda kullanıcıların otomatik olarak güncelleme almasını sağlamak için `electron-updater` kütüphanesi kullanılır.

#### A. electron-builder Yayın Yapılandırması (`package.json`)
Sürümlerin GitHub Releases üzerine gönderilmesi için yapılandırma:
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

#### B. Dağıtım / Yayınlama Süreci
Yeni bir sürüm yayınlamak için:
1.  Sürüm numarasını güncelleyin: `npm version patch`.
2.  GitHub kişisel erişim jetonunu (**GitHub Personal Access Token - GH_TOKEN**) tanımlayın:
    ```powershell
    # Windows PowerShell
    $env:GH_TOKEN="ghp_SizinGithubJetonunuz..."
    ```
3.  Uygulamayı derleyin ve GitHub Releases'e gönderin:
    ```bash
    # Derleme yapıp otomatik olarak taslak (draft) release oluşturur ve yükler:
    npx electron-builder --win --mac --publish always
    ```
4.  GitHub deponuzda oluşturulan **Draft Release**'i kontrol edin ve "Publish Release" diyerek kullanıcılara açın.

#### C. Kod Entegrasyonu (Geri Plan - `main.js`)
Geri planda otomatik güncellemeleri yöneten ana yapı:
```javascript
const { autoUpdater } = require('electron-updater');

// Güncelleme kontrollerini başlat
app.whenReady().then(() => {
  createWindow();
  
  // Uygulama açıldıktan 3 saniye sonra güncellemeleri denetler
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
});

// Güncelleme durum olaylarını Renderer (Arayüz) tarafına yollar
autoUpdater.on('update-available', (info) => {
  mainWindow.webContents.send('lorenz:update-status', { state: 'available', version: info.version });
});

autoUpdater.on('update-downloaded', (info) => {
  mainWindow.webContents.send('lorenz:update-status', { state: 'downloaded', version: info.version });
});

// Arayüzden tetiklenen "Şimdi Yeniden Başlat ve Güncelle" IPC isteği
ipcMain.handle('lorenz:restart-and-update', () => {
  autoUpdater.quitAndInstall();
});
```

#### D. Arayüz Entegrasyonu (Renderer - `app.js`)
Kullanıcıyı bilgilendiren ve güncellemeyi uygulayan ön yüz entegrasyonu:
```javascript
const updateNotification = document.getElementById('updateNotification');
const restartBtn = document.getElementById('restartBtn');

window.lorenzAPI?.onUpdateStatus((status) => {
  switch (status.state) {
    case 'available':
      // Güncelleme bulundu uyarısını göster
      updateNotification.classList.remove('hidden');
      updateNotification.querySelector('.toast-message').innerText = `Yeni Güncelleme Mevcut: v${status.version}`;
      break;
      
    case 'downloading':
      // İndirme yüzdesini güncelle
      updateNotification.querySelector('.toast-message').innerText = `Güncelleme İndiriliyor: %${Math.round(status.percent)}`;
      break;
      
    case 'downloaded':
      // İndirme bittiğinde butonu aktif et
      updateNotification.querySelector('.toast-message').innerText = 'Güncelleme Hazır! Uygulamayı yeniden başlatın.';
      restartBtn.classList.remove('hidden');
      break;
  }
});

// Yeniden başlat butonuna tıklandığında arka plana güncelleme emrini yolla
restartBtn.addEventListener('click', () => {
  window.lorenzAPI?.restartAndUpdate();
});
```

---

## 🛠️ Yerel Geliştirme (Local Development)

Projeyi yerel makinenizde çalıştırmak için:

1.  Bağımlılıkları yükleyin:
    ```bash
    npm install
    ```
2.  Uygulamayı geliştirme modunda başlatın:
    ```bash
    npm start
    ```
3.  Masaüstü ikonlarını oluşturmak için:
    ```bash
    npm run generate-icons
    ```
