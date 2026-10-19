shader_type canvas_item;

// Circle-wipe scene transition. progress 0 = fully clear, 1 = fully covered.
// The hole is a circle in screen-aspect space so it stays round on any
// window shape. The cover is the splash/banner sky: a soft blue -> lavender ->
// pink gradient with floating light dots and a pink cloud bank at the bottom,
// and a white glow rides the edge of the hole.

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec4 sky_top : source_color = vec4(0.62, 0.80, 0.98, 1.0);
uniform vec4 sky_mid : source_color = vec4(0.80, 0.72, 0.97, 1.0);
uniform vec4 sky_bottom : source_color = vec4(0.98, 0.76, 0.88, 1.0);
uniform vec4 cloud : source_color = vec4(1.0, 0.90, 0.95, 1.0);
uniform vec4 accent : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec2 size_px = vec2(720.0, 1280.0);

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void fragment() {
	float aspect = size_px.x / size_px.y;
	vec2 p = (UV - 0.5) * vec2(aspect, 1.0);
	float max_r = length(vec2(aspect, 1.0)) * 0.5 + 0.06;
	float r = (1.0 - progress) * max_r;
	float d = length(p);
	float px = 1.0 / size_px.y;
	float covered = smoothstep(r - px * 1.5, r + px * 1.5, d);
	// Soft white glow hugging the hole's edge.
	float rim = (1.0 - smoothstep(0.0, px * 16.0, abs(d - r - px * 8.0))) * step(0.001, progress) * step(progress, 0.999);

	// Banner sky: blue at the top, lavender through the middle, pink below.
	float t = UV.y;
	vec3 col = mix(sky_top.rgb, sky_mid.rgb, smoothstep(0.0, 0.6, t));
	col = mix(col, sky_bottom.rgb, smoothstep(0.5, 1.0, t));

	// Floating light dots on a loose grid, each with its own size and glow.
	vec2 g = UV * vec2(aspect * 9.0, 9.0);
	vec2 cell = floor(g);
	vec2 f = fract(g) - 0.5;
	float h = hash21(cell);
	vec2 off = (vec2(hash21(cell + 7.1), hash21(cell + 3.7)) - 0.5) * 0.5;
	float dd = length(f - off);
	float dot_r = 0.05 + h * 0.1;
	float spark = (1.0 - smoothstep(dot_r * 0.6, dot_r, dd)) * step(0.35, h);
	col = mix(col, vec3(1.0), spark * 0.45);

	// A scalloped pink cloud bank along the bottom edge.
	float bank = 0.88 + sin(UV.x * aspect * 14.0) * 0.012 + sin(UV.x * aspect * 31.0 + 1.3) * 0.006;
	col = mix(col, cloud.rgb, smoothstep(bank - 0.004, bank + 0.004, t));

	col = mix(col, accent.rgb, rim);
	float alpha = max(covered, rim * 0.9);
	if (progress >= 0.999) {
		alpha = 1.0;
	}
	COLOR = vec4(col, alpha);
}
