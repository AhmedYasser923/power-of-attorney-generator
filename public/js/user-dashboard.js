'use strict';

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
