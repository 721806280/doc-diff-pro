import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Keeps a ref pointed at the most recent value without writing during render.
 *
 * Use this for values that a long-lived listener or timer needs to read at
 * fire time, where adding them to an effect's dependencies would tear the
 * subscription down and rebuild it on every render.
 *
 * Assigning `ref.current = value` in the render body does the same job but is
 * unsafe under concurrent rendering: React may discard or replay a render, so
 * the ref can end up holding a value from a render that was never committed.
 * A layout effect runs only for the render that is actually shown, and runs
 * before any passive effect that might read the ref.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);

  useLayoutEffect(() => {
    ref.current = value;
  });

  return ref;
}

/**
 * Points an existing ref at the latest value, for the case where the ref has
 * to be referenced before the value can be created.
 *
 * Two hooks that need each other's output cannot both come first, so one side
 * takes a ref up front and binds it once the other side exists. Binding in a
 * layout effect keeps the same commit-only guarantee as {@link useLatestRef}.
 */
export function useBindLatest<T>(ref: RefObject<T>, value: T): void {
  useLayoutEffect(() => {
    ref.current = value;
  });
}
