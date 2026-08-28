/**
 * What two embedded images are compared on, and how alike the answer says they
 * are.
 *
 * The division of labour matters more than any of the arithmetic below.
 * *Whether* an image changed is decided by its hash, which is exact and needs
 * no threshold: a figure nobody touched is copied verbatim from one document's
 * package into the next. The score here answers a different question — whether
 * two images are the same figure, so that a revised chart is reported as one
 * changed figure rather than as a deletion beside an unrelated insertion, and
 * how much the change is likely to matter to a reader.
 *
 * Deliberately free of canvas and of any decoding: everything here works on
 * plain float arrays. That seam is what lets the thresholds be calibrated in
 * unit tests against synthesized figures, rather than only in a real browser
 * against binary fixtures — see `imageDescriptor.test.ts`, which is as much a
 * calibration harness as it is a test.
 *
 * The columns are chosen for the images documents actually carry, which are not
 * photographs. A page of charts, CAD line work, formulas and UI screenshots is
 * mostly white with a thin scattering of dark strokes, and the usual perceptual
 * hash collapses all of it to the same near-uniform grey. So a gradient hash
 * carries only part of the weight, and the rest goes to descriptors that
 * measure *where the ink is* — which is the thing that changes when a chart's
 * data changes.
 */

/** Side of the luminance grid every descriptor is derived from. */
export const IMAGE_SAMPLE_SIZE = 64;
/** Side of the far coarser colour grid; hue survives heavy downsampling. */
export const IMAGE_COLOR_SIZE = 4;

const GRADIENT_COLUMNS = 9;
const GRADIENT_ROWS = 8;
const INK_GRID = 16;
const PROJECTION_BINS = 32;

/**
 * How much of the plane's contrast two neighbouring samples must differ by
 * before the gradient hash calls it a gradient rather than a tie.
 */
const GRADIENT_TIE_RATIO = 0.02;

/**
 * Weights over the four columns. Provisional: they are ordered by how much
 * evidence each column carries for document figures, not fitted to a labelled
 * corpus, and the calibration test pins the separation they produce rather than
 * the values themselves.
 */
const GRADIENT_WEIGHT = 0.34;
const INK_WEIGHT = 0.3;
const PROJECTION_WEIGHT = 0.2;
const COLOR_WEIGHT = 0.16;

/**
 * Ceiling for a pair where at least one side was never decoded.
 *
 * Shape alone cannot say two images look alike, so such a pair must never be
 * mistaken for a cosmetic re-export — but it still has to be able to clear the
 * pairing threshold, or an undecoded image would cascade into a delete plus an
 * insert.
 */
const UNKNOWN_VISUAL_CEILING = 0.7;
/** Only a byte-for-byte match is allowed to score a flat 1. */
const MAX_VISUAL_SIMILARITY = 0.99;

/**
 * Whether two images are the same figure, and so belong in one difference
 * rather than a deletion beside an insertion.
 *
 * Measured, not guessed: the calibration test scores every synthesized figure
 * against every perturbation of it and asserts this line falls in the gap
 * between "the same figure, revised" and "a different figure entirely". A
 * heavily reworked chart still lands around 0.85, while two unrelated figures
 * top out around 0.53, so the line sits between them with room either side.
 */
export const IMAGE_PAIR_THRESHOLD = 0.6;

/**
 * Above this, two images differ in their bytes but not in what they show — a
 * figure re-exported or recompressed rather than redrawn.
 *
 * Used only to label a difference, never to hide one. Whether an image changed
 * is decided by its hash, which is exact; this only says how much the change is
 * likely to matter to a reader.
 */
export const IMAGE_COSMETIC_THRESHOLD = 0.97;

/** Luminance and colour planes sampled off a decoded image. */
export type ImageSample = {
  /** 0..1 luminance, `IMAGE_SAMPLE_SIZE` squared, row major. */
  gray: Float32Array;
  /** 0..1 RGB triples, `IMAGE_COLOR_SIZE` squared, row major. */
  color: Float32Array;
};

export type ImageVisualDescriptor = {
  /** 8x8 luminance gradient comparisons, one bit each. */
  gradient: Uint8Array;
  /** Ink coverage per cell of a 16x16 grid, 0..255. */
  ink: Uint8Array;
  /** Ink mass per horizontal band, 0..255. */
  rows: Uint8Array;
  /** Ink mass per vertical band, 0..255. */
  columns: Uint8Array;
  /** Mean RGB per cell of the colour grid, 0..255. */
  color: Uint8Array;
};

export type ImageDescriptor = {
  /** Hex SHA-256 of the encoded bytes: the exact-identity key. */
  hash: string;
  /** Pixel dimensions from the container header; 0 when it could not be read. */
  width: number;
  height: number;
  byteLength: number;
  /** Absent when the image was never decoded — too large, or no decoder. */
  visual?: ImageVisualDescriptor;
};

/**
 * Descriptors by the `src` of the element they were taken from.
 *
 * The `src` is the key because it is the only thing that survives from parsing
 * into the comparison: the markup carries object URLs, and a comparison that
 * starts from those strings can find a descriptor without the pixels being
 * reachable any more.
 */
export type ImageDescriptorTable = Map<string, ImageDescriptor>;

export function createImageVisualDescriptor(sample: ImageSample): ImageVisualDescriptor {
  const ink = inkMask(sample.gray);

  return {
    gradient: gradientHash(sample.gray),
    ink: inkCoverage(ink),
    rows: inkProjection(ink, 'rows'),
    columns: inkProjection(ink, 'columns'),
    color: quantize(sample.color)
  };
}

/**
 * How alike two images are, from 0 to 1.
 *
 * Byte equality short-circuits to 1 because it is both exact and by far the
 * most common answer: an image nobody touched is copied verbatim from one
 * document's package into the next, so the hashes match and nothing has to be
 * decoded at all.
 */
export function compareImageDescriptors(left: ImageDescriptor, right: ImageDescriptor): number {
  if (left.hash === right.hash) return 1;

  const shapeScore = aspectSimilarity(left, right);
  if (!left.visual || !right.visual) return UNKNOWN_VISUAL_CEILING * shapeScore;

  const visualScore =
    hammingSimilarity(left.visual.gradient, right.visual.gradient) * GRADIENT_WEIGHT +
    overlapSimilarity(left.visual.ink, right.visual.ink) * INK_WEIGHT +
    projectionSimilarity(left.visual, right.visual) * PROJECTION_WEIGHT +
    meanAbsoluteSimilarity(left.visual.color, right.visual.color) * COLOR_WEIGHT;

  // A figure re-exported at another size keeps its proportions; one that was
  // cropped or replaced usually does not, so proportion damps the whole score
  // rather than contributing a share of it.
  return Math.min(MAX_VISUAL_SIMILARITY, visualScore * shapeScore);
}

function aspectSimilarity(left: ImageDescriptor, right: ImageDescriptor): number {
  if (left.width <= 0 || left.height <= 0 || right.width <= 0 || right.height <= 0) return 1;

  return ratio(left.width / left.height, right.width / right.height);
}

function ratio(left: number, right: number): number {
  const largest = Math.max(left, right);
  return largest === 0 ? 1 : Math.min(left, right) / largest;
}

/** Fraction of the 64 gradient bits the two hashes agree on. */
function hammingSimilarity(left: Uint8Array, right: Uint8Array): number {
  let matching = 0;

  for (let index = 0; index < left.length; index++) {
    let differing = (left[index] ?? 0) ^ (right[index] ?? 0);
    while (differing !== 0) {
      differing &= differing - 1;
      matching++;
    }
  }

  return 1 - matching / (left.length * 8);
}

/**
 * Overlap rather than mean difference, which is the whole point of measuring
 * ink at all.
 *
 * Ink on a document figure is sparse: nearly every cell is empty on both sides,
 * so an averaged difference is dominated by the agreeing background and two
 * completely unrelated line drawings score almost identically. Charging only
 * the ink — how much of the two sides' ink falls in the same cells, over how
 * much ink there is between them — puts the score back on the part of the image
 * that carries the meaning.
 */
function overlapSimilarity(left: Uint8Array, right: Uint8Array): number {
  let shared = 0;
  let total = 0;

  for (let index = 0; index < left.length; index++) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    shared += Math.min(leftValue, rightValue);
    total += leftValue + rightValue;
  }

  // Two images with no ink at all agree completely about where their ink is.
  return total === 0 ? 1 : (2 * shared) / total;
}

/**
 * The projections are the sharpest column for the case worth catching: on a bar
 * or line chart the vertical ink profile more or less *is* the plotted data, so
 * moving one bar moves one band and little else.
 */
function projectionSimilarity(left: ImageVisualDescriptor, right: ImageVisualDescriptor): number {
  return (overlapSimilarity(left.rows, right.rows) + overlapSimilarity(left.columns, right.columns)) / 2;
}

/** Mean difference, which suits colour: unlike ink, every cell carries signal. */
function meanAbsoluteSimilarity(left: Uint8Array, right: Uint8Array): number {
  if (left.length === 0) return 1;

  let total = 0;
  for (let index = 0; index < left.length; index++) {
    total += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }

  return 1 - total / (left.length * 255);
}

/**
 * Adjacent-sample comparisons over a 9x8 resample, one bit per comparison.
 *
 * Taken on the float grid rather than an 8-bit one on purpose. A pale figure
 * downsamples into a narrow band of near-white values, and quantizing before
 * the comparison would leave most neighbouring pairs equal to the same integer
 * — turning the hash into rounding noise for exactly the images that need it
 * most.
 *
 * The tie tolerance is what makes the hash survive recompression. A figure on a
 * flat background produces cell after cell of exactly equal samples, and a bare
 * `>` resolves every one of those ties the same way — until a whisper of
 * compression noise arrives and resolves about half of them the other way, which
 * measured as a third of the bits flipping on an image nobody had touched.
 * Sized against the plane's own contrast rather than absolutely, so that a
 * faint figure is still judged on the gradients it does have.
 */
function gradientHash(gray: Float32Array): Uint8Array {
  const resampled = resample(gray, IMAGE_SAMPLE_SIZE, GRADIENT_COLUMNS, GRADIENT_ROWS);
  const bits = new Uint8Array(Math.ceil(((GRADIENT_COLUMNS - 1) * GRADIENT_ROWS) / 8));
  const tolerance = contrastRange(resampled) * GRADIENT_TIE_RATIO;
  let bit = 0;

  for (let row = 0; row < GRADIENT_ROWS; row++) {
    for (let column = 0; column < GRADIENT_COLUMNS - 1; column++) {
      const index = row * GRADIENT_COLUMNS + column;
      if ((resampled[index] ?? 0) - (resampled[index + 1] ?? 0) > tolerance) {
        bits[bit >> 3] = (bits[bit >> 3] ?? 0) | (1 << (bit & 7));
      }
      bit++;
    }
  }

  return bits;
}

function contrastRange(values: Float32Array): number {
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < values.length; index++) {
    const value = values[index] ?? 0;
    if (value < lowest) lowest = value;
    if (value > highest) highest = value;
  }

  return highest > lowest ? highest - lowest : 0;
}

/**
 * Per-pixel ink flags, from the luminance split Otsu's method puts the page at.
 *
 * Classified by histogram bin rather than by raw value, because that is the
 * space the threshold was chosen in. Comparing a bin-derived threshold against
 * unquantized luminance puts every pixel sitting exactly on the chosen level on
 * the wrong side of it — which for a flat-shaded figure is not an edge case but
 * whole objects: a chart's bars, all filled with one value, dropped out of the
 * mask entirely while the same bars survived in a recompressed copy whose
 * values had been jittered across the line.
 */
function inkMask(gray: Float32Array): Uint8Array {
  const threshold = otsuLevel(gray);
  const mask = new Uint8Array(gray.length);
  if (threshold === null) return mask;

  for (let index = 0; index < gray.length; index++) {
    if (bin(gray[index] ?? 1) <= threshold) mask[index] = 1;
  }

  return mask;
}

/**
 * The histogram level that best separates the page into two classes, or null
 * when there is only one class to find — a blank or solid image, which has no
 * ink rather than an unknown amount of it.
 */
function otsuLevel(gray: Float32Array): number | null {
  const histogram = new Uint32Array(256);
  for (let index = 0; index < gray.length; index++) {
    const level = bin(gray[index] ?? 0);
    histogram[level] = (histogram[level] ?? 0) + 1;
  }

  let weighted = 0;
  for (let level = 0; level < 256; level++) weighted += level * (histogram[level] ?? 0);

  let belowWeight = 0;
  let belowWeighted = 0;
  let bestVariance = 0;
  let bestLevel: number | null = null;

  for (let level = 0; level < 256; level++) {
    belowWeight += histogram[level] ?? 0;
    if (belowWeight === 0) continue;
    const aboveWeight = gray.length - belowWeight;
    if (aboveWeight === 0) break;

    belowWeighted += level * (histogram[level] ?? 0);
    const meanDelta = belowWeighted / belowWeight - (weighted - belowWeighted) / aboveWeight;
    const variance = belowWeight * aboveWeight * meanDelta * meanDelta;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestLevel = level;
    }
  }

  return bestLevel;
}

function bin(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value * 255)));
}

/** Ink fraction per cell of the coverage grid, scaled to a byte. */
function inkCoverage(mask: Uint8Array): Uint8Array {
  const cell = IMAGE_SAMPLE_SIZE / INK_GRID;
  const coverage = new Uint8Array(INK_GRID * INK_GRID);

  for (let index = 0; index < mask.length; index++) {
    if (mask[index] !== 1) continue;
    const row = Math.floor(Math.floor(index / IMAGE_SAMPLE_SIZE) / cell);
    const column = Math.floor((index % IMAGE_SAMPLE_SIZE) / cell);
    const target = row * INK_GRID + column;
    coverage[target] = (coverage[target] ?? 0) + 1;
  }

  for (let index = 0; index < coverage.length; index++) {
    coverage[index] = Math.round(((coverage[index] ?? 0) / (cell * cell)) * 255);
  }

  return coverage;
}

function inkProjection(mask: Uint8Array, axis: 'rows' | 'columns'): Uint8Array {
  const band = IMAGE_SAMPLE_SIZE / PROJECTION_BINS;
  const totals = new Uint32Array(PROJECTION_BINS);

  for (let index = 0; index < mask.length; index++) {
    if (mask[index] !== 1) continue;
    const position = axis === 'rows' ? Math.floor(index / IMAGE_SAMPLE_SIZE) : index % IMAGE_SAMPLE_SIZE;
    const bandIndex = Math.floor(position / band);
    totals[bandIndex] = (totals[bandIndex] ?? 0) + 1;
  }

  const perBand = band * IMAGE_SAMPLE_SIZE;
  const projection = new Uint8Array(PROJECTION_BINS);
  for (let index = 0; index < PROJECTION_BINS; index++) {
    projection[index] = Math.round(((totals[index] ?? 0) / perBand) * 255);
  }

  return projection;
}

function quantize(values: Float32Array): Uint8Array {
  const quantized = new Uint8Array(values.length);
  for (let index = 0; index < values.length; index++) quantized[index] = bin(values[index] ?? 0);

  return quantized;
}

/**
 * Area-average resample of a square plane to arbitrary dimensions.
 *
 * Area-weighted rather than nearest-neighbour because the targets here do not
 * divide the source — 9 columns out of 64 — and picking one source pixel per
 * target would let a single stroke's position decide a whole column's value.
 */
function resample(source: Float32Array, sourceSize: number, width: number, height: number): Float32Array {
  const target = new Float32Array(width * height);
  const scaleX = sourceSize / width;
  const scaleY = sourceSize / height;

  for (let row = 0; row < height; row++) {
    const startY = row * scaleY;
    const endY = startY + scaleY;

    for (let column = 0; column < width; column++) {
      const startX = column * scaleX;
      const endX = startX + scaleX;
      let total = 0;
      let weight = 0;

      for (let y = Math.floor(startY); y < Math.min(sourceSize, Math.ceil(endY)); y++) {
        const heightWeight = Math.min(endY, y + 1) - Math.max(startY, y);

        for (let x = Math.floor(startX); x < Math.min(sourceSize, Math.ceil(endX)); x++) {
          const cellWeight = heightWeight * (Math.min(endX, x + 1) - Math.max(startX, x));
          total += (source[y * sourceSize + x] ?? 0) * cellWeight;
          weight += cellWeight;
        }
      }

      target[row * width + column] = weight === 0 ? 0 : total / weight;
    }
  }

  return target;
}
