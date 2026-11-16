// Polyomino packing controller: layout, level lifecycle, moves, feelings,
// winning, undo, hints, the idle free hint and the coach marks.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using CozyBlocks.Core;
using CozyBlocks.Engine;
using CozyBlocks.Render;
using CozyBlocks.Audio;
using CozyBlocks.Platform;
using CozyBlocks.Fx;
using CozyBlocks.Objects;
using CozyBlocks.UI;

namespace CozyBlocks.Scenes
{
    public sealed class GameScene : Scene
    {
        const float TRAY_FIT = 0.9f;
        const float TRAY_MAX_CELL_FRAC = 0.5f;
        const float LANDSCAPE_ASPECT = 1.0f;
        const float LAYOUT_SEP = 6;
        const float IDLE_HINT_SECONDS = 10;
        const float RESTART_CONFIRM_MS = 2500;

        struct PickOrigin { public Slot slot; public Vec origin; public int tray; public int id; }
        sealed class GuideMove { public PieceView pv; public Vec origin; public List<Vec> cells; }
        struct UndoEntry { public PieceView view; public Slot slot; public Vec origin; public int tray; public int id; }

        public BoardView board;
        public TrayView tray;
        public Hud hud;
        public LevelData level;
        public BoardState state;
        public bool acceptingInput = true;

        DragController drag;
        readonly LevelGenerator generator = new LevelGenerator();
        LevelCompletePanel winPanel;
        AdRewardPanel adPanel;
        TutorialOverlay tutorial;
        DragGuide dragGuide;
        RotateGuide rotGuide;
        RectObj bg;

        readonly OrderedMap<int, PieceView> onBoard = new OrderedMap<int, PieceView>();
        readonly List<PieceView> inTray = new List<PieceView>();
        readonly List<PieceView> allViews = new List<PieceView>();
        PickOrigin pickOrigin = new PickOrigin { slot = Slot.Tray, origin = PieceView.INVALID, tray = -1, id = -1 };
        readonly List<UndoEntry> undoStack = new List<UndoEntry>();

        float idleSince, lastTick;
        bool idleHintUsed;
        int hintsUsed, undosUsed, combo;
        readonly OrderedMap<int, bool> prevViolated = new OrderedMap<int, bool>();
        bool quietRefresh;
        int loadSerial;
        bool relayoutQueued;
        float restartArmedUntil;
        static bool upsetTipShown;

        bool HasGuide => dragGuide != null || rotGuide != null;

        protected override void Build(object data)
        {
            GameState.EnsureLoaded();
            bg = AddRect(-40, -40, 10, 10, Art.CREAM.ToUnity());
            bg.SetOrigin(0, 0);
            bg.SetDepth(0);
            board = new BoardView(this);
            tray = new TrayView(this);
            hud = new Hud(this);
            drag = new DragController(this);
            hud.onUndo = Undo;
            hud.onHint = Hint;
            hud.onRestart = OnRestartPressed;
            hud.onMenu = OnMenuPressed;
            hud.onHelp = ShowTutorial;

            winPanel = new LevelCompletePanel(this);
            winPanel.onNext = OnNext;
            winPanel.onRewardBurst = OnRewardBurst;
            winPanel.HidePanel();
            adPanel = new AdRewardPanel(this);
            adPanel.onFinished = OnAdFinished;
            tutorial = new TutorialOverlay(this);
            tutorial.onFinished = OnTutorialFinished;

            DoLayout();
            LoadLevel(GameState.currentLevel);
            PlatformSdk.GameplayStart();
            Shutdown += PlatformSdk.GameplayStop;
        }

        protected override void Update(float time, float deltaMs)
        {
            base.Update(time, deltaMs);
            float dt = Mathf.Min(deltaMs, 100) / 1000f;
            board.Tick(dt);
            drag.Tick(dt);
            foreach (var pv in allViews.ToArray()) pv.Tick(dt);
            dragGuide?.Tick(dt);
            rotGuide?.Tick(dt);
            tutorial.Tick(dt);
            TickIdleHint(time);
        }

        protected override void OnResize()
        {
            DoLayout();
            QueueRelayout();
            winPanel.Layout();
            adPanel.Layout();
            tutorial.Layout();
        }

        void DoLayout()
        {
            bg.SetPosition(-40, -40);
            bg.SetSize(W + 80, H + 80);
            hud.Layout(W);
            float top = hud.Height() + LAYOUT_SEP;
            float bodyH = H - top;
            bool landscape = W > H * LANDSCAPE_ASPECT;
            if (landscape)
            {
                float trayW = Mathf.Clamp(W * 0.3f, 320, 560);
                float boardW = W - LAYOUT_SEP - trayW;
                board.SetRect(0, top, boardW, bodyH);
                tray.safeBottom = 0;
                tray.SetRect(boardW + LAYOUT_SEP, top, trayW, bodyH);
            }
            else
            {
                float trayH = Mathf.Clamp(H * 0.15f, 190, 300);
                float boardH = bodyH - LAYOUT_SEP - trayH;
                board.SetRect(0, top, W, boardH);
                tray.safeBottom = 0;
                tray.SetRect(0, top + boardH + LAYOUT_SEP, W, trayH);
            }
        }

        void QueueRelayout()
        {
            if (state == null || relayoutQueued) return;
            relayoutQueued = true;
            DelayedCall(0, () =>
            {
                relayoutQueued = false;
                Relayout(0);
            });
        }

        void Relayout(float duration = 0.14f)
        {
            if (state == null) return;
            board.Relayout();
            tray.Relayout();
            foreach (var pv in onBoard.Values())
            {
                if (PieceView.IsInvalid(pv.origin))
                {
                    var rec = state.GetPlaced(pv.piece.id);
                    if (rec != null) pv.origin = rec.origin;
                }
                pv.SetCellSize(board.cellSize);
                Move(pv, board.x + board.originX + pv.origin.x * board.cellSize, board.y + board.originY + pv.origin.y * board.cellSize, duration);
            }
            foreach (var pv in inTray) if (pv != null) FitInTraySlot(pv, duration);
        }

        void Move(PieceView pv, float x, float y, float duration)
        {
            if (duration <= 0) pv.SetTopLeft(x, y);
            else pv.TravelTo(x, y, duration);
        }

        // --- level lifecycle ---

        public void LoadLevel(int index)
        {
            drag.Cancel();
            StopGuide();
            foreach (var pv in allViews) pv.Destroy();
            allViews.Clear();
            onBoard.Clear();
            inTray.Clear();
            undoStack.Clear();
            hintsUsed = 0;
            undosUsed = 0;
            idleSince = lastTick;
            idleHintUsed = false;
            combo = 0;
            prevViolated.Clear();
            loadSerial++;
            winPanel.HidePanel();
            acceptingInput = true;
            GameState.currentLevel = index;
            var lv = generator.Generate(index);
            if (lv == null)
            {
                Debug.LogError($"GameScene: could not generate level {index}");
                return;
            }
            level = lv;
            state = lv.BuildState();
            board.SetState(state);
            tray.SetSlotCount(lv.trayPieces.Count);
            hud.SetLevel(index);
            foreach (var p in lv.fixedPieces)
            {
                var pv = SpawnPiece(p, false);
                pv.origin = p.OrientToSolution();
                pv.slot = Slot.Board;
                onBoard.Set(p.id, pv);
            }
            for (int i = 0; i < lv.trayPieces.Count; i++)
            {
                var pv = SpawnPiece(lv.trayPieces[i], true);
                pv.slot = Slot.Tray;
                pv.trayIndex = i;
                inTray.Add(pv);
            }
            RestoreRun(index);
            Relayout(0);
            quietRefresh = true;
            RefreshUnhappy();
            quietRefresh = false;
            PlayIntro();
            if (!GameState.tutorialDone) ShowTutorial();
            else if (index == 0 && GameState.StarsFor(0) == 0) StartGuide();
            else if (index == LevelGenerator.ROTATE_FROM_LEVEL && GameState.StarsFor(index) == 0)
            {
                var loaded = level;
                DelayedCall(1200, () =>
                {
                    if (level != loaded || drag.IsDragging() || HasGuide) return;
                    StartRotateGuide();
                    if (HasGuide) hud.FlashMessage(Loc.T("hud_rotate_unlocked"), 8);
                });
            }
            else if (index < 3) hud.FlashMessage(Loc.T("hud_drag_hint"), 3.5f);
        }

        public bool rotationEnabled => level != null && LevelGenerator.RotationUnlocked(level.levelIndex);

        PieceView SpawnPiece(PieceData data, bool movable)
        {
            var pv = new PieceView(this);
            pv.Setup(data, movable);
            allViews.Add(pv);
            return pv;
        }

        void RestoreRun(int index)
        {
            var saved = GameState.RunFor(index);
            if (saved == null) return;
            hintsUsed = saved.hints;
            undosUsed = saved.undos;
            foreach (var tv in inTray)
                if (tv != null && saved.rots.TryGetValue(tv.piece.id.ToString(), out int r)) tv.piece.rot = r & 3;
            foreach (var entry in saved.placed)
            {
                if (entry == null || entry.Length < 4) continue;
                int pid = entry[0];
                for (int i = 0; i < inTray.Count; i++)
                {
                    var pv = inTray[i];
                    if (pv == null || pv.piece.id != pid) continue;
                    pv.piece.rot = entry[1] & 3;
                    var cell = new Vec(entry[2], entry[3]);
                    if (!state.CanPlaceCells(pv.piece.WorldCells(cell))) break;
                    inTray[i] = null;
                    state.PlacePiece(pv.piece, cell);
                    onBoard.Set(pid, pv);
                    pv.slot = Slot.Board;
                    pv.origin = cell;
                    break;
                }
            }
        }

        void SaveRun()
        {
            if (level == null || state == null || !acceptingInput) return;
            if (level.levelIndex != GameState.highestUnlocked) return;
            var placed = new List<int[]>();
            foreach (var pv in onBoard.Values()) if (pv.movable) placed.Add(new[] { pv.piece.id, pv.piece.rot, pv.origin.x, pv.origin.y });
            var rots = new Dictionary<string, int>();
            foreach (var tv in inTray) if (tv != null && tv.piece.rot != 0) rots[tv.piece.id.ToString()] = tv.piece.rot;
            if (placed.Count == 0 && rots.Count == 0 && hintsUsed == 0 && undosUsed == 0)
            {
                GameState.ClearRun();
                return;
            }
            GameState.SaveRun(new RunSave { level = level.levelIndex, gen = LevelGenerator.VERSION, placed = placed, rots = rots, hints = hintsUsed, undos = undosUsed });
        }

        void ShowTutorial()
        {
            drag.Cancel();
            tutorial.ShowTutorial(rotationEnabled || level == null);
        }

        void OnTutorialFinished()
        {
            GameState.MarkTutorialDone();
            if (level != null && level.levelIndex == 0) StartGuide();
        }

        void StartGuide()
        {
            StopGuide();
            if (state == null || !acceptingInput) return;
            foreach (var bv in onBoard.Values()) if (bv.movable) return;
            var move = SolutionGuideMove();
            if (move != null) dragGuide = new DragGuide(this, move.pv, move.origin, move.cells);
        }

        void StartRotateGuide()
        {
            StopGuide();
            if (state == null || !acceptingInput) return;
            PieceView pick = null;
            foreach (var pv in inTray)
            {
                if (pv == null || pv.piece.solutionWorld.Count == 0 || pv.piece.UniqueRots().Count < 2) continue;
                var d = pv.piece.DuplicatePiece();
                d.OrientToSolution();
                if (d.rot != pv.piece.rot) { pick = pv; break; }
                if (pick == null) pick = pv;
            }
            if (pick != null) rotGuide = new RotateGuide(this, pick);
        }

        GuideMove SolutionGuideMove()
        {
            GuideMove best = null;
            foreach (var pv in inTray)
            {
                if (pv == null || pv.piece.solutionWorld.Count == 0) continue;
                var d = pv.piece.DuplicatePiece();
                var origin = d.OrientToSolution();
                if (!state.CanPlaceCells(d.WorldCells(origin))) continue;
                bool facing = d.rot == pv.piece.rot;
                if (best == null || facing) best = new GuideMove { pv = pv, origin = origin, cells = d.LocalCells() };
                if (facing) break;
            }
            return best;
        }

        GuideMove SolverGuideMove(Solver solver)
        {
            var remaining = new List<PieceData>();
            foreach (var pv in inTray) if (pv != null) remaining.Add(pv.piece);
            if (remaining.Count == 0) return null;
            var answer = solver.Solve(state, remaining);
            if (answer == null) return null;
            GuideMove fallback = null;
            foreach (var id in answer.PlacedIds())
            {
                var pv = inTray.Find(t => t != null && t.piece.id == id);
                var rec = answer.GetPlaced(id);
                if (pv == null || rec == null) continue;
                var cells = rec.piece.LocalCells();
                var move = new GuideMove { pv = pv, origin = rec.origin, cells = cells };
                var now = pv.piece.LocalCells();
                if (cells.Count == now.Count && cells.SequenceEqual(now)) return move;
                if (fallback == null) fallback = move;
            }
            return fallback;
        }

        void TickIdleHint(float now)
        {
            float gap = now - lastTick;
            lastTick = now;
            bool busy = state == null || !acceptingInput || HasGuide || drag.IsDragging() || tutorial.Visible || adPanel.Visible;
            if (idleHintUsed || busy || gap > 1500) { idleSince = now; return; }
            if (now - idleSince < IDLE_HINT_SECONDS * 1000) return;
            idleSince = now;
            ShowIdleHint();
        }

        void ShowIdleHint()
        {
            var solver = new Solver(rotationEnabled);
            var move = SolverGuideMove(solver);
            if (move == null)
            {
                if (!solver.aborted)
                {
                    idleHintUsed = true;
                    hud.FlashMessage(Loc.T("no_way_home"), 3);
                    return;
                }
                move = SolutionGuideMove();
            }
            if (move == null) return;
            idleHintUsed = true;
            dragGuide = new DragGuide(this, move.pv, move.origin, move.cells);
            hud.FlashMessage(Loc.T("hud_idle_hint"), 3);
        }

        void StopGuide()
        {
            dragGuide?.Destroy();
            dragGuide = null;
            rotGuide?.Destroy();
            rotGuide = null;
        }

        void PlayIntro()
        {
            board.SetAlpha(0);
            var bt = tw.Create();
            bt.TweenMethod(a => board.SetAlpha(a), 0, 1, 0.25);
            var fixd = onBoard.Values().OrderBy(p => p.origin.x + p.origin.y).ToList();
            for (int i = 0; i < fixd.Count; i++) fixd[i].PopIn(0.08f + i * 0.05f);
            float bas = 0.12f + fixd.Count * 0.05f;
            for (int i = 0; i < inTray.Count; i++) inTray[i]?.PopIn(bas + i * 0.07f);
            Sfx.Play("whoosh", -6);
        }

        // --- piece lookup ---

        /// <summary>Dev automation: a press point on a tray piece and the matching release point on its answer cell (logical).</summary>
        public bool DevDragPlan(out Vector2 from, out Vector2 to)
        {
            from = to = default;
            var m = SolutionGuideMove();
            if (m == null) return false;
            var c0 = m.pv.piece.LocalCells()[0];
            from = new Vector2(m.pv.Left + (c0.x + 0.5f) * m.pv.cellSize, m.pv.Top + (c0.y + 0.5f) * m.pv.cellSize);
            var c1 = m.cells[0];
            to = new Vector2(board.x + board.originX + (m.origin.x + c1.x + 0.5f) * board.cellSize, board.y + board.originY + (m.origin.y + c1.y + 0.5f) * board.cellSize);
            return true;
        }

        public PieceView ViewAt(float px, float py)
        {
            for (int i = 0; i < inTray.Count; i++)
            {
                var tv = inTray[i];
                if (tv != null && tv.movable)
                {
                    var r = tray.SlotRect(i);
                    if (px >= r.x && py >= r.y && px < r.x + r.width && py < r.y + r.height) return tv;
                }
            }
            PieceView found = null;
            foreach (var pv in allViews)
            {
                if (!pv.movable) continue;
                if (px >= pv.Left && py >= pv.Top && px < pv.Left + pv.BoxW && py < pv.Top + pv.BoxH && pv.ContainsGlobal(px, py)) found = pv;
            }
            return found;
        }

        public bool CanPlace(PieceView pv, Vec cell)
        {
            if (PieceView.IsInvalid(cell)) return false;
            return state.CanPlaceCells(pv.piece.WorldCells(cell));
        }

        public bool PlacementHappy(PieceView pv, Vec cell)
        {
            if (!CanPlace(pv, cell)) return false;
            return !state.WouldViolate(pv.piece, cell);
        }

        // --- moves ---

        public void OnPickUp(PieceView pv)
        {
            StopGuide();
            pickOrigin = new PickOrigin { slot = pv.slot, origin = pv.origin, tray = pv.trayIndex, id = pv.piece.id };
            if (pv.slot == Slot.Board && !PieceView.IsInvalid(pv.origin))
            {
                state.RemovePiece(pv.piece.id);
                onBoard.Delete(pv.piece.id);
                pv.origin = PieceView.INVALID;
            }
            pv.SetCellSize(board.cellSize);
            RefreshUnhappy();
        }

        public void CommitPlace(PieceView pv, Vec cell)
        {
            DetachFromTray(pv);
            state.PlacePiece(pv.piece, cell);
            onBoard.Set(pv.piece.id, pv);
            pv.slot = Slot.Board;
            pv.origin = cell;
            pv.SetCellSize(board.cellSize);
            float x = board.x + board.originX + cell.x * board.cellSize;
            float y = board.y + board.originY + cell.y * board.cellSize;
            Move(pv, x, y, 0.04f);
            pv.SetDragging(false);
            pv.Squash();
            PlaceJuice(pv, x + pv.BoxW * 0.5f, y + pv.BoxH * 0.5f);
            PushUndo(pv);
            RefreshUnhappy();
            SaveRun();
            CheckWin();
        }

        void PlaceJuice(PieceView pv, float cx, float cy)
        {
            combo++;
            float pitch = 1 + Mathf.Min(combo - 1, 8) * 0.06f;
            Sfx.Play("place", 0, pitch);
            var col = Art.PaletteFill(pv.piece.color);
            Effects.RingWave(this, cx, cy, Mathf.Max(pv.BoxW, pv.BoxH) * 0.62f, new Col(1, 1, 1, 0.85f), Mathf.Max(6, pv.cellSize * 0.1f));
            Effects.PiecePop(this, cx, cy, col);
            Effects.StarSparkle(this, cx, cy, new Col(1, 1, 0.85f, 1), 6, 0.9f);
            Effects.Shake(this, 3 + Mathf.Min(combo, 5) * 0.6f, 0.16f);
            if (combo >= 3 && combo % 3 == 0)
            {
                var words = new[] { Loc.T("praise_nice"), Loc.T("praise_great"), Loc.T("praise_awesome"), Loc.T("praise_amazing") };
                string word = words[Mathf.Min(combo / 3 - 1, words.Length - 1)];
                Effects.FloatText(this, word, cx, cy - pv.BoxH * 0.6f, Art.STAR, 48, 70, 0.3f);
                Sfx.Play("sparkle", -4);
            }
        }

        public void OnRefuse(PieceView pv, List<Vec> tried)
        {
            combo = 0;
            pv.Refuse();
            Sfx.Play("refuse");
            if (tried.Count > 0) board.FlashBad(tried);
            Effects.Shake(this, 4, 0.18f);
        }

        public void ReturnHome(PieceView pv)
        {
            var from = pickOrigin;
            if (from.slot == Slot.Board && !PieceView.IsInvalid(from.origin) && state.CanPlaceCells(pv.piece.WorldCells(from.origin)))
            {
                DetachFromTray(pv);
                state.PlacePiece(pv.piece, from.origin);
                onBoard.Set(pv.piece.id, pv);
                pv.slot = Slot.Board;
                pv.origin = from.origin;
                pv.SetCellSize(board.cellSize);
                Move(pv, board.x + board.originX + from.origin.x * board.cellSize, board.y + board.originY + from.origin.y * board.cellSize, 0.1f);
            }
            else ToTray(pv);
            RefreshUnhappy();
        }

        public void SendToTray(PieceView pv)
        {
            bool fromBoard = pickOrigin.slot == Slot.Board;
            ToTray(pv);
            if (fromBoard) PushUndo(pv);
            RefreshUnhappy();
            SaveRun();
        }

        void ToTray(PieceView pv)
        {
            DetachFromTray(pv);
            float cx = pv.Left + pv.BoxW / 2, cy = pv.Top + pv.BoxH / 2;
            int idx = pv.trayIndex;
            if (idx < 0 || idx >= inTray.Count || inTray[idx] != null) idx = inTray.IndexOf(null);
            if (idx == -1)
            {
                inTray.Add(pv);
                idx = inTray.Count - 1;
                tray.SetSlotCount(inTray.Count);
            }
            inTray[idx] = pv;
            pv.slot = Slot.Tray;
            pv.trayIndex = idx;
            pv.origin = PieceView.INVALID;
            FitInTraySlot(pv, 0.1f, new Vector2(cx, cy));
        }

        void FitInTraySlot(PieceView pv, float duration = 0.1f, Vector2? from = null)
        {
            var slot = tray.SlotRect(pv.trayIndex);
            var bb = pv.piece.Bbox();
            float bx = Mathf.Max(bb.x, 1), by = Mathf.Max(bb.y, 1);
            float ox = 0, oy = 0;
            if (pv.piece.mood != Mood.NEUTRAL)
            {
                var o = Art.ThoughtOverhangCells();
                ox = o.x;
                oy = o.y;
            }
            float ex = bx + ox, ey = by + oy;
            float fit = Mathf.Min(slot.width / ex, slot.height / ey) * TRAY_FIT;
            fit = Mathf.Min(Mathf.Max(fit, 12), Mathf.Max(12, tray.slotSize * TRAY_MAX_CELL_FRAC));
            pv.SetCellSize(fit);
            if (from.HasValue) pv.SetTopLeft(from.Value.x - pv.BoxW / 2, from.Value.y - pv.BoxH / 2);
            float gx = slot.x + slot.width / 2 - ex * fit / 2;
            float gy = slot.y + slot.height / 2 - ey * fit / 2 + oy * fit;
            Move(pv, gx, gy, duration);
        }

        public void OnRotate(PieceView pv)
        {
            FitInTraySlot(pv);
            SaveRun();
        }

        void DetachFromTray(PieceView pv)
        {
            int i = inTray.IndexOf(pv);
            if (i != -1) inTray[i] = null;
        }

        // --- feelings ---

        void RefreshUnhappy()
        {
            var seen = new HashSet<int>();
            foreach (var kv in onBoard.Entries())
            {
                var pv = kv.Value;
                bool upset = state.PieceViolated(pv.piece.id);
                pv.SetUnhappy(upset);
                seen.Add(kv.Key);
                bool prev = prevViolated.TryGet(kv.Key, out var pvv) && pvv;
                if (!quietRefresh && prev != upset) MoodJuice(pv, upset);
                prevViolated.Set(kv.Key, upset);
            }
            foreach (var id in prevViolated.Keys()) if (!seen.Contains(id)) prevViolated.Delete(id);
            board.Redraw();
            int remaining = inTray.Count(p => p != null);
            if (remaining == 0) remaining = state.EmptyCount();
            hud.SetRemaining(remaining);
            hud.SetDiamonds(GameState.diamonds);
        }

        void MoodJuice(PieceView pv, bool upset)
        {
            float cx = pv.Left + pv.BoxW * 0.5f, cy = pv.Top + pv.BoxH * 0.5f;
            if (upset)
            {
                pv.Shiver();
                Effects.Puff(this, cx, cy, new Col(0.35f, 0.3f, 0.55f, 1));
                Sfx.Play("upset", -3);
                if (!upsetTipShown && level != null && level.levelIndex < 10)
                {
                    upsetTipShown = true;
                    hud.FlashMessage(Loc.T("hud_red_ring"), 3);
                }
            }
            else
            {
                pv.Hop();
                Effects.HeartsUp(this, cx, cy - pv.BoxH * 0.25f);
                Sfx.Play("happy", -2);
            }
        }

        // --- winning ---

        int ScoreStars()
        {
            int assists = hintsUsed + undosUsed;
            if (assists == 0) return 3;
            return assists <= 2 ? 2 : 1;
        }

        void CheckWin()
        {
            if (!state.IsSolved()) return;
            acceptingInput = false;
            PlatformSdk.GameplayStop();
            int stars = ScoreStars();
            GameState.CompleteLevel(level.levelIndex, stars, state.Snapshot(), GameState.BgForLevel(level.levelIndex));
            var boardPieces = onBoard.Values().OrderBy(p => p.origin.x + p.origin.y).ToList();
            for (int i = 0; i < boardPieces.Count; i++)
            {
                var pv = boardPieces[i];
                pv.SetCelebrating(true);
                pv.Hop(0.15f + i * 0.06f);
                float sx = pv.Left + pv.BoxW * 0.5f, sy = pv.Top + pv.BoxH * 0.5f;
                var t = tw.Create();
                t.TweenInterval(0.15f + i * 0.06f);
                t.TweenCallback(() => { if (pv.Active) Effects.StarSparkle(this, sx, sy, new Col(1, 0.95f, 0.6f, 1), 7); });
            }
            Sfx.Play("win_fanfare");
            string headline = new[] { "", Loc.T("praise_nice"), Loc.T("praise_great"), Loc.T("praise_perfect") }[Mathf.Clamp(stars, 0, 3)];
            float cs = board.cellSize;
            float bcx = board.x + board.originX + state.width * cs / 2;
            float bcy = board.y + board.originY + state.height * cs / 2;
            Effects.FloatText(this, headline, bcx, bcy, Art.STAR, 92, 60, 0.5f);
            float Wv = Viewport.w, Hv = Viewport.h;
            Effects.ConfettiCannon(this, -10, Hv + 10, 0.45f, -1);
            Effects.ConfettiCannon(this, Wv + 10, Hv + 10, -0.45f, -1);
            Effects.Shake(this, 10, 0.35f);
            int serial = loadSerial;
            var t2 = tw.Create();
            t2.TweenInterval(1);
            t2.TweenCallback(() =>
            {
                if (serial != loadSerial) return;
                winPanel.ShowPanel(level.levelIndex, LevelGenerator.TIERS[level.tier].name, stars, GameState.CLEAR_REWARD);
            });
        }

        void OnRewardBurst(float fromX, float fromY, int amount)
        {
            var target = hud.DiamondTarget();
            int startValue = GameState.diamonds - amount;
            int landed = 0;
            int n = Mathf.Clamp(amount, 1, 8);
            Effects.FlyGems(this, fromX, fromY, target.x, target.y, n, () =>
            {
                landed++;
                hud.SetDiamonds(startValue + Js.RoundI((float)amount * landed / n));
                Sfx.Play("diamond_tick", -2, 1 + landed * 0.05f);
            });
        }

        void OnAdFinished(bool granted, float fromX, float fromY)
        {
            if (granted)
            {
                OnRewardBurst(fromX, fromY, GameState.AD_REWARD);
                hud.FlashMessage(Loc.Fmt("ad_reward_toast", GameState.AD_REWARD));
            }
            else hud.FlashMessage(Loc.T("ad_failed"));
        }

        void OnNext()
        {
            PlatformSdk.ShowInterstitial();
            hud.SetDiamonds(GameState.diamonds);
            LoadLevel(level.levelIndex + 1);
            PlatformSdk.GameplayStart();
        }

        void OnMenuPressed()
        {
            Sfx.Play("whoosh", -4);
            Go("MainMenu");
        }

        void OnRestartPressed()
        {
            if (state == null || !acceptingInput) return;
            bool hasWork = onBoard.Values().Any(pv => pv.movable);
            if (hasWork && timeNow > restartArmedUntil)
            {
                restartArmedUntil = timeNow + RESTART_CONFIRM_MS;
                hud.FlashMessage(Loc.T("restart_confirm"), RESTART_CONFIRM_MS / 1000);
                return;
            }
            restartArmedUntil = 0;
            int index = level.levelIndex;
            int h = hintsUsed, u = undosUsed;
            if (GameState.RunFor(index) != null) GameState.ClearRun();
            Sfx.Play("whoosh", -4);
            LoadLevel(index);
            hintsUsed = h;
            undosUsed = u;
            SaveRun();
        }

        // --- undo / hint ---

        public void Undo()
        {
            if (undoStack.Count == 0 || !acceptingInput) return;
            idleSince = lastTick;
            Sfx.Play("undo");
            undosUsed++;
            var e = undoStack[undoStack.Count - 1];
            undoStack.RemoveAt(undoStack.Count - 1);
            var pv = e.view;
            if (pv.slot == Slot.Board && !PieceView.IsInvalid(pv.origin))
            {
                state.RemovePiece(pv.piece.id);
                onBoard.Delete(pv.piece.id);
                pv.origin = PieceView.INVALID;
            }
            pickOrigin = new PickOrigin { slot = e.slot, origin = e.origin, tray = e.tray, id = e.id };
            ReturnHome(pv);
            SaveRun();
        }

        void PushUndo(PieceView pv)
            => undoStack.Add(new UndoEntry { view = pv, slot = pickOrigin.slot, origin = pickOrigin.origin, tray = pickOrigin.tray, id = pv.piece.id });

        void HintFlash(PieceView pv)
        {
            float cs = board.cellSize;
            float x = board.x + board.originX + pv.origin.x * cs + pv.BoxW * 0.5f;
            float y = board.y + board.originY + pv.origin.y * cs + pv.BoxH * 0.5f;
            float r = Mathf.Max(pv.BoxW, pv.BoxH) * 0.7f;
            Effects.RingWave(this, x, y, r, Art.STAR, 12);
            Effects.RingWave(this, x, y, r * 1.3f, Art.STAR.WithAlpha(0.7f), 8, 0.6f);
            Effects.StarSparkle(this, x, y, Art.STAR, 10, 1.2f);
        }

        public void Hint()
        {
            if (!acceptingInput || state == null) return;
            idleSince = lastTick;
            var remaining = new List<PieceData>();
            foreach (var pv in inTray) if (pv != null) remaining.Add(pv.piece);
            if (remaining.Count == 0) return;
            if (!GameState.SpendHint())
            {
                Sfx.Play("hint_deny");
                if (PlatformSdk.IsRewardedAvailable())
                {
                    drag.Cancel();
                    adPanel.Show();
                }
                else hud.FlashMessage(Loc.T("no_diamonds_hint"));
                return;
            }
            var answer = new Solver(rotationEnabled).Solve(state, remaining);
            if (answer == null)
            {
                GameState.diamonds += GameState.HINT_COST;
                GameState.SaveProgress();
                hud.FlashMessage(Loc.T("no_way_home"));
                return;
            }
            Sfx.Play("hint_use");
            foreach (var id in answer.PlacedIds())
            {
                if (onBoard.Has(id)) continue;
                var rec = answer.GetPlaced(id);
                var piece = rec.piece;
                var origin = rec.origin;
                PieceView target = null;
                foreach (var pv in inTray) if (pv != null && pv.piece.id == piece.id) target = pv;
                if (target == null)
                {
                    foreach (var pv in inTray)
                        if (pv != null && pv.piece.color == piece.color && pv.piece.mood == piece.mood && pv.piece.targetColor == piece.targetColor && pv.piece.baseCells.Count == piece.baseCells.Count)
                        { target = pv; break; }
                }
                if (target == null) continue;
                pickOrigin = new PickOrigin { slot = Slot.Tray, origin = PieceView.INVALID, tray = target.trayIndex, id = target.piece.id };
                target.piece.rot = piece.rot;
                target.SetCellSize(board.cellSize);
                CommitPlace(target, origin);
                HintFlash(target);
                hintsUsed++;
                SaveRun();
                return;
            }
        }
    }
}
