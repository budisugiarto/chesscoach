import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_POSITION, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  gameFromMoves,
  isSquare,
  positionsFromMoves,
  uciLineToSan,
  type MoveInput,
} from "./features/board/chessState";
import {
  StockfishClient,
  type EngineLine,
  type EngineSettings,
  type EngineStatus,
} from "./features/engine/stockfishClient";
import { importFen, importPgn } from "./features/import/importGame";

type ImportMode = "pgn" | "fen";
type PromotionPiece = "q" | "r" | "b" | "n";
type PresetName = "Pemula" | "Menengah" | "Lanjut" | "Maksimal" | "Kustom";

const THINKING_PRESETS: Array<{
  name: Exclude<PresetName, "Kustom">;
  settings: EngineSettings;
}> = [
  { name: "Pemula", settings: { skillLevel: 0, depth: 8, moveTime: 800, multiPv: 1 } },
  { name: "Menengah", settings: { skillLevel: 7, depth: 12, moveTime: 1500, multiPv: 1 } },
  { name: "Lanjut", settings: { skillLevel: 14, depth: 16, moveTime: 2500, multiPv: 2 } },
  { name: "Maksimal", settings: { skillLevel: 20, depth: 20, moveTime: 4000, multiPv: 3 } },
];

function App() {
  const [mode, setMode] = useState<ImportMode>("pgn");
  const [pgnInput, setPgnInput] = useState("");
  const [fenInput, setFenInput] = useState("");
  const [initialFen, setInitialFen] = useState(DEFAULT_POSITION);
  const [moves, setMoves] = useState<MoveInput[]>([]);
  const [positions, setPositions] = useState([DEFAULT_POSITION]);
  const [currentPly, setCurrentPly] = useState(0);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [error, setError] = useState("");
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("loading");
  const [engineError, setEngineError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisLines, setAnalysisLines] = useState<EngineLine[]>([]);
  const [bestMove, setBestMove] = useState("");
  const [preset, setPreset] = useState<PresetName>("Menengah");
  const [skillLevel, setSkillLevel] = useState(7);
  const [depth, setDepth] = useState(12);
  const [moveTime, setMoveTime] = useState(1500);
  const [multiPv, setMultiPv] = useState(1);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const engineRef = useRef<StockfishClient | null>(null);

  const visibleGame = useMemo(
    () => gameFromMoves(initialFen, moves.slice(0, currentPly)),
    [initialFen, moves, currentPly],
  );
  const latestGame = useMemo(
    () => gameFromMoves(initialFen, moves),
    [initialFen, moves],
  );
  const canPlay = currentPly === moves.length && !latestGame.isGameOver();

  function initializeEngine() {
    engineRef.current?.terminate();
    engineRef.current = null;
    setEngineStatus("loading");
    setEngineError("");

    try {
      engineRef.current = new StockfishClient((event) => {
        switch (event.type) {
          case "ready":
            setEngineStatus("ready");
            setEngineError("");
            break;
          case "info":
            setAnalysisLines((currentLines) => {
              const nextLines = new Map(
                currentLines.map((line) => [line.multiPv, line] as const),
              );
              nextLines.set(event.line.multiPv, event.line);
              return [...nextLines.values()].sort((left, right) => left.multiPv - right.multiPv);
            });
            break;
          case "bestmove":
            setBestMove(event.move);
            setIsAnalyzing(false);
            break;
          case "error":
            setEngineStatus("error");
            setEngineError(event.message);
            setIsAnalyzing(false);
            break;
        }
      });
    } catch (engineLoadError) {
      setEngineStatus("error");
      setEngineError(
        engineLoadError instanceof Error
          ? engineLoadError.message
          : "Worker Stockfish gagal dimulai.",
      );
    }
  }

  useEffect(() => {
    initializeEngine();
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  const visibleFen = visibleGame.fen();
  useEffect(() => {
    if (!isAnalyzing) return;
    engineRef.current?.stop();
    setIsAnalyzing(false);
    setAnalysisLines([]);
    setBestMove("");
  }, [visibleFen]);

  function installPosition(nextInitialFen: string, nextMoves: MoveInput[]) {
    const nextPositions = positionsFromMoves(nextInitialFen, nextMoves);
    setInitialFen(nextInitialFen);
    setMoves(nextMoves);
    setPositions(nextPositions);
    setCurrentPly(nextMoves.length);
    setPendingPromotion(null);
    setError("");
  }

  function loadInput() {
    const input = mode === "pgn" ? pgnInput.trim() : fenInput.trim();
    if (!input) {
      setError(mode === "pgn" ? "Tempel PGN terlebih dahulu." : "Tempel FEN terlebih dahulu.");
      return;
    }

    try {
      if (mode === "pgn") {
        const importedGame = importPgn(input);
        installPosition(importedGame.initialFen, importedGame.moves);
      } else {
        const importedGame = importFen(input);
        installPosition(importedGame.initialFen, importedGame.moves);
      }
    } catch (loadError) {
      const detail =
        loadError instanceof Error ? loadError.message : "Format input tidak dikenali.";
      setError(
        mode === "pgn"
          ? `PGN tidak valid: ${detail}`
          : `FEN tidak valid: ${detail}`,
      );
    }
  }

  function makeMove(from: Square, to: Square, promotion?: PromotionPiece): boolean {
    if (!canPlay) return false;

    const nextGame = gameFromMoves(initialFen, moves);
    try {
      nextGame.move({ from, to, ...(promotion ? { promotion } : {}) });
    } catch {
      return false;
    }

    const nextMoves = nextGame.history({ verbose: true });
    setMoves(nextMoves);
    setPositions((currentPositions) => [...currentPositions, nextGame.fen()]);
    setCurrentPly(nextMoves.length);
    setPendingPromotion(null);
    setError("");
    return true;
  }

  function handlePieceDrop(sourceSquare: string, targetSquare: string): boolean {
    if (!isSquare(sourceSquare) || !isSquare(targetSquare) || !canPlay) return false;

    const from = sourceSquare;
    const to = targetSquare;
    const piece = latestGame.get(from);
    const isPromotion =
      piece?.type === "p" &&
      ((piece.color === "w" && to[1] === "8") ||
        (piece.color === "b" && to[1] === "1"));

    if (isPromotion) {
      setPendingPromotion({ from, to });
      return false;
    }

    return makeMove(from, to);
  }

  function navigateTo(ply: number) {
    setCurrentPly(ply);
    setPendingPromotion(null);
  }

  function applyPreset(nextPreset: Exclude<PresetName, "Kustom">) {
    const selected = THINKING_PRESETS.find(({ name }) => name === nextPreset);
    if (!selected) return;
    setPreset(nextPreset);
    setSkillLevel(selected.settings.skillLevel);
    setDepth(selected.settings.depth);
    setMoveTime(selected.settings.moveTime);
    setMultiPv(selected.settings.multiPv);
  }

  function updateSetting<T extends "skillLevel" | "depth" | "moveTime" | "multiPv">(
    setting: T,
    value: number,
  ) {
    setPreset("Kustom");
    if (setting === "skillLevel") setSkillLevel(value);
    if (setting === "depth") setDepth(value);
    if (setting === "moveTime") setMoveTime(value);
    if (setting === "multiPv") setMultiPv(value);
  }

  function analyzePosition() {
    if (!engineRef.current) {
      setEngineError("Worker Stockfish belum tersedia. Coba muat ulang engine.");
      setEngineStatus("error");
      return;
    }

    setAnalysisLines([]);
    setBestMove("");
    setEngineError("");
    setIsAnalyzing(true);
    try {
      engineRef.current.analyze(visibleFen, { skillLevel, depth, moveTime, multiPv });
    } catch (analysisError) {
      setIsAnalyzing(false);
      setEngineError(
        analysisError instanceof Error
          ? analysisError.message
          : "Analisis engine gagal dimulai.",
      );
    }
  }

  function getGameStatus(): string {
    if (visibleGame.isCheckmate()) {
      return `Skakmat — ${visibleGame.turn() === "w" ? "Hitam" : "Putih"} menang`;
    }
    if (visibleGame.isStalemate()) return "Remis — stalemate";
    if (visibleGame.isThreefoldRepetition()) return "Remis — posisi berulang";
    if (visibleGame.isInsufficientMaterial()) return "Remis — materi tidak cukup";
    if (visibleGame.isDraw()) return "Remis";
    if (visibleGame.isCheck()) {
      return `Skak untuk ${visibleGame.turn() === "w" ? "Putih" : "Hitam"}`;
    }
    return `Giliran ${visibleGame.turn() === "w" ? "Putih" : "Hitam"}`;
  }

  const moveRows = Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => {
    const whiteMove = moves[index * 2];
    const blackMove = moves[index * 2 + 1];
    return { moveNumber: index + 1, whiteMove, blackMove, firstPly: index * 2 + 1 };
  });
  const topColor = orientation === "white" ? "Hitam" : "Putih";
  const bottomColor = orientation === "white" ? "Putih" : "Hitam";
  const topPiece = orientation === "white" ? "♟" : "♙";
  const bottomPiece = orientation === "white" ? "♙" : "♟";

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Chess Coach beranda">
          <span className="brand-mark" aria-hidden="true">♞</span>
          <span>chess<span className="brand-accent">coach</span></span>
        </a>
        <div className="topbar-right">
          <span className="local-badge"><span className="status-dot" /> Berjalan lokal</span>
          <button
            className="icon-button"
            type="button"
            onClick={() => setOrientation((side) => (side === "white" ? "black" : "white"))}
            aria-label="Balik orientasi papan"
            title="Balik papan"
          >
            ⇅
          </button>
        </div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">RUANG LATIHAN PRIBADI</p>
          <h1>Belajar satu langkah lebih baik.</h1>
          <p className="subtitle">Tempel posisi atau game, lalu jelajahi papan langkah demi langkah.</p>
        </div>
        <span className="privacy-note"><span aria-hidden="true">◈</span> Game tetap di perangkat ini</span>
      </section>

      <section className="workspace">
        <div className="board-column">
          <div className="board-card">
            <div className="board-topline">
              <div className="player-label">
                <span className={`player-piece ${topColor === "Hitam" ? "black-piece" : "white-piece"}`} aria-hidden="true">{topPiece}</span>
                <div><strong>{topColor}</strong><span>{topColor === "Putih" ? "di sisi Anda" : "lawan"}</span></div>
              </div>
              <span className={`turn-indicator ${visibleGame.turn() === "b" ? "active" : ""}`}>
                {visibleGame.turn() === "b" ? "GILIRAN" : ""}
              </span>
            </div>

            <div className="board-wrap">
              <Chessboard
                options={{
                  position: positions[currentPly] ?? visibleGame.fen(),
                  boardOrientation: orientation,
                  allowDragging: canPlay,
                  showNotation: true,
                  showAnimations: true,
                  animationDurationInMs: 160,
                  boardStyle: { borderRadius: "4px", overflow: "hidden" },
                  darkSquareStyle: { backgroundColor: "#769656" },
                  lightSquareStyle: { backgroundColor: "#eeeed2" },
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    if (!sourceSquare || !targetSquare) return false;
                    return handlePieceDrop(sourceSquare, targetSquare);
                  },
                }}
              />
            </div>

            <div className="board-bottomline">
              <span className={`player-piece ${bottomColor === "Hitam" ? "black-piece" : "white-piece"}`} aria-hidden="true">{bottomPiece}</span>
              <div className="player-label-text">
                <strong>{bottomColor}</strong>
                <span>{bottomColor === "Putih" ? "di sisi Anda" : "lawan"}</span>
              </div>
              <span className={`turn-indicator ${visibleGame.turn() === "w" ? "active" : ""}`}>
                {visibleGame.turn() === "w" ? "GILIRAN" : ""}
              </span>
            </div>
          </div>

          <div className="board-controls">
            <div className="navigation-controls" aria-label="Navigasi langkah">
              <button type="button" onClick={() => navigateTo(0)} disabled={currentPly === 0} aria-label="Ke posisi awal">|◀</button>
              <button type="button" onClick={() => navigateTo(Math.max(0, currentPly - 1))} disabled={currentPly === 0} aria-label="Langkah sebelumnya">‹</button>
              <span className="move-counter">{currentPly} / {moves.length}</span>
              <button type="button" onClick={() => navigateTo(Math.min(moves.length, currentPly + 1))} disabled={currentPly === moves.length} aria-label="Langkah berikutnya">›</button>
              <button type="button" onClick={() => navigateTo(moves.length)} disabled={currentPly === moves.length} aria-label="Ke posisi terbaru">▶|</button>
            </div>
            <span className="game-status">{getGameStatus()}</span>
          </div>

          {pendingPromotion && (
            <div className="promotion-panel" role="group" aria-label="Pilih bidak promosi">
              <span>Promosikan pion menjadi:</span>
              {([
                ["q", "Menteri"],
                ["r", "Benteng"],
                ["b", "Gajah"],
                ["n", "Kuda"],
              ] as const).map(([piece, label]) => (
                <button
                  key={piece}
                  type="button"
                  onClick={() => makeMove(pendingPromotion.from, pendingPromotion.to, piece)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="side-panel">
          <section className="panel-section import-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">MULAI DARI POSISI</p>
                <h2>Impor game</h2>
              </div>
              <span className="step-number">01</span>
            </div>
            <div className="tab-switch" role="tablist" aria-label="Jenis input">
              <button
                id="pgn-tab"
                type="button"
                role="tab"
                aria-selected={mode === "pgn"}
                aria-controls="import-input"
                className={mode === "pgn" ? "selected" : ""}
                onClick={() => { setMode("pgn"); setError(""); }}
              >
                PGN game
              </button>
              <button
                id="fen-tab"
                type="button"
                role="tab"
                aria-selected={mode === "fen"}
                aria-controls="import-input"
                className={mode === "fen" ? "selected" : ""}
                onClick={() => { setMode("fen"); setError(""); }}
              >
                FEN posisi
              </button>
            </div>
            {mode === "pgn" ? (
              <textarea
                id="import-input"
                className="import-textarea"
                role="tabpanel"
                aria-labelledby="pgn-tab"
                value={pgnInput}
                onChange={(event) => setPgnInput(event.target.value)}
                placeholder={'Tempel PGN game di sini...\n\nContoh:\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'}
                spellCheck={false}
              />
            ) : (
              <textarea
                id="import-input"
                className="import-textarea fen-textarea"
                role="tabpanel"
                aria-labelledby="fen-tab"
                value={fenInput}
                onChange={(event) => setFenInput(event.target.value)}
                placeholder="Tempel notasi FEN posisi di sini..."
                spellCheck={false}
              />
            )}
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="primary-button" type="button" onClick={loadInput}>
              Muat {mode.toUpperCase()} <span aria-hidden="true">→</span>
            </button>
            <p className="helper-text">Input diproses di browser dan tidak dikirim ke server.</p>
          </section>

          <section className="panel-section moves-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">RIWAYAT POSISI</p>
                <h2>Langkah game <span className="move-count">({moves.length})</span></h2>
              </div>
              <span className="step-number">02</span>
            </div>
            {moveRows.length ? (
              <div className="move-list" aria-label="Daftar langkah">
                {moveRows.map(({ moveNumber, whiteMove, blackMove, firstPly }) => (
                  <div className="move-row" key={moveNumber}>
                    <span className="move-number">{moveNumber}.</span>
                    {whiteMove && (
                      <button
                        type="button"
                        className={`move-san ${currentPly === firstPly ? "current" : ""}`}
                        onClick={() => navigateTo(firstPly)}
                        aria-label={`Langkah ${moveNumber} putih ${whiteMove.san}`}
                      >
                        {whiteMove.san}
                      </button>
                    )}
                    {blackMove ? (
                      <button
                        type="button"
                        className={`move-san ${currentPly === firstPly + 1 ? "current" : ""}`}
                        onClick={() => navigateTo(firstPly + 1)}
                        aria-label={`Langkah ${moveNumber} hitam ${blackMove.san}`}
                      >
                        {blackMove.san}
                      </button>
                    ) : <span className="move-san empty" />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-moves">
                <span className="empty-icon" aria-hidden="true">♙</span>
                <p>Belum ada langkah.</p>
                <span>Tempel PGN atau mulai dengan menggerakkan bidak.</span>
              </div>
            )}
          </section>

          <section className="panel-section engine-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">KONTROL ENGINE</p>
                <h2>Tingkat berpikir</h2>
              </div>
              <span className={`engine-status ${engineStatus}`}>
                <span className="status-dot" />
                {engineStatus === "ready" ? "SIAP" : engineStatus === "error" ? "ERROR" : "MEMUAT"}
              </span>
            </div>

            <div className="preset-grid" aria-label="Preset tingkat kesulitan">
              {THINKING_PRESETS.map(({ name }) => (
                <button
                  key={name}
                  type="button"
                  className={preset === name ? "selected" : ""}
                  onClick={() => applyPreset(name)}
                >
                  {name}
                </button>
              ))}
            </div>

            <label className="slider-setting">
              <span><span>Skill Level</span><strong>{skillLevel} / 20</strong></span>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={skillLevel}
                onChange={(event) => updateSetting("skillLevel", Number(event.target.value))}
              />
            </label>
            <label className="slider-setting">
              <span><span>Kedalaman</span><strong>{depth} ply</strong></span>
              <input
                type="range"
                min="6"
                max="24"
                step="1"
                value={depth}
                onChange={(event) => updateSetting("depth", Number(event.target.value))}
              />
            </label>
            <label className="slider-setting">
              <span><span>Batas waktu</span><strong>{moveTime} ms</strong></span>
              <input
                type="range"
                min="250"
                max="5000"
                step="250"
                value={moveTime}
                onChange={(event) => updateSetting("moveTime", Number(event.target.value))}
              />
            </label>

            <div className="multipv-control">
              <span>Variasi terbaik</span>
              <div role="group" aria-label="Jumlah variasi terbaik">
                {[1, 2, 3].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={multiPv === count ? "selected" : ""}
                    onClick={() => updateSetting("multiPv", count)}
                    aria-pressed={multiPv === count}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="primary-button engine-button"
              type="button"
              onClick={analyzePosition}
              disabled={engineStatus !== "ready" || isAnalyzing}
            >
              {isAnalyzing ? "Menganalisis posisi..." : "Analisis posisi ini"}
              {!isAnalyzing && <span aria-hidden="true">→</span>}
            </button>

            {engineStatus === "error" && (
              <div className="engine-error" role="alert">
                <p>{engineError || "Engine gagal dimuat."}</p>
                <button type="button" onClick={initializeEngine}>Coba muat ulang</button>
              </div>
            )}

            {(analysisLines.length > 0 || bestMove) && (
              <div className="engine-results" aria-live="polite">
                <div className="result-heading">
                  <strong>Variasi engine</strong>
                  {bestMove && (
                    <span>
                      Terbaik: {uciLineToSan(visibleFen, [bestMove])[0] ?? bestMove}
                    </span>
                  )}
                </div>
                <p className="score-caption">Evaluasi dari sisi pemain yang sedang giliran.</p>
                {analysisLines.map((line) => {
                  const score =
                    line.mate !== undefined
                      ? `M${line.mate > 0 ? "+" : ""}${line.mate}`
                      : line.scoreCp !== undefined
                        ? `${line.scoreCp > 0 ? "+" : ""}${(line.scoreCp / 100).toFixed(2)}`
                        : "—";
                  const sanLine = uciLineToSan(visibleFen, line.pv);
                  return (
                    <div className="engine-line" key={line.multiPv}>
                      <span className="line-index">{line.multiPv}</span>
                      <strong>{score}</strong>
                      <span>{sanLine.join(" ") || "Menunggu variasi..."}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {engineError && engineStatus !== "error" && (
              <p className="error-message" role="alert">{engineError}</p>
            )}
            <p className="helper-text">
              Gunakan untuk game selesai atau latihan lokal; tidak terhubung ke situs catur.
              <br />
              Analisis berjalan lokal.
              {" "}<a href="/engine/Copying.txt" target="_blank" rel="noreferrer">Lisensi GPLv3</a>
              {" "}· <a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1" target="_blank" rel="noreferrer">Kode sumber</a>
            </p>
          </section>
        </aside>
      </section>

      <footer className="footer">
        <span>CHESS COACH <span className="footer-dot">·</span> RUANG BELAJAR PRIBADI</span>
        <span>Belajar dengan tenang. Satu langkah setiap saat.</span>
      </footer>
    </main>
  );
}

export default App;
