(function initTemplateIoPopup() {
  const namespace = window.TemplateIo;
  const listElement = document.querySelector("[data-list]");
  const searchInput = document.querySelector("[data-search]");
  const statusElement = document.querySelector("[data-status]");
  const countElement = document.querySelector("[data-template-count]");
  const authElement = document.querySelector("[data-auth-status]");
  let state = null;

  function setStatus(message, tone) {
    statusElement.textContent = message || "";
    statusElement.style.color = tone === "error" ? "#b42318" : "#64748b";
  }

  function activeTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0]);
      });
    });
  }

  async function sendToActiveTab(message) {
    const tab = await activeTab();
    if (!tab || !tab.id) {
      throw new Error("Активная вкладка не найдена.");
    }

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error("На этой странице расширение недоступно."));
          return;
        }
        resolve(response);
      });
    });
  }

  function filteredTemplates() {
    const query = searchInput.value;
    return state.templates
      .filter((template) => namespace.templates.templateMatches(template, query))
      .slice(0, 8);
  }

  function renderTemplates() {
    listElement.replaceChildren();
    const items = filteredTemplates();

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "status";
      empty.textContent = "Ничего не найдено";
      listElement.append(empty);
      return;
    }

    for (const template of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "template-button";
      button.addEventListener("click", async () => {
        try {
          setStatus("Вставляю шаблон");
          await sendToActiveTab({
            type: "TEMPLATE_IO_INSERT_TEMPLATE",
            templateId: template.id
          });
          window.close();
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      const head = document.createElement("span");
      const title = document.createElement("span");
      const preview = document.createElement("span");
      const shortcut = document.createElement("span");

      head.className = "template-head";
      title.className = "template-title";
      preview.className = "template-preview";
      shortcut.className = "shortcut";
      title.textContent = template.title;
      preview.textContent = namespace.templates.getFirstLinePreview(template.body);
      shortcut.textContent = template.shortcut || "нет";

      head.append(title, shortcut);
      button.append(head, preview);
      listElement.append(button);
    }
  }

  async function load() {
    state = await namespace.storage.getState();
    countElement.textContent = String(state.templates.length);
    authElement.textContent = state.auth.isAuthenticated
      ? `Вход: ${state.auth.userEmail}`
      : "Локальный режим";
    renderTemplates();
  }

  document.querySelector("[data-open-overlay]").addEventListener("click", async () => {
    try {
      setStatus("Открываю меню на странице");
      await sendToActiveTab({ type: "TEMPLATE_IO_OPEN_OVERLAY" });
      window.close();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  document.querySelector("[data-options]").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  searchInput.addEventListener("input", renderTemplates);
  load().catch((error) => setStatus(error.message, "error"));
})();
