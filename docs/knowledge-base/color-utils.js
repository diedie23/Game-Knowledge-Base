/**
 * ═══════════════════════════════════════════════════════
 *   Color Utilities v1.0
 *   美术在线工具公共颜色空间转换
 * ═══════════════════════════════════════════════════════
 *
 * 用法：
 *   <script src="color-utils.js"></script>
 *
 *   ColorUtils.rgb2hex(255, 128, 0)     → '#ff8000'
 *   ColorUtils.hex2rgb('#ff8000')       → [255, 128, 0]
 *   ColorUtils.rgb2hsv(255, 128, 0)     → [30, 100, 100]
 *   ColorUtils.hsv2rgb(30, 100, 100)    → [255, 128, 0]
 *   ColorUtils.rgb2lab(255, 128, 0)     → [67.2, 43.2, 72.9]
 *   ColorUtils.deltaE(lab1, lab2)       → 12.5
 *   ColorUtils.rgb2hsl(255, 128, 0)     → [30, 100, 50]
 *   ColorUtils.hsl2rgb(30, 100, 50)     → [255, 128, 0]
 */
;(function(global) {
  'use strict';

  /* ═══ Hex ↔ RGB ═══ */

  /**
   * RGB → Hex
   * @param {number} r 0-255
   * @param {number} g 0-255
   * @param {number} b 0-255
   * @returns {string} '#rrggbb'
   */
  function rgb2hex(r, g, b) {
    return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('');
  }

  /**
   * Hex → RGB
   * @param {string} hex '#rgb' or '#rrggbb'
   * @returns {number[]} [r, g, b] 0-255
   */
  function hex2rgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }

  /* ═══ RGB ↔ HSV ═══ */

  /**
   * RGB → HSV
   * @returns {number[]} [h: 0-360, s: 0-100, v: 0-100]
   */
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0, s = max === 0 ? 0 : d / max, v = max;

    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(v * 100)];
  }

  /**
   * HSV → RGB
   * @param {number} h 0-360
   * @param {number} s 0-100
   * @param {number} v 0-100
   * @returns {number[]} [r, g, b] 0-255
   */
  function hsv2rgb(h, s, v) {
    h /= 360; s /= 100; v /= 100;
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  /* ═══ RGB ↔ HSL ═══ */

  /**
   * RGB → HSL
   * @returns {number[]} [h: 0-360, s: 0-100, l: 0-100]
   */
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  /**
   * HSL → RGB
   * @param {number} h 0-360
   * @param {number} s 0-100
   * @param {number} l 0-100
   * @returns {number[]} [r, g, b] 0-255
   */
  function hsl2rgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p2 = 2 * l - q2;
      r = hue2rgb(p2, q2, h + 1/3);
      g = hue2rgb(p2, q2, h);
      b = hue2rgb(p2, q2, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  /* ═══ RGB → Lab (CIE L*a*b*) ═══ */

  /**
   * RGB → Lab
   * @returns {number[]} [L: 0-100, a: -128~128, b: -128~128]
   */
  function rgb2lab(r, g, b) {
    // sRGB → linear
    let lr = r / 255, lg = g / 255, lb = b / 255;
    lr = lr > 0.04045 ? Math.pow((lr + 0.055) / 1.055, 2.4) : lr / 12.92;
    lg = lg > 0.04045 ? Math.pow((lg + 0.055) / 1.055, 2.4) : lg / 12.92;
    lb = lb > 0.04045 ? Math.pow((lb + 0.055) / 1.055, 2.4) : lb / 12.92;

    // linear RGB → XYZ (D65)
    let x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
    let y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750);
    let z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / 1.08883;

    // XYZ → Lab
    const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16/116;
    x = f(x); y = f(y); z = f(z);

    const L = 116 * y - 16;
    const a = 500 * (x - y);
    const bVal = 200 * (y - z);
    return [L, a, bVal];
  }

  /**
   * Lab → RGB
   * @param {number} L 0-100
   * @param {number} a
   * @param {number} b
   * @returns {number[]} [r, g, b] 0-255 (clamped)
   */
  function lab2rgb(L, a, bVal) {
    let y = (L + 16) / 116;
    let x = a / 500 + y;
    let z = y - bVal / 200;

    const f_inv = (t) => {
      const t3 = t * t * t;
      return t3 > 0.008856 ? t3 : (t - 16/116) / 7.787;
    };
    x = 0.95047 * f_inv(x);
    y = 1.00000 * f_inv(y);
    z = 1.08883 * f_inv(z);

    // XYZ → linear RGB
    let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
    let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
    let b2 = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

    // linear → sRGB
    const gamma = (c) => c > 0.0031308 ? 1.055 * Math.pow(c, 1/2.4) - 0.055 : 12.92 * c;
    r = gamma(r); g = gamma(g); b2 = gamma(b2);

    return [
      Math.round(Math.max(0, Math.min(255, r * 255))),
      Math.round(Math.max(0, Math.min(255, g * 255))),
      Math.round(Math.max(0, Math.min(255, b2 * 255)))
    ];
  }

  /* ═══ 色差计算 ═══ */

  /**
   * CIE76 色差 (简单欧氏距离)
   * @param {number[]} lab1 [L, a, b]
   * @param {number[]} lab2 [L, a, b]
   * @returns {number}
   */
  function deltaE(lab1, lab2) {
    const dL = lab1[0] - lab2[0];
    const da = lab1[1] - lab2[1];
    const db = lab1[2] - lab2[2];
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  /**
   * RGB 色差 (快速近似)
   * @param {number[]} rgb1 [r, g, b]
   * @param {number[]} rgb2 [r, g, b]
   * @returns {number} 0~441.67
   */
  function rgbDistance(rgb1, rgb2) {
    const dr = rgb1[0] - rgb2[0];
    const dg = rgb1[1] - rgb2[1];
    const db = rgb1[2] - rgb2[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /* ═══ 工具函数 ═══ */

  /**
   * 限制值范围
   */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * 混合两个颜色
   * @param {number[]} rgb1
   * @param {number[]} rgb2
   * @param {number} t 0-1 (0=rgb1, 1=rgb2)
   * @returns {number[]} [r, g, b]
   */
  function mixRGB(rgb1, rgb2, t) {
    return [
      Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t),
      Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t),
      Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t)
    ];
  }

  /**
   * 从 ImageData 获取像素颜色
   * @param {ImageData} imageData
   * @param {number} x
   * @param {number} y
   * @returns {number[]} [r, g, b, a]
   */
  function getPixel(imageData, x, y) {
    const i = (y * imageData.width + x) * 4;
    return [imageData.data[i], imageData.data[i+1], imageData.data[i+2], imageData.data[i+3]];
  }

  /**
   * 设置 ImageData 像素颜色
   * @param {ImageData} imageData
   * @param {number} x
   * @param {number} y
   * @param {number[]} rgba [r, g, b, a]
   */
  function setPixel(imageData, x, y, rgba) {
    const i = (y * imageData.width + x) * 4;
    imageData.data[i]   = rgba[0];
    imageData.data[i+1] = rgba[1];
    imageData.data[i+2] = rgba[2];
    imageData.data[i+3] = rgba[3] !== undefined ? rgba[3] : 255;
  }

  // 暴露全局 API
  global.ColorUtils = {
    rgb2hex, hex2rgb,
    rgb2hsv, hsv2rgb,
    rgb2hsl, hsl2rgb,
    rgb2lab, lab2rgb,
    deltaE, rgbDistance,
    clamp, mixRGB,
    getPixel, setPixel
  };

})(typeof window !== 'undefined' ? window : this);
