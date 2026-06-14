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

function verifyMaxMultilineInserted({ textContent, innerText }, finalText) {
  const currentText = normalizeMaxVerifyChunk(textContent);
  const currentInner = normalizeMaxPreserveNewlines(innerText);
  const currentInnerFlat = normalizeMaxVerifyChunk(currentInner);
  const lines = String(finalText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeMaxVerifyChunk(line))
    .filter((line) => line.length >= 3);
  const uniqueLines = Array.from(new Set(lines));
  const lineMatches = uniqueLines.map((line) => {
    const chunk = line.slice(0, Math.min(40, line.length));
    return Boolean(chunk && (currentText.includes(chunk) || currentInnerFlat.includes(chunk)));
  });
  const hasLineBreaks = Boolean(
    uniqueLines.length <= 1 ||
    /\n\s*\d+\./.test(currentInner) ||
    /1\.\s*\S[\s\S]*\n[\s\S]*2\.\s*\S/.test(currentInner)
  );
  return lineMatches.every(Boolean) && hasLineBreaks;
}

function chooseMaxInsertMethod(finalText) {
  return /\r|\n/.test(String(finalText || ""))
    ? "max-paste-multiline"
    : "max-pre-capture-insertText";
}

function buildMaxMultilineHtml(finalText) {
  return String(finalText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => `<p>${line || "<br>"}</p>`)
    .join("");
}

function focusVariableIndexByDelta(length, currentIndex, delta) {
  return Math.max(0, Math.min(length - 1, currentIndex + delta));
}

const details = [
  "Чтобы я могла всё правильно рассчитать и подсказать точную стоимость, уточните, пожалуйста:",
  "1. 123",
  "2. 123",
  "3. 123"
].join("\n");

assert.equal(chooseMaxInsertMethod("Здравствуйте! Рада помочь."), "max-pre-capture-insertText");
assert.equal(chooseMaxInsertMethod(details), "max-paste-multiline");

assert.equal(
  verifyMaxMultilineInserted({
    textContent: "Чтобы я могла всё правильно рассчитать и подсказать точную стоимость, уточните, пожалуйста:1. 1232. 1233. 123",
    innerText: "Чтобы я могла всё правильно рассчитать и подсказать точную стоимость, уточните, пожалуйста:1. 1232. 1233. 123"
  }, details),
  false
);

assert.equal(
  verifyMaxMultilineInserted({
    textContent: "Чтобы я могла всё правильно рассчитать и подсказать точную стоимость, уточните, пожалуйста:1. 1232. 1233. 123",
    innerText: details
  }, details),
  true
);

assert.equal(buildMaxMultilineHtml("Intro\n\n1. 123"), "<p>Intro</p><p><br></p><p>1. 123</p>");

assert.equal(focusVariableIndexByDelta(3, 0, 1), 1);
assert.equal(focusVariableIndexByDelta(3, 1, 1), 2);
assert.equal(focusVariableIndexByDelta(3, 2, 1), 2);
assert.equal(focusVariableIndexByDelta(3, 2, -1), 1);
assert.equal(focusVariableIndexByDelta(3, 0, -1), 0);

console.log("stage15 checks passed");
