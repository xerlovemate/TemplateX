import assert from "node:assert/strict";

const maxTrailingPattern = /^[\s\u00a0\u200b\u200c\u200d\ufeff]*$/u;

function normalizeMaxText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function collapseRepeats(text, finalText) {
  const final = String(finalText || "");
  let result = String(text || "");
  if (!final) {
    return result;
  }
  while (result.includes(`${final}${final}`)) {
    result = result.replace(`${final}${final}`, final);
  }
  return result;
}

function cleanupMaxReplacementText(replacementText, shortcut, finalText) {
  const token = String(shortcut || "");
  const final = String(finalText || "");
  let replacement = collapseRepeats(replacementText, final);
  if (token && final && replacement.includes(`${token}${final}`)) {
    replacement = final;
  }
  return replacement;
}

function computeMaxReplacementTextForExec(currentText, shortcut, finalText, source) {
  const text = normalizeMaxText(currentText);
  const token = String(shortcut || "");
  const final = String(finalText || "");

  if (token) {
    const index = text.lastIndexOf(token);
    if (index >= 0 && maxTrailingPattern.test(text.slice(index + token.length))) {
      return cleanupMaxReplacementText(`${text.slice(0, index)}${final}`, token, final);
    }
  }

  if (token && text.includes(token)) {
    return final;
  }

  if (source === "shortcut") {
    return final;
  }

  if (token === "//") {
    return cleanupMaxReplacementText(text.replace(/\/\/\s*$/u, final) || final, token, final);
  }

  return final;
}

function shouldDisableClipboardFallbackForMax(context) {
  return Boolean(
    context &&
    (
      context.fromShortcut ||
      context.triggerMode === "shortcut" ||
      context.removeTextBeforeInsert ||
      context.removeTrigger
    )
  );
}

const shortcut = "/priv";
const finalText = "HELLO";

assert.equal(computeMaxReplacementTextForExec("/priv", shortcut, finalText, "shortcut"), finalText);
assert.equal(computeMaxReplacementTextForExec(`/priv\u00a0`, shortcut, finalText, "shortcut"), finalText);
assert.equal(computeMaxReplacementTextForExec("", shortcut, finalText, "shortcut"), finalText);
assert.equal(computeMaxReplacementTextForExec(`${shortcut}${finalText}${finalText}`, shortcut, finalText, "shortcut"), finalText);
assert.equal(computeMaxReplacementTextForExec(`${finalText}${finalText}${shortcut}`, shortcut, finalText, "shortcut"), finalText);
assert.equal(computeMaxReplacementTextForExec("draft /priv", shortcut, finalText, "shortcut"), `draft ${finalText}`);
assert.equal(computeMaxReplacementTextForExec("//", "//", finalText, "slashTrigger"), finalText);
assert.equal(computeMaxReplacementTextForExec("draft", "", finalText, "overlayDirect"), finalText);

assert.equal(shouldDisableClipboardFallbackForMax({ fromShortcut: true }), true);
assert.equal(shouldDisableClipboardFallbackForMax({ removeTextBeforeInsert: "/priv" }), true);
assert.equal(shouldDisableClipboardFallbackForMax({}), false);

console.log("stage9 checks passed");
