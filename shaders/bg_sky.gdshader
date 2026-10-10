shader_type canvas_item;

// Vibrant sky backdrop: three-stop vertical gradient, a slowly drifting
// diagonal pattern of soft rounded squares and dots, and a light vignette.
// Everything is computed per-pixel, so there is no texture to load.

uniform vec4 top_color : source_color = vec4(0.36, 0.79, 1.0, 1.0);
uniform vec4 mid_color : source_color = vec4(0.42, 0.55, 1.0, 1.0);
uniform vec4 bottom_color : source_color = vec4(0.56, 0.42, 1.0, 1.0);
uniform vec2 size_px = vec2(720.0, 1280.0);
uniform float cell = 96.0;
uniform float speed : hint_range(0.0, 1.0) = 0.06;
uniform float pattern_alpha : hint_range(0.0, 0.5) = 0.09;

float rounded_box(vec2 p, float half_size, float r) {
	vec2 d = abs(p) - vec2(half_size - r);
	return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

void fragment() {
	float t = UV.y;
	vec3 col = t < 0.5
		? mix(top_color.rgb, mid_color.rgb, t * 2.0)
		: mix(mid_color.rgb, bottom_color.rgb, (t - 0.5) * 2.0);

	// Rotate the pattern grid ~25 degrees and scroll it exactly one cell per
	// period, so fract() wraps seamlessly and TIME never loses precision.
	vec2 px = UV * size_px;
	float a = 0.45;
	mat2 rot = mat2(vec2(cos(a), sin(a)), vec2(-sin(a), cos(a)));
	vec2 q = rot * px + vec2(1.0, 1.0) * fract(TIME * speed) * cell;
	vec2 id = floor(q / cell);
	vec2 g = mod(q, cell) - cell * 0.5;
	float checker = mod(id.x + id.y, 2.0);

	float sq = rounded_box(g, cell * 0.2, cell * 0.07);
	float square_mask = 1.0 - smoothstep(-1.0, 1.0, sq);
	float dot_mask = 1.0 - smoothstep(-1.0, 1.0, length(g) - cell * 0.075);
	float m = mix(square_mask, dot_mask, checker);
	col = mix(col, vec3(1.0), m * pattern_alpha);

	vec2 c = UV - 0.5;
	col *= 1.0 - dot(c, c) * 0.32;
	COLOR = vec4(col, 1.0);
}
