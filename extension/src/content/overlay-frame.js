(function initTemplateIoOverlayFrame(global) {
  const FRAME_SOURCE = "templateio-overlay-frame";
  const CONTENT_SOURCE = "templateio-content";
  const templatesApi = (global.TemplateIo && global.TemplateIo.templates) || {};

  const refs = {
    panel: document.querySelector("[data-panel]"),
    count: document.querySelector("[data-count]"),
    search: document.querySelector("[data-search]"),
    list: document.querySelector("[data-list]"),
    empty: document.querySelector("[data-empty]"),
    options: document.querySelector("[data-options]"),
    footerOptions: document.querySelector("[data-footer-options]"),
    close: document.querySelector("[data-close]"),
    variables: document.querySelector("[data-variables]"),
    variableForm: document.querySelector("[data-variable-form]"),
    variableTitle: document.querySelector("[data-variable-title]"),
    variableClose: document.querySelector("[data-variable-close]"),
    variableCancel: document.querySelector("[data-variable-cancel]"),
    variableSubmit: document.querySelector("[data-variable-submit]"),
    fields: document.querySelector("[data-fields]"),
    footerHint: document.querySelector("[data-footer-hint]")
  };

  let state = null;
  let removeTrigger = false;
  let overlayMode = "";
  let filteredTemplates = [];
  let selectedIndex = 0;
  let pendingVariables = null;
  const collapsedFolderIds = new Set();

  function debug(message, details) {
    if (state && state.settings && state.settings.debugMode) {
      console.debug(`[TemplateX] ${message}`, details || "");
    }
  }

  function send(type, payload) {
    parent.postMessage({
      source: FRAME_SOURCE,
      type,
      ...(payload || {})
    }, "*");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function templateMatches(template, query) {
    if (templatesApi.templateMatches) {
      return templatesApi.templateMatches(template, query);
    }
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return [template.title, template.shortcut, template.body, Array.isArray(template.tags) ? template.tags.join(" ") : ""]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  }

  function getPreview(body) {
    if (templatesApi.getFirstLinePreview) {
      return templatesApi.getFirstLinePreview(body);
    }
    return String(body || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "Без текста";
  }

  function sortedTemplates() {
    if (!state) {
      return [];
    }
    const foldersById = new Map((state.folders || []).map((folder) => [folder.id, folder]));
    return [...(state.templates || [])].sort((left, right) => {
      const leftFolder = foldersById.get(left.folderId);
      const rightFolder = foldersById.get(right.folderId);
      const folderCompare = (leftFolder ? leftFolder.sortOrder : 9999) - (rightFolder ? rightFolder.sortOrder : 9999);
      if (folderCompare !== 0) {
        return folderCompare;
      }
      return String(left.title || "").localeCompare(String(right.title || ""), "ru");
    });
  }

  function groupedTemplates(query) {
    if (!state) {
      return [];
    }
    const templatesByFolder = new Map();
    for (const template of filteredTemplates) {
      const folderId = template.folderId || "__none__";
      if (!templatesByFolder.has(folderId)) {
        templatesByFolder.set(folderId, []);
      }
      templatesByFolder.get(folderId).push(template);
    }

    const groups = [...(state.folders || [])]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        templates: templatesByFolder.get(folder.id) || []
      }))
      .filter((group) => group.templates.length > 0);

    const withoutFolder = templatesByFolder.get("__none__") || [];
    if (withoutFolder.length > 0) {
      groups.push({
        id: "__none__",
        name: "Без папки",
        templates: withoutFolder
      });
    }

    return groups.map((group) => ({
      ...group,
      collapsed: !query && collapsedFolderIds.has(group.id)
    }));
  }

  function buildTemplateRow(template, index) {
    const row = createElement("button", `row${index === selectedIndex ? " selected" : ""}`);
    row.type = "button";
    row.addEventListener("click", () => selectTemplate(index));

    const main = createElement("span", "row-main");
    const title = createElement("span", "row-title", template.title || "Без названия");
    const meta = createElement("span", "row-meta");
    const preview = createElement(
      "span",
      "row-preview",
      state && state.settings && state.settings.showPreview ? getPreview(template.body) : "Предпросмотр скрыт"
    );
    const shortcut = createElement("span", "shortcut", template.shortcut || "без shortcut");

    meta.append(preview);
    main.append(title, meta);
    row.append(main, shortcut);
    return row;
  }

  function buildFolderSection(group, query) {
    const section = createElement("section", `folder-section${group.collapsed ? " collapsed" : ""}`);
    const header = createElement("button", "folder-header");
    header.type = "button";
    header.addEventListener("click", () => {
      if (query) {
        return;
      }
      if (collapsedFolderIds.has(group.id)) {
        collapsedFolderIds.delete(group.id);
      } else {
        collapsedFolderIds.add(group.id);
      }
      renderList();
    });

    const chevron = createElement("span", "folder-chevron", "▾");
    const icon = createElement("span", "folder-icon");
    const name = createElement("span", "folder-name", group.name);
    const count = createElement("span", "folder-count", String(group.templates.length));
    const items = createElement("div", "folder-items");

    header.append(chevron, icon, name, count);
    for (const template of group.templates) {
      const index = filteredTemplates.findIndex((item) => item.id === template.id);
      items.append(buildTemplateRow(template, index));
    }
    section.append(header, items);
    return section;
  }

  function renderList() {
    const query = refs.search.value.trim();
    filteredTemplates = sortedTemplates().filter((template) => templateMatches(template, query));
    selectedIndex = clamp(selectedIndex, 0, Math.max(filteredTemplates.length - 1, 0));
    refs.count.textContent = `${filteredTemplates.length} из ${state ? state.templates.length : 0}`;
    refs.list.replaceChildren();
    refs.empty.hidden = filteredTemplates.length > 0;
    refs.list.hidden = filteredTemplates.length === 0;

    for (const group of groupedTemplates(query)) {
      refs.list.append(buildFolderSection(group, query));
    }
  }

  function selectTemplate(index) {
    const template = filteredTemplates[index];
    if (!template) {
      return;
    }
    send("TEMPLATEIO_SELECT_TEMPLATE", {
      templateId: template.id,
      removeTrigger
    });
  }

  function setListMode(payload) {
    state = payload.state || state;
    removeTrigger = Boolean(payload.removeTrigger);
    overlayMode = payload.mode || "";
    pendingVariables = null;
    refs.variables.hidden = true;
    refs.panel.hidden = false;
    refs.search.value = payload.initialQuery || "";
    if (refs.footerHint) {
      refs.footerHint.textContent = overlayMode === "maxCommandCapture"
        ? "Esc - вернуть /"
        : "Esc - закрыть";
    }
    selectedIndex = 0;
    renderList();
    requestAnimationFrame(() => {
      refs.search.focus();
      refs.search.select();
    });
  }

  function setVariableBusy(isBusy) {
    refs.variableSubmit.disabled = isBusy;
    refs.variableCancel.disabled = isBusy;
    refs.variableClose.disabled = isBusy;
  }

  function getVariableInputs() {
    return Array.from(refs.fields.querySelectorAll("[data-variable-input]"))
      .filter((input) => !input.disabled && !refs.variables.hidden);
  }

  function focusVariableInputByDelta(current, delta) {
    const inputs = getVariableInputs();
    const index = inputs.indexOf(current);
    if (index === -1) {
      return false;
    }

    const nextIndex = clamp(index + delta, 0, Math.max(inputs.length - 1, 0));
    const next = inputs[nextIndex];
    if (!next) {
      return false;
    }
    if (next !== current) {
      next.focus();
      if (typeof next.setSelectionRange === "function") {
        const end = String(next.value || "").length;
        try {
          next.setSelectionRange(end, end);
        } catch (error) {
          // Some input types can reject selection APIs.
        }
      }
    }
    return true;
  }

  function handleVariableInputKeyDown(event) {
    if (
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.currentTarget.tagName === "TEXTAREA"
    ) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      focusVariableInputByDelta(event.currentTarget, event.key === "ArrowDown" ? 1 : -1);
    }
  }

  function showVariables(payload) {
    state = payload.state || state;
    pendingVariables = {
      requestId: payload.requestId,
      template: payload.template,
      variableNames: payload.variableNames || [],
      submitted: false
    };

    refs.panel.hidden = true;
    refs.variables.hidden = false;
    refs.variableTitle.textContent = payload.template && payload.template.title ? payload.template.title : "";
    refs.fields.replaceChildren();
    setVariableBusy(false);

    const defaults = payload.defaults || {};
    for (const name of pendingVariables.variableNames) {
      const label = createElement("label");
      const title = createElement("span", "", name);
      const input = document.createElement("input");
      input.name = name;
      input.type = name === "payment_link" ? "url" : "text";
      input.value = Object.prototype.hasOwnProperty.call(defaults, name) ? String(defaults[name] || "") : "";
      input.autocomplete = "off";
      input.dataset.variableInput = "true";
      input.addEventListener("keydown", handleVariableInputKeyDown);
      label.append(title, input);
      refs.fields.append(label);
    }

    debug("variables form opened", {
      requestId: pendingVariables.requestId,
      templateId: pendingVariables.template && pendingVariables.template.id,
      fields: pendingVariables.variableNames
    });

    requestAnimationFrame(() => {
      const first = refs.fields.querySelector("input");
      if (first) {
        first.focus();
        first.select();
      } else {
        refs.variableSubmit.focus();
      }
    });
  }

  function submitVariables() {
    if (!pendingVariables || pendingVariables.submitted) {
      return;
    }
    const values = {};
    refs.fields.querySelectorAll("[data-variable-input]").forEach((input) => {
      values[input.name] = input.value;
    });
    pendingVariables.submitted = true;
    setVariableBusy(true);
    debug("variables submit clicked", {
      requestId: pendingVariables.requestId,
      values
    });
    send("TEMPLATEIO_VARIABLES_SUBMIT", {
      requestId: pendingVariables.requestId,
      templateId: pendingVariables.template && pendingVariables.template.id,
      values
    });
  }

  function cancelVariables() {
    if (!pendingVariables || pendingVariables.submitted) {
      return;
    }
    send("TEMPLATEIO_VARIABLES_CANCEL", {
      requestId: pendingVariables.requestId,
      templateId: pendingVariables.template && pendingVariables.template.id
    });
    pendingVariables = null;
  }

  function closeFrame() {
    pendingVariables = null;
    refs.panel.hidden = true;
    refs.variables.hidden = true;
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!refs.variables.hidden) {
        cancelVariables();
      } else {
        send("TEMPLATEIO_CLOSE", { reason: "escape", mode: overlayMode });
      }
      return;
    }

    if (!refs.variables.hidden) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = clamp(selectedIndex + 1, 0, Math.max(filteredTemplates.length - 1, 0));
      renderList();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = clamp(selectedIndex - 1, 0, Math.max(filteredTemplates.length - 1, 0));
      renderList();
      return;
    }

    if (event.key === "Enter" && filteredTemplates.length > 0) {
      event.preventDefault();
      selectTemplate(selectedIndex);
    }
  }

  function handleParentMessage(event) {
    if (event.source !== parent) {
      return;
    }
    const data = event.data || {};
    if (data.source !== CONTENT_SOURCE) {
      return;
    }

    if (data.type === "TEMPLATEIO_OPEN") {
      setListMode(data);
      return;
    }

    if (data.type === "TEMPLATEIO_STATE") {
      state = data.state || state;
      if (!refs.panel.hidden) {
        renderList();
      }
      return;
    }

    if (data.type === "TEMPLATEIO_SHOW_VARIABLES") {
      showVariables(data);
      return;
    }

    if (data.type === "TEMPLATEIO_INSERT_DONE") {
      if (pendingVariables && pendingVariables.requestId === data.requestId) {
        pendingVariables = null;
        closeFrame();
      }
      return;
    }

    if (data.type === "TEMPLATEIO_INSERT_ERROR") {
      if (pendingVariables && pendingVariables.requestId === data.requestId) {
        pendingVariables.submitted = false;
        setVariableBusy(false);
      }
      return;
    }

    if (data.type === "TEMPLATEIO_ESCAPE") {
      if (!refs.variables.hidden) {
        cancelVariables();
      } else {
        send("TEMPLATEIO_CLOSE", { reason: "escape", mode: overlayMode });
      }
      return;
    }

    if (data.type === "TEMPLATEIO_CLOSE") {
      closeFrame();
    }
  }

  refs.search.addEventListener("input", () => {
    selectedIndex = 0;
    renderList();
    send("TEMPLATEIO_QUERY_CHANGE", {
      query: refs.search.value,
      mode: overlayMode
    });
  });
  refs.close.addEventListener("click", () => send("TEMPLATEIO_CLOSE", { reason: "button", mode: overlayMode }));
  refs.options.addEventListener("click", () => send("TEMPLATEIO_OPEN_SETTINGS"));
  refs.footerOptions.addEventListener("click", () => send("TEMPLATEIO_OPEN_SETTINGS"));
  refs.variableForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitVariables();
  });
  refs.variableCancel.addEventListener("click", cancelVariables);
  refs.variableClose.addEventListener("click", cancelVariables);
  document.addEventListener("keydown", handleKeyDown, true);
  global.addEventListener("message", handleParentMessage, false);

  send("TEMPLATEIO_READY");
})(globalThis);
