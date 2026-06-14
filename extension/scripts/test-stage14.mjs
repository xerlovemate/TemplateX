import assert from "node:assert/strict";

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

function verifyMaxInserted(currentText, innerText, finalText) {
  const chunks = getMeaningfulMaxVerifyChunks(finalText);
  const candidates = [
    normalizeMaxVerifyChunk(currentText),
    normalizeMaxVerifyChunk(innerText),
    normalizeForMaxVerify(currentText),
    normalizeForMaxVerify(innerText)
  ].filter(Boolean);

  return chunks.some((chunk) => {
    const normalizedChunk = normalizeMaxVerifyChunk(chunk) || normalizeForMaxVerify(chunk);
    return Boolean(normalizedChunk && candidates.some((candidate) => candidate.includes(normalizedChunk)));
  });
}

function shouldRestoreSlashOnEsc(state) {
  return Boolean(
    state.captureActive &&
    state.shouldRestoreSlash &&
    !state.templateSelected &&
    !state.inserted
  );
}

function computeYandexCaretOffset(currentText, token, insertedText) {
  const index = String(currentText || "").lastIndexOf(token);
  return index < 0 ? -1 : index + String(insertedText || "").length;
}

assert.equal(
  verifyMaxInserted(
    "Hello!   Glad to help with pricing.",
    "Hello!   Glad to help with pricing.",
    "Hello! \u{1F31F} Glad to help with pricing."
  ),
  true
);

assert.equal(shouldRestoreSlashOnEsc({
  captureActive: true,
  shouldRestoreSlash: true,
  templateSelected: false,
  inserted: false
}), true);

assert.equal(shouldRestoreSlashOnEsc({
  captureActive: true,
  shouldRestoreSlash: false,
  templateSelected: true,
  inserted: true
}), false);

const yandexText = "/priv\n--\nSignature";
const yandexCaret = computeYandexCaretOffset(yandexText, "/priv", "Hello");
assert.equal(yandexCaret, "Hello".length);
assert.notEqual(yandexCaret, yandexText.length);

console.log("stage14 checks passed");
