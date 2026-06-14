(function initTemplateIoShortcuts(global) {
  const namespace = global.TemplateIo || {};

  function normalizeKeyName(key) {
    const value = String(key || "").trim();
    if (!value) {
      return "";
    }

    const lower = value.toLowerCase();
    if (lower === " ") {
      return "Space";
    }
    if (lower === "esc") {
      return "Escape";
    }
    if (lower.length === 1) {
      return lower.toUpperCase();
    }
    return value.slice(0, 1).toUpperCase() + value.slice(1);
  }

  function normalizeHotkey(hotkey) {
    const parts = String(hotkey || "")
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);

    const modifiers = [];
    let mainKey = "";

    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower === "ctrl" || lower === "control") {
        modifiers.push("Ctrl");
      } else if (lower === "shift") {
        modifiers.push("Shift");
      } else if (lower === "alt" || lower === "option") {
        modifiers.push("Alt");
      } else if (lower === "meta" || lower === "cmd" || lower === "command") {
        modifiers.push("Meta");
      } else {
        mainKey = normalizeKeyName(part);
      }
    }

    const ordered = ["Ctrl", "Shift", "Alt", "Meta"].filter((name) => modifiers.includes(name));
    if (mainKey) {
      ordered.push(mainKey);
    }

    return ordered.join("+");
  }

  function eventToHotkey(event) {
    const parts = [];
    if (event.ctrlKey) {
      parts.push("Ctrl");
    }
    if (event.shiftKey) {
      parts.push("Shift");
    }
    if (event.altKey) {
      parts.push("Alt");
    }
    if (event.metaKey) {
      parts.push("Meta");
    }

    const key = event.code === "Space" ? "Space" : normalizeKeyName(event.key);
    if (!["Control", "Shift", "Alt", "Meta"].includes(key)) {
      parts.push(key);
    }

    return parts.join("+");
  }

  function isHotkeyEvent(event, hotkey) {
    return normalizeHotkey(eventToHotkey(event)) === normalizeHotkey(hotkey);
  }

  function findDuplicateShortcuts(templates) {
    const seen = new Map();
    const duplicates = new Set();

    for (const template of templates || []) {
      const shortcut = String(template.shortcut || "").trim().toLowerCase();
      if (!shortcut) {
        continue;
      }
      if (seen.has(shortcut)) {
        duplicates.add(shortcut);
      }
      seen.set(shortcut, template.id);
    }

    return Array.from(duplicates);
  }

  namespace.shortcuts = {
    eventToHotkey,
    findDuplicateShortcuts,
    isHotkeyEvent,
    normalizeHotkey
  };

  global.TemplateIo = namespace;
})(globalThis);
