(function initTemplateIoAuth(global) {
  const namespace = global.TemplateIo || {};

  async function login(email) {
    const normalizedEmail = String(email || "").trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Введите корректный email.");
    }

    const tokenSeed = global.crypto && typeof global.crypto.randomUUID === "function"
      ? global.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

    const state = await namespace.storage.updateAuth({
      isAuthenticated: true,
      userEmail: normalizedEmail,
      token: `mock-${tokenSeed}`
    });

    await namespace.storage.updateSettings({ email: normalizedEmail });
    return state.auth;
  }

  async function logout() {
    const state = await namespace.storage.updateAuth({
      isAuthenticated: false,
      userEmail: "",
      token: ""
    });
    return state.auth;
  }

  namespace.auth = {
    login,
    logout
  };

  global.TemplateIo = namespace;
})(globalThis);
