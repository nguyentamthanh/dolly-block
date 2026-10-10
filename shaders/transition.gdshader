shader_type canvas_item;

// Circle-wipe scene transition. progress 0 = fully clear, 1 = fully covered.
// The hole is a circle in screen-aspect space so it stays round on any
// window shape; a ring of dots rides the edge for a little candy flourish.

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec4 fill : source_color = vec4(0.27, 0.2, 0.62, 1.0);
uniform vec4 accent : source_color = vec4(1.0, 0.82, 0.25, 1.0);
uniform vec2 size_px = vec2(720.0, 1280.0);

void fragment() {
	float aspect = size_px.x / size_px.y;
	vec2 p = (UV - 0.5) * vec2(aspect, 1.0);
	float max_r = length(vec2(aspect, 1.0)) * 0.5 + 0.06;
	float r = (1.0 - progress) * max_r;
	float d = length(p);
	float px = 1.0 / size_px.y;
	float covered = smoothstep(r - px * 1.5, r + px * 1.5, d);
	// Thin gold rim just outside the hole.
	float rim = (1.0 - smoothstep(0.0, px * 10.0, abs(d - r - px * 8.0))) * step(0.001, progress) * step(progress, 0.999);
	vec3 col = mix(fill.rgb, accent.rgb, rim);
	float alpha = max(covered, rim);
	if (progress >= 0.999) {
		alpha = 1.0;
	}
	COLOR = vec4(col, alpha * fill.a);
}
