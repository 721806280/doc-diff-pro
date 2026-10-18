import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderImageDifference } from './imageDifference';

type Listener = (event?: Event) => void;

class FakeImage {
  private listeners: Partial<Record<'error' | 'load', Listener>> = {};

  addEventListener(type: 'error' | 'load', listener: Listener): void {
    this.listeners[type] = listener;
  }

  set src(value: string) {
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
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects invalid dimensions immediately', async () => {
    const canvas = createCanvas(createContext());
    await expect(
      renderImageDifference('a', 'b', { width: 0, height: 10 }, canvas as unknown as HTMLCanvasElement)
    ).resolves.toBe(false);
    expect(canvas.getContext).not.toHaveBeenCalled();
  });

  it('returns false when the target canvas has no context', async () => {
    const canvas = createCanvas(null);
    await expect(
      renderImageDifference('a', 'b', { width: 1, height: 1 }, canvas as unknown as HTMLCanvasElement)
    ).resolves.toBe(false);
  });

  it('returns false when a source image cannot load', async () => {
    const canvas = createCanvas(createContext());
    await expect(
      renderImageDifference('left', 'error', { width: 1, height: 1 }, canvas as unknown as HTMLCanvasElement)
    ).resolves.toBe(false);
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
    expect(targetContext.clearRect).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(targetContext.drawImage.mock.calls[0]![0]).toBeInstanceOf(FakeImage);
    expect(targetContext.drawImage).toHaveBeenNthCalledWith(2, mask, 0, 0);
    expect(targetContext.filter).toBe('none');
    expect(rendered).toBe(true);
  });
});
