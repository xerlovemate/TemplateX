(function initTemplateIoEditorAdapter(global) {
  const namespace = global.TemplateIo || {};

  const TEXT_INPUT_TYPES = new Set([
    "email",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "url"
  ]);
  const EDITABLE_SELECTOR = [
    "input",
    "textarea",
    "[contenteditable]",
    "[role='textbox']",
    "[data-lexical-editor]",
    ".ProseMirror"
  ].join(",");
  const MAX_LEXICAL_SELECTOR = '[data-lexical-editor="true"][role="textbox"][contenteditable]';
  const MAX_MESSAGE_PLACEHOLDER = "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435";

  function isInputElement(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  }

  function isEditableElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    if (element instanceof HTMLTextAreaElement) {
      return !element.disabled && !element.readOnly;
    }

    if (element instanceof HTMLInputElement) {
      const type = String(element.type || "text").toLowerCase();
      return TEXT_INPUT_TYPES.has(type) && !element.disabled && !element.readOnly;
    }

    if (element.isContentEditable || element.getAttribute("contenteditable") === "plaintext-only") {
      return true;
    }

    if (element.getAttribute("role") === "textbox" && element.getAttribute("aria-readonly") !== "true") {
      return true;
    }

    return Boolean(element.matches && element.matches("[data-lexical-editor], .ProseMirror"));
  }

  function resolveEditableElement(element) {
    if (!element) {
      return null;
    }

    const current = element.nodeType === Node.TEXT_NODE ? element.parentElement : element;
    if (!current || current.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    if (isEditableElement(current)) {
      if (!isInputElement(current)) {
        return current.closest("[contenteditable], [role='textbox'], [data-lexical-editor], .ProseMirror") || current;
      }
      return current;
    }

    const editable = current.closest && current.closest(EDITABLE_SELECTOR);
    return isEditableElement(editable) ? editable : null;
  }

  function getText(element) {
    const target = resolveEditableElement(element);
    if (!target) {
      return "";
    }
    if (isInputElement(target)) {
      return target.value || "";
    }
    return target.innerText || target.textContent || "";
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function waitForEditorFlush() {
    return new Promise((resolve) => {
      global.setTimeout(resolve, 20);
    });
  }

  function waitForMaxCheck(delay) {
    return new Promise((resolve) => {
      global.setTimeout(resolve, delay);
    });
  }

  function getHostname() {
    try {
      return String(global.location && global.location.hostname || "").toLowerCase();
    } catch (error) {
      return "";
    }
  }

  function isMaxHost() {
    const host = getHostname();
    return host === "web.max.ru" || host.endsWith(".max.ru");
  }

  function isMaxLexicalEditor(element) {
    return Boolean(element && element.matches && element.matches(MAX_LEXICAL_SELECTOR));
  }

  function getMaxComposerEditor(candidate) {
    const direct = resolveEditableElement(candidate);
    if (isMaxLexicalEditor(direct)) {
      debugStrategy("Max editor detected", { method: "candidate" });
      return direct;
    }

    const active = document.activeElement;
    if (isMaxLexicalEditor(active)) {
      debugStrategy("Max editor detected", { method: "activeElement" });
      return active;
    }

    const fromComposer = document.querySelector(`[data-testid="composer"] ${MAX_LEXICAL_SELECTOR}`);
    if (fromComposer) {
      debugStrategy("Max editor detected", { method: "composer-selector" });
      return fromComposer;
    }

    const editors = Array.from(document.querySelectorAll(MAX_LEXICAL_SELECTOR));
    const byPlaceholder = editors.find((element) =>
      element.getAttribute("placeholder") === MAX_MESSAGE_PLACEHOLDER ||
      element.getAttribute("aria-placeholder") === MAX_MESSAGE_PLACEHOLDER ||
      element.getAttribute("placeholder") === "Сообщение" ||
      element.getAttribute("aria-placeholder") === "Сообщение" ||
      element.getAttribute("placeholder") === "РЎРѕРѕР±С‰РµРЅРёРµ" ||
      element.getAttribute("aria-placeholder") === "РЎРѕРѕР±С‰РµРЅРёРµ"
    );
    if (byPlaceholder || editors[0]) {
      debugStrategy("Max editor detected", { method: byPlaceholder ? "placeholder" : "first-lexical" });
      return byPlaceholder || editors[0];
    }

    debugStrategy("Max editor detected", { method: "not-found", found: false });
    return null;
  }

  function isYandexMailHost() {
    const host = getHostname();
    return (
      host === "mail.yandex.ru" ||
      host === "mail.yandex.com" ||
      host === "mail.ya.ru" ||
      host.endsWith(".mail.yandex.ru") ||
      host.endsWith(".mail.yandex.com")
    );
  }

  function yandexDebug(message, details) {
    if (!isYandexMailHost()) {
      return;
    }
    try {
      console.debug("[TemplateX][Yandex]", message, details || "");
    } catch (error) {
      // Some frames can block console access during navigation.
    }
  }

  function createYandexCaretMarker() {
    const marker = document.createElement("span");
    marker.setAttribute("data-templatex-caret-marker", "true");
    marker.textContent = "\u200b";
    return marker;
  }

  function placeCaretAfterMarker(marker) {
    if (!marker || !marker.parentNode) {
      return false;
    }
    const doc = marker.ownerDocument || document;
    const win = doc.defaultView || global;
    const range = doc.createRange();
    range.setStartAfter(marker);
    range.collapse(true);
    const selection = win.getSelection && win.getSelection();
    if (!selection) {
      marker.remove();
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    marker.remove();
    yandexDebug("caret after inserted template done");
    return true;
  }

  function appendTextWithCaretMarker(element, text, caretOffset) {
    const value = String(text || "");
    const marker = createYandexCaretMarker();
    const targetOffset = Math.max(0, Math.min(Number(caretOffset) || 0, value.length));
    let offset = 0;
    let markerInserted = false;

    function insertMarkerIfNeeded() {
      if (!markerInserted && offset >= targetOffset) {
        element.append(marker);
        markerInserted = true;
        yandexDebug("caret marker placed", { caretOffset: targetOffset });
      }
    }

    const lines = value.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) {
        insertMarkerIfNeeded();
        element.append(document.createElement("br"));
        offset += 1;
      }

      if (!line) {
        insertMarkerIfNeeded();
        return;
      }

      const nextOffset = offset + line.length;
      if (!markerInserted && targetOffset > offset && targetOffset < nextOffset) {
        const before = line.slice(0, targetOffset - offset);
        const after = line.slice(targetOffset - offset);
        element.append(document.createTextNode(before));
        offset += before.length;
        insertMarkerIfNeeded();
        element.append(document.createTextNode(after));
        offset += after.length;
        return;
      }

      insertMarkerIfNeeded();
      element.append(document.createTextNode(line));
      offset = nextOffset;
    });

    insertMarkerIfNeeded();
    return marker;
  }

  function debugStrategy(message, details) {
    try {
      console.debug(`[TemplateX] ${message}`, details || "");
    } catch (error) {
      // Some frames can block console access during navigation.
    }
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function dispatchBeforeInput(element, data, inputType) {
    try {
      const event = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        composed: true,
        data,
        inputType: inputType || "insertText"
      });
      element.dispatchEvent(event);
      return !event.defaultPrevented;
    } catch (error) {
      element.dispatchEvent(new Event("beforeinput", { bubbles: true, cancelable: true, composed: true }));
      return true;
    }
  }

  function dispatchInputEvents(element, data, inputType) {
    try {
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          data,
          inputType: inputType || "insertText"
        })
      );
    } catch (error) {
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    try {
      element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, composed: true, data: "" }));
    } catch (error) {
      element.dispatchEvent(new Event("compositionend", { bubbles: true, composed: true }));
    }
  }

  function setPlainTextForEditable(element, text, data, inputType, options) {
    const value = String(text || "");
    const hasCaretOffset = options && Number.isFinite(options.caretOffset);
    const caretOffset = hasCaretOffset
      ? Math.max(0, Math.min(options.caretOffset, value.length))
      : value.length;

    if (isInputElement(element)) {
      setNativeValue(element, value);
      try {
        element.setSelectionRange(caretOffset, caretOffset);
      } catch (error) {
        // Some input types reject selection APIs.
      }
      return true;
    }

    element.replaceChildren();
    if (hasCaretOffset && isYandexMailHost()) {
      const marker = appendTextWithCaretMarker(element, value, caretOffset);
      return placeCaretAfterMarker(marker);
    }

    const lines = value.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) {
        element.append(document.createElement("br"));
      }
      element.append(document.createTextNode(line));
    });
    placeCaretAtEnd(element);
    return true;
  }

  function getMaxPlainText(editor) {
    return String((editor && (editor.innerText || editor.textContent)) || "");
  }

  function normalizeForMaxVerify(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeMaxVerifyChunk(value) {
    return normalizeForMaxVerify(value)
      .replace(/[^\p{L}\p{N}\s.,!?-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getMeaningfulMaxVerifyChunks(finalText) {
    const normalized = normalizeMaxVerifyChunk(finalText);
    const chunks = [];

    if (normalized.length >= 8) {
      chunks.push(normalized.slice(0, Math.min(40, normalized.length)));
    }

    for (const part of normalized.split(/[.!?\n]/).map((item) => item.trim()).filter(Boolean)) {
      if (part.length >= 8) {
        chunks.push(part.slice(0, Math.min(40, part.length)));
      }
    }

    const fallback = normalizeForMaxVerify(finalText);
    if (!chunks.length && fallback) {
      chunks.push(fallback.slice(0, Math.min(40, fallback.length)));
    }

    return Array.from(new Set(chunks));
  }

  function verifyMaxInserted(editor, finalText) {
    const textContent = String((editor && editor.textContent) || "");
    const innerText = String((editor && editor.innerText) || "");
    const html = String((editor && editor.innerHTML) || "");
    const chunks = getMeaningfulMaxVerifyChunks(finalText);
    const candidates = [
      normalizeMaxVerifyChunk(textContent),
      normalizeMaxVerifyChunk(innerText),
      normalizeForMaxVerify(textContent),
      normalizeForMaxVerify(innerText)
    ].filter(Boolean);
    const success = chunks.length === 0
      ? String(finalText || "") === ""
      : chunks.some((chunk) => {
        const normalizedChunk = normalizeMaxVerifyChunk(chunk) || normalizeForMaxVerify(chunk);
        return Boolean(normalizedChunk && candidates.some((candidate) => candidate.includes(normalizedChunk)));
      });

    return {
      success,
      chunks,
      currentText: normalizeForMaxVerify(textContent),
      innerText: normalizeForMaxVerify(innerText),
      htmlSlice: html.slice(0, 500)
    };
  }

  function isMaxDebugEnabled() {
    return isMaxHost();
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

  function maxDebug(...args) {
    if (!isMaxDebugEnabled()) {
      return;
    }
    try {
      console.debug("[TemplateX][Max13]", ...args);
    } catch (error) {
      // Some frames can block console access during navigation.
    }
  }

  function maxWarn(...args) {
    if (!isMaxDebugEnabled()) {
      return;
    }
    try {
      console.warn("[TemplateX][Max13]", ...args);
    } catch (error) {
      // Some frames can block console access during navigation.
    }
  }

  function max15Debug(...args) {
    if (!isMaxDebugEnabled()) {
      return;
    }
    try {
      console.debug("[TemplateX][Max15]", ...args);
    } catch (error) {
      // Some frames can block console access during navigation.
    }
  }

  function max15Warn(...args) {
    if (!isMaxDebugEnabled()) {
      return;
    }
    try {
      console.warn("[TemplateX][Max15]", ...args);
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

  function describeSelection() {
    const selection = global.getSelection && global.getSelection();
    if (!selection) {
      return null;
    }
    return {
      rangeCount: selection.rangeCount,
      anchorNode: selection.anchorNode && selection.anchorNode.nodeName,
      anchorText: selection.anchorNode && selection.anchorNode.textContent,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode && selection.focusNode.nodeName,
      focusText: selection.focusNode && selection.focusNode.textContent,
      focusOffset: selection.focusOffset
    };
  }

  function normalizeMaxPreserveNewlines(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getMaxMultilineLines(finalText) {
    return String(finalText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  }

  function buildMaxMultilineHtml(finalText) {
    return getMaxMultilineLines(finalText)
      .map((line) => `<p>${line ? escapeHtml(line) : "<br>"}</p>`)
      .join("");
  }

  function createMaxClipboardData(finalText, html) {
    const text = String(finalText || "");
    try {
      const data = new global.DataTransfer();
      data.setData("text/plain", text);
      if (html) {
        data.setData("text/html", html);
      }
      return data;
    } catch (error) {
      const store = {};
      return {
        setData(type, value) {
          store[type] = String(value || "");
        },
        getData(type) {
          return store[type] || "";
        },
        clearData(type) {
          if (type) {
            delete store[type];
          } else {
            Object.keys(store).forEach((key) => delete store[key]);
          }
        },
        get types() {
          return Object.keys(store);
        },
        files: []
      };
    }
  }

  function dispatchMaxPaste(editor, finalText, html) {
    const clipboardData = createMaxClipboardData(finalText, html);
    if (!clipboardData.getData("text/plain")) {
      clipboardData.setData("text/plain", String(finalText || ""));
    }
    if (html && !clipboardData.getData("text/html")) {
      clipboardData.setData("text/html", html);
    }

    let event = null;
    try {
      event = new global.ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData
      });
    } catch (error) {
      event = null;
    }

    if (!event || !event.clipboardData) {
      event = new global.Event("paste", {
        bubbles: true,
        cancelable: true,
        composed: true
      });
    }

    try {
      Object.defineProperty(event, "clipboardData", {
        value: clipboardData,
        configurable: true
      });
    } catch (error) {
      // ClipboardEvent may already expose clipboardData.
    }

    return editor.dispatchEvent(event);
  }

  function verifyMaxMultilineInserted(editor, finalText) {
    const textContent = String((editor && editor.textContent) || "");
    const innerText = String((editor && editor.innerText) || "");
    const html = String((editor && editor.innerHTML) || "");
    const currentText = normalizeMaxVerifyChunk(textContent);
    const currentInner = normalizeMaxPreserveNewlines(innerText);
    const currentInnerFlat = normalizeMaxVerifyChunk(currentInner);
    const lines = getMaxMultilineLines(finalText)
      .map((line) => normalizeMaxVerifyChunk(line))
      .filter((line) => line.length >= 3);
    const uniqueLines = Array.from(new Set(lines));
    const lineMatches = uniqueLines.map((line) => {
      const chunk = line.slice(0, Math.min(40, line.length));
      return {
        line,
        chunk,
        present: Boolean(chunk && (currentText.includes(chunk) || currentInnerFlat.includes(chunk)))
      };
    });
    const allLinesPresent = lineMatches.every((match) => match.present);
    const anyLinePresent = lineMatches.some((match) => match.present);
    const hasLineBreaks = Boolean(
      uniqueLines.length <= 1 ||
      /\n\s*\d+\./.test(currentInner) ||
      /1\.\s*\S[\s\S]*\n[\s\S]*2\.\s*\S/.test(currentInner) ||
      lineMatches.slice(1).some((match) => match.chunk && currentInner.includes(`\n${match.chunk}`))
    );

    return {
      success: Boolean(allLinesPresent && hasLineBreaks),
      allLinesPresent,
      anyLinePresent,
      hasLineBreaks,
      lines: uniqueLines,
      lineMatches,
      currentText: normalizeForMaxVerify(textContent),
      innerText: currentInner,
      htmlSlice: html.slice(0, 500)
    };
  }

  async function undoFailedMaxMultilinePaste(editor, selectionSnapshot) {
    let undoOk = false;
    try {
      undoOk = Boolean(document.execCommand && document.execCommand("undo", false, null));
    } catch (error) {
      undoOk = false;
    }
    await waitForMaxCheck(50);
    editor.focus();
    if (selectionSnapshot) {
      restoreSelection(selectionSnapshot);
    } else {
      placeCaretAtEnd(editor);
    }
    max15Debug("multiline paste undo before html fallback", {
      undoOk,
      selection: describeSelection()
    });
    return undoOk;
  }

  async function insertMaxMultilineViaPaste(editor, finalText) {
    const html = buildMaxMultilineHtml(finalText);
    const lines = getMaxMultilineLines(finalText);
    max15Debug("multiline paste start", {
      finalText,
      lines
    });
    const pasteResult = dispatchMaxPaste(editor, finalText, html);
    await waitForMaxCheck(150);
    const verification = verifyMaxMultilineInserted(editor, finalText);
    max15Debug("multiline paste result", {
      pasteResult,
      textContent: verification.currentText,
      innerText: verification.innerText,
      ok: verification.success,
      allLinesPresent: verification.allLinesPresent,
      hasLineBreaks: verification.hasLineBreaks,
      lines: verification.lines
    });
    return {
      ok: verification.success,
      method: "max-paste-multiline",
      pasteResult,
      verification
    };
  }

  async function insertMaxMultilineViaHtml(editor, finalText) {
    const html = buildMaxMultilineHtml(finalText);
    max15Debug("multiline html fallback start");
    let commandOk = false;
    try {
      commandOk = Boolean(document.execCommand && document.execCommand("insertHTML", false, html));
    } catch (error) {
      commandOk = false;
    }
    await waitForMaxCheck(150);
    const verification = verifyMaxMultilineInserted(editor, finalText);
    max15Debug("multiline html fallback result", {
      commandOk,
      ok: verification.success,
      textContent: verification.currentText,
      innerText: verification.innerText,
      allLinesPresent: verification.allLinesPresent,
      hasLineBreaks: verification.hasLineBreaks
    });
    return {
      ok: verification.success,
      method: "max-insertHTML-multiline",
      commandOk,
      verification
    };
  }

  async function insertMaxMultilineWithFallback(editor, finalText, selectionSnapshot) {
    const pasted = await insertMaxMultilineViaPaste(editor, finalText);
    if (pasted.ok) {
      max15Debug("multiline inserted success", {
        method: pasted.method,
        textContent: pasted.verification.currentText,
        innerText: pasted.verification.innerText
      });
      return pasted;
    }

    if (pasted.verification && pasted.verification.anyLinePresent) {
      await undoFailedMaxMultilinePaste(editor, selectionSnapshot);
    }

    const htmlInserted = await insertMaxMultilineViaHtml(editor, finalText);
    if (htmlInserted.ok) {
      max15Debug("multiline inserted success", {
        method: htmlInserted.method,
        textContent: htmlInserted.verification.currentText,
        innerText: htmlInserted.verification.innerText
      });
      return htmlInserted;
    }

    max15Warn("multiline insert failed", {
      finalText,
      textContent: htmlInserted.verification.currentText,
      innerText: htmlInserted.verification.innerText,
      htmlSlice: htmlInserted.verification.htmlSlice
    });
    return htmlInserted;
  }

  async function insertMaxPreCapturedText({ editor, finalText, source, selectionSnapshot, templateId }) {
    const maxEditor = getMaxComposerEditor(editor);
    const text = String(finalText || "");
    if (!maxEditor) {
      maxWarn("insert failed", {
        reason: "max-editor-not-found",
        replacementText: text,
        source
      });
      return {
        ok: false,
        reason: "max-editor-not-found",
        previousText: "",
        newText: ""
      };
    }

    const previousText = getMaxPlainText(maxEditor);
    incrementMaxDebugCounter("insertAttempts");
    pushMaxDebugEvent({
      type: "max13-insert-start",
      source,
      templateId,
      currentText: previousText,
      finalText: text
    });
    maxDebug("insert start", {
      source,
      templateId,
      currentText: previousText,
      finalText: text,
      editor: describeElement(maxEditor),
      selectionBefore: describeSelection()
    });

    maxEditor.focus();
    if (selectionSnapshot) {
      restoreSelection(selectionSnapshot);
    } else {
      placeCaretAtEnd(maxEditor);
    }
    maxDebug("selection restored", {
      selection: describeSelection()
    });

    const hasNewlines = /\r|\n/.test(text);
    let commandOk = false;
    let method = "max-pre-capture-insertText";
    let verification = null;
    try {
      if (hasNewlines) {
        const multiline = await insertMaxMultilineWithFallback(maxEditor, text, selectionSnapshot);
        commandOk = Boolean(multiline.ok);
        method = multiline.method || "max-paste-multiline";
        verification = multiline.verification;
      } else {
        commandOk = Boolean(document.execCommand && document.execCommand("insertText", false, text));
      }
    } catch (error) {
      commandOk = false;
    }
    maxDebug("execCommand result", {
      ok: commandOk,
      method,
      multiline: hasNewlines,
      afterText: getMaxPlainText(maxEditor),
      selectionAfter: describeSelection()
    });
    if (!verification) {
      await waitForMaxCheck(100);
      verification = hasNewlines
        ? verifyMaxMultilineInserted(maxEditor, text)
        : verifyMaxInserted(maxEditor, text);
    }
    if (!verification.success && !hasNewlines) {
      await waitForMaxCheck(200);
      verification = verifyMaxInserted(maxEditor, text);
    }
    maxDebug("insert result", {
      ok: commandOk,
      successByVerify: verification.success,
      currentText: verification.currentText,
      innerText: verification.innerText,
      chunks: verification.chunks,
      selectionAfter: describeSelection()
    });

    if (verification.success) {
      const after = verification.innerText || verification.currentText;
      maxDebug("insert success verified", {
        method,
        source,
        chunks: verification.chunks,
        lines: verification.lines,
        currentText: verification.currentText,
        innerText: verification.innerText,
        htmlSlice: verification.htmlSlice,
        multiline: hasNewlines,
        finalTextLength: text.length,
        afterText: after
      });
      pushMaxDebugEvent({
        type: "insert-success",
        method,
        source,
        chunks: verification.chunks,
        lines: verification.lines,
        multiline: hasNewlines,
        finalTextLength: text.length,
        afterText: after
      });
      return {
        ok: true,
        method,
        element: maxEditor,
        previousText,
        textAfterRemoval: previousText,
        newText: after,
        textContent: verification.currentText,
        innerText: verification.innerText,
        chunks: verification.chunks
      };
    }

    maxWarn("insert failed", {
      reason: "max-pre-capture-insert-failed",
      currentText: verification.currentText,
      innerText: verification.innerText,
      chunks: verification.chunks,
      successByVerify: verification.success,
      finalText: text,
      source
    });
    pushMaxDebugEvent({
      type: "insert-failed",
      reason: "max-pre-capture-insert-failed",
      source
    });
    return {
      ok: false,
      reason: "max-pre-capture-insert-failed",
      element: maxEditor,
      previousText,
      textAfterRemoval: previousText,
      newText: verification.innerText || verification.currentText,
      textContent: verification.currentText,
      innerText: verification.innerText,
      chunks: verification.chunks
    };
  }

  function captureSelection(element) {
    const target = resolveEditableElement(element);
    if (!target) {
      return null;
    }

    if (isInputElement(target)) {
      return {
        type: "input",
        element: target,
        start: target.selectionStart,
        end: target.selectionEnd
      };
    }

    const selection = global.getSelection();
    if (!selection || !selection.rangeCount) {
      return {
        type: "contenteditable",
        element: target,
        range: null
      };
    }

    const range = selection.getRangeAt(0);
    if (!target.contains(range.commonAncestorContainer)) {
      return {
        type: "contenteditable",
        element: target,
        range: null
      };
    }

    return {
      type: "contenteditable",
      element: target,
      range: range.cloneRange()
    };
  }

  function placeCaretAtEnd(element) {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = global.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function restoreSelection(snapshot) {
    if (!snapshot || !snapshot.element || !document.contains(snapshot.element)) {
      return false;
    }

    const target = snapshot.element;
    target.focus();

    if (snapshot.type === "input" && isInputElement(target)) {
      const start = Number.isFinite(snapshot.start) ? snapshot.start : target.value.length;
      const end = Number.isFinite(snapshot.end) ? snapshot.end : start;
      try {
        target.setSelectionRange(start, end);
      } catch (error) {
        return false;
      }
      return true;
    }

    if (snapshot.type === "contenteditable") {
      const selection = global.getSelection();
      if (!selection) {
        return false;
      }

      selection.removeAllRanges();
      if (snapshot.range) {
        try {
          selection.addRange(snapshot.range);
        } catch (error) {
          placeCaretAtEnd(target);
        }
      } else {
        placeCaretAtEnd(target);
      }
      return true;
    }

    return false;
  }

  function getTextBeforeCaret(element) {
    const target = resolveEditableElement(element);
    if (!target) {
      return "";
    }

    if (isInputElement(target)) {
      const caret = Number.isFinite(target.selectionStart) ? target.selectionStart : target.value.length;
      return target.value.slice(0, caret);
    }

    const selection = global.getSelection();
    if (!selection || !selection.rangeCount) {
      return "";
    }
    const range = selection.getRangeAt(0);
    if (!target.contains(range.commonAncestorContainer)) {
      return "";
    }

    const before = range.cloneRange();
    before.selectNodeContents(target);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString();
  }

  function walkTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }

  function getCaretTextOffset(root) {
    const selection = global.getSelection();
    if (!selection || !selection.rangeCount) {
      return 0;
    }

    const range = selection.getRangeAt(0);
    const before = range.cloneRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length;
  }

  function createRangeByTextOffsets(root, startOffset, endOffset) {
    const range = document.createRange();
    const nodes = walkTextNodes(root);

    if (!nodes.length) {
      range.setStart(root, 0);
      range.setEnd(root, 0);
      return range;
    }

    let current = 0;
    let startSet = false;

    for (const node of nodes) {
      const next = current + node.nodeValue.length;
      if (!startSet && startOffset >= current && startOffset <= next) {
        range.setStart(node, Math.max(0, startOffset - current));
        startSet = true;
      }
      if (endOffset >= current && endOffset <= next) {
        range.setEnd(node, Math.max(0, endOffset - current));
        return range;
      }
      current = next;
    }

    const last = nodes[nodes.length - 1];
    if (!startSet) {
      range.setStart(last, last.nodeValue.length);
    }
    range.setEnd(last, last.nodeValue.length);
    return range;
  }

  function removeTextBeforeInsert(element, textToRemove) {
    const target = resolveEditableElement(element);
    const text = String(textToRemove || "");
    if (!target || !text) {
      return false;
    }

    if (isInputElement(target)) {
      const start = Number.isFinite(target.selectionStart) ? target.selectionStart : target.value.length;
      const end = Number.isFinite(target.selectionEnd) ? target.selectionEnd : start;
      const before = target.value.slice(0, start);

      if (!before.endsWith(text)) {
        return false;
      }

      const nextValue = `${target.value.slice(0, start - text.length)}${target.value.slice(end)}`;
      dispatchBeforeInput(target, null, "deleteContentBackward");
      setNativeValue(target, nextValue);
      const caret = start - text.length;
      try {
        target.setSelectionRange(caret, caret);
      } catch (error) {
        // Selection APIs are not available for every input type.
      }
      dispatchInputEvents(target, null, "deleteContentBackward");
      return true;
    }

    const selection = global.getSelection();
    if (!selection || !selection.rangeCount) {
      return false;
    }

    const before = getTextBeforeCaret(target);
    if (!before.endsWith(text)) {
      return false;
    }

    const caretOffset = getCaretTextOffset(target);
    const range = createRangeByTextOffsets(target, caretOffset - text.length, caretOffset);
    dispatchBeforeInput(target, null, "deleteContentBackward");
    range.deleteContents();
    selection.removeAllRanges();
    const after = createRangeByTextOffsets(target, caretOffset - text.length, caretOffset - text.length);
    after.collapse(true);
    selection.addRange(after);
    dispatchInputEvents(target, null, "deleteContentBackward");
    return true;
  }

  function removeTriggerBeforeInsert(element, triggerText) {
    return removeTextBeforeInsert(element, triggerText);
  }

  function replaceTextBeforeInsert(element, textToReplace, replacementText) {
    const target = resolveEditableElement(element);
    const token = String(textToReplace || "");
    const text = String(replacementText || "");

    if (!target || !token) {
      return false;
    }

    if (isInputElement(target)) {
      const caret = Number.isFinite(target.selectionStart) ? target.selectionStart : target.value.length;
      const end = Number.isFinite(target.selectionEnd) ? target.selectionEnd : caret;
      const before = target.value.slice(0, caret);

      if (!before.endsWith(token)) {
        return false;
      }

      const start = caret - token.length;
      const nextValue = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
      dispatchBeforeInput(target, text, "insertReplacementText");
      try {
        if (typeof target.setRangeText === "function") {
          target.setRangeText(text, start, end, "end");
        }
      } catch (error) {
        // Native setter below keeps React/Vue controlled inputs in sync.
      }
      setNativeValue(target, nextValue);
      const nextCaret = start + text.length;
      try {
        target.setSelectionRange(nextCaret, nextCaret);
      } catch (error) {
        // Some input types reject selection APIs.
      }
      dispatchInputEvents(target, text, "insertReplacementText");
      return true;
    }

    const selection = global.getSelection();
    if (!selection || !selection.rangeCount) {
      return false;
    }

    const before = getTextBeforeCaret(target);
    if (!before.endsWith(token)) {
      return false;
    }

    const caretOffset = getCaretTextOffset(target);
    const range = createRangeByTextOffsets(target, caretOffset - token.length, caretOffset);
    dispatchBeforeInput(target, text, "insertReplacementText");
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    dispatchInputEvents(target, text, "insertReplacementText");
    return true;
  }

  function findTokenReplacementIndex(currentText, token, options) {
    const text = String(currentText || "");
    const suffix = text.match(/[\s\u200b\u200c\u200d\ufeff]*$/u);
    const suffixLength = suffix ? suffix[0].length : 0;
    const trimmedEnd = suffixLength > 0 ? text.slice(0, -suffixLength) : text;
    if (trimmedEnd.endsWith(token)) {
      return {
        index: trimmedEnd.length - token.length,
        suffixStart: trimmedEnd.length
      };
    }
    if (options && options.allowLastOccurrence) {
      const index = text.lastIndexOf(token);
      if (index >= 0) {
        return {
          index,
          suffixStart: index + token.length
        };
      }
    }
    return {
      index: -1,
      suffixStart: -1
    };
  }

  function replaceLastOccurrenceInEditableText(element, token, text, options) {
    const target = resolveEditableElement(element);
    const currentText = getText(target);
    const match = findTokenReplacementIndex(currentText, token, options || {});
    if (!target || !token || match.index < 0) {
      return {
        ok: false,
        reason: "token-not-found",
        element: target,
        previousText: currentText,
        textAfterRemoval: currentText,
        newText: currentText
      };
    }

    const nextText = `${currentText.slice(0, match.index)}${text}${currentText.slice(match.index + token.length)}`;
    dispatchBeforeInput(target, text, "insertReplacementText");
    setPlainTextForEditable(target, nextText, text, "insertReplacementText", {
      caretOffset: isYandexMailHost() ? match.index + text.length : undefined
    });
    dispatchInputEvents(target, text, "insertReplacementText");
    if (isYandexMailHost()) {
      yandexDebug("fallback skipped generic end-of-editor", {
        caretOffset: match.index + text.length,
        textLength: text.length
      });
    }

    if (!verifyTokenReplacement(target, token, text, currentText)) {
      return {
        ok: false,
        reason: "token-replacement-failed",
        element: target,
        previousText: currentText,
        textAfterRemoval: getText(target),
        newText: getText(target)
      };
    }

    return {
      ok: true,
      element: target,
      previousText: currentText,
      textAfterRemoval: currentText,
      newText: getText(target)
    };
  }

  function replaceMaxComposerShortcutWithText(element, shortcut, finalText) {
    return {
      ok: false,
      reason: "max-pre-capture-required",
      element: getMaxComposerEditor(element),
      previousText: "",
      newText: ""
    };
  }

  function replaceTextContentSuffix(element, token, text) {
    return replaceLastOccurrenceInEditableText(element, token, text, { allowLastOccurrence: false }).ok;
  }

  function verifyTokenReplacement(element, token, text, previousText) {
    const nextText = getText(element);
    const probe = String(text || "").slice(0, 120);
    const normalizedProbe = normalizeText(probe);
    const normalizedNextText = normalizeText(nextText);
    const normalizedJoined = normalizeText(`${token}${probe}`);
    return Boolean(
      nextText !== previousText &&
      (
        probe === "" ||
        nextText.includes(probe) ||
        (normalizedProbe && normalizedNextText.includes(normalizedProbe))
      ) &&
      !(normalizedJoined && normalizedNextText.includes(normalizedJoined))
    );
  }

  function replaceTokenBeforeCaretOrAbort(element, tokenToReplace, replacementText) {
    const target = resolveEditableElement(element);
    const token = String(tokenToReplace || "");
    const text = String(replacementText || "");
    if (!target || !token) {
      return {
        ok: false,
        reason: "missing-token"
      };
    }

    const previousText = getText(target);
    if (isMaxHost()) {
      return replaceMaxComposerShortcutWithText(target, token, text);
    }

    let inserted = replaceTextBeforeInsert(target, token, text);
    if (!inserted && !isInputElement(target)) {
      const safeReplacement = replaceLastOccurrenceInEditableText(target, token, text, {
        allowLastOccurrence: isYandexMailHost()
      });
      if (safeReplacement.ok) {
        return safeReplacement;
      }
      inserted = false;
    }

    if (!inserted || !verifyTokenReplacement(target, token, text, previousText)) {
      return {
        ok: false,
        reason: "token-replacement-failed",
        element: target,
        previousText,
        textAfterRemoval: getText(target),
        newText: getText(target)
      };
    }

    return {
      ok: true,
      element: target,
      previousText,
      textAfterRemoval: previousText,
      newText: getText(target)
    };
  }

  function insertIntoInput(element, text) {
    const start = Number.isFinite(element.selectionStart) ? element.selectionStart : element.value.length;
    const end = Number.isFinite(element.selectionEnd) ? element.selectionEnd : start;
    const nextValue = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;

    dispatchBeforeInput(element, text, "insertText");

    try {
      if (typeof element.setRangeText === "function") {
        element.setRangeText(text, start, end, "end");
      }
    } catch (error) {
      // Some input types expose setRangeText but reject selection-based writes.
    }
    setNativeValue(element, nextValue);
    const caret = start + text.length;
    try {
      element.setSelectionRange(caret, caret);
    } catch (error) {
      // Number-like inputs can reject selection APIs.
    }
    dispatchInputEvents(element, text, "insertText");
    return true;
  }

  function insertTextNodeAtSelection(element, text) {
    element.focus();
    const selection = global.getSelection();

    if (!selection || !selection.rangeCount || !element.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      placeCaretAtEnd(element);
    }

    const activeSelection = global.getSelection();
    const range = activeSelection && activeSelection.rangeCount
      ? activeSelection.getRangeAt(0)
      : null;

    if (!range) {
      return false;
    }

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    activeSelection.removeAllRanges();
    activeSelection.addRange(range);
    return true;
  }

  function insertIntoContentEditable(element, text) {
    element.focus();

    dispatchBeforeInput(element, text, "insertText");

    let inserted = false;
    try {
      inserted = insertTextNodeAtSelection(element, text);
    } catch (error) {
      inserted = false;
    }

    try {
      if (!inserted && document.queryCommandSupported && document.queryCommandSupported("insertText")) {
        inserted = document.execCommand("insertText", false, text);
      }
    } catch (error) {
      // Manual Range insertion above is preferred; execCommand is only a fallback.
    }

    dispatchInputEvents(element, text, "insertText");
    return inserted;
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }

  async function insertText(element, text, options) {
    const opts = options || {};
    const tokenToReplace = opts.removeTextBeforeInsert || (opts.removeTrigger ? opts.triggerText : "");
    const requireTokenReplacement = Boolean(tokenToReplace && opts.requireTokenReplacement);
    const maxInsert = isMaxHost();
    const target = maxInsert
      ? getMaxComposerEditor(element)
      : resolveEditableElement(element);

    if (!target) {
      return {
        ok: false,
        reason: "not-editable"
      };
    }

    const previousText = getText(target);
    target.focus();

    if (opts.selectionSnapshot) {
      restoreSelection(opts.selectionSnapshot);
    }

    if (maxInsert) {
      const replacement = await insertMaxPreCapturedText({
        editor: target,
        finalText: text,
        source: opts.source || (tokenToReplace ? "shortcut" : "overlayDirect"),
        selectionSnapshot: opts.selectionSnapshot || null,
        templateId: opts.templateId || ""
      });
      await waitForEditorFlush();
      return replacement;
    }

    let textAfterRemoval = previousText;
    let inserted = false;

    if (requireTokenReplacement) {
      const replacement = replaceTokenBeforeCaretOrAbort(target, tokenToReplace, text);
      await waitForEditorFlush();
      if (!replacement.ok) {
        return replacement;
      }
      if (isYandexMailHost()) {
        yandexDebug("fallback skipped generic end-of-editor", {
          reason: "token-replacement-range"
        });
      }
      return {
        ...replacement,
        newText: getText(target)
      };
    }

    if (tokenToReplace) {
      inserted = replaceTextBeforeInsert(target, tokenToReplace, text);
      textAfterRemoval = inserted ? previousText : getText(target);
    }

    if (!inserted) {
      inserted = isInputElement(target)
        ? insertIntoInput(target, text)
        : insertIntoContentEditable(target, text);
      textAfterRemoval = previousText;
    }
    await waitForEditorFlush();
    const newText = getText(target);
    const probe = String(text || "").slice(0, 120);
    const normalizedProbe = normalizeText(probe);
    const normalizedNewText = normalizeText(newText);
    const verified = Boolean(
      inserted &&
      (
        probe === "" ||
        newText.includes(probe) ||
        (normalizedProbe && normalizedNewText.includes(normalizedProbe)) ||
        newText !== textAfterRemoval
      )
    );

    if (verified && isYandexMailHost()) {
      yandexDebug("fallback skipped generic end-of-editor", {
        reason: "selection-already-after-inserted-template"
      });
    }

    return {
      ok: Boolean(verified),
      element: target,
      previousText,
      textAfterRemoval,
      newText
    };
  }

  function getSelectionRect(element) {
    const target = resolveEditableElement(element);
    if (!target) {
      return null;
    }

    if (!isInputElement(target)) {
      const selection = global.getSelection();
      if (selection && selection.rangeCount) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        if (rect && (rect.width || rect.height)) {
          return rect;
        }
      }
    }

    return target.getBoundingClientRect();
  }

  namespace.editorAdapter = {
    captureSelection,
    copyToClipboard,
    dispatchInputEvents,
    getSelectionRect,
    getText,
    getTextBeforeCaret,
    insertText,
    isEditableElement,
    removeTextBeforeInsert,
    removeTriggerBeforeInsert,
    replaceTokenBeforeCaretOrAbort,
    replaceTextBeforeInsert,
    resolveEditableElement,
    restoreSelection
  };

  global.TemplateIo = namespace;
})(globalThis);
