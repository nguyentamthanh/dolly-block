// Godot's SortArray (introsort, threshold 16) used by Array.sort_custom. It is NOT stable above 16
// elements and LevelGenerator's tray ordering depends on that.
using System;
using System.Collections.Generic;

namespace CozyBlocks.Core
{
    public static class GodotSort
    {
        const int THRESHOLD = 16;

        public static void SortCustom<T>(List<T> arr, Func<T, T, bool> less)
        {
            int n = arr.Count;
            if (n == 0) return;
            new Sorter<T>(arr, less).Run(n);
        }

        sealed class Sorter<T>
        {
            readonly List<T> arr;
            readonly Func<T, T, bool> less;
            public Sorter(List<T> a, Func<T, T, bool> l) { arr = a; less = l; }

            static int Bitlog(int v) { int k = 0; for (; v != 1; v /= 2) k++; return k; }

            T Median3(T a, T b, T c)
            {
                if (less(a, b))
                {
                    if (less(b, c)) return b;
                    if (less(a, c)) return c;
                    return a;
                }
                if (less(a, c)) return a;
                if (less(b, c)) return c;
                return b;
            }

            void PushHeap(int first, int hole, int top, T value)
            {
                int parent = (hole - 1) / 2;
                while (hole > top && less(arr[first + parent], value))
                {
                    arr[first + hole] = arr[first + parent];
                    hole = parent;
                    parent = (hole - 1) / 2;
                }
                arr[first + hole] = value;
            }

            void AdjustHeap(int first, int hole, int len, T value)
            {
                int top = hole;
                int second = 2 * hole + 2;
                while (second < len)
                {
                    if (less(arr[first + second], arr[first + (second - 1)])) second--;
                    arr[first + hole] = arr[first + second];
                    hole = second;
                    second = 2 * (second + 1);
                }
                if (second == len)
                {
                    arr[first + hole] = arr[first + (second - 1)];
                    hole = second - 1;
                }
                PushHeap(first, hole, top, value);
            }

            void PopHeapTo(int first, int last, int result, T value)
            {
                arr[result] = arr[first];
                AdjustHeap(first, 0, last - first, value);
            }

            void MakeHeap(int first, int last)
            {
                if (last - first < 2) return;
                int len = last - first;
                int parent = (len - 2) / 2;
                for (;;)
                {
                    AdjustHeap(first, parent, len, arr[first + parent]);
                    if (parent == 0) return;
                    parent--;
                }
            }

            void SortHeap(int first, int last)
            {
                while (last - first > 1)
                {
                    PopHeapTo(first, last - 1, last - 1, arr[last - 1]);
                    last--;
                }
            }

            void PartialSort(int first, int last, int middle)
            {
                MakeHeap(first, middle);
                for (int i = middle; i < last; i++)
                    if (less(arr[i], arr[first])) PopHeapTo(first, middle, i, arr[i]);
                SortHeap(first, middle);
            }

            int Partitioner(int first, int last, T pivot)
            {
                for (;;)
                {
                    while (less(arr[first], pivot)) first++;
                    last--;
                    while (less(pivot, arr[last])) last--;
                    if (!(first < last)) return first;
                    T tmp = arr[first];
                    arr[first] = arr[last];
                    arr[last] = tmp;
                    first++;
                }
            }

            void Introsort(int first, int last, int maxDepth)
            {
                while (last - first > THRESHOLD)
                {
                    if (maxDepth == 0) { PartialSort(first, last, last); return; }
                    maxDepth--;
                    int cut = Partitioner(first, last, Median3(arr[first], arr[first + (last - first) / 2], arr[last - 1]));
                    Introsort(cut, last, maxDepth);
                    last = cut;
                }
            }

            void UnguardedLinearInsert(int last, T value)
            {
                int next = last - 1;
                while (less(value, arr[next]))
                {
                    arr[last] = arr[next];
                    last = next;
                    next--;
                }
                arr[last] = value;
            }

            void LinearInsert(int first, int last)
            {
                T val = arr[last];
                if (less(val, arr[first]))
                {
                    for (int i = last; i > first; i--) arr[i] = arr[i - 1];
                    arr[first] = val;
                }
                else UnguardedLinearInsert(last, val);
            }

            void InsertionSort(int first, int last)
            {
                if (first == last) return;
                for (int i = first + 1; i != last; i++) LinearInsert(first, i);
            }

            void FinalInsertionSort(int first, int last)
            {
                if (last - first > THRESHOLD)
                {
                    InsertionSort(first, first + THRESHOLD);
                    for (int i = first + THRESHOLD; i != last; i++) UnguardedLinearInsert(i, arr[i]);
                }
                else InsertionSort(first, last);
            }

            public void Run(int n)
            {
                Introsort(0, n, Bitlog(n) * 2);
                FinalInsertionSort(0, n);
            }
        }
    }
}
