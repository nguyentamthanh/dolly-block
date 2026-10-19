// Port of Godot's SortArray (introsort, threshold 16) used by Array.sort_custom. It is NOT stable
// above 16 elements, and LevelGenerator's tray ordering depends on that, so the exact algorithm
// matters for reproducing Godot's levels.

const INTROSORT_THRESHOLD = 16;

export function godotSortCustom<T>(arr: T[], less: (a: T, b: T) => boolean): void {
  const n = arr.length;
  if (n === 0) return;

  const bitlog = (v: number): number => {
    let k = 0;
    for (; v !== 1; v = Math.floor(v / 2)) k++;
    return k;
  };

  const median3 = (a: T, b: T, c: T): T => {
    if (less(a, b)) {
      if (less(b, c)) return b;
      if (less(a, c)) return c;
      return a;
    }
    if (less(a, c)) return a;
    if (less(b, c)) return c;
    return b;
  };

  const pushHeap = (first: number, hole: number, top: number, value: T): void => {
    let parent = Math.trunc((hole - 1) / 2);
    while (hole > top && less(arr[first + parent], value)) {
      arr[first + hole] = arr[first + parent];
      hole = parent;
      parent = Math.trunc((hole - 1) / 2);
    }
    arr[first + hole] = value;
  };

  const adjustHeap = (first: number, hole: number, len: number, value: T): void => {
    const top = hole;
    let second = 2 * hole + 2;
    while (second < len) {
      if (less(arr[first + second], arr[first + (second - 1)])) second--;
      arr[first + hole] = arr[first + second];
      hole = second;
      second = 2 * (second + 1);
    }
    if (second === len) {
      arr[first + hole] = arr[first + (second - 1)];
      hole = second - 1;
    }
    pushHeap(first, hole, top, value);
  };

  const popHeapTo = (first: number, last: number, result: number, value: T): void => {
    arr[result] = arr[first];
    adjustHeap(first, 0, last - first, value);
  };

  const makeHeap = (first: number, last: number): void => {
    if (last - first < 2) return;
    const len = last - first;
    let parent = Math.trunc((len - 2) / 2);
    for (;;) {
      adjustHeap(first, parent, len, arr[first + parent]);
      if (parent === 0) return;
      parent--;
    }
  };

  const sortHeap = (first: number, last: number): void => {
    while (last - first > 1) {
      popHeapTo(first, last - 1, last - 1, arr[last - 1]);
      last--;
    }
  };

  const partialSort = (first: number, last: number, middle: number): void => {
    makeHeap(first, middle);
    for (let i = middle; i < last; i++) {
      if (less(arr[i], arr[first])) popHeapTo(first, middle, i, arr[i]);
    }
    sortHeap(first, middle);
  };

  const partitioner = (first: number, last: number, pivot: T): number => {
    for (;;) {
      while (less(arr[first], pivot)) first++;
      last--;
      while (less(pivot, arr[last])) last--;
      if (!(first < last)) return first;
      const tmp = arr[first];
      arr[first] = arr[last];
      arr[last] = tmp;
      first++;
    }
  };

  const introsort = (first: number, last: number, maxDepth: number): void => {
    while (last - first > INTROSORT_THRESHOLD) {
      if (maxDepth === 0) {
        partialSort(first, last, last);
        return;
      }
      maxDepth--;
      const cut = partitioner(
        first,
        last,
        median3(arr[first], arr[first + Math.trunc((last - first) / 2)], arr[last - 1]),
      );
      introsort(cut, last, maxDepth);
      last = cut;
    }
  };

  const unguardedLinearInsert = (last: number, value: T): void => {
    let next = last - 1;
    while (less(value, arr[next])) {
      arr[last] = arr[next];
      last = next;
      next--;
    }
    arr[last] = value;
  };

  const linearInsert = (first: number, last: number): void => {
    const val = arr[last];
    if (less(val, arr[first])) {
      for (let i = last; i > first; i--) arr[i] = arr[i - 1];
      arr[first] = val;
    } else {
      unguardedLinearInsert(last, val);
    }
  };

  const insertionSort = (first: number, last: number): void => {
    if (first === last) return;
    for (let i = first + 1; i !== last; i++) linearInsert(first, i);
  };

  const finalInsertionSort = (first: number, last: number): void => {
    if (last - first > INTROSORT_THRESHOLD) {
      insertionSort(first, first + INTROSORT_THRESHOLD);
      for (let i = first + INTROSORT_THRESHOLD; i !== last; i++) unguardedLinearInsert(i, arr[i]);
    } else {
      insertionSort(first, last);
    }
  };

  introsort(0, n, bitlog(n) * 2);
  finalInsertionSort(0, n);
}
