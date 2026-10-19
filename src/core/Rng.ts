// Godot's RandomNumberGenerator (PCG32) and String.hash (djb2), reproduced exactly so a level
// index yields the same puzzle as the Godot build. Verified against tests/fixtures/godot_fixtures.json.

const MULT = 6364136223846793005n;
const DEFAULT_INC = 1442695040888963407n;

const asU64 = (v: bigint): bigint => BigInt.asUintN(64, v);

export class Pcg32 {
  private state = 0n;
  private readonly inc: bigint;

  constructor(seed: number | bigint = 0) {
    this.inc = asU64((DEFAULT_INC << 1n) | 1n);
    this.seed(seed);
  }

  /** RandomNumberGenerator.seed = x */
  seed(seed: number | bigint): void {
    this.state = 0n;
    this.nextU32();
    this.state = asU64(this.state + asU64(BigInt(seed)));
    this.nextU32();
  }

  /** RandomNumberGenerator.randi() */
  nextU32(): number {
    const old = this.state;
    this.state = asU64(old * MULT + this.inc);
    const xorshifted = Number(BigInt.asUintN(32, ((old >> 18n) ^ old) >> 27n));
    const rot = Number(old >> 59n);
    return ((xorshifted >>> rot) | (xorshifted << (-rot & 31))) >>> 0;
  }

  /** uniform in [0, bound) without modulo bias (pcg32_boundedrand_r) */
  private bounded(bound: number): number {
    const threshold = (4294967296 - bound) % bound;
    for (;;) {
      const r = this.nextU32();
      if (r >= threshold) return r % bound;
    }
  }

  /** RandomNumberGenerator.randi_range(from, to), inclusive */
  randiRange(from: number, to: number): number {
    if (from === to) return from;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    return this.bounded(hi - lo + 1) + lo;
  }

  /** RandomNumberGenerator.randf(): float32 in [0, 1], consuming one or two u32 draws */
  randf(): number {
    const protoExp = this.nextU32();
    if (protoExp === 0) return 0;
    const m = (this.nextU32() | 0x80000001) >>> 0;
    return Math.fround(Math.fround(m) * 2 ** (-32 - Math.clz32(protoExp)));
  }
}

/** GDScript hash(String) -> unsigned 32-bit djb2 over code points. */
export function godotStringHash(s: string): number {
  let h = 5381;
  for (const ch of s) {
    h = (Math.imul(h, 33) + ch.codePointAt(0)!) >>> 0;
  }
  return h;
}
