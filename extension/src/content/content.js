(function initTemplateIoContent(global) {
  if (global.__templateIoInitialized) {
    return;
  }
  global.__templateIoInitialized = true;

  function isExtensionContextInvalidatedMessage(value) {
    const message = String(value && value.message ? value.message : value || "");
    return /Extension context invalidated|context invalidated/i.test(message);
  }

  global.addEventListener("unhandledrejection", (event) => {
    if (isExtensionContextInvalidatedMessage(event.reason)) {
      event.preventDefault();
    }
  });

  global.addEventListener("error", (event) => {
    if (isExtensionContextInvalidatedMessage(event.message || event.error)) {
      event.preventDefault();
    }
  });

  const namespace = global.TemplateIo || {};
  const editor = namespace.editorAdapter;
  const storage = namespace.storage;
  const templates = namespace.templates;
  const shortcuts = namespace.shortcuts;
  const payments = namespace.payments;
  const storageKey = namespace.constants.STORAGE_KEY;

  let statePromise = storage.getState();
  let state = null;
  let lastPageEditableElement = null;
  let lastSelection = null;
  let suppressOverlayUntil = 0;
  let expandingShortcut = false;
  let lastExpandedShortcut = null;
  let lastExpandedAt = 0;
  let lastExpandedEditor = null;
  let shortcutExpansionLock = null;
  let editorKeySequence = 0;
  let lastInsertionKey = null;
  let lastInsertionAt = 0;
  let maxProcessedSuccessUntil = 0;
  let maxProcessedSuccessKey = "";
  let maxProcessingUntil = 0;
  let maxProcessingKey = "";
  let maxCaptureActive = false;
  let maxCaptureEditor = null;
  let maxCaptureSelection = null;
  let maxCaptureStartedAt = 0;
  let maxCaptureTemplateSelected = false;
  let maxCaptureInserted = false;
  let maxCaptureShouldRestoreSlash = false;
  let variableRequestSequence = 0;
  const editorKeys = new WeakMap();
  const activeInsertionKeys = new Set();
  const pendingVariableRequests = new Map();
  const processedVariableRequests = new Set();

  const overlay = namespace.createTemplateOverlay({
    onPick: handleTemplatePick,
    onClose: handleOverlayClose,
    onQueryChange: handleOverlayQueryChange,
    onOpenOptions() {
      try {
        chrome.runtime.sendMessage({ type: "TEMPLATE_IO_OPEN_OPTIONS" });
      } catch (error) {
        if (!isExtensionContextInvalidatedMessage(error)) {
          throw error;
        }
      }
    }
  });

  statePromise
    .then((loadedState) => {
      state = loadedState;
      overlay.updateState(state);
    })
    .catch((error) => {
      if (!isExtensionContextInvalidatedMessage(error)) {
        console.warn("[TemplateX] failed to load state", error);
      }
    });

  function debug(message, details) {
    if (state && state.settings && state.settings.debugMode) {
      console.debug(`[TemplateX] ${message}`, details || "");
    }
  }

  function isMaxDebugEnabled() {
    return isMaxSite();
  }

  function ensureMaxDebugState() {
    if (!isMaxDebugEnabled()) {
      return null;
    }
    global.__templateXMaxDebug = global.__templateXMaxDebug || {
      shortcutKeydowns: 0,
      insertAttempts: 0,
      variableSubmits: 0,
      duplicateSkips: 0,
      lastEvents: []
    };
    return global.__templateXMaxDebug;
  }

  function pushMaxDebugEvent(event) {
    const debugState = ensureMaxDebugState();
    if (!debugState) {
      return;
    }
    debugState.lastEvents.push({
      time: new Date().toISOString(),
      ...event
    });
    debugState.lastEvents = debugState.lastEvents.slice(-50);
  }

  function incrementMaxDebugCounter(name) {
    const debugState = ensureMaxDebugState();
    if (!debugState) {
      return;
    }
    debugState[name] = (debugState[name] || 0) + 1;
  }

  function debugMax(message, details) {
    if (!isMaxDebugEnabled()) {
      return;
    }
    try {
      console.debug("[TemplateX][Max13]", message, details || "");
    } catch (error) {
      // Some frames can block console access during navigation.
    }
  }

  function warnMax(message, details) {
    if (!isMaxDebugEnabled()) {
      return;
    }
    try {
      console.warn("[TemplateX][Max13]", message, details || "");
    } catch (error) {
      // Some frames can block console access during navigation.
    }
  }

  function describeElement(element) {
    if (!element) {
      return null;
    }
    return {
      tag: element.tagName,
      id: element.id || "",
      className: String(element.className || ""),
      role: element.getAttribute && element.getAttribute("role"),
      contenteditable: element.getAttribute && element.getAttribute("contenteditable"),
      lexical: element.getAttribute && element.getAttribute("data-lexical-editor"),
      placeholder: element.getAttribute && (element.getAttribute("placeholder") || element.getAttribute("aria-placeholder")),
      textContent: String(element.textContent || "").slice(0, 300)
    };
  }

  const MAX_COMPOSER_SELECTOR = '[data-lexical-editor="true"][role="textbox"][contenteditable]';

  function isMaxComposerElement(element) {
    return Boolean(element && element.matches && element.matches(MAX_COMPOSER_SELECTOR));
  }

  function getMaxComposerFromEvent(event) {
    const target = event && event.target && event.target.nodeType === Node.TEXT_NODE
      ? event.target.parentElement
      : event && event.target;
    if (target && target.closest) {
      const closest = target.closest(MAX_COMPOSER_SELECTOR);
      if (closest) {
        return closest;
      }
    }
    const active = document.activeElement;
    if (isMaxComposerElement(active)) {
      return active;
    }
    return null;
  }

  function clearMaxCapture(reason) {
    if (maxCaptureActive) {
      debugMax("capture cleared", { reason });
    }
    maxCaptureActive = false;
    maxCaptureEditor = null;
    maxCaptureSelection = null;
    maxCaptureStartedAt = 0;
    maxCaptureTemplateSelected = false;
    maxCaptureShouldRestoreSlash = false;
  }

  function markMaxCaptureInserted(reason) {
    maxCaptureInserted = true;
    maxCaptureShouldRestoreSlash = false;
    clearMaxCapture(reason || "insert-success");
  }

  async function restoreLiteralSlashToMax() {
    const editable = maxCaptureEditor && document.contains(maxCaptureEditor)
      ? maxCaptureEditor
      : null;
    const selectionSnapshot = maxCaptureSelection;
    if (!editable) {
      clearMaxCapture("escape-no-editor");
      return;
    }
    debugMax("Esc restore slash", {
      editor: describeElement(editable)
    });
    pushMaxDebugEvent({
      type: "esc-restore-slash"
    });
    clearMaxCapture("escape-restore-slash");
    await editor.insertText(editable, "/", {
      maxPreCapture: true,
      source: "literalSlash",
      selectionSnapshot
    });
  }

  function getEditorKey(editable) {
    if (!editable) {
      return "none";
    }
    let key = editorKeys.get(editable);
    if (!key) {
      key = `editor-${++editorKeySequence}`;
      editorKeys.set(editable, key);
    }
    return key;
  }

  function buildInsertionKey(template, editable, context) {
    const token = context && context.removeTextBeforeInsert
      ? context.removeTextBeforeInsert
      : (context && context.removeTrigger ? state.settings.triggerText : "");
    return [
      getEditorKey(editable),
      template && template.id ? template.id : "template",
      token || "",
      context && context.fromShortcut ? "shortcut" : "direct"
    ].join(":");
  }

  function isDuplicateInsertion(insertionKey) {
    const now = Date.now();
    if (
      activeInsertionKeys.has(insertionKey) ||
      (lastInsertionKey === insertionKey && now - lastInsertionAt < 750)
    ) {
      debug("duplicate insert suppressed", { insertionKey });
      return true;
    }

    lastInsertionKey = insertionKey;
    lastInsertionAt = now;
    activeInsertionKeys.add(insertionKey);
    return false;
  }

  function releaseInsertionKey(insertionKey) {
    setTimeout(() => {
      activeInsertionKeys.delete(insertionKey);
    }, 350);
  }

  function isMaxSite() {
    const host = String(location && location.hostname || "").toLowerCase();
    return host === "web.max.ru" || host.endsWith(".max.ru");
  }

  function buildMaxInsertionSignature(template, editable, context, finalText) {
    if (context && context.lockKey) {
      return context.lockKey;
    }
    const token = (context && (context.removeTextBeforeInsert || context.tokenToReplace)) || "";
    return [
      token,
      template && template.id ? template.id : "template"
    ].join("|");
  }

  function buildMaxShortcutLockKey(shortcut, template) {
    return [
      shortcut || "",
      template && template.id ? template.id : "template"
    ].join("|");
  }

  function shouldIgnoreMaxProcessedSuccess(lockKey) {
    if (!lockKey) {
      return false;
    }
    const now = Date.now();
    if (now < maxProcessedSuccessUntil && maxProcessedSuccessKey === lockKey) {
      debug("Max processed success skip duplicate", { lockKey });
      incrementMaxDebugCounter("duplicateSkips");
      warnMax("duplicate insert skipped", {
        signature: lockKey,
        lastSignature: maxProcessedSuccessKey,
        elapsed: Date.now() - (maxProcessedSuccessUntil - 2000)
      });
      pushMaxDebugEvent({
        type: "duplicate-skip",
        signature: lockKey,
        reason: "processed-success"
      });
      return true;
    }
    return false;
  }

  function rememberMaxProcessedSuccess(lockKey) {
    if (!lockKey) {
      return;
    }
    maxProcessedSuccessKey = lockKey;
    maxProcessedSuccessUntil = Date.now() + 2000;
  }

  function isMaxProcessing(lockKey) {
    if (!lockKey) {
      return false;
    }
    if (Date.now() >= maxProcessingUntil) {
      maxProcessingKey = "";
      maxProcessingUntil = 0;
      return false;
    }
    if (maxProcessingKey === lockKey) {
      incrementMaxDebugCounter("duplicateSkips");
      warnMax("duplicate insert skipped", {
        signature: lockKey,
        lastSignature: maxProcessingKey,
        elapsed: Date.now() - (maxProcessingUntil - 2000)
      });
      pushMaxDebugEvent({
        type: "duplicate-skip",
        signature: lockKey,
        reason: "processing"
      });
      return true;
    }
    return false;
  }

  function startMaxProcessing(lockKey) {
    if (!lockKey) {
      return;
    }
    maxProcessingKey = lockKey;
    maxProcessingUntil = Date.now() + 2000;
    setTimeout(() => {
      if (maxProcessingKey === lockKey && Date.now() >= maxProcessingUntil) {
        maxProcessingKey = "";
        maxProcessingUntil = 0;
      }
    }, 2100);
  }

  function finishMaxProcessing(lockKey) {
    if (lockKey && maxProcessingKey === lockKey) {
      maxProcessingKey = "";
      maxProcessingUntil = 0;
    }
  }

  function isMaxShortcutInsertionContext(context) {
    return Boolean(
      isMaxSite() &&
      context &&
      (
        context.fromShortcut ||
        context.triggerMode === "shortcut" ||
        context.maxPreCapture ||
        context.triggerMode === "maxCommandCapture" ||
        context.removeTextBeforeInsert ||
        context.removeTrigger
      )
    );
  }

  function createVariableRequestId(template) {
    return `${template.id || "template"}:${Date.now()}:${++variableRequestSequence}`;
  }

  function rememberProcessedVariableRequest(requestId) {
    if (!requestId) {
      return;
    }
    processedVariableRequests.add(requestId);
    if (processedVariableRequests.size > 50) {
      processedVariableRequests.delete(processedVariableRequests.values().next().value);
    }
  }

  function setShortcutExpansionLock(editable, detected) {
    const lockDuration = isMaxSite() ? 2000 : 1000;
    shortcutExpansionLock = {
      editor: editable,
      shortcut: detected.shortcut,
      templateId: detected.template.id,
      startedAt: Date.now()
    };
    setTimeout(() => {
      if (
        shortcutExpansionLock &&
        shortcutExpansionLock.editor === editable &&
        shortcutExpansionLock.shortcut === detected.shortcut &&
        shortcutExpansionLock.templateId === detected.template.id
      ) {
        shortcutExpansionLock = null;
      }
    }, lockDuration);
  }

  function isShortcutExpansionLocked(editable, detected) {
    if (!shortcutExpansionLock) {
      return false;
    }
    const lockDuration = isMaxSite() ? 2000 : 1000;
    if (Date.now() - shortcutExpansionLock.startedAt > lockDuration) {
      shortcutExpansionLock = null;
      return false;
    }
    return (
      shortcutExpansionLock.editor === editable &&
      (!detected || (
        shortcutExpansionLock.shortcut === detected.shortcut &&
        shortcutExpansionLock.templateId === detected.template.id
      ))
    );
  }

  async function getFreshState() {
    state = await storage.getState();
    overlay.updateState(state);
    return state;
  }

  function rememberEditable(element) {
    if (overlay.isInsideEvent && overlay.isInsideEvent({ target: element, composedPath: () => [element] })) {
      return false;
    }

    const editable = editor.resolveEditableElement(element);
    if (!editable) {
      return false;
    }

    lastPageEditableElement = editable;
    lastSelection = editor.captureSelection(editable);
    debug("active editor changed", editable);
    return true;
  }

  function getCurrentEditable() {
    const active = overlay.isOpen() ? null : editor.resolveEditableElement(document.activeElement);
    if (active) {
      rememberEditable(active);
      return active;
    }
    if (lastPageEditableElement && document.contains(lastPageEditableElement)) {
      return lastPageEditableElement;
    }
    return null;
  }

  function findFallbackEditable() {
    const candidates = Array.from(document.querySelectorAll(
      "[contenteditable='true'], [contenteditable='plaintext-only'], [role='textbox'], [data-lexical-editor], .ProseMirror, textarea, input[type='text'], input[type='search']"
    ));

    for (const candidate of candidates) {
      if (overlay.isInsideEvent && overlay.isInsideEvent({ target: candidate, composedPath: () => [candidate] })) {
        continue;
      }
      const editable = editor.resolveEditableElement(candidate);
      if (!editable) {
        continue;
      }
      const rect = editable.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        debug("fallback editor found", editable);
        return editable;
      }
    }

    return null;
  }

  function getAnchorRect(editable) {
    return editor.getSelectionRect(editable) || (editable && editable.getBoundingClientRect());
  }

  async function openOverlay(options) {
    if (Date.now() < suppressOverlayUntil) {
      debug("overlay open suppressed", options);
      return;
    }

    const currentState = await getFreshState();
    const editable = getCurrentEditable();

    if (editable) {
      lastSelection = editor.captureSelection(editable);
    }

    overlay.open({
      state: currentState,
      removeTrigger: Boolean(options && options.removeTrigger),
      anchorRect: editable ? getAnchorRect(editable) : null
    });
    debug("overlay opened", options);

    if (!editable) {
      overlay.showToast("Сначала поставьте курсор в поле ввода", "error");
    }
  }

  async function openMaxCommandCapture(maxEditor, event) {
    const currentState = await getFreshState();
    const selectionSnapshot = editor.captureSelection(maxEditor);
    maxCaptureActive = true;
    maxCaptureEditor = maxEditor;
    maxCaptureSelection = selectionSnapshot;
    maxCaptureStartedAt = Date.now();
    maxCaptureTemplateSelected = false;
    maxCaptureInserted = false;
    maxCaptureShouldRestoreSlash = true;
    lastPageEditableElement = maxEditor;
    lastSelection = selectionSnapshot;
    suppressOverlayUntil = Date.now() + 300;
    incrementMaxDebugCounter("shortcutKeydowns");
    debugMax("pre-capture slash", {
      key: event && event.key,
      target: describeElement(event && event.target),
      active: describeElement(document.activeElement),
      editor: describeElement(maxEditor),
      time: Date.now()
    });
    pushMaxDebugEvent({
      type: "pre-capture-slash",
      key: event && event.key
    });
    overlay.open({
      state: currentState,
      removeTrigger: false,
      anchorRect: getAnchorRect(maxEditor),
      mode: "maxCommandCapture",
      initialQuery: ""
    });
  }

  function handleOverlayQueryChange(data) {
    if (!maxCaptureActive || data.mode !== "maxCommandCapture") {
      return;
    }
    debugMax("overlay query", {
      query: data.query || ""
    });
    pushMaxDebugEvent({
      type: "overlay-query",
      query: data.query || ""
    });
  }

  function handleOverlayClose(data) {
    if (!maxCaptureActive || data.mode !== "maxCommandCapture") {
      return;
    }
    if (data.reason === "escape") {
      if (!maxCaptureShouldRestoreSlash || maxCaptureTemplateSelected || maxCaptureInserted) {
        debugMax("Esc close without slash restore", {
          templateSelected: maxCaptureTemplateSelected,
          inserted: maxCaptureInserted
        });
        clearMaxCapture("escape-no-restore");
        return;
      }
      restoreLiteralSlashToMax().catch((error) => {
        warnMax("Esc restore slash failed", {
          reason: error && error.message
        });
        clearMaxCapture("escape-restore-error");
      });
      return;
    }
    clearMaxCapture(data.reason || "overlay-close");
  }

  function customVariablesForTemplate(template) {
    return templates
      .extractVariables(template.body)
      .filter((name) => !templates.isSystemVariable(name));
  }

  function detectShortcutBeforeCursor(editable) {
    if (!state || !state.settings || !state.settings.enableShortcutExpansion) {
      return null;
    }

    const beforeCaret = editor.getTextBeforeCaret(editable);
    const match = beforeCaret.match(/(^|[\s\r\n])(\S+)$/u);
    if (!match) {
      return null;
    }

    const token = match[2];
    const template = state.templates.find((item) => String(item.shortcut || "").trim() === token);
    if (!template) {
      return null;
    }

    return {
      template,
      shortcut: token
    };
  }

  async function expandShortcut(editable, detected) {
    const now = Date.now();
    const maxLockKey = isMaxSite() ? buildMaxShortcutLockKey(detected.shortcut, detected.template) : "";
    if (
      expandingShortcut ||
      (
        lastExpandedShortcut === detected.shortcut &&
        lastExpandedEditor === editable &&
        now - lastExpandedAt < 1000
      ) ||
      isShortcutExpansionLocked(editable, detected) ||
      isMaxProcessing(maxLockKey)
    ) {
      debug("shortcut duplicate suppressed", detected.shortcut);
      return;
    }

    if (maxLockKey) {
      startMaxProcessing(maxLockKey);
    }
    expandingShortcut = true;
    suppressOverlayUntil = now + 1100;
    lastExpandedShortcut = detected.shortcut;
    lastExpandedAt = now;
    lastExpandedEditor = editable;
    setShortcutExpansionLock(editable, detected);
    const selectionSnapshot = editor.captureSelection(editable);
    lastPageEditableElement = editable;
    lastSelection = selectionSnapshot;
    debug("shortcut detected", detected.shortcut);
    if (isMaxSite()) {
      debugMax("shortcut processing start", {
        shortcut: detected.shortcut,
        templateId: detected.template && detected.template.id,
        lockKey: maxLockKey
      });
    }

    try {
      await handleTemplatePick(detected.template, {
        editable,
        fromShortcut: true,
        removeTextBeforeInsert: detected.shortcut,
        selectionSnapshot,
        lockKey: maxLockKey
      });
    } finally {
      finishMaxProcessing(maxLockKey);
      suppressOverlayUntil = Date.now() + 1100;
      setTimeout(() => {
        expandingShortcut = false;
      }, 1000);
    }
  }

  async function enrichPaymentValues(template, values) {
    const variables = templates.extractVariables(template.body);
    const hasPaymentLink = variables.includes("payment_link");
    const settings = state.settings || {};

    if (!hasPaymentLink || values.payment_link) {
      return values;
    }

    if (settings.paymentProvider === "manual" && !settings.paymentDevMode) {
      return values;
    }

    const paymentLink = await payments.createPaymentLink(
      {
        amount: values.amount || 0,
        description: template.title,
        clientName: values.client_name || values.name || "",
        manualPaymentLink: values.payment_link || "",
        metadata: {
          templateId: template.id
        }
      },
      settings
    );

    return {
      ...values,
      payment_link: paymentLink
    };
  }

  async function insertResolvedTemplate({ template, values: rawValues, context, source }) {
    const editable = (context && context.editable && document.contains(context.editable))
      ? context.editable
      : (getCurrentEditable() || findFallbackEditable());
    if (!editable) {
      overlay.showToast("Сначала поставьте курсор в поле ввода", "error");
      return { ok: false, reason: "no-editor" };
    }

    const insertionKey = buildInsertionKey(template, editable, context || {});
    if (isDuplicateInsertion(insertionKey)) {
      return { ok: false, reason: "duplicate" };
    }

    try {
    let values = rawValues || {};
    try {
      values = await enrichPaymentValues(template, values);
    } catch (error) {
      overlay.showToast(error.message || "Не удалось создать ссылку на оплату", "error");
      return { ok: false, reason: "payment-error", error };
    }

    const renderedText = templates
      .resolveTemplateBody(template.body, values, state)
      .replace(/{{\s*[^}]+\s*}}/g, "");
    debug("resolved final text", {
      requestId: context && context.requestId,
      templateId: template.id,
      hasPlaceholders: /{{\s*[^}]+\s*}}/.test(renderedText),
      finalTextLength: renderedText.length
    });
    const isMaxShortcutInsert = isMaxShortcutInsertionContext(context);
    const maxLockKey = isMaxShortcutInsert
      ? buildMaxInsertionSignature(template, editable, context, renderedText)
      : "";
    if (shouldIgnoreMaxProcessedSuccess(maxLockKey)) {
      return { ok: true, ignored: true, method: "max-success-lock" };
    }
    debug("inserting resolved template", { templateId: template.id, source, context });
    const result = await editor.insertText(editable, renderedText, {
      removeTrigger: Boolean(context && context.removeTrigger && !context.maxPreCapture),
      triggerText: state.settings.triggerText,
      removeTextBeforeInsert: context && !context.maxPreCapture ? context.removeTextBeforeInsert : "",
      requireTokenReplacement: Boolean(context && !context.maxPreCapture && (context.removeTextBeforeInsert || context.removeTrigger)),
      selectionSnapshot: (context && context.selectionSnapshot) || lastSelection,
      templateId: template && template.id,
      maxPreCapture: Boolean(context && context.maxPreCapture),
      source: isMaxShortcutInsert
        ? (context && context.maxPreCapture ? "maxCommandCapture" : ((context && context.triggerMode) || (context && context.fromShortcut ? "shortcut" : source)))
        : source
    });

    if (result.ok) {
      rememberMaxProcessedSuccess(maxLockKey);
      suppressOverlayUntil = Date.now() + 1100;
      overlay.close();
      debug("insert success", { templateId: template.id });
      if (isMaxShortcutInsert) {
        debugMax("insert success, closing overlay/modal", {
          method: result.method,
          finalTextLength: renderedText.length,
          afterText: result.newText || result.textContent || ""
        });
        pushMaxDebugEvent({
          type: "content-insert-success",
          method: result.method,
          templateId: template && template.id,
          finalTextLength: renderedText.length
        });
      }
      if (context && context.maxPreCapture) {
        markMaxCaptureInserted("insert-success");
      }
      overlay.showToast("Шаблон вставлен");
      return { ok: true, result };
    }

    if (isMaxShortcutInsert) {
      debug("Max insert failed without clipboard fallback", result);
      warnMax("insert failed", {
        reason: result.reason || "max-insert-failed",
        currentText: result.newText || "",
        replacementText: renderedText,
        source,
        tokenToReplace: context && (context.removeTextBeforeInsert || context.tokenToReplace)
      });
      pushMaxDebugEvent({
        type: "content-insert-failed",
        reason: result.reason || "max-insert-failed",
        templateId: template && template.id
      });
      overlay.showToast("Max: \u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0442\u0435\u043a\u0441\u0442", "error");
      return { ok: false, reason: result.reason || "max-insert-failed", result };
    }

    if (state.settings.fallbackToClipboard && result.reason !== "token-replacement-failed") {
      try {
        debug("insert fail", result);
        await editor.copyToClipboard(renderedText);
        suppressOverlayUntil = Date.now() + 1100;
        overlay.close();
        debug("fallback used", { templateId: template.id });
        overlay.showToast("Текст скопирован, нажмите Ctrl+V");
        return { ok: true, copied: true, result };
      } catch (error) {
        overlay.showToast("Не удалось вставить или скопировать текст", "error");
        return { ok: false, reason: "clipboard-error", error };
      }
    }

    debug("insert fail", result);
    overlay.showToast("Не удалось вставить текст в это поле", "error");
    return { ok: false, reason: result.reason || "insert-failed", result };
    } finally {
      releaseInsertionKey(insertionKey);
    }
  }

  async function handleVariablesSubmit(requestId, values) {
    debug("received variables submit", { requestId, values: values || {} });
    const pending = pendingVariableRequests.get(requestId);
    if (isMaxSite()) {
      incrementMaxDebugCounter("variableSubmits");
      debugMax("variables submit received", {
        requestId,
        templateId: pending && pending.template && pending.template.id,
        values: values || {},
        pendingExists: Boolean(pending),
        tokenToReplace: pending && pending.context && pending.context.tokenToReplace,
        source: pending && pending.context && pending.context.triggerMode
      });
      pushMaxDebugEvent({
        type: "variables-submit",
        requestId,
        templateId: pending && pending.template && pending.template.id,
        pendingExists: Boolean(pending)
      });
    }
    if (!pending || processedVariableRequests.has(requestId)) {
      debug("stale variables submit ignored", { requestId });
      return;
    }

    const insertResult = await insertResolvedTemplate({
      template: pending.template,
      values: values || {},
      context: {
        ...pending.context,
        variablesAlreadyResolved: true
      },
      source: "variables"
    });
    if (!insertResult || !insertResult.ok) {
      throw new Error(insertResult && insertResult.reason ? insertResult.reason : "insert-failed");
    }

    rememberProcessedVariableRequest(requestId);
    pendingVariableRequests.delete(requestId);
    debug("pending cleared", { requestId });
  }

  async function handleTemplatePick(template, context) {
    const currentState = await getFreshState();
    state = currentState;
    let pickContext = context || {};
    if (isMaxSite() && maxCaptureActive && !pickContext.maxPreCapture) {
      const editable = maxCaptureEditor && document.contains(maxCaptureEditor)
        ? maxCaptureEditor
        : getCurrentEditable();
      maxCaptureTemplateSelected = true;
      maxCaptureShouldRestoreSlash = false;
      debugMax("template selected", {
        templateId: template && template.id,
        title: template && template.title,
        editor: describeElement(editable)
      });
      pushMaxDebugEvent({
        type: "template-selected",
        templateId: template && template.id
      });
      pickContext = {
        ...pickContext,
        editable,
        selectionSnapshot: maxCaptureSelection || lastSelection,
        maxPreCapture: true,
        maxCommandCapture: true,
        triggerMode: "maxCommandCapture",
        removeTrigger: false,
        removeTextBeforeInsert: "",
        tokenToReplace: null
      };
    }
    const variableNames = customVariablesForTemplate(template);

    if (variableNames.length > 0) {
      const insertionContext = {
        ...pickContext,
        editable: (pickContext && pickContext.editable && document.contains(pickContext.editable))
          ? pickContext.editable
          : getCurrentEditable(),
        selectionSnapshot: (pickContext && pickContext.selectionSnapshot) || lastSelection
      };

      debug("activeElement before modal", document.activeElement);
      if (insertionContext.editable && typeof insertionContext.editable.blur === "function") {
        debug("blurring page editor before modal", insertionContext.editable);
        insertionContext.editable.blur();
      }

      if (!overlay.isOpen()) {
        if (insertionContext.fromShortcut && typeof overlay.openModalHost === "function") {
          overlay.openModalHost({ state: currentState, removeTrigger: false });
        } else {
          await openOverlay({ removeTrigger: Boolean(context && context.removeTrigger) });
        }
      }
      const requestId = createVariableRequestId(template);
      const pendingContext = {
        ...insertionContext,
        requestId,
        templateId: template.id,
        triggerMode: insertionContext.maxPreCapture
          ? "maxCommandCapture"
          : (insertionContext.fromShortcut
          ? "shortcut"
          : (insertionContext.removeTrigger ? "slashTrigger" : "overlayDirect")),
        tokenToReplace: insertionContext.removeTextBeforeInsert || (insertionContext.removeTrigger ? currentState.settings.triggerText : null),
        lockKey: isMaxSite() && (insertionContext.fromShortcut || insertionContext.maxPreCapture)
          ? `${insertionContext.removeTextBeforeInsert || ""}|${template.id || "template"}`
          : ""
      };
      if (isMaxSite()) {
        debugMax("pending variable context created", {
          requestId,
          templateId: template && template.id,
          tokenToReplace: pendingContext.tokenToReplace,
          source: pendingContext.triggerMode,
          editor: describeElement(insertionContext.editable),
          currentText: editor.getText(insertionContext.editable)
        });
        pushMaxDebugEvent({
          type: "pending-variable-context",
          requestId,
          templateId: template && template.id,
          tokenToReplace: pendingContext.tokenToReplace,
          source: pendingContext.triggerMode
        });
      }
      pendingVariableRequests.set(requestId, {
        template,
        context: pendingContext
      });
      debug("variables form opened", { requestId, templateId: template.id, fields: variableNames });
      overlay.showVariables(template, variableNames, {}, async (values, meta) => {
        await handleVariablesSubmit((meta && meta.requestId) || requestId, values);
      }, () => {
        pendingVariableRequests.delete(requestId);
      }, { requestId });
      setTimeout(() => {
        debug("activeElement after modal focus", document.activeElement);
      }, 80);
      return;
    }

    await insertResolvedTemplate({
      template,
      values: {},
      context: pickContext,
      source: pickContext && pickContext.fromShortcut ? "shortcut" : "direct"
    });
  }

  function handleMaxPreCaptureKeydown(event) {
    if (!isMaxSite()) {
      return;
    }
    if (overlay.isInsideEvent && overlay.isInsideEvent(event)) {
      return;
    }
    if (overlay.isOpen() || (overlay.isModalOpen && overlay.isModalOpen())) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key !== "/") {
      return;
    }
    const maxEditor = getMaxComposerFromEvent(event);
    if (!maxEditor) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }

    openMaxCommandCapture(maxEditor, event).catch((error) => {
      warnMax("pre-capture open failed", {
        reason: error && error.message
      });
      clearMaxCapture("open-error");
    });
  }

  function handleInput(event) {
    if (overlay.isInsideEvent && overlay.isInsideEvent(event)) {
      return;
    }

    if (overlay.isModalOpen && overlay.isModalOpen()) {
      debug("page input suppressed while modal open", event.target);
      return;
    }

    if (Date.now() < suppressOverlayUntil || expandingShortcut) {
      debug("input trigger suppressed", event.type);
      return;
    }

    if (isMaxSite()) {
      return;
    }

    const editable = editor.resolveEditableElement(event.target);
    if (!editable || overlay.isOpen()) {
      return;
    }
    if (isShortcutExpansionLocked(editable)) {
      debug("input ignored during shortcut lock", event.type);
      return;
    }

    rememberEditable(editable);
    const currentSettings = state && state.settings;
    if (!currentSettings || !currentSettings.enableSlashTrigger || !currentSettings.triggerText) {
      return;
    }

    const beforeCaret = editor.getTextBeforeCaret(editable);
    if (beforeCaret.endsWith(currentSettings.triggerText)) {
      debug("trigger detected", currentSettings.triggerText);
      openOverlay({ removeTrigger: true });
    }
  }

  function handleFocus(event) {
    if (overlay.isInsideEvent && overlay.isInsideEvent(event)) {
      return;
    }
    if (overlay.isModalOpen && overlay.isModalOpen()) {
      return;
    }
    rememberEditable(event.target);
  }

  function handlePointerDown(event) {
    if (overlay.isInsideEvent && overlay.isInsideEvent(event)) {
      return;
    }
    if (overlay.isModalOpen && overlay.isModalOpen()) {
      return;
    }
    rememberEditable(event.target);
  }

  function handleSelectionChange() {
    if (overlay.isOpen()) {
      return;
    }
    const editable = editor.resolveEditableElement(document.activeElement);
    if (editable) {
      rememberEditable(editable);
    }
  }

  function handleKeyDown(event) {
    if (overlay.isModalOpen && overlay.isModalOpen()) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) {
        event.stopImmediatePropagation();
      }
      if (event.key === "Escape") {
        overlay.handleEscape();
      }
      debug("page keydown suppressed while modal open", event.target);
      return;
    }

    if (overlay.isOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) {
          event.stopImmediatePropagation();
        }
        overlay.handleEscape();
      }
      return;
    }

    const editable = getCurrentEditable();
    if (editable) {
      rememberEditable(editable);
    }

    if (
      state &&
      state.settings &&
      !isMaxSite() &&
      [" ", "Enter", "Tab"].includes(event.key) &&
      editable
    ) {
      const detected = detectShortcutBeforeCursor(editable);
      if (detected) {
        if (isMaxSite()) {
          incrementMaxDebugCounter("shortcutKeydowns");
          debugMax("shortcut keydown detected", {
            shortcut: detected.shortcut,
            templateId: detected.template && detected.template.id,
            key: event.key,
            target: describeElement(event.target),
            active: describeElement(document.activeElement),
            time: Date.now()
          });
          pushMaxDebugEvent({
            type: "shortcut-keydown",
            shortcut: detected.shortcut,
            templateId: detected.template && detected.template.id,
            key: event.key
          });
        }
        suppressOverlayUntil = Date.now() + 1100;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) {
          event.stopImmediatePropagation();
        }
        expandShortcut(editable, detected);
        return;
      }
    }

    if (!state || !state.settings || !shortcuts.isHotkeyEvent(event, state.settings.hotkey)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openOverlay({ removeTrigger: false });
  }

  function findTemplateById(templateId) {
    return state && state.templates.find((template) => template.id === templateId);
  }

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }

    if (message.type === "TEMPLATE_IO_OPEN_OVERLAY") {
      openOverlay({ removeTrigger: false }).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message.type === "TEMPLATE_IO_INSERT_TEMPLATE") {
      getFreshState()
        .then(() => {
          const template = findTemplateById(message.templateId);
          if (!template) {
            overlay.showToast("Шаблон не найден", "error");
            return null;
          }
          return handleTemplatePick(template, { removeTrigger: false });
        })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
    });
  } catch (error) {
    if (!isExtensionContextInvalidatedMessage(error)) {
      console.warn("[TemplateX] failed to subscribe to runtime messages", error);
    }
  }

  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[storageKey]) {
          return;
        }
        state = changes[storageKey].newValue;
        overlay.updateState(state);
      });
    }
  } catch (error) {
    if (!isExtensionContextInvalidatedMessage(error)) {
      console.warn("[TemplateX] failed to subscribe to storage changes", error);
    }
  }

  document.addEventListener("focusin", handleFocus, true);
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("mousedown", handlePointerDown, true);
  document.addEventListener("input", handleInput, true);
  document.addEventListener("selectionchange", handleSelectionChange, true);
  document.addEventListener("keydown", handleMaxPreCaptureKeydown, true);
  document.addEventListener("keydown", handleKeyDown, true);
})(globalThis);
