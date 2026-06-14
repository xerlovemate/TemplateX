import assert from "node:assert/strict";

function shouldPreCaptureMaxSlash({ isMaxSite, isOverlayOpen, isModalOpen, key, ctrlKey, metaKey, altKey, hasMaxComposer }) {
  return Boolean(
    isMaxSite &&
    !isOverlayOpen &&
    !isModalOpen &&
    key === "/" &&
    !ctrlKey &&
    !metaKey &&
    !altKey &&
    hasMaxComposer
  );
}

function buildMaxPreCaptureInsertOptions(context) {
  return {
    removeTrigger: Boolean(context && context.removeTrigger && !context.maxPreCapture),
    removeTextBeforeInsert: context && !context.maxPreCapture ? context.removeTextBeforeInsert : "",
    requireTokenReplacement: Boolean(context && !context.maxPreCapture && (context.removeTextBeforeInsert || context.removeTrigger)),
    maxPreCapture: Boolean(context && context.maxPreCapture),
    source: context && context.maxPreCapture ? "maxCommandCapture" : "direct"
  };
}

assert.equal(shouldPreCaptureMaxSlash({
  isMaxSite: true,
  isOverlayOpen: false,
  isModalOpen: false,
  key: "/",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  hasMaxComposer: true
}), true);

assert.equal(shouldPreCaptureMaxSlash({
  isMaxSite: true,
  isOverlayOpen: false,
  isModalOpen: false,
  key: "/",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  hasMaxComposer: true
}), false);

assert.equal(shouldPreCaptureMaxSlash({
  isMaxSite: true,
  isOverlayOpen: true,
  isModalOpen: false,
  key: "/",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  hasMaxComposer: true
}), false);

assert.deepEqual(buildMaxPreCaptureInsertOptions({
  maxPreCapture: true,
  removeTrigger: true,
  removeTextBeforeInsert: "/priv"
}), {
  removeTrigger: false,
  removeTextBeforeInsert: "",
  requireTokenReplacement: false,
  maxPreCapture: true,
  source: "maxCommandCapture"
});

console.log("stage13 checks passed");
