(function initTemplateIoOptions() {
  const namespace = window.TemplateIo;
  const storage = namespace.storage;
  const templates = namespace.templates;
  const shortcuts = namespace.shortcuts;
  const importExport = namespace.importExport;
  const auth = namespace.auth;
  const payments = namespace.payments;

  let state = null;
  let selectedFolderId = "all";
  let selectedTemplateId = null;

  const statusElement = document.querySelector("[data-status]");
  const authStatusElement = document.querySelector("[data-auth-status]");
  const folderListElement = document.querySelector("[data-folder-list]");
  const templateListElement = document.querySelector("[data-template-list]");
  const templateTotalElement = document.querySelector("[data-template-total]");
  const templateFilterInput = document.querySelector("[data-template-filter]");
  const duplicateElement = document.querySelector("[data-duplicates]");
  const bindsElement = document.querySelector("[data-binds]");
  const previewElement = document.querySelector("[data-preview]");
  const paymentResultElement = document.querySelector("[data-payment-result]");

  function setStatus(message, tone) {
    statusElement.textContent = message || "";
    statusElement.style.color = tone === "error" ? "#b42318" : "#64748b";
  }

  function getSettingField(name) {
    return document.querySelector(`[data-setting="${name}"]`);
  }

  function setFieldValue(field, value) {
    if (!field) {
      return;
    }
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value == null ? "" : String(value);
    }
  }

  function readFieldValue(field) {
    if (field.type === "checkbox") {
      return field.checked;
    }
    return field.value;
  }

  function hydrateSettings() {
    Object.entries(state.settings).forEach(([key, value]) => {
      setFieldValue(getSettingField(key), value);
    });

    authStatusElement.textContent = state.auth.isAuthenticated
      ? `Вход: ${state.auth.userEmail}`
      : "Локальный режим";
  }

  function collectSettings() {
    const settings = {};
    document.querySelectorAll("[data-setting]").forEach((field) => {
      settings[field.dataset.setting] = readFieldValue(field);
    });
    settings.hotkey = shortcuts.normalizeHotkey(settings.hotkey);
    return settings;
  }

  function folderName(folderId) {
    const folder = state.folders.find((item) => item.id === folderId);
    return folder ? folder.name : "Без папки";
  }

  function renderFolders() {
    folderListElement.replaceChildren();
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = `list-button${selectedFolderId === "all" ? " active" : ""}`;
    allButton.textContent = "Все шаблоны";
    allButton.addEventListener("click", () => {
      selectedFolderId = "all";
      render();
    });
    folderListElement.append(allButton);

    const withoutFolder = document.createElement("button");
    withoutFolder.type = "button";
    withoutFolder.className = `list-button${selectedFolderId === "none" ? " active" : ""}`;
    withoutFolder.textContent = "Без папки";
    withoutFolder.addEventListener("click", () => {
      selectedFolderId = "none";
      render();
    });
    folderListElement.append(withoutFolder);

    [...state.folders]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .forEach((folder) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `list-button${selectedFolderId === folder.id ? " active" : ""}`;
        button.textContent = folder.name;
        button.addEventListener("click", () => {
          selectedFolderId = folder.id;
          render();
        });
        folderListElement.append(button);
      });
  }

  function filteredTemplates() {
    const query = templateFilterInput.value;
    return state.templates.filter((template) => {
      const byFolder =
        selectedFolderId === "all" ||
        (selectedFolderId === "none" && !template.folderId) ||
        template.folderId === selectedFolderId;
      return byFolder && templates.templateMatches(template, query);
    });
  }

  function renderTemplateList() {
    const items = filteredTemplates();
    templateTotalElement.textContent = `${items.length}`;
    templateListElement.replaceChildren();

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Шаблонов нет";
      templateListElement.append(empty);
      return;
    }

    items.forEach((template) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `list-button${selectedTemplateId === template.id ? " active" : ""}`;
      button.addEventListener("click", () => {
        selectedTemplateId = template.id;
        fillTemplateForm(template);
        renderTemplateList();
      });

      const title = document.createElement("strong");
      const meta = document.createElement("span");
      title.textContent = template.title;
      meta.textContent = `${template.shortcut || "без shortcut"} · ${folderName(template.folderId)}`;
      button.append(title, meta);
      templateListElement.append(button);
    });
  }

  function fillTemplateFolderSelect() {
    const select = document.querySelector('[data-template-field="folderId"]');
    select.replaceChildren();

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Без папки";
    select.append(empty);

    state.folders
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .forEach((folder) => {
        const option = document.createElement("option");
        option.value = folder.id;
        option.textContent = folder.name;
        select.append(option);
      });
  }

  function templateFields() {
    return {
      title: document.querySelector('[data-template-field="title"]'),
      shortcut: document.querySelector('[data-template-field="shortcut"]'),
      folderId: document.querySelector('[data-template-field="folderId"]'),
      tags: document.querySelector('[data-template-field="tags"]'),
      body: document.querySelector('[data-template-field="body"]')
    };
  }

  function fillTemplateForm(template) {
    const fields = templateFields();
    fields.title.value = template ? template.title : "";
    fields.shortcut.value = template ? template.shortcut : "";
    fields.folderId.value = template && template.folderId ? template.folderId : "";
    fields.tags.value = template && template.tags ? template.tags.join(", ") : "";
    fields.body.value = template ? template.body : "";
    renderPreview();
  }

  function collectTemplateForm() {
    const fields = templateFields();
    return {
      title: fields.title.value.trim(),
      shortcut: fields.shortcut.value.trim(),
      folderId: fields.folderId.value || null,
      tags: fields.tags.value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      body: fields.body.value
    };
  }

  function renderPreview() {
    const body = templateFields().body.value;
    previewElement.textContent = templates.resolveTemplateBody(
      body,
      {
        name: "Иван",
        amount: "3500",
        payment_link: "https://pay.example.test/templatex"
      },
      state
    );
  }

  function renderBinds() {
    bindsElement.replaceChildren();
    const duplicates = shortcuts.findDuplicateShortcuts(state.templates);
    duplicateElement.textContent = duplicates.length
      ? `Дубли: ${duplicates.join(", ")}`
      : "Дублей нет";
    duplicateElement.style.color = duplicates.length ? "#b42318" : "#64748b";

    state.templates.forEach((template) => {
      const row = document.createElement("div");
      row.className = "bind";
      const title = document.createElement("strong");
      const shortcut = document.createElement("span");
      title.textContent = template.title;
      shortcut.textContent = template.shortcut || "нет";
      row.append(title, shortcut);
      bindsElement.append(row);
    });
  }

  function render() {
    hydrateSettings();
    fillTemplateFolderSelect();
    renderFolders();
    renderTemplateList();
    renderBinds();
    const selected = state.templates.find((template) => template.id === selectedTemplateId);
    if (selected) {
      fillTemplateForm(selected);
    } else if (!selectedTemplateId) {
      fillTemplateForm(null);
    }
  }

  async function reload() {
    state = await storage.getState();
    if (selectedTemplateId && !state.templates.some((template) => template.id === selectedTemplateId)) {
      selectedTemplateId = null;
    }
    render();
  }

  async function saveSettings() {
    state = await storage.updateSettings(collectSettings());
    setStatus("Настройки сохранены");
    render();
  }

  async function saveTemplate() {
    const payload = collectTemplateForm();
    if (!payload.title || !payload.body) {
      setStatus("Название и текст шаблона обязательны", "error");
      return;
    }

    if (selectedTemplateId) {
      await storage.updateTemplate(selectedTemplateId, payload);
      setStatus("Шаблон обновлен");
    } else {
      const created = await storage.addTemplate(payload);
      selectedTemplateId = created.id;
      setStatus("Шаблон создан");
    }
    await reload();
  }

  document.querySelector("[data-save-settings]").addEventListener("click", () => {
    saveSettings().catch((error) => setStatus(error.message, "error"));
  });

  document.querySelector("[data-login]").addEventListener("click", async () => {
    try {
      const email = prompt("Email для mock-входа", getSettingField("email").value || "");
      if (!email) {
        return;
      }
      await auth.login(email);
      setStatus("Вход выполнен");
      await reload();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  document.querySelector("[data-logout]").addEventListener("click", async () => {
    await auth.logout();
    setStatus("Вы вышли из mock-профиля");
    await reload();
  });

  document.querySelector("[data-add-folder]").addEventListener("click", async () => {
    const name = prompt("Название папки");
    if (!name) {
      return;
    }
    const folder = await storage.addFolder({
      name: name.trim(),
      sortOrder: state.folders.length + 1
    });
    selectedFolderId = folder.id;
    await reload();
  });

  document.querySelector("[data-rename-folder]").addEventListener("click", async () => {
    if (selectedFolderId === "all" || selectedFolderId === "none") {
      setStatus("Выберите папку", "error");
      return;
    }
    const folder = state.folders.find((item) => item.id === selectedFolderId);
    const name = prompt("Новое название", folder ? folder.name : "");
    if (!name) {
      return;
    }
    await storage.updateFolder(selectedFolderId, { name: name.trim() });
    await reload();
  });

  document.querySelector("[data-delete-folder]").addEventListener("click", async () => {
    if (selectedFolderId === "all" || selectedFolderId === "none") {
      setStatus("Выберите папку", "error");
      return;
    }
    if (!confirm("Удалить папку? Шаблоны останутся без папки.")) {
      return;
    }
    await storage.deleteFolder(selectedFolderId);
    selectedFolderId = "all";
    await reload();
  });

  document.querySelector("[data-new-template]").addEventListener("click", () => {
    selectedTemplateId = null;
    fillTemplateForm(null);
    renderTemplateList();
  });

  document.querySelector("[data-save-template]").addEventListener("click", () => {
    saveTemplate().catch((error) => setStatus(error.message, "error"));
  });

  document.querySelector("[data-delete-template]").addEventListener("click", async () => {
    if (!selectedTemplateId) {
      setStatus("Выберите шаблон", "error");
      return;
    }
    if (!confirm("Удалить шаблон?")) {
      return;
    }
    await storage.deleteTemplate(selectedTemplateId);
    selectedTemplateId = null;
    setStatus("Шаблон удален");
    await reload();
  });

  document.querySelector("[data-export]").addEventListener("click", async () => {
    const exported = await storage.exportState();
    importExport.downloadJson(`templatex-export-${Date.now()}.json`, exported);
  });

  document.querySelector("[data-import-file]").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      if (!confirm("Импорт изменит текущие настройки. Продолжить?")) {
        event.target.value = "";
        return;
      }
      const payload = await importExport.readJsonFile(file);
      const mode = document.querySelector("[data-import-mode]").value;
      await storage.importState(payload, mode);
      selectedTemplateId = null;
      setStatus("Импорт завершен");
      await reload();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      event.target.value = "";
    }
  });

  document.querySelector("[data-test-payment]").addEventListener("click", async () => {
    try {
      await saveSettings();
      const amount = document.querySelector('[data-payment-test="amount"]').value;
      const description = document.querySelector('[data-payment-test="description"]').value;
      const link = await payments.createPaymentLink(
        {
          amount,
          description,
          clientName: state.settings.managerName,
          manualPaymentLink: ""
        },
        state.settings
      );
      paymentResultElement.textContent = link;
      paymentResultElement.style.color = "#047857";
    } catch (error) {
      paymentResultElement.textContent = error.message;
      paymentResultElement.style.color = "#b42318";
    }
  });

  templateFilterInput.addEventListener("input", renderTemplateList);
  document.querySelectorAll("[data-template-field]").forEach((field) => {
    field.addEventListener("input", renderPreview);
    field.addEventListener("change", renderPreview);
  });

  reload().catch((error) => setStatus(error.message, "error"));
})();
