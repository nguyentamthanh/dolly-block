// The circle-wipe cover (TransitionScene): the sky gradient with floating light dots and a pink cloud bank, a round
// hole with a ~3px soft edge and a white glow riding the hole's rim, evaluated per pixel on
// the GPU. Output is premultiplied.
Shader "Cozy/Wipe"
{
    Properties
    {
        _Progress ("Progress", Float) = 0
        _Size ("Logical size (w, h)", Vector) = (720, 1280, 0, 0)
        _Alpha ("Alpha", Float) = 1
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" }
        Cull Off ZWrite Off ZTest Always
        Blend One OneMinusSrcAlpha
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float _Progress;
            float4 _Size;
            float _Alpha;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };

            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.texcoord.xy; // (0,0) top-left: drawn with the canvas-row quad
                return o;
            }

            float hash21(float2 p)
            {
                float x = frac(p.x * 123.34);
                float y = frac(p.y * 456.21);
                float d = x * (x + 45.32) + y * (y + 45.32);
                x += d;
                y += d;
                return frac(x * y);
            }

            float3 sky(float u, float t, float aspect)
            {
                float3 top = float3(0.62, 0.8, 0.98);
                float3 mid = float3(0.8, 0.72, 0.97);
                float3 bot = float3(0.98, 0.76, 0.88);
                float3 col = lerp(lerp(top, mid, smoothstep(0, 0.6, t)), bot, smoothstep(0.5, 1, t));
                float gx = u * aspect * 9, gy = t * 9;
                float2 c = floor(float2(gx, gy));
                float2 f = frac(float2(gx, gy)) - 0.5;
                float hh = hash21(c);
                float ox = (hash21(c + 7.1) - 0.5) * 0.5;
                float oy = (hash21(c + 3.7) - 0.5) * 0.5;
                float dd = length(f - float2(ox, oy));
                float dotR = 0.05 + hh * 0.1;
                float spark = (1 - smoothstep(dotR * 0.6, dotR, dd)) * (hh >= 0.35 ? 1 : 0);
                col = lerp(col, 1, spark * 0.45);
                float bank = 0.88 + sin(u * aspect * 14) * 0.012 + sin(u * aspect * 31 + 1.3) * 0.006;
                float cm = smoothstep(bank - 0.004, bank + 0.004, t);
                return lerp(col, float3(1, 0.9, 0.95), cm);
            }

            // White glow alpha over the hole's rim: the canvas gradient's stops at r - 8 .. r + 24.
            float glow(float d, float r)
            {
                float offs[9] = { -8, -4, 0, 4, 8, 12, 16, 20, 24 };
                float vals[9] = { 0, 0.156, 0.5, 0.84, 1, 0.84, 0.5, 0.156, 0 };
                float inner = max(r - 8, 0), outer = r + 24;
                float t = (d - inner) / (outer - inner);
                float prevT = saturate((r + offs[0] - inner) / (outer - inner));
                if (t <= prevT) return vals[0];
                [unroll] for (int i = 1; i < 9; i++)
                {
                    float st = saturate((r + offs[i] - inner) / (outer - inner));
                    if (t <= st) return lerp(vals[i - 1], vals[i], st > prevT ? (t - prevT) / (st - prevT) : 1);
                    prevT = st;
                }
                return vals[8];
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float w = _Size.x, h = _Size.y;
                float p = _Progress;
                if (p <= 0) return 0;
                float2 px = i.uv * float2(w, h);
                float3 col = sky(i.uv.x, i.uv.y, w / h);
                float4 o = float4(col, 1);
                if (p < 0.999)
                {
                    float aspect = w / h;
                    float maxR = length(float2(aspect, 1)) * 0.5 + 0.06;
                    float r = (1 - p) * maxR * h;
                    float d = length(px - float2(w, h) * 0.5);
                    float cut = saturate(1 - (d - (r - 1.5)) / 3.0);
                    o *= 1 - cut;
                    if (p > 0.001)
                    {
                        float ga = glow(d, r) * 0.9;
                        o = float4(ga, ga, ga, ga) + o * (1 - ga);
                    }
                }
                return o * _Alpha;
            }
            ENDCG
        }
    }
}
