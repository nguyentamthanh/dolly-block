shader_type canvas_item;

// Rotating light rays that fade out radially. Drawn on a square ColorRect
// behind celebration content (win stars, menu logo).

uniform vec4 ray_color : source_color = vec4(1.0, 0.95, 0.7, 0.45);
uniform float rays = 14.0;
uniform float speed = 0.25;
uniform float softness : hint_range(0.01, 1.0) = 0.35;

void fragment() {
	vec2 p = UV - 0.5;
	float ang = atan(p.y, p.x) + mod(TIME * speed, 6.2831853);
	float r = length(p) * 2.0;
	float s = smoothstep(-softness, softness, sin(ang * rays));
	float fade = (1.0 - smoothstep(0.15, 1.0, r)) * smoothstep(0.0, 0.12, r);
	COLOR = vec4(ray_color.rgb, ray_color.a * s * fade);
}
