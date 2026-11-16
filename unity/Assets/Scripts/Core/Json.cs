// Minimal JSON reader/writer (objects -> Dictionary<string, object>, arrays -> List<object>, numbers -> double).
// The save keeps the exact schema of the Phaser build.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CozyBlocks.Core
{
    public static class Json
    {
        public static object Parse(string text)
        {
            int i = 0;
            var v = ReadValue(text, ref i);
            SkipWs(text, ref i);
            if (i != text.Length) throw new FormatException("trailing characters");
            return v;
        }

        static void SkipWs(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        static object ReadValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            if (i >= s.Length) throw new FormatException("unexpected end");
            char c = s[i];
            if (c == '{')
            {
                i++;
                var d = new Dictionary<string, object>();
                SkipWs(s, ref i);
                if (s[i] == '}') { i++; return d; }
                for (;;)
                {
                    SkipWs(s, ref i);
                    string k = ReadString(s, ref i);
                    SkipWs(s, ref i);
                    if (s[i] != ':') throw new FormatException("expected :");
                    i++;
                    d[k] = ReadValue(s, ref i);
                    SkipWs(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; return d; }
                    throw new FormatException("expected , or }");
                }
            }
            if (c == '[')
            {
                i++;
                var l = new List<object>();
                SkipWs(s, ref i);
                if (s[i] == ']') { i++; return l; }
                for (;;)
                {
                    l.Add(ReadValue(s, ref i));
                    SkipWs(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; return l; }
                    throw new FormatException("expected , or ]");
                }
            }
            if (c == '"') return ReadString(s, ref i);
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (s.Length - i >= 5 && string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int st = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (st == i) throw new FormatException("bad value");
            return double.Parse(s.Substring(st, i - st), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        static string ReadString(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException("expected string");
            i++;
            var sb = new StringBuilder();
            while (s[i] != '"')
            {
                char c = s[i++];
                if (c == '\\')
                {
                    char e = s[i++];
                    switch (e)
                    {
                        case 'n': sb.Append('\n'); break;
                        case 't': sb.Append('\t'); break;
                        case 'r': sb.Append('\r'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                        default: sb.Append(e); break;
                    }
                }
                else sb.Append(c);
            }
            i++;
            return sb.ToString();
        }

        public static string Write(object v)
        {
            var sb = new StringBuilder();
            WriteValue(sb, v);
            return sb.ToString();
        }

        static void WriteValue(StringBuilder sb, object v)
        {
            switch (v)
            {
                case null: sb.Append("null"); break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case string s: WriteString(sb, s); break;
                case int n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); break;
                case long n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); break;
                case float f: sb.Append(((double)f).ToString("R", CultureInfo.InvariantCulture)); break;
                case double d: sb.Append(d.ToString("R", CultureInfo.InvariantCulture)); break;
                case IDictionary d:
                    {
                        sb.Append('{');
                        bool first = true;
                        foreach (DictionaryEntry e in d)
                        {
                            if (!first) sb.Append(',');
                            first = false;
                            WriteString(sb, e.Key.ToString());
                            sb.Append(':');
                            WriteValue(sb, e.Value);
                        }
                        sb.Append('}');
                        break;
                    }
                case IEnumerable e:
                    {
                        sb.Append('[');
                        bool first = true;
                        foreach (var x in e)
                        {
                            if (!first) sb.Append(',');
                            first = false;
                            WriteValue(sb, x);
                        }
                        sb.Append(']');
                        break;
                    }
                default: WriteString(sb, v.ToString()); break;
            }
        }

        static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        // --- helpers for reading loosely typed values (Math.trunc(Number(x)) || 0) ---
        public static int Int(object x, int dflt)
        {
            if (x == null) return dflt;
            switch (x)
            {
                case double d: return double.IsNaN(d) ? 0 : (int)Math.Truncate(d);
                case int n: return n;
                case long l: return (int)l;
                case bool b: return b ? 1 : 0;
                case string s: return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? (int)Math.Truncate(v) : 0;
            }
            return 0;
        }

        public static bool Bool(object x)
        {
            switch (x)
            {
                case null: return false;
                case bool b: return b;
                case double d: return d != 0 && !double.IsNaN(d);
                case string s: return s.Length > 0;
            }
            return true;
        }

        public static object Get(Dictionary<string, object> d, string k) => d != null && d.TryGetValue(k, out var v) ? v : null;
    }
}
