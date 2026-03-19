import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

import type { WordRallyViewState } from "./word-rally-runtime-state";

type WordRallyRuntimePanelProps = {
  activePlayerLabel: string;
  canSubmitAnswer: boolean;
  currentPlayerAnswer: string | null;
  gameState: GameStateSnapshot | null;
  playerCount: number;
  showRawState?: boolean;
  state: WordRallyViewState;
  onSubmitAnswer: (optionId: string) => void;
};

export function WordRallyRuntimePanel(props: WordRallyRuntimePanelProps) {
  return (
    <>
      <section className="quiz-stage">
        <div className="quiz-header">
          <div>
            <p className="mini-label">Prompt</p>
            <h3>{props.state.prompt.title}</h3>
            <p className="quiz-roundline">
              {props.state.isCompleted
                ? `Final ${props.state.totalRounds}/${props.state.totalRounds}`
                : `Round ${props.state.currentRoundNumber}/${props.state.totalRounds}`}
              <span>{props.state.prompt.category}</span>
            </p>
          </div>
          <span
            className={`status-pill ${
              props.state.isCompleted || props.state.allPlayersAnswered
                ? "status-connected"
                : "status-connecting"
            }`}
          >
            {props.state.isCompleted
              ? "本局已结束"
              : props.state.allPlayersAnswered
                ? "本轮已揭晓"
                : `${props.state.answerCount}/${props.playerCount} 已作答`}
          </span>
        </div>

        <p className="quiz-body">{props.state.prompt.body}</p>

        <div className="quiz-meta-grid">
          <div className="quiz-meta-card">
            <span>Required Letter</span>
            <strong>{props.state.prompt.requiredLetter}</strong>
            <p>选择最符合主题且首字母匹配的词</p>
          </div>
          <div className="quiz-meta-card">
            <span>当前乘客</span>
            <strong>{props.activePlayerLabel}</strong>
            <p>
              {props.state.isCompleted
                ? "本局已完赛"
                : props.currentPlayerAnswer
                  ? `你已提交 ${props.currentPlayerAnswer}`
                  : props.canSubmitAnswer
                    ? "当前可作答"
                    : "等待房间连接或轮到当前乘客"}
            </p>
          </div>
          <div className="quiz-meta-card">
            <span>领先玩家</span>
            <strong>{props.state.winningPlayerIds.join(", ") || "暂无"}</strong>
            <p>同分时并列领先</p>
          </div>
          <div className="quiz-meta-card">
            <span>上一轮结果</span>
            <strong>
              {props.state.lastCompletedRound
                ? `Round ${props.state.lastCompletedRound.roundNumber}`
                : "尚未揭晓"}
            </strong>
            <p>
              {props.state.lastCompletedRound
                ? `正确词 ${props.state.lastCompletedRound.correctOptionId} · 胜出 ${props.state.lastCompletedRound.winningPlayerIds.join(", ") || "无人"}`
                : "等待本轮所有玩家完成选择"}
            </p>
          </div>
        </div>

        <div className="choice-grid">
          {props.state.prompt.options.map((option) => (
            <button
              className={`choice-button ${
                props.currentPlayerAnswer === option.id
                  ? "choice-button-selected"
                  : ""
              }`}
              disabled={!props.canSubmitAnswer}
              key={option.id}
              onClick={() => {
                props.onSubmitAnswer(option.id);
              }}
              type="button"
            >
              <span className="choice-label">{option.id.slice(0, 1).toUpperCase()}</span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </button>
          ))}
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

      {props.state.roundHistory.length > 0 ? (
        <div className="round-history">
          {props.state.roundHistory.map((round) => (
            <article className="round-history-card" key={round.roundNumber}>
              <div className="round-history-topline">
                <strong>Round {round.roundNumber}</strong>
                <span>{round.promptId}</span>
              </div>
              <p>{round.promptTitle}</p>
              <p>
                Letter {round.requiredLetter} · 正确词 {round.correctOptionId}
              </p>
              <p>
                结算于{" "}
                {new Date(round.completedAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit"
                })}
              </p>
              <div className="tag-row">
                {Object.entries(round.answersByPlayer).map(([playerId, answer]) => (
                  <span className="tag" key={playerId}>
                    {playerId}: {answer ?? "-"}
                  </span>
                ))}
                {Object.entries(round.scoresSnapshot).map(([playerId, score]) => (
                  <span className="tag" key={`${playerId}-score`}>
                    {playerId} score: {score}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className="answer-feed">
        {props.state.recentAnswers.map((answer) => (
          <article className="answer-feed-item" key={`${answer.playerId}-${answer.seq}`}>
            <strong>{answer.playerId}</strong>
            <span>提交了 {answer.answerId}</span>
            <time>
              {new Date(answer.submittedAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
              })}
            </time>
          </article>
        ))}
      </div>

      {props.showRawState ? (
        <div className="json-card">
          <p className="mini-label">最新 game state</p>
          <pre>{JSON.stringify(props.gameState, null, 2)}</pre>
        </div>
      ) : null}
    </>
  );
}
