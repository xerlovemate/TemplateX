(function initTemplateIoStorage(global) {
  const namespace = global.TemplateIo || {};
  const constants = namespace.constants || {};
  const STORAGE_KEY = constants.STORAGE_KEY || "templateIoState";
  const CURRENT_SCHEMA_VERSION = constants.CURRENT_SCHEMA_VERSION || 1;
  let chromeStorageUnavailable = false;

  function getDefaultSettings() {
    return {
      managerName: "",
      email: "",
      triggerText: "//",
      enableSlashTrigger: true,
      enableShortcutExpansion: true,
      hotkey: "Ctrl+Shift+Space",
      autoCloseAfterInsert: true,
      fallbackToClipboard: true,
      showPreview: true,
      debugMode: false,
      language: "ru",
      backendApiUrl: "",
      paymentProvider: "manual",
      paymentDevMode: true
    };
  }

  function createDefaultState() {
    const createdAt = namespace.nowIso ? namespace.nowIso() : new Date().toISOString();
    const folderId = "folder-basic";

    return {
      version: CURRENT_SCHEMA_VERSION,
      settings: getDefaultSettings(),
      auth: {
        isAuthenticated: false,
        userEmail: "",
        token: ""
      },
      folders: [
        {
          id: folderId,
          name: "Базовые шаблоны",
          sortOrder: 1
        }
      ],
      templates: [
        {
          id: "template-greeting",
          folderId,
          title: "Приветствие",
          shortcut: "/прив",
          body: "Здравствуйте! 🌟 Рада приветствовать вас. Подскажите, пожалуйста, чем могу помочь?",
          tags: ["старт", "клиент"],
          createdAt,
          updatedAt: createdAt
        },
        {
          id: "template-details",
          folderId,
          title: "Уточнение деталей",
          shortcut: "/детали",
          body: "Чтобы я могла всё правильно рассчитать и подсказать точную стоимость, уточните, пожалуйста:\n\n1. {{detail_1}}\n2. {{detail_2}}\n3. {{detail_3}}",
          tags: ["бриф", "детали"],
          createdAt,
          updatedAt: createdAt
        },
        {
          id: "template-payment",
          folderId,
          title: "Оплата",
          shortcut: "/оплата",
          body: "Ура, всё согласовали! Заказ сформирован и готов к запуску 🎉\n\nК оплате: {{amount}} руб.\n\nОплатить можно по ссылке:\n{{payment_link}}\n\nПосле оплаты, пожалуйста, пришлите скриншот чека прямо сюда в чат.",
          tags: ["оплата", "ссылка"],
          createdAt,
          updatedAt: createdAt
        }
      ]
    };
  }

  function getErrorMessage(error) {
    return String(error && error.message ? error.message : error || "");
  }

  function isExtensionContextInvalidated(error) {
    const message = getErrorMessage(error);
    return /Extension context invalidated|context invalidated/i.test(message);
  }

  function markChromeStorageUnavailable(error) {
    if (isExtensionContextInvalidated(error)) {
      chromeStorageUnavailable = true;
      return true;
    }
    return false;
  }

  function warnStorageError(action, error) {
    try {
      console.warn(`[TemplateX] storage ${action} failed, using fallback`, error);
    } catch (warnError) {
      // Console can be unavailable in some restricted extension contexts.
    }
  }

  function getChromeLastError() {
    try {
      return global.chrome && global.chrome.runtime ? global.chrome.runtime.lastError : null;
    } catch (error) {
      return error;
    }
  }

  function hasChromeStorage() {
    if (chromeStorageUnavailable) {
      return false;
    }
    try {
      return Boolean(
        global.chrome &&
        global.chrome.runtime &&
        global.chrome.runtime.id &&
        global.chrome.storage &&
        global.chrome.storage.local
      );
    } catch (error) {
      markChromeStorageUnavailable(error);
      return false;
    }
  }

  function getLocalFallback() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  function setLocalFallback(value) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      }
    } catch (error) {
      // localStorage may be unavailable in restricted contexts.
    }
  }

  function storageGet() {
    if (!hasChromeStorage()) {
      return Promise.resolve(getLocalFallback());
    }

    return new Promise((resolve) => {
      try {
        global.chrome.storage.local.get([STORAGE_KEY], (result) => {
          const lastError = getChromeLastError();
          if (lastError) {
            if (markChromeStorageUnavailable(lastError)) {
              resolve(getLocalFallback());
              return;
            }
            warnStorageError("get", lastError);
            resolve(getLocalFallback());
            return;
          }
          resolve(result ? result[STORAGE_KEY] : undefined);
        });
      } catch (error) {
        if (markChromeStorageUnavailable(error)) {
          resolve(getLocalFallback());
          return;
        }
        warnStorageError("get", error);
        resolve(getLocalFallback());
      }
    });
  }

  function storageSet(value) {
    if (!hasChromeStorage()) {
      setLocalFallback(value);
      return Promise.resolve(value);
    }

    return new Promise((resolve) => {
      try {
        global.chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
          const lastError = getChromeLastError();
          if (lastError) {
            if (markChromeStorageUnavailable(lastError)) {
              setLocalFallback(value);
              resolve(value);
              return;
            }
            warnStorageError("set", lastError);
            setLocalFallback(value);
            resolve(value);
            return;
          }
          resolve(value);
        });
      } catch (error) {
        if (markChromeStorageUnavailable(error)) {
          setLocalFallback(value);
          resolve(value);
          return;
        }
        warnStorageError("set", error);
        setLocalFallback(value);
        resolve(value);
      }
    });
  }

  function normalizeFolder(folder, index) {
    return {
      id: String(folder.id || (namespace.createId ? namespace.createId("folder") : `folder-${Date.now()}`)),
      name: String(folder.name || "Новая папка"),
      sortOrder: Number.isFinite(Number(folder.sortOrder)) ? Number(folder.sortOrder) : index + 1
    };
  }

  function normalizeTemplate(template) {
    const timestamp = namespace.nowIso ? namespace.nowIso() : new Date().toISOString();
    return {
      id: String(template.id || (namespace.createId ? namespace.createId("template") : `template-${Date.now()}`)),
      folderId: template.folderId || null,
      title: String(template.title || "Новый шаблон"),
      shortcut: String(template.shortcut || ""),
      body: String(template.body || ""),
      tags: Array.isArray(template.tags) ? template.tags.map(String) : [],
      createdAt: String(template.createdAt || timestamp),
      updatedAt: String(template.updatedAt || timestamp)
    };
  }

  function normalizeState(raw) {
    const fallback = createDefaultState();
    if (!raw || typeof raw !== "object") {
      return fallback;
    }

    const settings = {
      ...fallback.settings,
      ...(raw.settings && typeof raw.settings === "object" ? raw.settings : {})
    };

    const auth = {
      ...fallback.auth,
      ...(raw.auth && typeof raw.auth === "object" ? raw.auth : {})
    };

    const folders = Array.isArray(raw.folders)
      ? raw.folders.map(normalizeFolder)
      : fallback.folders;
    const folderIds = new Set(folders.map((folder) => folder.id));
    const templates = Array.isArray(raw.templates)
      ? raw.templates.map(normalizeTemplate).map((template) => ({
          ...template,
          folderId: template.folderId && folderIds.has(template.folderId) ? template.folderId : null
        }))
      : fallback.templates;

    return {
      version: CURRENT_SCHEMA_VERSION,
      settings,
      auth,
      folders,
      templates
    };
  }

  async function getState() {
    try {
      const raw = await storageGet();
      const state = normalizeState(raw);
      if (!raw) {
        await storageSet(state);
      }
      return state;
    } catch (error) {
      warnStorageError("getState", error);
      return normalizeState(getLocalFallback() || createDefaultState());
    }
  }

  async function setState(nextState) {
    const normalized = normalizeState(nextState);
    try {
      await storageSet(normalized);
    } catch (error) {
      warnStorageError("setState", error);
      setLocalFallback(normalized);
    }
    return normalized;
  }

  async function updateState(updater) {
    try {
      const state = await getState();
      const nextState = updater(namespace.clone ? namespace.clone(state) : JSON.parse(JSON.stringify(state)));
      return setState(nextState);
    } catch (error) {
      warnStorageError("updateState", error);
      const state = normalizeState(getLocalFallback() || createDefaultState());
      const nextState = updater(namespace.clone ? namespace.clone(state) : JSON.parse(JSON.stringify(state)));
      return setState(nextState);
    }
  }

  function stampUpdate(item) {
    return {
      ...item,
      updatedAt: namespace.nowIso ? namespace.nowIso() : new Date().toISOString()
    };
  }

  async function updateSettings(partialSettings) {
    return updateState((state) => ({
      ...state,
      settings: {
        ...state.settings,
        ...partialSettings
      }
    }));
  }

  async function updateAuth(partialAuth) {
    return updateState((state) => ({
      ...state,
      auth: {
        ...state.auth,
        ...partialAuth
      }
    }));
  }

  async function addTemplate(input) {
    const timestamp = namespace.nowIso ? namespace.nowIso() : new Date().toISOString();
    const template = normalizeTemplate({
      ...input,
      id: namespace.createId ? namespace.createId("template") : undefined,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    await updateState((state) => ({
      ...state,
      templates: [...state.templates, template]
    }));

    return template;
  }

  async function updateTemplate(templateId, patch) {
    let updated = null;
    await updateState((state) => ({
      ...state,
      templates: state.templates.map((template) => {
        if (template.id !== templateId) {
          return template;
        }
        updated = stampUpdate(normalizeTemplate({ ...template, ...patch, id: template.id }));
        return updated;
      })
    }));
    return updated;
  }

  async function deleteTemplate(templateId) {
    return updateState((state) => ({
      ...state,
      templates: state.templates.filter((template) => template.id !== templateId)
    }));
  }

  async function addFolder(input) {
    const folder = normalizeFolder({
      ...input,
      id: namespace.createId ? namespace.createId("folder") : undefined
    });

    await updateState((state) => ({
      ...state,
      folders: [...state.folders, folder]
    }));

    return folder;
  }

  async function updateFolder(folderId, patch) {
    let updated = null;
    await updateState((state) => ({
      ...state,
      folders: state.folders.map((folder) => {
        if (folder.id !== folderId) {
          return folder;
        }
        updated = normalizeFolder({ ...folder, ...patch, id: folder.id });
        return updated;
      })
    }));
    return updated;
  }

  async function deleteFolder(folderId) {
    return updateState((state) => ({
      ...state,
      folders: state.folders.filter((folder) => folder.id !== folderId),
      templates: state.templates.map((template) =>
        template.folderId === folderId ? { ...template, folderId: null } : template
      )
    }));
  }

  async function exportState() {
    const state = await getState();
    return {
      version: state.version,
      exportedAt: namespace.nowIso ? namespace.nowIso() : new Date().toISOString(),
      settings: state.settings,
      auth: state.auth,
      folders: state.folders,
      templates: state.templates
    };
  }

  function validateImportPayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Файл не похож на экспорт TemplateX.");
    }
    if (!payload.settings || !Array.isArray(payload.folders) || !Array.isArray(payload.templates)) {
      throw new Error("В JSON должны быть settings, folders и templates.");
    }
    return normalizeState(payload);
  }

  async function importState(payload, mode) {
    const incoming = validateImportPayload(payload);
    if (mode === "merge") {
      return updateState((state) => {
        const foldersById = new Map(state.folders.map((folder) => [folder.id, folder]));
        const templatesById = new Map(state.templates.map((template) => [template.id, template]));

        for (const folder of incoming.folders) {
          foldersById.set(folder.id, folder);
        }
        for (const template of incoming.templates) {
          templatesById.set(template.id, template);
        }

        return {
          ...state,
          settings: {
            ...state.settings,
            ...incoming.settings
          },
          folders: Array.from(foldersById.values()),
          templates: Array.from(templatesById.values())
        };
      });
    }

    return setState(incoming);
  }

  namespace.storage = {
    addFolder,
    addTemplate,
    createDefaultState,
    deleteFolder,
    deleteTemplate,
    exportState,
    getState,
    importState,
    setState,
    updateAuth,
    updateFolder,
    updateSettings,
    updateTemplate
  };

  global.TemplateIo = namespace;
})(globalThis);
