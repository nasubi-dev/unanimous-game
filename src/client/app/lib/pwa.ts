export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI__" in window;
};

export const isPWACapable = (): boolean => {
  return "serviceWorker" in navigator && "PushManager" in window;
};

export const isPWAInstalled = (): boolean => {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
};

export const registerServiceWorker = async (): Promise<void> => {
  // Tauriの場合はService Workerを登録しない
  if (isTauri()) {
    console.log("Running in Tauri - Service Worker not needed");
    return;
  }

  if (!isPWACapable()) {
    console.log("PWA not supported");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            // 新しいバージョンが利用可能
            if (confirm("新しいバージョンが利用可能です。更新しますか？")) {
              window.location.reload();
            }
          }
        });
      }
    });

    console.log("Service Worker registered:", registration);
  } catch (error) {
    console.error("Service Worker registration failed:", error);
  }
};

export const checkForPWAPrompt = (): void => {
  // Tauriの場合はPWAプロンプト不要
  if (isTauri()) {
    return;
  }

  let deferredPrompt: any;

  window.addEventListener("beforeinstallprompt", (e) => {
    console.log("PWA install prompt intercepted");
    e.preventDefault();
    deferredPrompt = e;

    // カスタムインストールボタンの表示など
    showInstallButton(deferredPrompt);
  });

  window.addEventListener("appinstalled", (e) => {
    console.log("PWA was installed");
    hideInstallButton();
  });
};

const showInstallButton = (deferredPrompt: any): void => {
  console.log("PWA install prompt available");
  
  // 既存のボタンがあれば削除
  const existingButton = document.getElementById('pwa-install-button');
  if (existingButton) {
    existingButton.remove();
  }
  
  // インストールボタンを作成
  const installButton = createInstallButton();
  document.body.appendChild(installButton);
  
  installButton.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      hideInstallButton();
      deferredPrompt = null;
    }
  });
};

const createInstallButton = (): HTMLElement => {
  const button = document.createElement('button');
  button.id = 'pwa-install-button';
  button.innerHTML = '📱 アプリをインストール';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000;
    background: #7c3aed;
    color: white;
    border: none;
    border-radius: 12px;
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: Inter, system-ui, sans-serif;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.5)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.4)';
  });
  
  return button;
};

const hideInstallButton = (): void => {
  const button = document.getElementById('pwa-install-button');
  if (button) {
    button.remove();
  }
};
