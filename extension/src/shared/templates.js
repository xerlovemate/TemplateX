(function initTemplateIoTemplates(global) {
  const namespace = global.TemplateIo || {};
  const SYSTEM_VARIABLES = new Set((namespace.constants && namespace.constants.SYSTEM_VARIABLES) || []);
  const variablePattern = /{{\s*([a-zA-Zа-яА-Я0-9_ -]+)\s*}}/g;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatDate(date) {
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  }

  function extractVariables(body) {
    const names = new Set();
    String(body || "").replace(variablePattern, (_, rawName) => {
      names.add(rawName.trim());
      return "";
    });
    return Array.from(names);
  }

  function isSystemVariable(name) {
    return SYSTEM_VARIABLES.has(String(name || "").trim());
  }

  function getSystemVariableValue(name, state) {
    const key = String(name || "").trim();
    const now = new Date();

    if (key === "today") {
      return formatDate(now);
    }

    if (key === "tomorrow") {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return formatDate(tomorrow);
    }

    if (key === "time") {
      return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    if (key === "manager_name") {
      return (state && state.settings && state.settings.managerName) || "";
    }

    return "";
  }

  function resolveTemplateBody(body, values, state) {
    const replacements = values || {};
    return String(body || "").replace(variablePattern, (_, rawName) => {
      const name = rawName.trim();
      if (isSystemVariable(name)) {
        return getSystemVariableValue(name, state);
      }
      return Object.prototype.hasOwnProperty.call(replacements, name) ? String(replacements[name] || "") : "";
    });
  }

  function templateMatches(template, query) {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) {
      return true;
    }

    const haystack = [
      template.title,
      template.shortcut,
      template.body,
      Array.isArray(template.tags) ? template.tags.join(" ") : ""
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  }

  function getFirstLinePreview(body) {
    return String(body || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "Без текста";
  }

  namespace.templates = {
    extractVariables,
    formatDate,
    getFirstLinePreview,
    getSystemVariableValue,
    isSystemVariable,
    resolveTemplateBody,
    templateMatches
  };

  global.TemplateIo = namespace;
})(globalThis);
