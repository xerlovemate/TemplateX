import assert from "node:assert/strict";

function createMaxSuccessLock() {
  let processedKey = "";
  let processedUntil = 0;
  return {
    rememberSuccess(lockKey, now) {
      processedKey = lockKey;
      processedUntil = now + 2000;
    },
    shouldIgnore(lockKey, now) {
      return Boolean(lockKey && processedKey === lockKey && now < processedUntil);
    }
  };
}

function createMaxProcessingLock() {
  let processingKey = "";
  let processingUntil = 0;
  return {
    start(lockKey, now) {
      processingKey = lockKey;
      processingUntil = now + 2000;
    },
    finish(lockKey) {
      if (processingKey === lockKey) {
        processingKey = "";
        processingUntil = 0;
      }
    },
    isProcessing(lockKey, now) {
      if (now >= processingUntil) {
        processingKey = "";
        processingUntil = 0;
        return false;
      }
      return Boolean(lockKey && lockKey === processingKey);
    }
  };
}

const successLock = createMaxSuccessLock();
assert.equal(successLock.shouldIgnore("/priv|template-greeting", 1000), false);
successLock.rememberSuccess("/priv|template-greeting", 1000);
assert.equal(successLock.shouldIgnore("/priv|template-greeting", 1500), true);
assert.equal(successLock.shouldIgnore("/details|template-details", 1500), false);
assert.equal(successLock.shouldIgnore("/priv|template-greeting", 3101), false);

const processingLock = createMaxProcessingLock();
processingLock.start("/details|template-details", 2000);
assert.equal(processingLock.isProcessing("/details|template-details", 2500), true);
processingLock.finish("/details|template-details");
assert.equal(processingLock.isProcessing("/details|template-details", 2600), false);

console.log("stage10 checks passed");
