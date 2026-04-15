'use strict';

// Simple in-process semaphore — limits concurrent Gemini API calls per Cloud Run instance.
// No external dependencies; works in a stateless environment.
class Semaphore {
  constructor(concurrency) {
    this._max = concurrency;
    this._running = 0;
    this._queue = [];
  }
  run(fn) {
    return new Promise((resolve, reject) => {
      const execute = () => {
        this._running++;
        Promise.resolve().then(fn).then(resolve, reject).finally(() => {
          this._running--;
          if (this._queue.length) this._queue.shift()();
        });
      };
      if (this._running < this._max) execute();
      else this._queue.push(execute);
    });
  }
}

function isQuotaError(err) {
  const msg = String(err.message || '') + String(err.status || '');
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
}

module.exports = { geminiQueue: new Semaphore(5), isQuotaError };
