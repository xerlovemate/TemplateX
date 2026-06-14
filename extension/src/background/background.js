try {
  importScripts("../shared/types.js", "../shared/storage.js");
} catch (error) {
  console.warn("TemplateX background init skipped shared imports", error);
}

chrome.runtime.onInstalled.addListener(() => {
  if (globalThis.TemplateIo && globalThis.TemplateIo.storage) {
    globalThis.TemplateIo.storage.getState().catch((error) => {
      console.warn("TemplateX storage bootstrap failed", error);
    });
  }
});

function sendToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      return;
    }
    chrome.tabs.sendMessage(tab.id, message, () => {
      const ignored = chrome.runtime.lastError;
      if (ignored) {
        console.warn("TemplateX content script is not available on this page.");
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "TEMPLATE_IO_OPEN_OVERLAY") {
    sendToActiveTab({ type: "TEMPLATE_IO_OPEN_OVERLAY" });
    return false;
  }

  if (message.type === "TEMPLATE_IO_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return false;
  }

  return false;
});
