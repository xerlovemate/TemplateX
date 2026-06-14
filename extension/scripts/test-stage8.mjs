import assert from "node:assert/strict";

const maxTrailingPattern = /^[\s\u00a0\u200b\u200c\u200d\ufeff]*$/u;

function canReplaceMaxShortcut(text, shortcut) {
  const index = String(text || "").lastIndexOf(shortcut);
  if (index < 0) {
    return false;
  }
  return maxTrailingPattern.test(String(text || "").slice(index + shortcut.length));
}

function replaceMaxShortcutText(text, shortcut, finalText) {
  if (!canReplaceMaxShortcut(text, shortcut)) {
    return null;
  }
  const index = text.lastIndexOf(shortcut);
  return `${text.slice(0, index)}${finalText}`;
}

assert.equal(canReplaceMaxShortcut("/прив", "/прив"), true);
assert.equal(canReplaceMaxShortcut("/прив \u200b", "/прив"), true);
assert.equal(canReplaceMaxShortcut("/привx", "/прив"), false);
assert.equal(replaceMaxShortcutText("/прив", "/прив", "Здравствуйте"), "Здравствуйте");
assert.equal(replaceMaxShortcutText("hello /прив\u00a0", "/прив", "Здравствуйте"), "hello Здравствуйте");
assert.equal(replaceMaxShortcutText("/прив already", "/прив", "Здравствуйте"), null);

console.log("stage8 checks passed");
