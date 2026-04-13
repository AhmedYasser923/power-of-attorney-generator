'use strict';

// ─── Live stat updates ────────────────────────────────────────────────────────
(function () {
  var _rawUSD = null;
  var _rawEGP = null;

  var sock = window._presenceSocket || (typeof io !== 'undefined' ? io() : null);
  if (!sock) return;

  sock.on('my_operation', function (op) {
    var opsEl = document.getElementById('ud-total-ops');
    if (opsEl) opsEl.textContent = parseInt(opsEl.textContent || '0') + 1;

    var usdEl = document.getElementById('ud-total-usd');
    if (usdEl) {
      if (_rawUSD === null) _rawUSD = parseFloat(usdEl.dataset.raw || '0');
      _rawUSD += op.costUSD || 0;
      usdEl.textContent = (_rawUSD || 0).toFixed(2);
    }

    var egpEl = document.getElementById('ud-total-egp');
    if (egpEl) {
      if (_rawEGP === null) _rawEGP = parseFloat(egpEl.dataset.raw || '0');
      _rawEGP += op.costEGP || 0;
      egpEl.textContent = (_rawEGP || 0).toFixed(2);
    }
  });
})();

// Month picker
(function () {
  var sel = document.getElementById('monthSelect');
  if (sel) {
    sel.addEventListener('change', function () {
      var parts = this.value.split('-');
      window.location.href = '/me?year=' + parts[0] + '&month=' + parts[1];
    });
  }
})();
