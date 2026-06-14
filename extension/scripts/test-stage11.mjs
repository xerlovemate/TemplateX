import assert from "node:assert/strict";

function createMaxDebugState() {
  return {
    shortcutKeydowns: 0,
    insertAttempts: 0,
    variableSubmits: 0,
    duplicateSkips: 0,
    lastEvents: []
  };
}

function pushMaxDebugEvent(debugState, event) {
  debugState.lastEvents.push({
    time: new Date("2026-06-14T00:00:00.000Z").toISOString(),
    ...event
  });
  debugState.lastEvents = debugState.lastEvents.slice(-50);
}

function describeElement(element) {
  if (!element) {
    return null;
  }
  return {
    tag: element.tagName,
    id: element.id || "",
    className: String(element.className || ""),
    role: element.getAttribute && element.getAttribute("role"),
    contenteditable: element.getAttribute && element.getAttribute("contenteditable"),
    lexical: element.getAttribute && element.getAttribute("data-lexical-editor"),
    placeholder: element.getAttribute && (element.getAttribute("placeholder") || element.getAttribute("aria-placeholder")),
    textContent: String(element.textContent || "").slice(0, 300)
  };
}

const debugState = createMaxDebugState();
debugState.shortcutKeydowns += 1;
debugState.insertAttempts += 1;
debugState.variableSubmits += 1;
debugState.duplicateSkips += 1;
pushMaxDebugEvent(debugState, { type: "exec-insert-start" });

assert.equal(debugState.shortcutKeydowns, 1);
assert.equal(debugState.insertAttempts, 1);
assert.equal(debugState.variableSubmits, 1);
assert.equal(debugState.duplicateSkips, 1);
assert.equal(debugState.lastEvents.length, 1);
assert.equal(debugState.lastEvents[0].type, "exec-insert-start");

const element = {
  tagName: "DIV",
  id: "",
  className: "contenteditable",
  textContent: "x".repeat(400),
  getAttribute(name) {
    return {
      role: "textbox",
      contenteditable: "",
      "data-lexical-editor": "true",
      placeholder: "Сообщение",
      "aria-placeholder": "Сообщение"
    }[name];
  }
};

const described = describeElement(element);
assert.equal(described.tag, "DIV");
assert.equal(described.role, "textbox");
assert.equal(described.lexical, "true");
assert.equal(described.textContent.length, 300);

console.log("stage11 checks passed");
