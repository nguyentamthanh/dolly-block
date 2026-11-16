// An insertion-ordered dictionary, standing in for JS Map where iteration order matters.
using System.Collections.Generic;

namespace CozyBlocks.Engine
{
    public sealed class OrderedMap<TK, TV>
    {
        readonly List<TK> keys = new List<TK>();
        readonly Dictionary<TK, TV> map = new Dictionary<TK, TV>();

        public int Count => keys.Count;
        public bool Has(TK k) => map.ContainsKey(k);
        public bool TryGet(TK k, out TV v) => map.TryGetValue(k, out v);
        public TV Get(TK k) => map.TryGetValue(k, out var v) ? v : default;

        public void Set(TK k, TV v)
        {
            if (!map.ContainsKey(k)) keys.Add(k);
            map[k] = v;
        }

        public bool Delete(TK k)
        {
            if (!map.Remove(k)) return false;
            keys.Remove(k);
            return true;
        }

        public void Clear() { keys.Clear(); map.Clear(); }
        public List<TK> Keys() => new List<TK>(keys);

        public List<TV> Values()
        {
            var l = new List<TV>(keys.Count);
            foreach (var k in keys) l.Add(map[k]);
            return l;
        }

        public List<KeyValuePair<TK, TV>> Entries()
        {
            var l = new List<KeyValuePair<TK, TV>>(keys.Count);
            foreach (var k in keys) l.Add(new KeyValuePair<TK, TV>(k, map[k]));
            return l;
        }
    }
}
