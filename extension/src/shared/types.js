(function initTemplateIoTypes(global) {
  const namespace = global.TemplateIo || {};

  const SYSTEM_VARIABLES = ["today", "tomorrow", "time", "manager_name"];
  const PAYMENT_PROVIDERS = ["manual", "tbank", "yookassa", "cloudpayments"];

  function createId(prefix) {
    const base =
      global.crypto && typeof global.crypto.randomUUID === "function"
        ? global.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${base}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  namespace.constants = {
    STORAGE_KEY: "templateIoState",
    CURRENT_SCHEMA_VERSION: 1,
    PAYMENT_PROVIDERS,
    SYSTEM_VARIABLES
  };
  namespace.createId = createId;
  namespace.clone = clone;
  namespace.nowIso = nowIso;

  global.TemplateIo = namespace;
})(globalThis);
