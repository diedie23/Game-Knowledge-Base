/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║          wand-worker.js — 智能魔棒 (Flood Fill) Worker          ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  运行在 Web Worker 线程中，避免主线程阻塞                         ║
 * ║  支持：色相/颜色容差、连续/全局模式、边缘羽化                      ║
 * ║  数据精度：Float32Array (0.0~1.0)                               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * ─── 主线程 ↔ Worker 通信协议 ───
 *
 * 【主线程 → Worker (postMessage)】
 * {
 *   type: 'floodFill',
 *   imageData: Uint8ClampedArray,   // RGBA 像素数据（原图）
 *   width: number,
 *   height: number,
 *   seedX: number,                  // 鼠标点击的种子点 X
 *   seedY: number,                  // 鼠标点击的种子点 Y
 *   tolerance: number,              // 色相容差 (0~180°)
 *   satTolerance: number,           // 饱和度容差 (0~100)
 *   valTolerance: number,           // 明度容差 (0~100)
 *   contiguous: boolean,            // true=连续区域, false=全图匹配
 *   featherRadius: number,          // 羽化半径 (0=不羽化, 1~20px)
 *   colorMode: 'hsv' | 'rgb',      // 颜色比较模式
 *   rgbTolerance: number            // RGB 模式下的欧几里得距离容差
 * }
 *
 * 【Worker → 主线程 (postMessage)】
 * {
 *   type: 'floodFillResult',
 *   mask: Float32Array,             // W×H 的浮点 Mask (0.0~1.0)
 *   bounds: {x, y, w, h},          // 选区的包围盒
 *   pixelCount: number,             // 被选中的像素总数
 *   elapsed: number                 // 耗时 (ms)
 * }
 *
 * 也支持进度回报：
 * { type: 'progress', percent: number }
 */

'use strict';

// ════════════════════════════════════════════════════
// §1  颜色空间转换
// ════════════════════════════════════════════════════

/**
 * RGB → HSV 转换
 * @param {number} r 0~255
 * @param {number} g 0~255
 * @param {number} b 0~255
 * @returns {[number, number, number]} [H: 0~360°, S: 0~100, V: 0~100]
 */
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  if (d !== 0) {
    if (max === r)      h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * (((b - r) / d) + 2);
    else                h = 60 * (((r - g) / d) + 4);
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

/**
 * 色相环距离（考虑 360° 环绕）
 * 例：hueDistance(10, 350) = 20, 不是 340
 */
function hueDistance(h1, h2) {
  const d = Math.abs(h1 - h2);
  return d > 180 ? 360 - d : d;
}

/**
 * RGB 欧几里得距离（用于 rgb 颜色模式）
 * √((r1-r2)² + (g1-g2)² + (b1-b2)²)
 */
function rgbDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ════════════════════════════════════════════════════
// §2  颜色相似度判断
// ════════════════════════════════════════════════════

/**
 * 判断两个像素是否"颜色相似"
 *
 * HSV 模式：
 *   - 色相差 ≤ tolerance  AND
 *   - 饱和度差 ≤ satTolerance  AND
 *   - 明度差 ≤ valTolerance
 *   返回 0.0~1.0 的匹配强度（用于软边缘）
 *
 * RGB 模式：
 *   - 欧几里得距离 ≤ rgbTolerance
 *   返回 0.0~1.0 的匹配强度
 */
function colorSimilarity(params, seedIdx, testIdx) {
  const { imageData, colorMode, tolerance, satTolerance, valTolerance, rgbTolerance, hsvCache } = params;
  const so = seedIdx * 4;
  const to = testIdx * 4;

  if (colorMode === 'rgb') {
    // ── RGB 欧几里得距离模式 ──
    const dist = rgbDistance(
      imageData[so], imageData[so + 1], imageData[so + 2],
      imageData[to], imageData[to + 1], imageData[to + 2]
    );
    if (dist > rgbTolerance) return 0;
    // 线性衰减: 距离为0时匹配度=1, 距离=tolerance时匹配度≈0
    return 1.0 - (dist / rgbTolerance);
  }

  // ── HSV 色相匹配模式 ──
  const sh = hsvCache[seedIdx * 3];      // 种子点色相
  const ss = hsvCache[seedIdx * 3 + 1];  // 种子点饱和度
  const sv = hsvCache[seedIdx * 3 + 2];  // 种子点明度

  const th = hsvCache[testIdx * 3];      // 测试点色相
  const ts = hsvCache[testIdx * 3 + 1];
  const tv = hsvCache[testIdx * 3 + 2];

  const hDist = hueDistance(sh, th);
  const sDist = Math.abs(ss - ts);
  const vDist = Math.abs(sv - tv);

  // 三个维度都必须在容差范围内
  if (hDist > tolerance || sDist > satTolerance || vDist > valTolerance) return 0;

  // 综合匹配强度 = 三个维度的归一化距离的加权平均
  // 使用 smoothstep 使边缘更自然
  const hFactor = 1.0 - smoothstep(tolerance * 0.7, tolerance, hDist);
  const sFactor = 1.0 - smoothstep(satTolerance * 0.7, satTolerance, sDist);
  const vFactor = 1.0 - smoothstep(valTolerance * 0.7, valTolerance, vDist);

  // 色相权重最高（0.5），饱和度和明度各 0.25
  return hFactor * 0.5 + sFactor * 0.25 + vFactor * 0.25;
}

/**
 * Hermite smoothstep 插值
 * edge0 < edge1, x 在 [edge0, edge1] 范围内从 0 平滑过渡到 1
 */
function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x <= edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ════════════════════════════════════════════════════
// §3  连续区域泛洪 (非递归栈实现)
// ════════════════════════════════════════════════════

/**
 * 基于栈的非递归 Flood Fill
 *
 * 原理：
 *  1. 从种子点 (seedX, seedY) 出发
 *  2. 使用显式栈（而非递归调用栈）管理待检测像素
 *  3. 采用"扫描线填充"优化：每行连续扩展，减少栈操作次数
 *  4. 每个像素写入 Float32 匹配强度 (0.0~1.0)
 *
 * 性能考量：
 *  - 使用 Uint8Array 作为 visited 位图，避免 Set 的哈希开销
 *  - 扫描线算法将 O(pixels) 个栈操作减少到 O(scanlines) 级
 *  - 4096×4096 图片约需 ~64MB visited + 64MB mask，在 Worker 中安全运行
 *
 * @param {object} params  包含 imageData, width, height, seedX, seedY 等
 * @returns {Float32Array} W×H 的浮点 mask
 */
function floodFillContiguous(params) {
  const { width, height, seedX, seedY } = params;
  const total = width * height;
  const mask = new Float32Array(total);       // 输出 mask
  const visited = new Uint8Array(total);      // 访问标记位图
  const seedIdx = seedY * width + seedX;

  // ── 种子点有效性检查 ──
  if (seedX < 0 || seedX >= width || seedY < 0 || seedY >= height) return mask;
  if (params.imageData[seedIdx * 4 + 3] < 10) return mask; // 透明像素跳过

  // ── 使用显式栈进行扫描线泛洪 ──
  // 栈中存储 [x, y] 对
  const stack = [seedX, seedY];
  visited[seedIdx] = 1;
  mask[seedIdx] = 1.0;

  let pixelCount = 0;
  let minX = seedX, maxX = seedX, minY = seedY, maxY = seedY;

  // 进度报告计数器
  let progressCounter = 0;
  const progressInterval = Math.max(1000, total >> 5); // 每 ~3% 报告一次

  while (stack.length > 0) {
    // 弹出当前点
    const cy = stack.pop();
    const cx = stack.pop();

    // ── 扫描线优化：先向左扩展，再向右扫 ──
    // 找到本行的最左匹配点
    let leftX = cx;
    while (leftX > 0) {
      const testIdx = cy * width + (leftX - 1);
      if (visited[testIdx] || params.imageData[testIdx * 4 + 3] < 10) break;
      const sim = colorSimilarity(params, seedIdx, testIdx);
      if (sim < 0.01) break;
      leftX--;
      visited[testIdx] = 1;
      mask[testIdx] = sim;
    }

    // 从最左点向右扫描整行
    let x = leftX;
    let checkAbove = true;  // 是否需要检查上方行
    let checkBelow = true;  // 是否需要检查下方行

    while (x < width) {
      const idx = cy * width + x;

      // 当前点尚未处理时
      if (!visited[idx]) {
        if (params.imageData[idx * 4 + 3] < 10) break; // 透明终止
        const sim = colorSimilarity(params, seedIdx, idx);
        if (sim < 0.01) break; // 颜色不匹配终止
        visited[idx] = 1;
        mask[idx] = sim;
      }

      // 统计
      pixelCount++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      // ── 检查上方像素 ──
      if (cy > 0) {
        const aboveIdx = (cy - 1) * width + x;
        if (!visited[aboveIdx] && params.imageData[aboveIdx * 4 + 3] >= 10) {
          const sim = colorSimilarity(params, seedIdx, aboveIdx);
          if (sim >= 0.01) {
            if (checkAbove) {
              stack.push(x, cy - 1); // 压入上方扫描线种子点
              checkAbove = false;
            }
          } else {
            checkAbove = true; // 遇到不匹配，重置标记
          }
        } else {
          checkAbove = true;
        }
      }

      // ── 检查下方像素 ──
      if (cy < height - 1) {
        const belowIdx = (cy + 1) * width + x;
        if (!visited[belowIdx] && params.imageData[belowIdx * 4 + 3] >= 10) {
          const sim = colorSimilarity(params, seedIdx, belowIdx);
          if (sim >= 0.01) {
            if (checkBelow) {
              stack.push(x, cy + 1);
              checkBelow = false;
            }
          } else {
            checkBelow = true;
          }
        } else {
          checkBelow = true;
        }
      }

      x++;

      // 进度报告
      progressCounter++;
      if (progressCounter >= progressInterval) {
        progressCounter = 0;
        self.postMessage({
          type: 'progress',
          percent: Math.min(95, (pixelCount / total) * 100)
        });
      }
    }
  }

  return mask;
}

// ════════════════════════════════════════════════════
// §4  全局匹配 (非连续模式)
// ════════════════════════════════════════════════════

/**
 * 全图扫描模式：不要求区域连续，匹配所有颜色相似的像素
 * 适用于选取散落在画面各处的同色区域
 */
function floodFillGlobal(params) {
  const { width, height, seedX, seedY } = params;
  const total = width * height;
  const mask = new Float32Array(total);
  const seedIdx = seedY * width + seedX;

  if (params.imageData[seedIdx * 4 + 3] < 10) return mask;

  let pixelCount = 0;
  let minX = width, maxX = 0, minY = height, maxY = 0;

  for (let i = 0; i < total; i++) {
    // 跳过透明像素
    if (params.imageData[i * 4 + 3] < 10) continue;

    const sim = colorSimilarity(params, seedIdx, i);
    if (sim >= 0.01) {
      mask[i] = sim;
      pixelCount++;
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // 进度报告
    if (i % 100000 === 0) {
      self.postMessage({ type: 'progress', percent: (i / total) * 95 });
    }
  }

  return mask;
}

// ════════════════════════════════════════════════════
// §5  边缘羽化 (Gaussian Blur on Mask)
// ════════════════════════════════════════════════════

/**
 * 对 Float32 Mask 进行高斯模糊实现羽化效果
 *
 * 原理：
 *  1. 将 2D 高斯核拆解为两个 1D 卷积（水平 + 垂直），时间复杂度 O(n·r) → O(n·2r)
 *  2. 采用 σ = radius / 2 的高斯分布
 *  3. 只处理 mask 边缘附近的像素（距离边界 ≤ 2×radius 的像素）以优化性能
 *  4. 羽化后 mask 值仍在 [0, 1] 范围内
 *
 * 性能说明：
 *  - 可分离高斯模糊：先水平后垂直（或反之），每维只需 O(r) 次乘加
 *  - 对于 radius=10 的 4096×4096 图：~4096×4096×20 = ~335M 次浮点运算
 *  - Float32Array 操作在 V8 中高度优化，Worker 中约 50~200ms
 *
 * @param {Float32Array} mask   W×H 的浮点 mask
 * @param {number} width
 * @param {number} height
 * @param {number} radius       羽化半径 (像素)
 * @returns {Float32Array}      羽化后的 mask
 */
function gaussianFeather(mask, width, height, radius) {
  if (radius <= 0) return mask;

  const total = width * height;
  const sigma = Math.max(radius / 2, 0.5);

  // ── 预计算 1D 高斯核权重 ──
  // 核大小 = 2 × radius + 1
  const kernelSize = radius * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  let kernelSum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    // 高斯函数: G(x) = e^(-x²/(2σ²))
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernelSum += kernel[i];
  }
  // 归一化核（保证权重和为 1）
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= kernelSum;
  }

  // ── Pass 1: 水平方向卷积 ──
  const temp = new Float32Array(total);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let wSum = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = x + k;
        if (nx >= 0 && nx < width) {
          const w = kernel[k + radius];
          sum += mask[rowOffset + nx] * w;
          wSum += w;
        }
      }
      temp[rowOffset + x] = sum / wSum;
    }
  }

  // ── Pass 2: 垂直方向卷积 ──
  const result = new Float32Array(total);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      let wSum = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = y + k;
        if (ny >= 0 && ny < height) {
          const w = kernel[k + radius];
          sum += temp[ny * width + x] * w;
          wSum += w;
        }
      }
      result[y * width + x] = sum / wSum;
    }
  }

  return result;
}

/**
 * 优化版羽化：仅对 mask 边缘区域进行模糊
 * 通过先检测哪些像素在 "边缘带" 内（相邻像素 mask 值差异大），
 * 只对这些区域做完整高斯模糊，内部和外部保持原值。
 * 对于大面积选区，这比全图模糊快 3~10 倍。
 */
function featherEdgesOnly(mask, width, height, radius) {
  if (radius <= 0) return mask;

  const total = width * height;
  const bandRadius = radius * 2; // 扩展带宽度

  // ── Step 1: 找到边缘像素（mask 值变化的区域） ──
  const isEdgeBand = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const val = mask[idx];
      // 检查4邻域是否有不同值
      let isEdge = false;
      if (x > 0 && Math.abs(mask[idx - 1] - val) > 0.01) isEdge = true;
      if (!isEdge && x < width - 1 && Math.abs(mask[idx + 1] - val) > 0.01) isEdge = true;
      if (!isEdge && y > 0 && Math.abs(mask[idx - width] - val) > 0.01) isEdge = true;
      if (!isEdge && y < height - 1 && Math.abs(mask[idx + width] - val) > 0.01) isEdge = true;
      if (isEdge) isEdgeBand[idx] = 1;
    }
  }

  // ── Step 2: 膨胀边缘带（扩展 bandRadius 像素） ──
  // 使用距离变换的简化版：迭代膨胀
  const expanded = new Uint8Array(isEdgeBand);
  for (let iter = 0; iter < bandRadius; iter++) {
    const prev = new Uint8Array(expanded);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (!prev[idx] && (prev[idx - 1] || prev[idx + 1] || prev[idx - width] || prev[idx + width])) {
          expanded[idx] = 1;
        }
      }
    }
  }

  // ── Step 3: 仅对边缘带内的像素做高斯模糊 ──
  const result = new Float32Array(mask); // 复制原始值
  const sigma = Math.max(radius / 2, 0.5);
  const kernelSize = radius * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  let kernelSum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernelSum += kernel[i];
  }
  for (let i = 0; i < kernelSize; i++) kernel[i] /= kernelSum;

  // 水平 pass（仅边缘带）
  const temp = new Float32Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!expanded[idx]) continue;
      let sum = 0, wSum = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = x + k;
        if (nx >= 0 && nx < width) {
          const w = kernel[k + radius];
          sum += mask[y * width + nx] * w;
          wSum += w;
        }
      }
      temp[idx] = sum / wSum;
    }
  }

  // 垂直 pass（仅边缘带）
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const idx = y * width + x;
      if (!expanded[idx]) continue;
      let sum = 0, wSum = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = y + k;
        if (ny >= 0 && ny < height) {
          const w = kernel[k + radius];
          sum += temp[ny * width + x] * w;
          wSum += w;
        }
      }
      result[idx] = sum / wSum;
    }
  }

  return result;
}

// ════════════════════════════════════════════════════
// §6  HSV 缓存预构建
// ════════════════════════════════════════════════════

/**
 * 预计算整张图的 HSV 值，存入 Float32Array
 * 避免在泛洪比较时重复转换，一次转换 = O(N)，后续查找 = O(1)
 */
function buildHSVCache(imageData, width, height) {
  const total = width * height;
  const cache = new Float32Array(total * 3);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const hsv = rgb2hsv(imageData[o], imageData[o + 1], imageData[o + 2]);
    cache[i * 3] = hsv[0];
    cache[i * 3 + 1] = hsv[1];
    cache[i * 3 + 2] = hsv[2];
  }
  return cache;
}

// ════════════════════════════════════════════════════
// §7  Worker 主消息处理
// ════════════════════════════════════════════════════

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'floodFill') {
    const startTime = performance.now();

    const { imageData, width, height, seedX, seedY,
            tolerance, satTolerance, valTolerance,
            contiguous, featherRadius, colorMode, rgbTolerance } = msg;

    // 预构建 HSV 缓存
    self.postMessage({ type: 'progress', percent: 5 });
    const hsvCache = buildHSVCache(imageData, width, height);
    self.postMessage({ type: 'progress', percent: 15 });

    // 打包参数对象
    const params = {
      imageData,
      width,
      height,
      seedX,
      seedY,
      tolerance: tolerance || 20,
      satTolerance: satTolerance || 30,
      valTolerance: valTolerance || 30,
      colorMode: colorMode || 'hsv',
      rgbTolerance: rgbTolerance || 50,
      hsvCache
    };

    // ── 执行泛洪算法 ──
    let mask;
    if (contiguous !== false) {
      mask = floodFillContiguous(params);
    } else {
      mask = floodFillGlobal(params);
    }
    self.postMessage({ type: 'progress', percent: 75 });

    // ── 边缘羽化 ──
    const fr = featherRadius || 0;
    if (fr > 0) {
      // 像素数 < 200万用全图模糊，否则用边缘优化版
      const total = width * height;
      if (total < 2000000) {
        mask = gaussianFeather(mask, width, height, fr);
      } else {
        mask = featherEdgesOnly(mask, width, height, fr);
      }
    }
    self.postMessage({ type: 'progress', percent: 95 });

    // ── 计算统计信息 ──
    let pixelCount = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (let i = 0, n = width * height; i < n; i++) {
      if (mask[i] > 0.01) {
        pixelCount++;
        const x = i % width;
        const y = (i / width) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    const elapsed = performance.now() - startTime;

    // ── 返回结果（使用 Transferable 零拷贝传输） ──
    self.postMessage({
      type: 'floodFillResult',
      mask: mask,
      bounds: {
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1
      },
      pixelCount,
      elapsed: Math.round(elapsed)
    }, [mask.buffer]); // Transferable 传输，避免内存复制
  }
};
