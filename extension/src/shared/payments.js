(function initTemplateIoPayments(global) {
  const namespace = global.TemplateIo || {};

  function normalizeApiUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  async function createPaymentLink(input, settings) {
    const provider = (settings && settings.paymentProvider) || "manual";
    const backendApiUrl = normalizeApiUrl(settings && settings.backendApiUrl);

    if (provider === "manual") {
      if (input && input.manualPaymentLink) {
        return String(input.manualPaymentLink);
      }
      if (settings && settings.paymentDevMode) {
        const amount = input && input.amount ? encodeURIComponent(String(input.amount)) : "demo";
        return `https://pay.example.test/templatex/${amount}`;
      }
      throw new Error("Введите ссылку на оплату вручную.");
    }

    if (!backendApiUrl) {
      throw new Error("Укажите backendApiUrl для создания платежной ссылки.");
    }

    // Production payment links must be created only through backend API. Never store acquiring secrets inside extension.
    const response = await fetch(`${backendApiUrl}/api/payments/create-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        provider,
        amount: Number(input && input.amount ? input.amount : 0),
        description: (input && input.description) || "",
        clientName: (input && input.clientName) || "",
        metadata: (input && input.metadata) || {}
      })
    });

    if (!response.ok) {
      throw new Error(`Backend вернул ошибку ${response.status}.`);
    }

    const payload = await response.json();
    if (!payload || !payload.paymentLink) {
      throw new Error("Backend не вернул paymentLink.");
    }

    return String(payload.paymentLink);
  }

  namespace.payments = {
    createPaymentLink
  };

  global.TemplateIo = namespace;
})(globalThis);
