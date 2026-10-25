import { useEffect, useMemo, useState, type RefObject } from 'react';
import { renderImageDifference, type ImageDifferenceResult } from '@/utils/imageDifference';
import type { ImageSize } from '@/utils/imageViewport';

/** Own one overlay render, including cancellation and diagnostics, separately from viewport controls. */
export function useImageDifference(
  enabled: boolean,
  canvas: RefObject<HTMLCanvasElement | null>,
  left: string,
  right: string,
  size: ImageSize
): ImageDifferenceResult['status'] | 'idle' | 'loading' {
  const request = useMemo(
    () => ({ enabled, left, right, width: size.width, height: size.height }),
    [enabled, left, right, size.width, size.height]
  );
  const [completion, setCompletion] = useState<{ request: typeof request; result: ImageDifferenceResult } | null>(null);

  useEffect(() => {
    const target = canvas.current;
    if (!request.enabled || !target) return;
    const controller = new AbortController();
    void renderImageDifference(request.left, request.right, request, target, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === 'error') console.warn('[Image difference overlay]', result.error);
      setCompletion({ request, result });
    });
    return () => controller.abort();
  }, [canvas, request]);

  if (!enabled) return 'idle';
  return completion?.request === request ? completion.result.status : 'loading';
}
