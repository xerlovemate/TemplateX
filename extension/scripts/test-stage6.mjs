import assert from "node:assert/strict";

function resolveTemplateBody(body, values) {
  return String(body || "").replace(/{{\s*([a-zA-Zа-яА-Я0-9_ -]+)\s*}}/g, (_, rawName) => {
    const name = rawName.trim();
    return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name] || "") : "";
  });
}

function buildOverlayPayload(type, payload) {
  return {
    source: "templateio-overlay-frame",
    type,
    ...payload
  };
}

function createRequestGuard() {
  const processed = new Set();
  return {
    accept(requestId) {
      if (processed.has(requestId)) {
        return false;
      }
      processed.add(requestId);
      return true;
    }
  };
}

function createShortcutLock() {
  let lock = null;
  return {
    start(editor, shortcut, templateId, now) {
      lock = { editor, shortcut, templateId, startedAt: now };
    },
    isLocked(editor, shortcut, templateId, now) {
      if (!lock || now - lock.startedAt > 800) {
        lock = null;
        return false;
      }
      return lock.editor === editor && lock.shortcut === shortcut && lock.templateId === templateId;
    }
  };
}

const resolved = resolveTemplateBody(
  "1. {{detail_1}}\n2. {{ detail_2 }}\n3. {{detail_3}}\n4. {{missing}}",
  {
    detail_1: "first",
    detail_2: "second",
    detail_3: "third"
  }
).replace(/{{\s*[^}]+\s*}}/g, "");
assert.equal(resolved.includes("{{"), false);
assert.equal(resolved.includes("first"), true);
assert.equal(resolved.includes("second"), true);
assert.equal(resolved.includes("third"), true);

const payload = buildOverlayPayload("TEMPLATEIO_VARIABLES_SUBMIT", {
  requestId: "req-1",
  templateId: "template-details",
  values: { detail_1: "A" }
});
assert.equal(payload.source, "templateio-overlay-frame");
assert.equal(payload.type, "TEMPLATEIO_VARIABLES_SUBMIT");
assert.equal(payload.requestId, "req-1");
assert.deepEqual(payload.values, { detail_1: "A" });

const guard = createRequestGuard();
assert.equal(guard.accept("req-1"), true);
assert.equal(guard.accept("req-1"), false);
assert.equal(guard.accept("req-2"), true);

const lock = createShortcutLock();
const editor = {};
lock.start(editor, "/прив", "template-greeting", 1000);
assert.equal(lock.isLocked(editor, "/прив", "template-greeting", 1200), true);
assert.equal(lock.isLocked(editor, "/прив", "template-greeting", 1901), false);

console.log("stage6 checks passed");
