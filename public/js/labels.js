/* Builds the 50 x 25 mm sticker and sends it to the printer. */
(function (global) {
  'use strict';

  var SETTINGS_KEY = 'assetreg.label';

  var DEFAULTS = {
    width: 50,
    height: 25,
    show_company: true,
    show_category: true,
    show_name: true,
    show_date: true,
    show_serial: true,
    barcode_height: 8.5,
    copies: 1,
  };

  function loadSettings() {
    var saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    } catch (e) {
      saved = {};
    }
    var settings = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      settings[key] = saved[key] === undefined ? DEFAULTS[key] : saved[key];
    });
    return settings;
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      /* ignore - the sticker still prints, the choice just is not remembered */
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function shortDate(value) {
    if (!value) return '';
    var parts = String(value).slice(0, 10).split('-');
    return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : value;
  }

  /** One sticker as HTML. `asset` is a row from the API. */
  function buildLabel(asset, options) {
    var settings = Object.assign({}, loadSettings(), options || {});
    var barcodeWidth = Math.max(settings.width - 6, 20);
    var svg = global.Barcode128.toSVG(asset.asset_code, {
      width: barcodeWidth,
      height: settings.barcode_height,
      unit: 'mm',
    }).svg;

    var top = '';
    if (settings.show_company || settings.show_category) {
      top =
        '<div class="l-top">' +
        '<span class="l-owner">' +
        (settings.show_company ? escapeHtml(asset.company_code) : '') +
        '</span>' +
        '<span class="l-cat">' +
        (settings.show_category ? escapeHtml(asset.category_code) : '') +
        '</span>' +
        '</div>';
    }

    // The maker's serial when there is one, otherwise the company's own number.
    var serial = asset.serial_number || asset.unique_no || '';
    var serialLine =
      settings.show_serial && serial
        ? '<div class="l-serial">SN ' + escapeHtml(serial) + '</div>'
        : '';

    var foot = '';
    if (settings.show_name || settings.show_date) {
      foot =
        '<div class="l-foot">' +
        '<span>' +
        (settings.show_name ? escapeHtml(asset.name) : '') +
        '</span>' +
        '<span>' +
        (settings.show_date ? shortDate(asset.purchase_date) : '') +
        '</span>' +
        '</div>';
    }

    return (
      '<div class="asset-label" style="width:' +
      settings.width +
      'mm;height:' +
      settings.height +
      'mm">' +
      top +
      svg +
      '<div class="l-code">' +
      escapeHtml(asset.asset_code) +
      '</div>' +
      serialLine +
      foot +
      '</div>'
    );
  }

  /**
   * Prints one sticker per asset (repeated `copies` times). The browser print
   * dialog decides the printer; the @page rule fixes the sticker size.
   */
  function printLabels(assets, options) {
    var settings = Object.assign({}, loadSettings(), options || {});
    var copies = Math.min(Math.max(Number(settings.copies) || 1, 1), 50);
    var area = document.getElementById('print-area');
    var html = [];

    assets.forEach(function (asset) {
      for (var i = 0; i < copies; i++) html.push(buildLabel(asset, settings));
    });

    if (!html.length) return false;

    // Keep the @page rule in step with the sticker roll actually loaded.
    var style =
      '<style id="print-page-size">@page { size: ' +
      settings.width +
      'mm ' +
      settings.height +
      'mm; margin: 0; }</style>';

    area.innerHTML = style + html.join('');
    global.focus();
    global.print();

    // Free the memory once the dialog closes; a timeout covers browsers that
    // do not fire afterprint.
    var clear = function () {
      area.innerHTML = '';
      global.removeEventListener('afterprint', clear);
    };
    global.addEventListener('afterprint', clear);
    setTimeout(clear, 60000);
    return true;
  }

  global.Labels = {
    DEFAULTS: DEFAULTS,
    buildLabel: buildLabel,
    loadSettings: loadSettings,
    printLabels: printLabels,
    saveSettings: saveSettings,
    shortDate: shortDate,
  };
})(window);
