(function initTemplateIoImportExport(global) {
  const namespace = global.TemplateIo || {};

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function readJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        try {
          resolve(JSON.parse(String(reader.result || "{}")));
        } catch (error) {
          reject(new Error("Не удалось прочитать JSON."));
        }
      });
      reader.addEventListener("error", () => reject(new Error("Не удалось открыть файл.")));
      reader.readAsText(file, "utf-8");
    });
  }

  namespace.importExport = {
    downloadJson,
    readJsonFile
  };

  global.TemplateIo = namespace;
})(globalThis);
