import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ImageDifferenceError,
  imageAspectMatches,
  imageDifferenceRenderSize,
  renderImageDifference
} from './imageDifference';
import { yieldToBrowser } from './comparisonScheduling';

vi.mock('./comparisonScheduling', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./comparisonScheduling')>();
  return { ...actual, yieldToBrowser: vi.fn(async (signal?: AbortSignal) => actual.throwIfAborted(signal)) };
});

type Listener = (event?: Event) => void;

class FakeImage {
  static instances: FakeImage[] = [];
  naturalWidth = 1;
  naturalHeight = 1;
  private listeners: Partial<Record<'error' | 'load', Listener>> = {};
  source = '';

  constructor() {
    FakeImage.instances.push(this);
  }

  addEventListener(type: 'error' | 'load', listener: Listener): void {
    this.listeners[type] = listener;
  }

  removeEventListener(type: 'error' | 'load'): void {
    delete this.listeners[type];
  }

  set src(value: string) {
    this.source = value;
    if (value === 'slow') return;
    const dimensions = /:(\d+)x(\d+)/.exec(value);
    if (dimensions) {
      this.naturalWidth = Number(dimensions[1]);
      this.naturalHeight = Number(dimensions[2]);
    }
    queueMicrotask(() => {
      if (value === 'error') this.listeners.error?.();
      else this.listeners.load?.();
    });
  }
}

function createContext() {
  return {
    clearRect: vi.fn(),
    createImageData: vi.fn((width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    })),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    filter: '',
    fillStyle: '',
    getImageData: vi.fn(),
    putImageData: vi.fn()
  };
}

function createCanvas(context: ReturnType<typeof createContext> | null) {
  return { width: 0, height: 0, getContext: vi.fn(() => context) };
}

function createReadCanvas(data: number[]) {
  const context = createContext();
  context.getImageData.mockReturnValue({
    width: 1,
    height: 1,
    data: new Uint8ClampedArray(data)
  });
  return createCanvas(context);
}

describe('renderImageDifference', () => {
  beforeEach(() => {
    FakeImage.instances = [];
    vi.stubGlobal('Image', FakeImage);
    vi.mocked(yieldToBrowser).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects invalid dimensions immediately', async () => {
    const canvas = createCanvas(createContext());
    await expect(
      renderImageDifference('a', 'b', { width: 0, height: 10 }, canvas as unknown as HTMLCanvasElement)
    ).resolves.toMatchObject({ status: 'error', error: { reason: 'invalid-size' } });
    expect(canvas.getContext).not.toHaveBeenCalled();
  });

  it('reports an unavailable canvas context', async () => {
    const canvas = createCanvas(null);
    await expect(
      renderImageDifference('a', 'b', { width: 1, height: 1 }, canvas as unknown as HTMLCanvasElement)
    ).resolves.toMatchObject({ status: 'error', error: { reason: 'canvas-unavailable' } });
  });

  it('reports image-load failures and cancels the still-loading peer', async () => {
    const canvas = createCanvas(createContext());
    await expect(
      renderImageDifference('slow', 'error', { width: 1, height: 1 }, canvas as unknown as HTMLCanvasElement)
    ).resolves.toMatchObject({ status: 'error', error: { reason: 'image-load' } });
    expect(FakeImage.instances[0]!.source).toBe('');
    expect(canvas.width).toBe(0);
  });

  it('draws the revised image with a blended red change mask', async () => {
    const targetContext = createContext();
    const target = createCanvas(targetContext);
    const left = createReadCanvas([8, 8, 8, 255]);
    const right = createReadCanvas([28, 8, 8, 255]);
    const maskContext = createContext();
    const mask = createCanvas(maskContext);
    let created = 0;
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        created += 1;
        if (created === 1) return left as unknown as HTMLElement;
        if (created === 2) return right as unknown as HTMLElement;
        return mask as unknown as HTMLElement;
      }
      throw new Error('Unexpected element');
    });

    const rendered = await renderImageDifference(
      'left',
      'right',
      { width: 1, height: 1 },
      target as unknown as HTMLCanvasElement
    );

    expect(createElement).toHaveBeenCalledTimes(3);
    expect(maskContext.createImageData).toHaveBeenCalledWith(1, 1);
    expect(maskContext.putImageData).toHaveBeenCalledTimes(1);
    const maskData = maskContext.putImageData.mock.calls[0]![0].data;
    expect(maskData[0]).toBeGreaterThan(240);
    expect(maskData[1]).toBeLessThan(210);
    expect(maskData[2]).toBeLessThan(210);
    expect(maskData[3]).toBe(40);
    expect(targetContext.fillRect).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(targetContext.drawImage.mock.calls[0]![0]).toBeInstanceOf(FakeImage);
    expect(targetContext.drawImage).toHaveBeenNthCalledWith(2, mask, 0, 0, 1, 1);
    expect(targetContext.filter).toBe('none');
    expect(rendered).toEqual({ status: 'ready' });
  });

  it('preserves crop coordinates instead of stretching unchanged content', async () => {
    const left = createReadCanvas([255, 255, 255, 255]);
    const right = createReadCanvas([255, 255, 255, 255]);
    const mask = createCanvas(createContext());
    const canvases = [left, right, mask];
    vi.spyOn(document, 'createElement').mockImplementation(() => canvases.shift() as unknown as HTMLElement);
    await expect(
      renderImageDifference(
        'left:120x100',
        'right:100x100',
        { width: 120, height: 100 },
        createCanvas(createContext()) as unknown as HTMLCanvasElement
      )
    ).resolves.toEqual({ status: 'ready' });
    expect(left.getContext()!.drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 120, 100);
    expect(right.getContext()!.drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 100, 100);
  });

  it('uniformly scales a proportional re-export and composites transparency over white', async () => {
    const left = createReadCanvas([255, 255, 255, 255]);
    const right = createReadCanvas([255, 255, 255, 255]);
    const canvases = [left, right, createCanvas(createContext())];
    vi.spyOn(document, 'createElement').mockImplementation(() => canvases.shift() as unknown as HTMLElement);
    const target = createContext();
    await renderImageDifference(
      'left:40x20',
      'right:80x40',
      { width: 80, height: 40 },
      createCanvas(target) as unknown as HTMLCanvasElement
    );
    expect(left.getContext()!.drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 40, 20);
    expect(target.fillStyle).toBe('#fff');
    expect(target.fillRect).toHaveBeenCalledWith(0, 0, 80, 40);
  });

  it('cancels image loading and leaves the destination untouched', async () => {
    const controller = new AbortController();
    const context = createContext();
    const target = createCanvas(context);
    const pending = renderImageDifference(
      'slow',
      'slow',
      { width: 10, height: 10 },
      target as unknown as HTMLCanvasElement,
      controller.signal
    );
    controller.abort();
    await expect(pending).resolves.toEqual({ status: 'cancelled' });
    expect(target.width).toBe(0);
    expect(context.drawImage).not.toHaveBeenCalled();
    await expect(
      renderImageDifference(
        'left',
        'right',
        { width: 10, height: 10 },
        target as unknown as HTMLCanvasElement,
        controller.signal
      )
    ).resolves.toEqual({ status: 'cancelled' });
  });

  it('stops a cancelled mask before committing pixels', async () => {
    const controller = new AbortController();
    const canvases = [
      createReadCanvas([0, 0, 0, 255]),
      createReadCanvas([255, 255, 255, 255]),
      createCanvas(createContext())
    ];
    vi.spyOn(document, 'createElement').mockImplementation(() => canvases.shift() as unknown as HTMLElement);
    vi.mocked(yieldToBrowser)
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {
        controller.abort();
      });
    const target = createCanvas(createContext());
    await expect(
      renderImageDifference(
        'left',
        'right',
        { width: 1, height: 1 },
        target as unknown as HTMLCanvasElement,
        controller.signal
      )
    ).resolves.toEqual({ status: 'cancelled' });
    expect(target.width).toBe(0);
    expect(canvases).toHaveLength(0);
  });

  it('preserves unexpected rendering errors and releases the temporary canvas', async () => {
    const cause = new DOMException('Cannot read pixels', 'SecurityError');
    const read = createReadCanvas([255, 255, 255, 255]);
    read.getContext()!.getImageData.mockImplementation(() => {
      throw cause;
    });
    vi.spyOn(document, 'createElement').mockReturnValue(read as unknown as HTMLElement);
    const target = createCanvas(createContext());

    const result = await renderImageDifference(
      'left',
      'right',
      { width: 1, height: 1 },
      target as unknown as HTMLCanvasElement
    );

    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('Expected a render error');
    expect(result.error).toBeInstanceOf(ImageDifferenceError);
    expect(result.error.reason).toBe('render-failed');
    expect(result.error.cause).toBe(cause);
    expect(read.width).toBe(0);
    expect(target.width).toBe(0);
  });

  it('bounds both pixel count and the longest edge without stretching', () => {
    expect(imageDifferenceRenderSize({ width: 4000, height: 4000 })).toEqual({ width: 2000, height: 2000 });
    expect(imageDifferenceRenderSize({ width: 40_960, height: 10 })).toEqual({ width: 4096, height: 1 });
    expect(imageDifferenceRenderSize({ width: Number.POSITIVE_INFINITY, height: 10 })).toEqual({ width: 0, height: 0 });
    expect(imageAspectMatches({ width: 800, height: 523 }, { width: 1600, height: 1045 })).toBe(true);
    expect(imageAspectMatches({ width: 120, height: 100 }, { width: 100, height: 100 })).toBe(false);
  });
});
