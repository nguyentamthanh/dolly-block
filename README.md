# Cozy Blocks — a Dolly Blocks–style puzzle game

A complete, working clone of the core mechanic from **Dolly Blocks**
(`com.richardilleskosmala.dollyblocks`, by Richard Illes Kosmala / Richard
Gameworks): a grid puzzle where every block has feelings about colors.

Built in **Godot 4.4** with GDScript. Runs on desktop and Android.

---

## 1. What the original game does

Taken from the store listings, which is what was verifiable:

- You place colorful blocks onto a **grid board**.
- **Blocks have emotions.** An *affectionate* block needs a matching color
  placed **next to** it. A *hostile* block must **not** end up next to a color
  it dislikes.
- Levels get progressively harder.
- You win by satisfying every block at once — "harmony", no conflicts.
- The presentation is cute, cozy and colorful.

### What was NOT verifiable

Store screenshots could not be retrieved, so the following are **design
decisions made here**, not claims about the original:

| Decision | Choice made | Why |
|---|---|---|
| Adjacency | Orthogonal (4-neighbour) | The natural reading of "next to". Diagonals do not count. |
| Board sizes | 4×4 → 7×7 by tier | Fits a phone; large enough to get interesting. |
| Where blocks come from | A tray at the bottom, dragged onto a board that already holds fixed blocks | Gives the puzzle a statement (fixed) and a task (tray). |
| Palette | 5 colors | Enough variety without making badges unreadable. |
| Level count | Unlimited, generated on demand | See §5. |

### Scope and licensing

This implements the **mechanic**, which is not copyrightable, with **original
art generated in code**. Nothing was extracted or decompiled from the original
app, and none of its assets, name, or store identity are used. The project is
named "Cozy Blocks" for that reason — **pick your own distinct name before
publishing anything.**

---

## 2. Tools you need

| Tool | Why | Notes |
|---|---|---|
| **Godot 4.4+** | The engine. | Single ~100 MB download, no install, no account. GDScript is Python-like. |
| **Godot Android export templates** | Building an APK/AAB. | `Editor → Manage Export Templates` inside Godot. |
| **JDK 17** + **Android SDK** | Required by the Android exporter. | Easiest via Android Studio; then point Godot at them in `Editor Settings → Export → Android`. |
| A text editor | Optional. | Godot's built-in editor is fine for GDScript. |

Deliberately **not** needed:

- **No image editor.** Every block, face, badge and board is drawn in code
  (`scripts/game/Art.gd`). See §7.
- **No external libraries.** Pure Godot.

---

## 3. Getting it running

```bash
godot --path . 
```

Or: open Godot → Import → pick this folder's `project.godot` → Run (F5).

Run the tests:

```bash
godot --headless --script res://tests/run_tests.gd
```

```bash
godot --headless --script res://tests/smoke.gd
```

Render a level to a PNG without playing it (note: **no** `--headless`, since
that has no renderer):

```bash
godot --script res://tests/screenshot.gd -- shots/out.png 49
```

---

## 4. Architecture

The split that matters: **pure logic knows nothing about the scene tree.**
`BoardState`, `Solver` and `LevelGenerator` are plain `RefCounted` objects, so
the generator can run the solver hundreds of thousands of times per second and
the test suite can verify the rules without opening a window.

```
scripts/core/          PURE LOGIC — no Node, headless-testable
  Palette.gd           colors, display names, accessibility shape tokens
  BlockData.gd         one block: color + mood + target color
  LevelData.gd         a puzzle: dims, holes, fixed blocks, tray blocks
  BoardState.gd        placement, adjacency, constraint evaluation, win check
  Solver.gd            backtracking search, solution counting, difficulty
  LevelGenerator.gd    builds puzzles backwards from a known answer
  GameState.gd         progression + settings (static, not an autoload — see below)

scripts/game/          PRESENTATION
  Art.gd               every drawing primitive in the game
  BlockView.gd         one block on screen; renders + animates, owns no rules
  GameBoard.gd         grid drawing and screen<->cell mapping
  Tray.gd              the shelf of unplaced blocks
  DragController.gd    pick up, carry, snap, drop
  LevelController.gd   coordinates all of the above; decides "solved"

scripts/ui/            HUD.gd, LevelCompletePanel.gd, Background.gd
scenes/Main.tscn       the whole game
tests/                 run_tests.gd (logic), smoke.gd (assembled game), probe.gd (tuning)
```

> `GameState` is a **static class, not an autoload.** Autoloads are not
> registered when Godot runs a custom `MainLoop` via `--script`, which made
> anything touching one impossible to test headlessly. Static members behave
> identically in-game and under the test runner.

---

## 5. The three algorithms that matter

### 5.1 Violated vs. unsatisfied — the distinction everything rests on

`BoardState` exposes two different questions, and conflating them breaks both
the solver and the UI:

- **`is_satisfied(cell)`** — is this block's need met *right now*? Used for the
  win check.
- **`is_violated(cell)`** — can this block's need *never* be met from here?

An affectionate block sitting alone on a half-empty board is **unsatisfied but
not violated**: a friend may still arrive. A hostile block already touching the
color it dislikes **is** violated, and no later placement can undo that.

Violation is **monotonic** — once true, always true. That is exactly what makes
it safe to prune a search branch on, and safe to flash red under a player's
finger. One function, two consumers.

```gdscript
# AFFECTIONATE: only doomed once every neighbour is settled and none match.
var found := false
for j in _nbr[i]:
    var nc := _color[j]
    if nc == EMPTY:
        return false   # an open seat remains; hope survives
    if nc == want:
        found = true
return not found
```

### 5.2 The solver

Backtracking over "which tray block goes in which empty cell", with four things
keeping it fast:

1. **Prune on violation** — doomed branches die at depth 0, not depth *n*.
2. **MRV cell ordering** — always expand the empty cell with the fewest legal
   candidates. Zero candidates ends the branch; one candidate forces the move.
3. **Multiset deduplication** — tray blocks sharing `(color, mood, target)` are
   interchangeable, so the search runs over *distinct types with counts*.
   Without this, *k* identical blocks multiply the tree by *k!* for zero extra
   solutions. This is the single biggest win, and because it could change the
   *answer* rather than just the speed, the test suite checks it against a
   brute-force reference that enumerates every permutation.
4. **Flat integer representation** — see below.

`count_solutions(state, tray, cap)` stops counting at `cap`, so `cap = 2`
answers "is it unique?" without enumerating an exponential space.

### 5.3 The generator builds backwards

Randomising a board and testing whether it happens to be solvable throws away
most candidates and gets worse as boards grow. Instead:

1. **Fill every playable cell with a random color.** That arrangement *is* the
   answer — it exists before the puzzle does.
2. **Give each block a mood already true of that arrangement**: it may only love
   a color genuinely beside it, and only resent a color genuinely absent.
3. **Lift some blocks into the tray.** Putting them back where they came from
   is, by construction, a valid solution.

Solvability is therefore never in question. The solver's job shifts to *how
loose* the puzzle is and *how much work* it took. Levels are seeded from the
level index, so level 37 is the same puzzle on every device and survives a
reinstall with nothing stored.

---

## 6. Things that were measured, not assumed

Four tuning decisions came out the opposite of the intuition, and are recorded
here so they are not "improved" back:

**Allocation, not search, was the bottleneck.** The first solver spent 1790 ms
on a single 7×7 level while expanding only ~4000 nodes. The cost was garbage:
`would_violate` was called ~330×/node and each call built fresh neighbour
arrays. Precomputing a neighbour table and packed int mirrors of the block
fields took it to **14 ms/level, a ~380× improvement**, with no change to the
algorithm.

**Tray size is bounded by the screen, not the board.** `tray_frac: 0.5` on a
7×7 meant a 22-block tray, which no phone can display legibly. Tray counts are
now absolute (5/6/8/10). Bigger boards get harder through *more fixed
constraints*, not more loose pieces.

**Clustering the free cells made puzzles worse.** Lifting a connected blob was
tried on the theory that adjacent holes constrain each other. Every tier
regressed (the 7×7 went from 29/40 to 39/40 over the ceiling) because a blob's
interior touches no fixed block at all and permutes freely. Scattered holes each
border ~4 fixed blocks and are pinned hard.

**Solution count is a bad difficulty dial.** Two rounds of tuning tried to use
it as one. Because the solver stops counting at `max_solutions + 1`, raising the
ceiling widens the *measurement window* rather than changing the puzzle — a
board that "had 5 solutions" turned out to have 10–14 once the ceiling rose. And
a low count is not what makes a puzzle good: ten valid arrangements out of the
millions of ways to fill ten cells is still vanishingly tight. Difficulty now
comes from board size, hole count, tray size and constraint density;
`max_solutions` survives only as an outlier guard.

---

## 7. Making the art

Everything is drawn procedurally in `scripts/game/Art.gd`. For this style —
rounded squares, flat pastel fills, simple faces — vector drawing is smaller and
sharper than bitmaps and scales to any screen density for free.

**To restyle the game, edit that one file.** To move to painted art instead,
replace the function bodies with `draw_texture_rect`; nothing outside `Art.gd`
needs to change.

### Guidelines that turned out to matter

- **Corner radius ≈ 14% of block size**, scaled rather than fixed, so blocks
  look identical at every board size.
- **A drop shadow plus a darker "chin"** along the bottom quarter is what makes
  a flat square read as a solid object.
- **The badge is not decoration — it is game state.** "Affectionate" is
  unplayable unless the player can see *which* color is wanted. Every
  opinionated block carries a swatch: a heart for love, a struck-through circle
  for dislike.
- **Never encode meaning in hue alone.** Each color also owns a shape token
  (circle, triangle, square, diamond, star) drawn on the badge, so a player who
  cannot separate pink from lilac can still solve every level. Toggled by
  `GameState.colorblind_tokens`.
- **An empty cell must not look like a hole.** One accepts a block, the other is
  a wall. They were nearly the same value at first and read as one surface;
  `CELL_EMPTY` is now deliberately lighter than the board frame.
- **A block below ~44 px stops being readable** on a phone, and an unreadable
  badge makes a level *unsolvable*, not merely ugly. The tray tries every row
  count and picks whichever makes blocks largest — for 10 blocks that is two
  rows of five (~83 px), not one row of ten (~63 px).
- **Juice worth having:** squash-and-stretch on landing, a shake on refusal, and
  a scale-up while carried. Cheap, and most of what makes placement feel good
  rather than merely correct.

---

## 8. Interaction notes

- **The block rides above the pointer on touch.** Without that offset your
  finger covers the very thing you are placing — the single most important
  mobile detail in `DragController`. Applied only on touch hardware; mouse users
  find it strange.
- **Snapping uses the block's centre, not the pointer**, since after the finger
  lift the two are far apart.
- **Green means legal *and* everyone stays content; red means occupied or
  somebody gets upset.** An upsetting drop is still *allowed* — the block wears
  a red ring until you resolve it.

  Forbidding unhappy drops was the alternative, and it is provably safe: every
  prefix of a valid solution is violation-free, because violations are
  monotonic. But safe is not the same as kind. Silently refusing a move teaches
  the player nothing, whereas letting them see *who* got upset is the whole
  theme. Refusal is reserved for physically impossible moves.
- **Touch needs no separate code path.** Godot's
  `input_devices/pointing/emulate_mouse_from_touch` (on by default) delivers
  finger input as mouse events.

---

## 9. Exporting to Android

1. Install JDK 17 and the Android SDK (via Android Studio is easiest).
2. In Godot: `Editor → Editor Settings → Export → Android`, set the Android SDK
   path and the JDK path.
3. `Editor → Manage Export Templates → Download and Install`.
4. `Project → Export → Add… → Android`.
5. Create a debug keystore, then set a release keystore for the Play Store.
6. Set a **unique package name** of your own — do not reuse the original's.
7. `Project → Export Project…` for an APK, or enable *Gradle Build* for an AAB.

Portrait orientation and the 720×1280 base resolution with `canvas_items`
stretch are already configured in `project.godot`; the board and tray recompute
their own layout on every resize, so rotation and any aspect ratio work without
special cases.

---

## 10. Test coverage

`tests/run_tests.gd` — 35 assertions over the pure logic:

- geometry, holes excluded from neighbours, diagonals rejected
- hostile violation on contact; the affectionate hope/despair distinction
- solver results on hand-built boards with known answers, including impossible
  ones
- **solver deduplication checked against a brute-force permutation reference**
- 200 generated levels across all four tiers: every one solvable, correct tier
  dimensions, under the outlier ceiling, and not solvable without search
- determinism: the same level index gives a byte-identical puzzle, and levels
  survive a save/load round trip

`tests/smoke.gd` — 17 assertions on the assembled game: scene wiring, one view
per block, board hit-testing round-trip, **every piece actually positioned where
the geometry says**, a level played to completion through the real
`commit_place()` path, win detection, and undo.

> That placement assertion exists because rendering a screenshot caught a bug
> the logic tests could not: `_relayout` ran during `_ready()`, before Godot had
> computed any Control sizes, so every block stacked up tiny in the corner. The
> game state was perfectly correct and completely invisible. If you change
> layout code, look at a screenshot.
