export type EngineStatus = "loading" | "ready" | "error";

export type EngineSettings = {
  skillLevel: number;
  depth: number;
  moveTime: number;
  multiPv: number;
};

export type EngineLine = {
  multiPv: number;
  depth: number;
  scoreCp?: number;
  mate?: number;
  pv: string[];
};

export type EngineEvent =
  | { type: "ready" }
  | { type: "info"; line: EngineLine }
  | { type: "bestmove"; move: string }
  | { type: "error"; message: string };

type EngineListener = (event: EngineEvent) => void;
type QueuedAnalysis = {
  fen: string;
  settings: EngineSettings;
};

function parseInfo(line: string): EngineLine | null {
  const depth = line.match(/\bdepth\s+(\d+)/);
  const multiPv = line.match(/\bmultipv\s+(\d+)/);
  const scoreCp = line.match(/\bscore\s+cp\s+(-?\d+)/);
  const mate = line.match(/\bscore\s+mate\s+(-?\d+)/);
  const pv = line.match(/\bpv\s+(.+)$/);
  if (!depth || (!scoreCp && !mate)) return null;

  return {
    depth: Number(depth[1]),
    multiPv: multiPv ? Number(multiPv[1]) : 1,
    ...(scoreCp ? { scoreCp: Number(scoreCp[1]) } : {}),
    ...(mate ? { mate: Number(mate[1]) } : {}),
    pv: pv ? pv[1].trim().split(/\s+/) : [],
  };
}

export class StockfishClient {
  private readonly worker: Worker;
  private readonly onEvent: EngineListener;
  private ready = false;
  private ignoreOutputUntilBestMove = false;
  private queuedAnalysis: QueuedAnalysis | null = null;

  constructor(onEvent: EngineListener) {
    this.onEvent = onEvent;
    this.worker = new Worker("/engine/stockfish-19-lite-single.js");
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", this.handleError);
    this.worker.postMessage("uci");
  }

  analyze(fen: string, settings: EngineSettings): void {
    if (!this.ready) {
      throw new Error("Stockfish belum siap. Tunggu sampai engine selesai dimuat.");
    }

    if (this.ignoreOutputUntilBestMove) {
      this.queuedAnalysis = { fen, settings };
      return;
    }
    this.startAnalysis(fen, settings);
  }

  private startAnalysis(fen: string, settings: EngineSettings): void {
    this.ignoreOutputUntilBestMove = false;
    this.worker.postMessage(`setoption name Skill Level value ${settings.skillLevel}`);
    this.worker.postMessage(`setoption name MultiPV value ${settings.multiPv}`);
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage(`go depth ${settings.depth} movetime ${settings.moveTime}`);
  }

  stop(): void {
    this.queuedAnalysis = null;
    if (this.ready && !this.ignoreOutputUntilBestMove) {
      this.ignoreOutputUntilBestMove = true;
      this.worker.postMessage("stop");
    }
  }

  terminate(): void {
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleError);
    this.worker.terminate();
  }

  private readonly handleMessage = (event: MessageEvent<string>): void => {
    const lines = String(event.data).split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line) this.handleLine(line);
    }
  };

  private handleLine(line: string): void {
    if (this.ignoreOutputUntilBestMove) {
      if (line.startsWith("bestmove ")) {
        this.ignoreOutputUntilBestMove = false;
        const queuedAnalysis = this.queuedAnalysis;
        this.queuedAnalysis = null;
        if (queuedAnalysis) {
          this.startAnalysis(queuedAnalysis.fen, queuedAnalysis.settings);
        }
      }
      return;
    }
    if (line === "uciok") {
      this.worker.postMessage("isready");
      return;
    }
    if (line === "readyok") {
      this.ready = true;
      this.onEvent({ type: "ready" });
      return;
    }
    if (line.startsWith("info ")) {
      const parsed = parseInfo(line);
      if (parsed) this.onEvent({ type: "info", line: parsed });
      return;
    }
    if (line.startsWith("bestmove ")) {
      this.onEvent({ type: "bestmove", move: line.split(/\s+/)[1] ?? "(none)" });
    }
  }

  private readonly handleError = (event: ErrorEvent): void => {
    this.onEvent({
      type: "error",
      message: event.message || "Worker Stockfish gagal dimuat.",
    });
  };
}
