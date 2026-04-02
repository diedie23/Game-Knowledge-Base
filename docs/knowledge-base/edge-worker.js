/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║        edge-worker.js — Sobel 边缘检测 & 边缘图生成 Worker       ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  运行在 Web Worker 线程中                                        ║
 * ║  生成 edgeMap (Float32Array)，供主线程画笔实时查询               ║
 * ║  支持：Sobel / Scharr 算子、多尺度、自适应阈值                   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * ─── 主线程 ↔ Worker 通信协议 ───
 *
 * 【主线程 → Worker (postMessage)】
 * {
 *   type: 'buildEdgeMap',
 *   imageData: Uint8ClampedArray,   // RGBA 像素数据
 *   width: number,
 *   height: number,
 *   method: 'sobel' | 'scharr',    // 边缘检测算子
 *   blurRadius: number,             // 预模糊半径 (降噪，0=不模糊)
 *   normalize: boolean              // 是否归一化到 [0,1]
 * }
 *
 * 【Worker → 主线程 (postMessage)】
 * {
 *   type: 'edgeMapResult',
 *   edgeMap: Float32Array,          // W×H 边缘强度图 (0.0~1.0)
 *   maxEdge: number,                // 最大边缘强度值
 *   elapsed: number
 * }
 */

'use strict';

// ════════════════════════════════════════════════════
// §1  灰度转换
// ════════════════════════════════════════════════════

/**
 * RGBA → 灰度值 (Luminance)
 * 使用 ITU-R BT.601 标准加权系数
 * Y = 0.299R + 0.587G + 0.114B
 *
 * 为什么用这个公式而不是简单平均？
 * → 人眼对绿色最敏感，对蓝色最不敏感。
 * → 该权重使灰度图更符合人类视觉感知。
 */
function rgbaToGrayscale(imageData, width, height) {
  const total = width * height;
  const gray = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    // alpha < 10 的像素视为背景
    if (imageData[o + 3] < 10) {
      gray[i] = 0;
    } else {
      gray[i] = (
        0.299 * imageData[o] +
        0.587 * imageData[o + 1] +
        0.114 * imageData[o + 2]
      ) / 255;
    }
  }
  return gray;
}

// ════════════════════════════════════════════════════
// §2  高斯预模糊（降噪）
// ════════════════════════════════════════════════════

/**
 * 对灰度图做高斯模糊（可分离 1D × 1D）
 *
 * 为什么要在边缘检测前模糊？
 * → 图像噪声会导致 Sobel 算子检测出大量伪边缘
 * → 高斯模糊平滑噪声，保留真实边缘结构
 * → σ = radius / 2，较小的 σ 保留更多细节
 */
function gaussianBlur(gray, width, height, radius) {
  if (radius <= 0) return gray;

  const total = width * height;
  const sigma = Math.max(radius / 2, 0.5);
  const kernelSize = radius * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  let sum = 0;

  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < kernelSize; i++) kernel[i] /= sum;

  // 水平 pass
  const temp = new Float32Array(total);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0, w = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = x + k;
        if (nx >= 0 && nx < width) {
          const kw = kernel[k + radius];
          s += gray[y * width + nx] * kw;
          w += kw;
        }
      }
      temp[y * width + x] = s / w;
    }
  }

  // 垂直 pass
  const result = new Float32Array(total);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let s = 0, w = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = y + k;
        if (ny >= 0 && ny < height) {
          const kw = kernel[k + radius];
          s += temp[ny * width + x] * kw;
          w += kw;
        }
      }
      result[y * width + x] = s / w;
    }
  }

  return result;
}

// ════════════════════════════════════════════════════
// §3  Sobel 边缘检测核心
// ════════════════════════════════════════════════════

/**
 * Sobel 算子 — 一阶偏导近似
 *
 * 数学原理：
 *   Sobel 算子通过卷积核计算图像在 X 和 Y 方向的梯度（一阶导数近似值），
 *   梯度幅值越大 = 灰度变化越剧烈 = 边缘越强。
 *
 *   Gx (水平梯度核):        Gy (垂直梯度核):
 *   ┌──────────────┐        ┌──────────────┐
 *   │ -1   0   +1  │        │ -1  -2  -1   │
 *   │ -2   0   +2  │        │  0   0   0   │
 *   │ -1   0   +1  │        │ +1  +2  +1   │
 *   └──────────────┘        └──────────────┘
 *
 *   边缘强度 = √(Gx² + Gy²)
 *
 *   其中中间行/列权重为 2 是因为高斯平滑的思想：
 *   距离中心越近的像素对梯度贡献越大。
 *
 * 为什么选 Sobel 而非 Canny？
 * → Sobel 直接输出连续的强度值（Float32），天然适合用作画笔的"衰减因子"
 * → Canny 输出二值边缘，不适合做平滑的透明度调制
 * → Sobel 计算量更小，适合实时交互
 *
 * @param {Float32Array} gray  灰度图 [0,1]
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array} 边缘强度图 (未归一化)
 */
function sobelEdgeDetect(gray, width, height) {
  const total = width * height;
  const edgeMap = new Float32Array(total);

  // Sobel 3×3 卷积核（已展开为直接索引访问，避免嵌套循环开销）
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // 3×3 邻域采样
      //   p00 p01 p02
      //   p10 p11 p12
      //   p20 p21 p22
      const p00 = gray[(y - 1) * width + (x - 1)];
      const p01 = gray[(y - 1) * width + x];
      const p02 = gray[(y - 1) * width + (x + 1)];
      const p10 = gray[y * width + (x - 1)];
      // p11 = center, not needed for gradient
      const p12 = gray[y * width + (x + 1)];
      const p20 = gray[(y + 1) * width + (x - 1)];
      const p21 = gray[(y + 1) * width + x];
      const p22 = gray[(y + 1) * width + (x + 1)];

      // Gx = 右列 - 左列（中间权重×2）
      const gx = (-p00 + p02) + (-2 * p10 + 2 * p12) + (-p20 + p22);

      // Gy = 下行 - 上行（中间权重×2）
      const gy = (-p00 - 2 * p01 - p02) + (p20 + 2 * p21 + p22);

      // 梯度幅值 = √(Gx² + Gy²)
      edgeMap[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return edgeMap;
}

// ════════════════════════════════════════════════════
// §4  Scharr 算子（精度更高的替代方案）
// ════════════════════════════════════════════════════

/**
 * Scharr 算子 — 比 Sobel 旋转不变性更好
 *
 *   Gx:                     Gy:
 *   ┌───────────────┐       ┌───────────────┐
 *   │  -3   0   +3  │       │  -3  -10  -3  │
 *   │ -10   0  +10  │       │   0    0   0  │
 *   │  -3   0   +3  │       │  +3  +10  +3  │
 *   └───────────────┘       └───────────────┘
 *
 * 优势：
 * → 更好的旋转对称性，45° 边缘检测更准确
 * → 对弧线和曲面的边缘响应更均匀
 * 劣势：
 * → 对噪声更敏感（权重更大），需要更强的预模糊
 */
function scharrEdgeDetect(gray, width, height) {
  const total = width * height;
  const edgeMap = new Float32Array(total);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p00 = gray[(y - 1) * width + (x - 1)];
      const p01 = gray[(y - 1) * width + x];
      const p02 = gray[(y - 1) * width + (x + 1)];
      const p10 = gray[y * width + (x - 1)];
      const p12 = gray[y * width + (x + 1)];
      const p20 = gray[(y + 1) * width + (x - 1)];
      const p21 = gray[(y + 1) * width + x];
      const p22 = gray[(y + 1) * width + (x + 1)];

      const gx = (-3 * p00 + 3 * p02) + (-10 * p10 + 10 * p12) + (-3 * p20 + 3 * p22);
      const gy = (-3 * p00 - 10 * p01 - 3 * p02) + (3 * p20 + 10 * p21 + 3 * p22);

      edgeMap[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return edgeMap;
}

// ════════════════════════════════════════════════════
// §5  归一化 & 后处理
// ════════════════════════════════════════════════════

/**
 * 将 edgeMap 归一化到 [0, 1]
 * 使用百分位数归一化（忽略极端异常值）
 */
function normalizeEdgeMap(edgeMap, total) {
  // 找到 98 百分位数作为最大值（排除噪点毛刺）
  const sorted = new Float32Array(edgeMap).sort();
  // 跳过值为 0 的像素
  let nonZeroStart = 0;
  while (nonZeroStart < total && sorted[nonZeroStart] === 0) nonZeroStart++;
  if (nonZeroStart >= total) return edgeMap; // 全黑图

  const p98Index = Math.min(total - 1, nonZeroStart + Math.floor((total - nonZeroStart) * 0.98));
  const maxVal = sorted[p98Index];
  if (maxVal <= 0) return edgeMap;

  const result = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    result[i] = Math.min(1, edgeMap[i] / maxVal);
  }
  return result;
}

// ════════════════════════════════════════════════════
// §6  Worker 主消息处理
// ════════════════════════════════════════════════════

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'buildEdgeMap') {
    const startTime = performance.now();
    const { imageData, width, height, method, blurRadius, normalize } = msg;

    // Step 1: RGBA → 灰度
    self.postMessage({ type: 'progress', percent: 10 });
    let gray = rgbaToGrayscale(imageData, width, height);

    // Step 2: 高斯预模糊（降噪）
    self.postMessage({ type: 'progress', percent: 25 });
    gray = gaussianBlur(gray, width, height, blurRadius || 1);

    // Step 3: 边缘检测
    self.postMessage({ type: 'progress', percent: 50 });
    let edgeMap;
    if (method === 'scharr') {
      edgeMap = scharrEdgeDetect(gray, width, height);
    } else {
      edgeMap = sobelEdgeDetect(gray, width, height);
    }

    // Step 4: 找最大边缘强度
    let maxEdge = 0;
    const total = width * height;
    for (let i = 0; i < total; i++) {
      if (edgeMap[i] > maxEdge) maxEdge = edgeMap[i];
    }

    // Step 5: 归一化
    self.postMessage({ type: 'progress', percent: 80 });
    if (normalize !== false && maxEdge > 0) {
      edgeMap = normalizeEdgeMap(edgeMap, total);
      maxEdge = 1.0;
    }

    const elapsed = performance.now() - startTime;
    self.postMessage({ type: 'progress', percent: 100 });

    // 返回结果（Transferable 零拷贝）
    self.postMessage({
      type: 'edgeMapResult',
      edgeMap: edgeMap,
      maxEdge: maxEdge,
      elapsed: Math.round(elapsed)
    }, [edgeMap.buffer]);
  }
};
