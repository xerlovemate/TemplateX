(function initTemplateIoOverlay(global) {
  const namespace = global.TemplateIo || {};
  const CONTENT_SOURCE = "templateio-content";
  const FRAME_SOURCE = "templateio-overlay-frame";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function getRuntimeUrl(path) {
    if (global.chrome && chrome.runtime && typeof chrome.runtime.getURL === "function") {
      return chrome.runtime.getURL(path);
    }
    return path;
  }

  function createTemplateOverlay(config) {
    const onPick = config && config.onPick;
    const onOpenOptions = config && config.onOpenOptions;
    const onClose = config && config.onClose;
    const onQueryChange = config && config.onQueryChange;
    let host = null;
    let frame = null;
    let toastElement = null;
    let ready = false;
    let state = null;
    let removeTrigger = false;
    let panelOpen = false;
    let modalOpen = false;
    let currentAnchorRect = null;
    let returnToListAfterVariables = false;
    let pendingMessages = [];
    let toastTimer = null;
    const variableCallbacks = new Map();
    const completedVariableRequests = new Set();

    function debug(message, details) {
      if (state && state.settings && state.settings.debugMode) {
        console.debug(`[TemplateX] ${message}`, details || "");
      }
    }

    function ensureDom() {
      if (host) {
        return;
      }

      host = document.createElement("div");
      host.id = "templateio-host";
      host.className = "templateio-hidden-host";
      host.dataset.templateioOverlay = "true";
      host.hidden = true;
      host.style.position = "fixed";
      host.style.inset = "0";
      host.style.zIndex = "2147483647";
      host.style.pointerEvents = "none";
      host.style.background = "transparent";
      document.documentElement.append(host);

      frame = document.createElement("iframe");
      frame.title = "TemplateX";
      frame.src = getRuntimeUrl("src/content/overlay-frame.html");
      frame.style.position = "fixed";
      frame.style.border = "0";
      frame.style.display = "none";
      frame.style.background = "transparent";
      frame.style.colorScheme = "light";
      frame.style.pointerEvents = "auto";
      frame.setAttribute("aria-label", "TemplateX");
      host.append(frame);

      toastElement = document.createElement("div");
      toastElement.style.position = "fixed";
      toastElement.style.right = "16px";
      toastElement.style.bottom = "16px";
      toastElement.style.maxWidth = "min(360px, calc(100vw - 32px))";
      toastElement.style.borderRadius = "8px";
      toastElement.style.background = "#111827";
      toastElement.style.color = "#ffffff";
      toastElement.style.boxShadow = "0 12px 34px rgba(17, 24, 39, 0.28)";
      toastElement.style.font = "13px/18px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      toastElement.style.padding = "10px 12px";
      toastElement.style.opacity = "0";
      toastElement.style.transform = "translateY(16px)";
      toastElement.style.transition = "opacity 160ms ease, transform 160ms ease";
      toastElement.style.pointerEvents = "none";
      host.append(toastElement);

      global.addEventListener("message", handleFrameMessage, false);
    }

    function flushMessages() {
      if (!ready || !frame || !frame.contentWindow) {
        return;
      }
      const messages = pendingMessages;
      pendingMessages = [];
      for (const message of messages) {
        frame.contentWindow.postMessage(message, "*");
      }
    }

    function postToFrame(type, payload) {
      ensureDom();
      const message = {
        source: CONTENT_SOURCE,
        type,
        ...(payload || {})
      };
      if (!ready || !frame.contentWindow) {
        pendingMessages.push(message);
        return;
      }
      frame.contentWindow.postMessage(message, "*");
    }

    function updateHostVisibility() {
      const shouldShow = panelOpen || modalOpen || (toastElement && toastElement.style.opacity === "1");
      host.hidden = !shouldShow;
      frame.style.display = panelOpen || modalOpen ? "block" : "none";
      host.style.pointerEvents = modalOpen ? "auto" : "none";
      host.style.background = modalOpen ? "rgba(15, 23, 42, 0.34)" : "transparent";
    }

    function positionFrame(mode, anchorRect) {
      ensureDom();
      const viewportPadding = 12;
      const viewportWidth = global.innerWidth || document.documentElement.clientWidth || 1024;
      const viewportHeight = global.innerHeight || document.documentElement.clientHeight || 768;

      if (mode === "variables") {
        const width = Math.min(440, Math.max(320, viewportWidth - viewportPadding * 2));
        const height = Math.min(560, Math.max(360, viewportHeight - viewportPadding * 2));
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
        frame.style.left = `${Math.round((viewportWidth - width) / 2)}px`;
        frame.style.top = `${Math.round((viewportHeight - height) / 2)}px`;
        return;
      }

      const width = Math.min(468, Math.max(320, viewportWidth - viewportPadding * 2));
      const height = Math.min(620, Math.max(360, viewportHeight - viewportPadding * 2));
      const rect = anchorRect || {
        left: Math.round(viewportWidth / 2) - Math.round(width / 2),
        top: Math.round(viewportHeight / 2) - Math.round(height / 2),
        bottom: Math.round(viewportHeight / 2) - Math.round(height / 2)
      };
      const left = clamp(rect.left, viewportPadding, viewportWidth - width - viewportPadding);
      let top = rect.bottom + 10;
      if (top + height > viewportHeight - viewportPadding) {
        top = rect.top - height - 10;
      }
      if (top < viewportPadding) {
        top = Math.max(viewportPadding, Math.round((viewportHeight - height) / 2));
      }

      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      frame.style.left = `${Math.round(left)}px`;
      frame.style.top = `${Math.round(top)}px`;
    }

    function rememberCompletedRequest(requestId) {
      if (!requestId) {
        return;
      }
      completedVariableRequests.add(requestId);
      if (completedVariableRequests.size > 40) {
        completedVariableRequests.delete(completedVariableRequests.values().next().value);
      }
    }

    function sendInsertAck(requestId, ok, error) {
      postToFrame(ok ? "TEMPLATEIO_INSERT_DONE" : "TEMPLATEIO_INSERT_ERROR", {
        requestId,
        error: error || ""
      });
    }

    async function handleSelectTemplate(data) {
      if (typeof onPick !== "function" || !state) {
        return;
      }
      const template = state.templates.find((item) => item.id === data.templateId);
      if (!template) {
        showToast("Шаблон не найден", "error");
        return;
      }
      try {
        await onPick(template, { removeTrigger });
      } catch (error) {
        showToast(error.message || "Не удалось выбрать шаблон", "error");
      }
    }

    async function handleVariablesSubmit(data) {
      const requestId = data.requestId;
      const callback = variableCallbacks.get(requestId);
      debug("received variables submit", { requestId, values: data.values || {} });
      if (!callback || completedVariableRequests.has(requestId)) {
        debug("stale variables submit ignored", { requestId });
        return;
      }
      if (callback.submitting) {
        debug("duplicate variables submit ignored while pending", { requestId });
        return;
      }

      callback.submitting = true;
      try {
        await callback.onSubmit(data.values || {}, {
          requestId,
          templateId: data.templateId
        });
        rememberCompletedRequest(requestId);
        sendInsertAck(requestId, true);
        variableCallbacks.delete(requestId);
        debug("pending cleared", { requestId });
      } catch (error) {
        callback.submitting = false;
        sendInsertAck(requestId, false, error && error.message);
        showToast(error && error.message ? error.message : "Не удалось вставить шаблон", "error");
      }
    }

    function handleVariablesCancel(data) {
      const requestId = data.requestId;
      const callback = variableCallbacks.get(requestId);
      if (callback && typeof callback.onCancel === "function") {
        callback.onCancel();
      }
      variableCallbacks.delete(requestId);
      modalOpen = false;
      if (returnToListAfterVariables) {
        panelOpen = true;
        positionFrame("list", currentAnchorRect);
        postToFrame("TEMPLATEIO_OPEN", {
          state,
          removeTrigger
        });
      } else {
        close();
      }
      updateHostVisibility();
    }

    function handleFrameMessage(event) {
      if (!frame || event.source !== frame.contentWindow) {
        return;
      }
      const data = event.data || {};
      if (data.source !== FRAME_SOURCE) {
        return;
      }

      if (data.type === "TEMPLATEIO_READY") {
        ready = true;
        flushMessages();
        if (state) {
          postToFrame("TEMPLATEIO_STATE", { state });
        }
        return;
      }

      if (data.type === "TEMPLATEIO_SELECT_TEMPLATE") {
        handleSelectTemplate(data);
        return;
      }

      if (data.type === "TEMPLATEIO_VARIABLES_SUBMIT") {
        handleVariablesSubmit(data);
        return;
      }

      if (data.type === "TEMPLATEIO_VARIABLES_CANCEL") {
        handleVariablesCancel(data);
        return;
      }

      if (data.type === "TEMPLATEIO_CLOSE") {
        close({ fromFrame: true, reason: data.reason || "close", mode: data.mode || "" });
        return;
      }

      if (data.type === "TEMPLATEIO_QUERY_CHANGE") {
        if (typeof onQueryChange === "function") {
          onQueryChange(data);
        }
        return;
      }

      if (data.type === "TEMPLATEIO_OPEN_SETTINGS") {
        if (typeof onOpenOptions === "function") {
          onOpenOptions();
        }
      }
    }

    function isInsideEvent(event) {
      if (!host || !event) {
        return false;
      }
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      return path.includes(host) || path.includes(frame) || event.target === host || event.target === frame;
    }

    function open(payload) {
      ensureDom();
      state = payload.state;
      removeTrigger = Boolean(payload.removeTrigger);
      currentAnchorRect = payload.anchorRect || null;
      panelOpen = true;
      modalOpen = false;
      positionFrame("list", currentAnchorRect);
      updateHostVisibility();
      postToFrame("TEMPLATEIO_OPEN", {
        state,
        removeTrigger,
        mode: payload.mode || "",
        initialQuery: payload.initialQuery || ""
      });
      frame.focus();
      debug("iframe overlay opened");
    }

    function openModalHost(payload) {
      ensureDom();
      state = payload.state;
      removeTrigger = Boolean(payload.removeTrigger);
      panelOpen = false;
      modalOpen = true;
      positionFrame("variables", null);
      updateHostVisibility();
      postToFrame("TEMPLATEIO_STATE", { state });
      frame.focus();
      debug("iframe modal host opened");
    }

    function showVariables(template, variableNames, defaults, onSubmit, onCancel, options) {
      ensureDom();
      const requestId = (options && options.requestId) || `${template.id || "template"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      returnToListAfterVariables = panelOpen;
      variableCallbacks.set(requestId, {
        onSubmit: typeof onSubmit === "function" ? onSubmit : async () => {},
        onCancel: typeof onCancel === "function" ? onCancel : null,
        submitting: false
      });

      panelOpen = false;
      modalOpen = true;
      positionFrame("variables", null);
      updateHostVisibility();
      postToFrame("TEMPLATEIO_SHOW_VARIABLES", {
        requestId,
        template,
        variableNames,
        defaults: defaults || {},
        state
      });
      frame.focus();
      debug("variables form opened", { requestId, templateId: template.id, fields: variableNames });
      return requestId;
    }

    function close(meta) {
      if (!host) {
        return;
      }
      panelOpen = false;
      modalOpen = false;
      variableCallbacks.clear();
      postToFrame("TEMPLATEIO_CLOSE");
      updateHostVisibility();
      if (meta && meta.fromFrame && typeof onClose === "function") {
        onClose({
          reason: meta.reason || "close",
          mode: meta.mode || ""
        });
      }
      debug("iframe overlay closed");
    }

    function isOpen() {
      return Boolean(panelOpen);
    }

    function isModalOpen() {
      return Boolean(modalOpen);
    }

    function handleEscape() {
      if (modalOpen) {
        postToFrame("TEMPLATEIO_ESCAPE");
        return;
      }
      close();
    }

    function showToast(message, tone) {
      ensureDom();
      toastElement.textContent = message || "";
      toastElement.style.background = tone === "error" ? "#b42318" : "#111827";
      toastElement.style.opacity = "1";
      toastElement.style.transform = "translateY(0)";
      updateHostVisibility();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastElement.style.opacity = "0";
        toastElement.style.transform = "translateY(16px)";
        updateHostVisibility();
      }, 2600);
    }

    function updateState(nextState) {
      state = nextState;
      if (host) {
        postToFrame("TEMPLATEIO_STATE", { state });
      }
    }

    return {
      close,
      handleEscape,
      isInsideEvent,
      isModalOpen,
      isOpen,
      open,
      openModalHost,
      showToast,
      showVariables,
      updateState
    };
  }

  namespace.createTemplateOverlay = createTemplateOverlay;
  global.TemplateIo = namespace;
})(globalThis);
