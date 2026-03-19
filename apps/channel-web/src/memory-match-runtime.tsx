import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

import type { MemoryMatchViewState } from "./memory-match-runtime-state";

type MemoryMatchRuntimePanelProps = {
  activePlayerLabel: string;
  canFlipCard: boolean;
  gameState: GameStateSnapshot | null;
  playerCount: number;
  state: MemoryMatchViewState;
  onFlipCard: (cardIndex: number) => void;
};

export function MemoryMatchRuntimePanel(props: MemoryMatchRuntimePanelProps) {
  return (
    <>
      <section className="quiz-stage">
        <div className="quiz-header">
          <div>
            <p className="mini-label">Board</p>
            <h3>Memory Match Duel</h3>
            <p className="quiz-roundline">
              Round {props.state.roundNumber}
              <span>
                {props.state.matchedPairCount}/{props.state.totalPairs} pairs matched
              </span>
            </p>
          </div>
          <span
            className={`status-pill ${
              props.state.isCompleted ? "status-connected" : "status-connecting"
            }`}
          >
            {props.state.isCompleted
              ? "本局已结束"
              : `当前轮到 ${props.state.currentTurnPlayerId}`}
          </span>
        </div>

        <div className="quiz-meta-grid">
          <div className="quiz-meta-card">
            <span>当前乘客</span>
            <strong>{props.activePlayerLabel}</strong>
            <p>{props.canFlipCard ? "当前可翻牌" : "等待回合或房间连接"}</p>
          </div>
          <div className="quiz-meta-card">
            <span>当前选择</span>
            <strong>{props.state.selection.length}/2</strong>
            <p>
              {props.state.selectionOwnerPlayerId
                ? `由 ${props.state.selectionOwnerPlayerId} 操作`
                : "等待第一张牌"}
            </p>
          </div>
          <div className="quiz-meta-card">
            <span>领先玩家</span>
            <strong>{props.state.winningPlayerIds.join(", ") || "暂无"}</strong>
            <p>同分时并列领先</p>
          </div>
          <div className="quiz-meta-card">
            <span>上一回合</span>
            <strong>
              {props.state.lastResolvedTurn
                ? `Round ${props.state.lastResolvedTurn.roundNumber}`
                : "尚未结算"}
            </strong>
            <p>
              {props.state.lastResolvedTurn
                ? `${props.state.lastResolvedTurn.playerId} ${
                    props.state.lastResolvedTurn.matched ? "成功配对" : "翻牌失败"
                  }`
                : "等待两张牌被揭开"}
            </p>
          </div>
        </div>

        <div className="choice-grid">
          {props.state.board.map((card, cardIndex) => {
            const isFaceUp = card.status !== "hidden";

            return (
              <button
                className={`choice-button ${
                  card.status === "matched" ? "choice-button-selected" : ""
                }`}
                disabled={!props.canFlipCard || card.status !== "hidden"}
                key={card.id}
                onClick={() => {
                  props.onFlipCard(cardIndex);
                }}
                type="button"
              >
                <span className="choice-label">{cardIndex + 1}</span>
                <strong>{isFaceUp ? card.label : "Hidden Card"}</strong>
                <small>
                  {card.status === "matched"
                    ? "Matched pair"
                    : card.status === "revealed"
                      ? `Pair ${card.pairId}`
                      : "Tap to reveal"}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="scoreboard">
        {Object.entries(props.state.scores).map(([playerId, score]) => (
          <div className="score-chip" key={playerId}>
            <span>{playerId}</span>
            <strong>{score}</strong>
          </div>
        ))}
      </div>

      {props.state.lastResolvedTurn ? (
        <article className="round-history-card">
          <div className="round-history-topline">
            <strong>最近一次结算</strong>
            <span>Round {props.state.lastResolvedTurn.roundNumber}</span>
          </div>
          <p>
            {props.state.lastResolvedTurn.playerId} 翻开了{" "}
            {props.state.lastResolvedTurn.cards.join(" / ")}
          </p>
          <p>
            结果: {props.state.lastResolvedTurn.matched ? "匹配成功" : "未匹配"}
          </p>
          <div className="tag-row">
            {Object.entries(props.state.lastResolvedTurn.scoresSnapshot).map(
              ([playerId, score]) => (
                <span className="tag" key={playerId}>
                  {playerId}: {score}
                </span>
              )
            )}
          </div>
        </article>
      ) : null}

      <div className="answer-feed">
        {props.state.recentMoves.map((move) => (
          <article className="answer-feed-item" key={`${move.playerId}-${move.seq}`}>
            <strong>{move.playerId}</strong>
            <span>
              翻开了 {move.cardId} (#{move.cardIndex + 1})
            </span>
            <time>
              {new Date(move.revealedAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
              })}
            </time>
          </article>
        ))}
      </div>

      <div className="json-card">
        <p className="mini-label">最新 game state</p>
        <pre>{JSON.stringify(props.gameState, null, 2)}</pre>
      </div>
    </>
  );
}
