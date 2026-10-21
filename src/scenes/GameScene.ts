// Polyomino packing controller: pieces of any shape fitted together into a complete picture.
// Ports scripts/game/LevelController.gd (and the scene layout of Main.tscn / Layout / HUD).

import * as Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { go } from './nav';
import * as Art from '../render/Art';
import { Color } from '../render/Color';
import { Sfx } from '../audio/Sfx';
import { PlatformSdk } from '../platform/PlatformSdk';
import { BoardState } from '../core/BoardState';
import { GameState, type RunSave } from '../core/GameState';
import { LevelData } from '../core/LevelData';
import { LevelGenerator, ROTATE_FROM_LEVEL, TIERS, VERSION as GENERATOR_VERSION, rotationUnlocked } from '../core/LevelGenerator';
import { Loc } from '../core/Loc';
import { Mood, type Vec, v } from '../core/PieceData';
import { PieceData } from '../core/PieceData';
import { Solver } from '../core/Solver';
import { Viewport } from '../render/Viewport';
import * as Fx from '../fx/Fx';
import { AdRewardPanel } from '../ui/AdRewardPanel';
import { LevelCompletePanel } from '../ui/LevelCompletePanel';
import { TutorialOverlay } from '../ui/TutorialOverlay';
import { BoardView } from '../objects/BoardView';
import { DragController } from '../objects/DragController';
import { DragGuide } from '../objects/DragGuide';
import { RotateGuide } from '../objects/RotateGuide';
import { Hud } from '../objects/Hud';
import { INVALID, PieceView, isInvalid } from '../objects/PieceView';
import { TrayView } from '../objects/TrayView';

/** Share of a tray slot a piece (plus its thought bubble) may fill. */
const TRAY_FIT = 0.9;
/** Largest tray cell size, as a share of the slot: keeps a 1-cell piece from dwarfing the longer ones. */
const TRAY_MAX_CELL_FRAC = 0.5;
/** Wider than this (width / height) => landscape layout. */
const LANDSCAPE_ASPECT = 1.0;
const LAYOUT_SEP = 6;
/** Seconds without touching a piece before the free hint shows (once per level). */
const IDLE_HINT_SECONDS = 10;

interface PickOrigin {
  slot: 'tray' | 'board';
  origin: Vec;
  tray: number;
  id: number;
}

interface GuideMove {
  pv: PieceView;
  origin: Vec;
  cells: Vec[];
}

interface UndoEntry extends PickOrigin {
  view: PieceView;
}

export class GameScene extends BaseScene {
  board!: BoardView;
  tray!: TrayView;
  hud!: Hud;
  level!: LevelData;
  state!: BoardState;
  acceptingInput = true;

  private drag!: DragController;
  private generator = new LevelGenerator();
  private winPanel!: LevelCompletePanel;
  private adPanel!: AdRewardPanel;
  private tutorial!: TutorialOverlay;
  private guide: DragGuide | RotateGuide | null = null;
  private bg!: Phaser.GameObjects.Rectangle;

  /** piece id -> PieceView for the board */
  private onBoard = new Map<number, PieceView>();
  /** tray slot index -> PieceView or null */
  private inTray: (PieceView | null)[] = [];
  private allViews: PieceView[] = [];
  private pickOrigin: PickOrigin = { slot: 'tray', origin: INVALID, tray: -1, id: -1 };
  private undoStack: UndoEntry[] = [];

  /** Clock time (ms) the player last did anything; the free hint fires IDLE_HINT_SECONDS after it. */
  private idleSince = 0;
  private lastTick = 0;
  private idleHintUsed = false;
  private hintsUsed = 0;
  private undosUsed = 0;
  private combo = 0;
  private prevViolated = new Map<number, boolean>();
  private quietRefresh = false;
  private loadSerial = 0;
  private relayoutQueued = false;

  private static upsetTipShown = false;

  constructor() {
    super('Game');
  }

  protected build(): void {
    GameState.ensureLoaded();
    this.bg = this.add.rectangle(-40, -40, 10, 10, Art.CREAM.toRgb()).setOrigin(0, 0).setDepth(0);

    this.board = new BoardView(this);
    this.tray = new TrayView(this);
    this.hud = new Hud(this);
    this.drag = new DragController(this);

    this.hud.onUndo = () => this.undo();
    this.hud.onHint = () => this.hint();
    this.hud.onMenu = () => this.onMenuPressed();
    this.hud.onHelp = () => this.showTutorial();

    this.winPanel = new LevelCompletePanel(this);
    this.winPanel.onNext = () => this.onNext();
    this.winPanel.onRewardBurst = (x, y, amount) => this.onRewardBurst(x, y, amount);
    this.winPanel.hidePanel();
    this.adPanel = new AdRewardPanel(this);
    this.adPanel.onFinished = (granted, x, y) => this.onAdFinished(granted, x, y);
    this.tutorial = new TutorialOverlay(this);
    this.tutorial.onFinished = () => this.onTutorialFinished();

    this.layout();
    this.loadLevel(GameState.currentLevel);
  }

  update(time: number, deltaMs: number): void {
    super.update(time, deltaMs);
    const dt = Math.min(deltaMs, 100) / 1000;
    this.board.update(dt);
    for (const pv of this.allViews) pv.update(dt);
    this.guide?.update(dt);
    this.tutorial.update(dt);
    this.tickIdleHint(time);
  }

  protected onResize(): void {
    this.layout();
    this.queueRelayout();
    this.winPanel.layout();
    this.adPanel.layout();
    this.tutorial.layout();
  }

  // --- layout ---------------------------------------------------------------------------------------------------

  /**
   * The Main.tscn layout: HUD on top, then a body that stacks board over tray on portrait screens and puts the
   * tray in a column on the right on landscape ones.
   */
  private layout(): void {
    const W = this.W;
    const H = this.H;
    this.bg.setPosition(-40, -40).setSize(W + 80, H + 80);
    this.hud.layout(W);
    const top = this.hud.height() + LAYOUT_SEP;
    const bodyH = H - top;
    const landscape = W > H * LANDSCAPE_ASPECT;
    if (landscape) {
      const trayW = Math.min(Math.max(W * 0.3, 320), 560);
      const boardW = W - LAYOUT_SEP - trayW;
      this.board.setRect(0, top, boardW, bodyH);
      this.tray.safeBottom = 0;
      this.tray.setRect(boardW + LAYOUT_SEP, top, trayW, bodyH);
    } else {
      const trayH = Math.min(Math.max(H * 0.15, 190), 300);
      const boardH = bodyH - LAYOUT_SEP - trayH;
      this.board.setRect(0, top, W, boardH);
      this.tray.safeBottom = 0;
      this.tray.setRect(0, top + boardH + LAYOUT_SEP, W, trayH);
    }
  }

  private queueRelayout(): void {
    if (!this.state || this.relayoutQueued) return;
    this.relayoutQueued = true;
    this.time.delayedCall(0, () => {
      this.relayoutQueued = false;
      this.relayout(0);
    });
  }

  private relayout(duration = 0.14): void {
    if (!this.state) return;
    this.board.relayout();
    this.tray.relayout();
    // Board pieces: position = board origin + origin * cell size.
    for (const pv of this.onBoard.values()) {
      if (isInvalid(pv.origin)) {
        const rec = this.state.getPlaced(pv.piece.id);
        if (rec) pv.origin = rec.origin;
      }
      pv.setCellSize(this.board.cellSize);
      this.move(pv, this.board.x + this.board.originX + pv.origin.x * this.board.cellSize, this.board.y + this.board.originY + pv.origin.y * this.board.cellSize, duration);
    }
    this.inTray.forEach((pv) => {
      if (pv) this.fitInTraySlot(pv, duration);
    });
  }

  private move(pv: PieceView, x: number, y: number, duration: number): void {
    if (duration <= 0) pv.setTopLeft(x, y);
    else pv.travelTo(x, y);
  }

  // --- level lifecycle ---------------------------------------------------------------------------------------------

  loadLevel(index: number): void {
    this.drag.cancel();
    this.stopGuide();
    for (const pv of this.allViews) pv.destroy();
    this.allViews = [];
    this.onBoard.clear();
    this.inTray = [];
    this.undoStack = [];
    this.hintsUsed = 0;
    this.undosUsed = 0;
    this.idleSince = this.lastTick;
    this.idleHintUsed = false;
    this.combo = 0;
    this.prevViolated.clear();
    this.loadSerial++;
    this.winPanel.hidePanel();
    this.acceptingInput = true;
    GameState.currentLevel = index;
    const lv = this.generator.generate(index);
    if (!lv) {
      console.error(`GameScene: could not generate level ${index}`);
      return;
    }
    this.level = lv;
    this.state = lv.buildState();
    this.board.setState(this.state);
    this.tray.setSlotCount(lv.trayPieces.length);
    this.hud.setLevel(index);

    // Fixed pieces: not movable.
    for (const p of lv.fixedPieces) {
      const pv = this.spawnPiece(p, false);
      pv.origin = p.orientToSolution();
      pv.slot = 'board';
      this.onBoard.set(p.id, pv);
    }
    // Tray pieces.
    lv.trayPieces.forEach((p, i) => {
      const pv = this.spawnPiece(p, true);
      pv.slot = 'tray';
      pv.trayIndex = i;
      this.inTray.push(pv);
    });
    this.restoreRun(index);
    this.relayout(0);
    this.quietRefresh = true;
    this.refreshUnhappy();
    this.quietRefresh = false;
    this.playIntro();
    if (!GameState.tutorialDone) {
      // First time in: the how-to-play cards, then the drag guide.
      this.showTutorial();
    } else if (index === 0 && GameState.starsFor(0) === 0) {
      this.startGuide();
    } else if (index === ROTATE_FROM_LEVEL && GameState.starsFor(index) === 0) {
      // Rotation arrives here: tell the player how it works, with a finger tapping a piece that needs turning.
      // Once the pieces have popped in, so the finger and its caption show up together with the piece they point at.
      const loaded = this.level;
      this.time.delayedCall(1200, () => {
        if (this.level !== loaded || this.drag.isDragging() || this.guide) return;
        this.startRotateGuide();
        if (this.guide) this.hud.flashMessage(Loc.t('hud_rotate_unlocked'), 8);
      });
    } else if (index < 3) {
      // First levels: just the drag (turning pieces is unlocked later).
      this.hud.flashMessage(Loc.t('hud_drag_hint'), 3.5);
    }
  }

  /** Tapping a tray piece turns it, from level 10 on. */
  get rotationEnabled(): boolean {
    return !!this.level && rotationUnlocked(this.level.levelIndex);
  }

  private spawnPiece(data: PieceData, movable: boolean): PieceView {
    const pv = new PieceView(this);
    pv.setup(data, movable);
    this.allViews.push(pv);
    return pv;
  }

  /**
   * Put back what the player had done on this level before leaving it: the tray pieces' turns, the pieces already
   * on the board, and the assist counts (so quitting and returning can't dodge the star penalty).
   */
  private restoreRun(index: number): void {
    const saved = GameState.runFor(index);
    if (Object.keys(saved).length === 0) return;
    this.hintsUsed = Math.trunc(Number(saved.hints ?? 0));
    this.undosUsed = Math.trunc(Number(saved.undos ?? 0));
    const rots = saved.rots ?? {};
    for (const tv of this.inTray) {
      if (tv && String(tv.piece.id) in rots) tv.piece.rot = Math.trunc(Number(rots[String(tv.piece.id)])) & 3;
    }
    for (const entry of saved.placed ?? []) {
      if (!Array.isArray(entry) || entry.length < 4) continue;
      const pid = Math.trunc(Number(entry[0]));
      for (let i = 0; i < this.inTray.length; i++) {
        const pv = this.inTray[i];
        if (!pv || pv.piece.id !== pid) continue;
        pv.piece.rot = Math.trunc(Number(entry[1])) & 3;
        const cell = v(Math.trunc(Number(entry[2])), Math.trunc(Number(entry[3])));
        if (!this.state.canPlaceCells(pv.piece.worldCells(cell))) break;
        this.inTray[i] = null;
        this.state.placePiece(pv.piece, cell);
        this.onBoard.set(pid, pv);
        pv.slot = 'board';
        pv.origin = cell;
        break;
      }
    }
  }

  /**
   * Write the current board to the save. Called after every move; a no-op once the level is solved and on replays
   * of cleared levels, which shouldn't displace the frontier level.
   */
  private saveRun(): void {
    if (!this.level || !this.state || !this.acceptingInput) return;
    if (this.level.levelIndex !== GameState.highestUnlocked) return;
    const placed: [number, number, number, number][] = [];
    for (const pv of this.onBoard.values()) {
      if (pv.movable) placed.push([pv.piece.id, pv.piece.rot, pv.origin.x, pv.origin.y]);
    }
    const rots: Record<string, number> = {};
    for (const tv of this.inTray) if (tv && tv.piece.rot !== 0) rots[String(tv.piece.id)] = tv.piece.rot;
    if (placed.length === 0 && Object.keys(rots).length === 0 && this.hintsUsed === 0 && this.undosUsed === 0) {
      GameState.clearRun();
      return;
    }
    const run: RunSave = { level: this.level.levelIndex, gen: GENERATOR_VERSION, placed, rots, hints: this.hintsUsed, undos: this.undosUsed };
    GameState.saveRun(run);
  }

  private showTutorial(): void {
    this.drag.cancel();
    this.tutorial.showTutorial(this.rotationEnabled || !this.level);
  }

  private onTutorialFinished(): void {
    GameState.markTutorialDone();
    if (this.level && this.level.levelIndex === 0) this.startGuide();
  }

  /**
   * Point a finger from one tray piece to its spot in the answer. Prefers a piece that already sits in the right
   * orientation, so the move shown is a plain drag; nothing is shown once the player has placed anything.
   */
  private startGuide(): void {
    this.stopGuide();
    if (!this.state || !this.acceptingInput) return;
    for (const bv of this.onBoard.values()) if (bv.movable) return; // the player already got going
    const move = this.solutionGuideMove();
    if (move) this.guide = new DragGuide(this, move.pv, move.origin, move.cells);
  }

  /** Tap-to-rotate coach mark: a tray piece facing away from its spot in the answer, so the tap shown is a useful one. */
  private startRotateGuide(): void {
    this.stopGuide();
    if (!this.state || !this.acceptingInput) return;
    let pick: PieceView | null = null;
    for (const pv of this.inTray) {
      if (!pv || pv.piece.solutionWorld.length === 0 || pv.piece.uniqueRots().length < 2) continue;
      const d = pv.piece.duplicatePiece();
      d.orientToSolution();
      if (d.rot !== pv.piece.rot) {
        pick = pv;
        break;
      }
      pick ??= pv;
    }
    if (pick) this.guide = new RotateGuide(this, pick);
  }

  /** The tray piece that can go straight to its spot in the generator's answer. Prefers one already facing the right way. */
  private solutionGuideMove(): GuideMove | null {
    let best: GuideMove | null = null;
    for (const pv of this.inTray) {
      if (!pv || pv.piece.solutionWorld.length === 0) continue;
      const d = pv.piece.duplicatePiece();
      const origin = d.orientToSolution();
      if (!this.state.canPlaceCells(d.worldCells(origin))) continue;
      const facing = d.rot === pv.piece.rot;
      if (!best || facing) best = { pv, origin, cells: d.localCells() };
      if (facing) break;
    }
    return best;
  }

  /**
   * A move that really leads to a win from the board as the player left it (so it still works after wrong
   * placements). Prefers a piece that is already turned the right way. Null when the position can't be solved.
   */
  private solverGuideMove(solver: Solver): GuideMove | null {
    const remaining: PieceData[] = [];
    for (const pv of this.inTray) if (pv) remaining.push(pv.piece);
    if (remaining.length === 0) return null;
    const answer = solver.solve(this.state, remaining);
    if (!answer) return null;
    let fallback: GuideMove | null = null;
    for (const id of answer.placedIds()) {
      const pv = this.inTray.find((t) => t?.piece.id === id);
      const rec = answer.getPlaced(id);
      if (!pv || !rec) continue;
      const cells = rec.piece.localCells();
      const move = { pv, origin: rec.origin, cells };
      const now = pv.piece.localCells();
      if (cells.length === now.length && cells.every((c, i) => c.x === now[i].x && c.y === now[i].y)) return move;
      fallback ??= move;
    }
    return fallback;
  }

  /**
   * The free hint: if the player has not dragged anything for IDLE_HINT_SECONDS, show the finger guide once per level.
   * It costs nothing and doesn't count against the stars.
   */
  private tickIdleHint(now: number): void {
    // Wall-clock time, not frame deltas: a slow device waits 10 seconds too. A long gap between frames (tab in the
    // background, platform pause) is not idle time.
    const gap = now - this.lastTick;
    this.lastTick = now;
    const busy = !this.state || !this.acceptingInput || this.guide !== null || this.drag.isDragging() || this.tutorial.visible || this.adPanel.visible;
    if (this.idleHintUsed || busy || gap > 1500) {
      this.idleSince = now;
      return;
    }
    if (now - this.idleSince < IDLE_HINT_SECONDS * 1000) return;
    this.idleSince = now;
    this.showIdleHint();
  }

  private showIdleHint(): void {
    const solver = new Solver(this.rotationEnabled);
    let move = this.solverGuideMove(solver);
    if (!move) {
      if (!solver.aborted) {
        // Searched everything: the board as it stands can't be finished.
        this.idleHintUsed = true;
        this.hud.flashMessage(Loc.t('no_way_home'), 3);
        return;
      }
      move = this.solutionGuideMove();
    }
    if (!move) return;
    this.idleHintUsed = true;
    this.guide = new DragGuide(this, move.pv, move.origin, move.cells);
    this.hud.flashMessage(Loc.t('hud_idle_hint'), 3);
  }

  private stopGuide(): void {
    this.guide?.destroy();
    this.guide = null;
  }

  /**
   * Level-start choreography: the board fades up while every piece pops in, the fixed ones first in a diagonal
   * wave, then the tray pieces left to right.
   */
  private playIntro(): void {
    this.board.setAlpha(0);
    const bt = this.tw.create();
    bt.tweenMethod((a) => this.board.setAlpha(a), 0, 1, 0.25);
    const fixed = [...this.onBoard.values()].sort((a, b) => a.origin.x + a.origin.y - (b.origin.x + b.origin.y));
    fixed.forEach((pv, i) => pv.popIn(0.08 + i * 0.05));
    const base = 0.12 + fixed.length * 0.05;
    this.inTray.forEach((pv, i) => pv?.popIn(base + i * 0.07));
    Sfx.play('whoosh', -6);
  }

  // --- piece lookup --------------------------------------------------------------------------------------------------

  viewAt(px: number, py: number): PieceView | null {
    // Tray pieces are grabbed by their whole slot: small, oddly shaped pieces are otherwise fiddly to hit.
    for (let i = 0; i < this.inTray.length; i++) {
      const tv = this.inTray[i];
      if (tv && tv.movable) {
        const r = this.tray.slotRect(i);
        if (px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h) return tv;
      }
    }
    let found: PieceView | null = null;
    for (const pv of this.allViews) {
      if (!pv.movable) continue;
      if (px >= pv.left && py >= pv.top && px < pv.left + pv.boxW && py < pv.top + pv.boxH && pv.containsGlobal(px, py)) found = pv;
    }
    return found;
  }

  canPlace(pv: PieceView, cell: Vec): boolean {
    if (isInvalid(cell)) return false;
    return this.state.canPlaceCells(pv.piece.worldCells(cell));
  }

  placementHappy(pv: PieceView, cell: Vec): boolean {
    if (!this.canPlace(pv, cell)) return false;
    return !this.state.wouldViolate(pv.piece, cell);
  }

  // --- moves ----------------------------------------------------------------------------------------------------------

  onPickUp(pv: PieceView): void {
    this.stopGuide();
    this.pickOrigin = { slot: pv.slot, origin: pv.origin, tray: pv.trayIndex, id: pv.piece.id };
    if (pv.slot === 'board' && !isInvalid(pv.origin)) {
      this.state.removePiece(pv.piece.id);
      this.onBoard.delete(pv.piece.id);
      pv.origin = INVALID;
    }
    // Scale to board size so the dragged shape matches the grid exactly.
    pv.setCellSize(this.board.cellSize);
    this.refreshUnhappy();
  }

  commitPlace(pv: PieceView, cell: Vec): void {
    this.detachFromTray(pv);
    this.state.placePiece(pv.piece, cell);
    this.onBoard.set(pv.piece.id, pv);
    pv.slot = 'board';
    pv.origin = cell;
    pv.setCellSize(this.board.cellSize);
    const x = this.board.x + this.board.originX + cell.x * this.board.cellSize;
    const y = this.board.y + this.board.originY + cell.y * this.board.cellSize;
    this.move(pv, x, y, 0.13);
    pv.setDragging(false);
    pv.squash();
    this.placeJuice(pv, x + pv.boxW * 0.5, y + pv.boxH * 0.5);
    this.pushUndo(pv);
    this.refreshUnhappy();
    this.saveRun();
    this.checkWin();
  }

  /**
   * The landing bundle for a successful drop: the sound (pitch climbs with the combo), a shockwave ring, candy
   * bits, sparkles and a tiny screen nudge.
   */
  private placeJuice(pv: PieceView, cx: number, cy: number): void {
    this.combo++;
    const pitch = 1 + Math.min(this.combo - 1, 8) * 0.06;
    Sfx.play('place', 0, pitch);
    const col = Art.paletteFill(pv.piece.color);
    Fx.ringWave(this, cx, cy, Math.max(pv.boxW, pv.boxH) * 0.62, new Color(1, 1, 1, 0.85), Math.max(6, pv.cellSize * 0.1));
    Fx.piecePop(this, cx, cy, col);
    Fx.starSparkle(this, cx, cy, new Color(1, 1, 0.85, 1), 6, 0.9);
    Fx.shake(this, 3 + Math.min(this.combo, 5) * 0.6, 0.16);
    if (this.combo >= 3 && this.combo % 3 === 0) {
      const words = [Loc.t('praise_nice'), Loc.t('praise_great'), Loc.t('praise_awesome'), Loc.t('praise_amazing')];
      const word = words[Math.min(Math.floor(this.combo / 3) - 1, words.length - 1)];
      Fx.floatText(this, word, cx, cy - pv.boxH * 0.6, Art.STAR, 48, 70, 0.3);
      Sfx.play('sparkle', -4);
    }
  }

  /** A drop that can't go there: wobble the piece, flash the cells it tried to cover, break the combo. */
  onRefuse(pv: PieceView, tried: Vec[]): void {
    this.combo = 0;
    pv.refuse();
    Sfx.play('refuse');
    if (tried.length > 0) this.board.flashBad(tried);
    Fx.shake(this, 4, 0.18);
  }

  returnHome(pv: PieceView): void {
    const from = this.pickOrigin;
    if (from.slot === 'board' && !isInvalid(from.origin) && this.state.canPlaceCells(pv.piece.worldCells(from.origin))) {
      // Undo of a board -> tray move lands here with the piece still in the tray array; drop that entry.
      this.detachFromTray(pv);
      this.state.placePiece(pv.piece, from.origin);
      this.onBoard.set(pv.piece.id, pv);
      pv.slot = 'board';
      pv.origin = from.origin;
      pv.setCellSize(this.board.cellSize);
      this.move(pv, this.board.x + this.board.originX + from.origin.x * this.board.cellSize, this.board.y + this.board.originY + from.origin.y * this.board.cellSize, 0.13);
    } else {
      this.toTray(pv);
    }
    this.refreshUnhappy();
  }

  /**
   * Explicit "put it back in the tray": used when a piece is dropped onto the tray shelf. Unlike returnHome this
   * never bounces a board piece back onto the board; dropping on the tray always means "take this off the board".
   */
  sendToTray(pv: PieceView): void {
    const fromBoard = this.pickOrigin.slot === 'board';
    this.toTray(pv);
    if (fromBoard) this.pushUndo(pv); // so Undo can drop it back where it was
    this.refreshUnhappy();
    this.saveRun();
  }

  private toTray(pv: PieceView): void {
    // A piece picked up from the tray still holds its slot while it is dragged (or tapped to rotate). Release it
    // first, so it reclaims its own slot below instead of seeing it "taken" by itself and growing the tray.
    this.detachFromTray(pv);
    let idx = pv.trayIndex;
    if (idx < 0 || idx >= this.inTray.length || this.inTray[idx] !== null) idx = this.inTray.indexOf(null);
    if (idx === -1) {
      this.inTray.push(pv);
      idx = this.inTray.length - 1;
      this.tray.setSlotCount(this.inTray.length);
    }
    this.inTray[idx] = pv;
    pv.slot = 'tray';
    pv.trayIndex = idx;
    pv.origin = INVALID;
    this.fitInTraySlot(pv);
  }

  /**
   * Fit a tray piece's on-screen size/position to its slot, given its CURRENT bbox. The fit covers the piece AND its
   * thought bubble (which pokes out above and to the right), so neighbours never overlap; and the cell size is
   * capped so a lone 1-cell piece doesn't balloon next to longer ones.
   */
  private fitInTraySlot(pv: PieceView, duration = 0.13): void {
    const slot = this.tray.slotRect(pv.trayIndex);
    const bb = pv.piece.bbox();
    const bx = Math.max(bb.x, 1);
    const by = Math.max(bb.y, 1);
    let ox = 0;
    let oy = 0;
    if (pv.piece.mood !== Mood.NEUTRAL) {
      const o = Art.thoughtOverhangCells();
      ox = o.x;
      oy = o.y;
    }
    const ex = bx + ox;
    const ey = by + oy;
    let fit = Math.min(slot.w / ex, slot.h / ey) * TRAY_FIT;
    fit = Math.min(Math.max(fit, 12), Math.max(12, this.tray.slotSize * TRAY_MAX_CELL_FRAC));
    pv.setCellSize(fit);
    // Centre piece + bubble as one block: the bubble's room sits above and to the right, so the piece itself lands
    // that much lower and further left.
    const gx = slot.x + slot.w / 2 - (ex * fit) / 2;
    const gy = slot.y + slot.h / 2 - (ey * fit) / 2 + oy * fit;
    this.move(pv, gx, gy, duration);
  }

  /** Called by the drag controller after a tray piece rotates: re-fit it into its slot (the bbox may have changed). */
  onRotate(pv: PieceView): void {
    this.fitInTraySlot(pv);
    this.saveRun();
  }

  private detachFromTray(pv: PieceView): void {
    const i = this.inTray.indexOf(pv);
    if (i !== -1) this.inTray[i] = null;
  }

  // --- feelings ---------------------------------------------------------------------------------------------------------

  private refreshUnhappy(): void {
    // React to CHANGES in mood: a piece that just turned upset puffs and shivers, one that just cheered up hops
    // and sends up hearts.
    const seen = new Set<number>();
    for (const [id, pv] of this.onBoard) {
      const upset = this.state.pieceViolated(pv.piece.id);
      pv.setUnhappy(upset);
      seen.add(id);
      if (!this.quietRefresh && (this.prevViolated.get(id) ?? false) !== upset) this.moodJuice(pv, upset);
      this.prevViolated.set(id, upset);
    }
    // Forget pieces that left the board, so re-placing them reacts afresh.
    for (const id of [...this.prevViolated.keys()]) if (!seen.has(id)) this.prevViolated.delete(id);
    this.board.redraw();
    // For polyominoes, show remaining PIECES, not empty cells.
    let remaining = this.inTray.filter((p) => p !== null).length;
    if (remaining === 0) remaining = this.state.emptyCount();
    this.hud.setRemaining(remaining);
    this.hud.setDiamonds(GameState.diamonds);
  }

  private moodJuice(pv: PieceView, upset: boolean): void {
    const cx = pv.left + pv.boxW * 0.5;
    const cy = pv.top + pv.boxH * 0.5;
    if (upset) {
      pv.shiver();
      Fx.puff(this, cx, cy, new Color(0.35, 0.3, 0.55, 1));
      Sfx.play('upset', -3);
      if (!GameScene.upsetTipShown && this.level && this.level.levelIndex < 10) {
        GameScene.upsetTipShown = true;
        this.hud.flashMessage(Loc.t('hud_red_ring'), 3);
      }
    } else {
      pv.hop();
      Fx.heartsUp(this, cx, cy - pv.boxH * 0.25);
      Sfx.play('happy', -2);
    }
  }

  // --- winning ------------------------------------------------------------------------------------------------------------

  /** 0 assists = flawless = 3 stars; 1-2 = 2; 3+ = 1 (never 0: finishing at all is always rewarded). */
  private scoreStars(): number {
    const assists = this.hintsUsed + this.undosUsed;
    if (assists === 0) return 3;
    return assists <= 2 ? 2 : 1;
  }

  private checkWin(): void {
    if (!this.state.isSolved()) return;
    this.acceptingInput = false;
    const stars = this.scoreStars();
    GameState.completeLevel(this.level.levelIndex, stars, this.state.snapshot(), GameState.bgForLevel(this.level.levelIndex));
    // Large-tier celebration: a diagonal "happy wave" hops across the board with ^ ^ eyes and sparkles, a headline
    // word pops over the board, confetti cannons fire from both bottom corners, and the screen gives one big shake.
    const boardPieces = [...this.onBoard.values()].sort((a, b) => a.origin.x + a.origin.y - (b.origin.x + b.origin.y));
    boardPieces.forEach((pv, i) => {
      pv.setCelebrating(true);
      pv.hop(0.15 + i * 0.06);
      const sx = pv.left + pv.boxW * 0.5;
      const sy = pv.top + pv.boxH * 0.5;
      const t = this.tw.create();
      t.tweenInterval(0.15 + i * 0.06);
      t.tweenCallback(() => {
        if (pv.active) Fx.starSparkle(this, sx, sy, new Color(1, 0.95, 0.6, 1), 7);
      });
    });
    Sfx.play('win_fanfare');
    const headline = ['', Loc.t('praise_nice'), Loc.t('praise_great'), Loc.t('praise_perfect')][Math.min(Math.max(stars, 0), 3)];
    const cs = this.board.cellSize;
    const bcx = this.board.x + this.board.originX + (this.state.width * cs) / 2;
    const bcy = this.board.y + this.board.originY + (this.state.height * cs) / 2;
    Fx.floatText(this, headline, bcx, bcy, Art.STAR, 92, 60, 0.5);
    const W = Viewport.w;
    const H = Viewport.h;
    Fx.confettiCannon(this, -10, H + 10, 0.45, -1);
    Fx.confettiCannon(this, W + 10, H + 10, -0.45, -1);
    Fx.shake(this, 10, 0.35);
    const serial = this.loadSerial;
    const t = this.tw.create();
    t.tweenInterval(1);
    t.tweenCallback(() => {
      // The player (or a test) may have loaded another level while we waited.
      if (serial !== this.loadSerial) return;
      this.winPanel.showPanel(this.level.levelIndex, TIERS[this.level.tier].name, stars, GameState.CLEAR_REWARD);
    });
  }

  /** The win panel's reward count finished: fly gems from it into the HUD chip, counting the HUD up as they land. */
  private onRewardBurst(fromX: number, fromY: number, amount: number): void {
    const target = this.hud.diamondTarget();
    const startValue = GameState.diamonds - amount;
    let landed = 0;
    const n = Math.min(Math.max(amount, 1), 8);
    Fx.flyGems(this, fromX, fromY, target.x, target.y, n, () => {
      landed++;
      this.hud.setDiamonds(startValue + Math.round((amount * landed) / n));
      Sfx.play('diamond_tick', -2, 1 + landed * 0.05);
    });
  }

  /** The rewarded ad ended: on success the diamonds are already in GameState, so fly them into the HUD counter. */
  private onAdFinished(granted: boolean, fromX: number, fromY: number): void {
    if (granted) {
      this.onRewardBurst(fromX, fromY, GameState.AD_REWARD);
      this.hud.flashMessage(Loc.fmt('ad_reward_toast', GameState.AD_REWARD));
    } else {
      this.hud.flashMessage(Loc.t('ad_failed'));
    }
  }

  private onNext(): void {
    // A level transition is the natural break Playgama wants interstitials at; the platform enforces its own gap.
    PlatformSdk.showInterstitial();
    // The win screen's gem fly-in may not have run if CONTINUE came early.
    this.hud.setDiamonds(GameState.diamonds);
    this.loadLevel(this.level.levelIndex + 1);
  }

  private onMenuPressed(): void {
    Sfx.play('whoosh', -4);
    go(this, 'MainMenu');
  }

  // --- undo / hint -------------------------------------------------------------------------------------------------------------

  undo(): void {
    if (this.undoStack.length === 0 || !this.acceptingInput) return;
    this.idleSince = this.lastTick;
    Sfx.play('undo');
    this.undosUsed++;
    const e = this.undoStack.pop()!;
    const pv = e.view;
    if (pv.slot === 'board' && !isInvalid(pv.origin)) {
      this.state.removePiece(pv.piece.id);
      this.onBoard.delete(pv.piece.id);
      pv.origin = INVALID;
    }
    this.pickOrigin = { slot: e.slot, origin: e.origin, tray: e.tray, id: e.id };
    this.returnHome(pv);
    this.saveRun();
  }

  private pushUndo(pv: PieceView): void {
    this.undoStack.push({ view: pv, slot: this.pickOrigin.slot, origin: this.pickOrigin.origin, tray: this.pickOrigin.tray, id: pv.piece.id });
  }

  /** A golden double ring where a hint just dropped its piece. */
  private hintFlash(pv: PieceView): void {
    const cs = this.board.cellSize;
    const x = this.board.x + this.board.originX + pv.origin.x * cs + pv.boxW * 0.5;
    const y = this.board.y + this.board.originY + pv.origin.y * cs + pv.boxH * 0.5;
    const r = Math.max(pv.boxW, pv.boxH) * 0.7;
    Fx.ringWave(this, x, y, r, Art.STAR, 12);
    Fx.ringWave(this, x, y, r * 1.3, Art.STAR.withAlpha(0.7), 8, 0.6);
    Fx.starSparkle(this, x, y, Art.STAR, 10, 1.2);
  }

  hint(): void {
    if (!this.acceptingInput || !this.state) return;
    this.idleSince = this.lastTick;
    const remaining: PieceData[] = [];
    for (const pv of this.inTray) if (pv) remaining.push(pv.piece);
    if (remaining.length === 0) return;
    // Check affordability before running the (expensive) solver: no point solving if the player can't pay.
    if (!GameState.spendHint()) {
      Sfx.play('hint_deny');
      if (PlatformSdk.isRewardedAvailable()) {
        this.drag.cancel();
        this.adPanel.show();
      } else {
        this.hud.flashMessage(Loc.t('no_diamonds_hint'));
      }
      return;
    }
    const answer = new Solver(this.rotationEnabled).solve(this.state, remaining);
    if (!answer) {
      // Refund: the player paid for a hint from an already-unsolvable position and got nothing for it.
      GameState.diamonds += GameState.HINT_COST;
      GameState.saveProgress();
      this.hud.flashMessage(Loc.t('no_way_home'));
      return;
    }
    Sfx.play('hint_use');
    for (const id of answer.placedIds()) {
      if (this.onBoard.has(id)) continue;
      // This id is a tray piece placed by the solver.
      const rec = answer.getPlaced(id)!;
      const piece = rec.piece;
      const origin = rec.origin;
      let target: PieceView | null = null;
      for (const pv of this.inTray) if (pv && pv.piece.id === piece.id) target = pv;
      if (!target) {
        // Also try matching by look if the id differs because of duplicates.
        for (const pv of this.inTray) {
          if (pv && pv.piece.color === piece.color && pv.piece.mood === piece.mood && pv.piece.targetColor === piece.targetColor && pv.piece.baseCells.length === piece.baseCells.length) {
            target = pv;
            break;
          }
        }
      }
      if (!target) continue;
      this.pickOrigin = { slot: 'tray', origin: INVALID, tray: target.trayIndex, id: target.piece.id };
      target.piece.rot = piece.rot; // the answer's rotation
      target.setCellSize(this.board.cellSize);
      this.commitPlace(target, origin);
      this.hintFlash(target);
      this.hintsUsed++;
      this.saveRun();
      return;
    }
  }
}

