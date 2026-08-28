import { describe, expect, it } from 'vitest';
import {
  compareImageDescriptors,
  createImageVisualDescriptor,
  IMAGE_COLOR_SIZE,
  IMAGE_COSMETIC_THRESHOLD,
  IMAGE_PAIR_THRESHOLD,
  IMAGE_SAMPLE_SIZE,
  type ImageDescriptor,
  type ImageSample
} from './imageDescriptor';

/**
 * A drawing kit just large enough to synthesize the figures documents carry.
 *
 * Working at two resolutions on purpose: drawing at 128 and box-averaging down
 * to the sample grid reproduces what the real pipeline does to a figure that
 * was re-exported at another size, antialiased edges and all, which is the
 * perturbation a descriptor most often has to see through.
 */
type Plane = { values: Float32Array; size: number };

function blank(size: number): Plane {
  return { values: new Float32Array(size * size).fill(1), size };
}

function fill(plane: Plane, x: number, y: number, width: number, height: number, value: number): Plane {
  for (let row = Math.max(0, y); row < Math.min(plane.size, y + height); row++) {
    for (let column = Math.max(0, x); column < Math.min(plane.size, x + width); column++) {
      plane.values[row * plane.size + column] = value;
    }
  }
  return plane;
}

function downsample(plane: Plane, size: number): Plane {
  const factor = plane.size / size;
  const values = new Float32Array(size * size);

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let total = 0;
      for (let y = 0; y < factor; y++) {
        for (let x = 0; x < factor; x++) {
          total += plane.values[(row * factor + y) * plane.size + (column * factor + x)] ?? 0;
        }
      }
      values[row * size + column] = total / (factor * factor);
    }
  }

  return { values, size };
}

/** Deterministic value noise, standing in for recompression artifacts. */
function addNoise(plane: Plane, amplitude: number): Plane {
  for (let index = 0; index < plane.values.length; index++) {
    const pseudo = Math.sin(index * 12.9898) * 43758.5453;
    const jitter = (pseudo - Math.floor(pseudo) - 0.5) * 2 * amplitude;
    plane.values[index] = Math.min(1, Math.max(0, (plane.values[index] ?? 0) + jitter));
  }
  return plane;
}

function brighten(plane: Plane, offset: number): Plane {
  for (let index = 0; index < plane.values.length; index++) {
    plane.values[index] = Math.min(1, Math.max(0, (plane.values[index] ?? 0) + offset));
  }
  return plane;
}

/** Bars on a baseline, the shape whose ink profile is its data. */
function barChart(heights: readonly number[], scale = 1): Plane {
  const size = IMAGE_SAMPLE_SIZE * scale;
  const plane = blank(size);
  const barWidth = 8 * scale;
  const gap = 4 * scale;

  fill(plane, 0, size - 4 * scale, size, 2 * scale, 0.1);
  heights.forEach((height, index) => {
    const barHeight = Math.round(height * size);
    fill(plane, gap + index * (barWidth + gap), size - 4 * scale - barHeight, barWidth, barHeight, 0.15);
  });

  return scale === 1 ? plane : downsample(plane, IMAGE_SAMPLE_SIZE);
}

/** A framed schematic: sparse strokes on white, the case a plain pHash loses. */
function lineDrawing(offset = 0, scale = 1): Plane {
  const size = IMAGE_SAMPLE_SIZE * scale;
  const plane = blank(size);
  const thickness = 2 * scale;

  fill(plane, 6 * scale, 6 * scale, size - 12 * scale, thickness, 0.2);
  fill(plane, 6 * scale, size - 8 * scale, size - 12 * scale, thickness, 0.2);
  fill(plane, 6 * scale, 6 * scale, thickness, size - 12 * scale, 0.2);
  fill(plane, size - 8 * scale, 6 * scale, thickness, size - 12 * scale, 0.2);
  fill(plane, (20 + offset) * scale, 20 * scale, thickness, size - 40 * scale, 0.25);
  fill(plane, 20 * scale, (30 + offset) * scale, size - 40 * scale, thickness, 0.25);

  return scale === 1 ? plane : downsample(plane, IMAGE_SAMPLE_SIZE);
}

/** Rows of short dark runs, standing in for a screenshot of dense CJK text. */
function textBlock(rows: number, scale = 1): Plane {
  const size = IMAGE_SAMPLE_SIZE * scale;
  const plane = blank(size);

  for (let row = 0; row < rows; row++) {
    const y = (6 + row * 7) * scale;
    for (let column = 0; column < 7; column++) {
      fill(plane, (6 + column * 8) * scale, y, 5 * scale, 4 * scale, 0.18);
    }
  }

  return scale === 1 ? plane : downsample(plane, IMAGE_SAMPLE_SIZE);
}

/** A smooth field, the one class an ordinary perceptual hash already handles. */
function photo(phase: number): Plane {
  const plane = blank(IMAGE_SAMPLE_SIZE);

  for (let row = 0; row < IMAGE_SAMPLE_SIZE; row++) {
    for (let column = 0; column < IMAGE_SAMPLE_SIZE; column++) {
      const value = 0.5 + 0.4 * Math.sin((column + phase) / 9) * Math.cos(row / 11);
      plane.values[row * IMAGE_SAMPLE_SIZE + column] = Math.min(1, Math.max(0, value));
    }
  }

  return plane;
}

function solidColor(red: number, green: number, blue: number): Float32Array {
  const color = new Float32Array(IMAGE_COLOR_SIZE * IMAGE_COLOR_SIZE * 3);
  for (let cell = 0; cell < IMAGE_COLOR_SIZE * IMAGE_COLOR_SIZE; cell++) {
    color[cell * 3] = red;
    color[cell * 3 + 1] = green;
    color[cell * 3 + 2] = blue;
  }
  return color;
}

/** Mean luminance per colour cell, which is what a grey figure's colour plane is. */
function colorFromGray(plane: Plane): Float32Array {
  const cell = plane.size / IMAGE_COLOR_SIZE;
  const color = new Float32Array(IMAGE_COLOR_SIZE * IMAGE_COLOR_SIZE * 3);

  for (let row = 0; row < IMAGE_COLOR_SIZE; row++) {
    for (let column = 0; column < IMAGE_COLOR_SIZE; column++) {
      let total = 0;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          total += plane.values[(row * cell + y) * plane.size + (column * cell + x)] ?? 0;
        }
      }
      const mean = total / (cell * cell);
      const base = (row * IMAGE_COLOR_SIZE + column) * 3;
      color[base] = mean;
      color[base + 1] = mean;
      color[base + 2] = mean;
    }
  }

  return color;
}

let nextHash = 0;

function descriptorOf(plane: Plane, options: { color?: Float32Array; width?: number; height?: number } = {}) {
  const sample: ImageSample = { gray: plane.values, color: options.color ?? colorFromGray(plane) };

  return {
    // Distinct per descriptor: the byte-equality short circuit would otherwise
    // answer every question here before the descriptor was consulted at all.
    hash: `synthetic-${nextHash++}`,
    width: options.width ?? 640,
    height: options.height ?? 640,
    byteLength: 4096,
    visual: createImageVisualDescriptor(sample)
  } satisfies ImageDescriptor;
}

function similarity(left: Plane, right: Plane): number {
  return compareImageDescriptors(descriptorOf(left), descriptorOf(right));
}

const BARS = [0.3, 0.55, 0.4, 0.7, 0.5] as const;

describe('image descriptor calibration', () => {
  /**
   * The number that decides whether this descriptor is usable: the gap between
   * the worst score earned by a pair that is the same figure, and the best
   * score earned by a pair that is not. Everything above the line is reported
   * as one changed figure; everything below becomes a deletion beside an
   * insertion. Printed rather than only asserted, so a change that narrows the
   * margin without crossing the threshold is still visible.
   */
  it('separates the same figure revised from a different figure entirely', () => {
    const sameFigure: Array<[string, number]> = [
      ['bar chart, recompressed', similarity(barChart(BARS), addNoise(barChart(BARS), 0.03))],
      ['bar chart, brightened', similarity(barChart(BARS), brighten(barChart(BARS), 0.08))],
      ['bar chart, re-exported at 2x', similarity(barChart(BARS), barChart(BARS, 2))],
      ['bar chart, one bar moved', similarity(barChart(BARS), barChart([0.3, 0.55, 0.4, 0.25, 0.5]))],
      ['bar chart, all bars changed', similarity(barChart(BARS), barChart([0.7, 0.2, 0.65, 0.3, 0.8]))],
      ['line drawing, recompressed', similarity(lineDrawing(), addNoise(lineDrawing(), 0.03))],
      ['line drawing, re-exported at 2x', similarity(lineDrawing(), lineDrawing(0, 2))],
      ['line drawing, divider moved', similarity(lineDrawing(), lineDrawing(14))],
      ['text block, recompressed', similarity(textBlock(7), addNoise(textBlock(7), 0.03))],
      ['text block, re-exported at 2x', similarity(textBlock(7), textBlock(7, 2))],
      ['text block, a row removed', similarity(textBlock(7), textBlock(5))],
      ['photo, recompressed', similarity(photo(0), addNoise(photo(0), 0.03))]
    ];

    const differentFigure: Array<[string, number]> = [
      ['bar chart against line drawing', similarity(barChart(BARS), lineDrawing())],
      ['bar chart against text block', similarity(barChart(BARS), textBlock(7))],
      ['line drawing against photo', similarity(lineDrawing(), photo(0))],
      ['text block against photo', similarity(textBlock(7), photo(0))],
      ['photo against another photo', similarity(photo(0), photo(18))]
    ];

    const worstSame = Math.min(...sameFigure.map(([, score]) => score));
    const bestDifferent = Math.max(...differentFigure.map(([, score]) => score));
    const report = [...sameFigure, ...differentFigure]
      .map(([label, score]) => `  ${score.toFixed(3)}  ${label}`)
      .join('\n');

    console.info(
      `image descriptor separation: margin ${(worstSame - bestDifferent).toFixed(3)}` +
        ` (same-figure floor ${worstSame.toFixed(3)}, different-figure ceiling ${bestDifferent.toFixed(3)},` +
        ` threshold ${IMAGE_PAIR_THRESHOLD})\n${report}`
    );

    expect(worstSame).toBeGreaterThan(bestDifferent);
    expect(worstSame).toBeGreaterThan(IMAGE_PAIR_THRESHOLD);
    expect(bestDifferent).toBeLessThan(IMAGE_PAIR_THRESHOLD);
  });

  /**
   * Recompression and re-export are the perturbations that must not read as an
   * edit, because a converter applies them to figures nobody touched.
   */
  it('recognizes a recompressed or re-exported figure as a cosmetic change', () => {
    expect(similarity(barChart(BARS), addNoise(barChart(BARS), 0.03))).toBeGreaterThanOrEqual(IMAGE_COSMETIC_THRESHOLD);
    expect(similarity(barChart(BARS), barChart(BARS, 2))).toBeGreaterThanOrEqual(IMAGE_COSMETIC_THRESHOLD);
    expect(similarity(lineDrawing(), lineDrawing(0, 2))).toBeGreaterThanOrEqual(IMAGE_COSMETIC_THRESHOLD);
    expect(similarity(textBlock(7), textBlock(7, 2))).toBeGreaterThanOrEqual(IMAGE_COSMETIC_THRESHOLD);
  });

  it('does not pass off a real edit as cosmetic', () => {
    expect(similarity(barChart(BARS), barChart([0.3, 0.55, 0.4, 0.25, 0.5]))).toBeLessThan(IMAGE_COSMETIC_THRESHOLD);
    expect(similarity(lineDrawing(), lineDrawing(14))).toBeLessThan(IMAGE_COSMETIC_THRESHOLD);
    expect(similarity(textBlock(7), textBlock(5))).toBeLessThan(IMAGE_COSMETIC_THRESHOLD);
  });

  it('tells two solid colours apart, which luminance alone cannot', () => {
    const plane = blank(IMAGE_SAMPLE_SIZE);
    const red = descriptorOf(plane, { color: solidColor(0.8, 0.1, 0.1) });
    const blue = descriptorOf(plane, { color: solidColor(0.1, 0.1, 0.8) });
    const alsoRed = descriptorOf(plane, { color: solidColor(0.8, 0.1, 0.1) });

    expect(compareImageDescriptors(red, alsoRed)).toBeGreaterThan(compareImageDescriptors(red, blue));
    expect(compareImageDescriptors(red, blue)).toBeLessThan(IMAGE_COSMETIC_THRESHOLD);
  });
});

describe('compareImageDescriptors', () => {
  it('answers byte-identical images without consulting the descriptor', () => {
    const shared: ImageDescriptor = { hash: 'same', width: 10, height: 10, byteLength: 100 };

    expect(compareImageDescriptors(shared, { ...shared, width: 999, height: 1 })).toBe(1);
  });

  it('keeps a pair that was never decoded pairable but never cosmetic', () => {
    const left: ImageDescriptor = { hash: 'a', width: 100, height: 100, byteLength: 10 };
    const right: ImageDescriptor = { hash: 'b', width: 100, height: 100, byteLength: 10 };

    const score = compareImageDescriptors(left, right);
    // Shape alone cannot claim two images look alike...
    expect(score).toBeLessThan(IMAGE_COSMETIC_THRESHOLD);
    // ...but it has to be enough to pair them, so an undecoded image does not
    // cascade into a delete plus an insert.
    expect(score).toBeGreaterThan(IMAGE_PAIR_THRESHOLD);
  });

  it('will not pair an undecoded image with one of a different shape', () => {
    const left: ImageDescriptor = { hash: 'a', width: 100, height: 100, byteLength: 10 };
    const right: ImageDescriptor = { hash: 'b', width: 400, height: 100, byteLength: 10 };

    expect(compareImageDescriptors(left, right)).toBeLessThan(IMAGE_PAIR_THRESHOLD);
  });

  it('damps the score of two like-looking images with different proportions', () => {
    const plane = barChart(BARS);
    const square = descriptorOf(plane, { width: 400, height: 400 });
    const wide = descriptorOf(plane, { width: 900, height: 300 });
    const alsoSquare = descriptorOf(plane, { width: 800, height: 800 });

    expect(compareImageDescriptors(square, alsoSquare)).toBeGreaterThan(compareImageDescriptors(square, wide));
  });

  it('ignores proportions when a container header could not be read', () => {
    const plane = lineDrawing();
    const known = descriptorOf(plane, { width: 300, height: 100 });
    const unknown = descriptorOf(plane, { width: 0, height: 0 });

    expect(compareImageDescriptors(known, unknown)).toBeGreaterThanOrEqual(IMAGE_COSMETIC_THRESHOLD);
  });

  it('treats two blank images as agreeing about where their ink is', () => {
    expect(similarity(blank(IMAGE_SAMPLE_SIZE), blank(IMAGE_SAMPLE_SIZE))).toBeGreaterThanOrEqual(
      IMAGE_COSMETIC_THRESHOLD
    );
  });
});
