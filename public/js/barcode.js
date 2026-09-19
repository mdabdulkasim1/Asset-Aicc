/*
 * Minimal Code 128 barcode renderer - no external library, so labels still
 * print on a site PC with no internet. Produces an inline SVG.
 *
 * Code set B covers every character an asset code uses (A-Z, 0-9, dash).
 * Each pattern below is the bar/space module widths for one symbol.
 */
(function (global) {
  'use strict';

  var PATTERNS = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'
  ];

  var START_B = 104;
  var STOP = 106;
  var QUIET_MODULES = 10; // blank margin each side, required by scanners

  function encode(text) {
    var values = [START_B];
    var checksum = START_B;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code < 32 || code > 126) {
        throw new Error('Character "' + text[i] + '" cannot be put in a barcode.');
      }
      var value = code - 32;
      values.push(value);
      checksum += value * (i + 1);
    }
    values.push(checksum % 103);
    values.push(STOP);
    return values;
  }

  /** Returns [{ x, width }] bar rectangles measured in modules, plus total width. */
  function bars(text) {
    var values = encode(text);
    var rects = [];
    var x = QUIET_MODULES;
    for (var i = 0; i < values.length; i++) {
      var pattern = PATTERNS[values[i]];
      for (var j = 0; j < pattern.length; j++) {
        var width = Number(pattern[j]);
        if (j % 2 === 0) rects.push({ x: x, width: width }); // even index = bar
        x += width;
      }
    }
    return { rects: rects, modules: x + QUIET_MODULES };
  }

  /**
   * Builds an SVG string sized in the unit given (default mm).
   * options: { width, height, unit, background }
   */
  function toSVG(text, options) {
    var opts = options || {};
    var unit = opts.unit || 'mm';
    var width = opts.width || 40;
    var height = opts.height || 10;
    var data = bars(String(text));
    var scale = width / data.modules;

    var parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" class="barcode-svg" viewBox="0 0 ' +
        data.modules + ' 100" preserveAspectRatio="none" width="' + width + unit +
        '" height="' + height + unit + '" shape-rendering="crispEdges">',
    ];
    if (opts.background !== false) {
      parts.push('<rect x="0" y="0" width="' + data.modules + '" height="100" fill="#ffffff"/>');
    }
    for (var i = 0; i < data.rects.length; i++) {
      parts.push(
        '<rect x="' + data.rects[i].x + '" y="0" width="' + data.rects[i].width +
          '" height="100" fill="#000000"/>'
      );
    }
    parts.push('</svg>');
    return { svg: parts.join(''), modules: data.modules, moduleWidth: scale };
  }

  global.Barcode128 = { encode: encode, bars: bars, toSVG: toSVG };
})(typeof window !== 'undefined' ? window : globalThis);
