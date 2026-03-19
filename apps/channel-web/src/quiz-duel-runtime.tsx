import type { GameStateSnapshot } from "@wifi-portal/game-sdk";

import type { QuizChoice, QuizDuelViewState } from "./quiz-duel-runtime-state";

type QuizDuelRuntimePanelProps = {
  activePlayerLabel: string;
  canSubmitAnswer: boolean;
  currentPlayerAnswer: QuizChoice | null;
  gameState: GameStateSnapshot | null;
  playerCount: number;
  showRawState?: boolean;
  state: QuizDuelViewState;
  onSubmitAnswer: (choice: QuizChoice) => void;
};

export function QuizDuelRuntimePanel(props: QuizDuelRuntimePanelProps) {
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
              <span>{props.state.completedRoundCount} 轮已结算</span>
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
              <span className="choice-label">{option.id}</span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>

        <div className="quiz-meta-grid">
          <div className="quiz-meta-card">
            <span>当前乘客</span>
            <strong>{props.activePlayerLabel}</strong>
            <p>
              {props.state.isCompleted
                ? "本局已完赛，可查看最终榜单"
                : props.currentPlayerAnswer
                  ? `你已提交答案 ${props.currentPlayerAnswer}`
                  : props.canSubmitAnswer
                    ? "当前可作答"
                    : "等待房间连接或切换到房间内乘客"}
            </p>
          </div>
          <div className="quiz-meta-card">
            <span>回合进度</span>
            <strong>
              {props.state.completedRoundCount}/{props.state.totalRounds}
            </strong>
            <p>
              {props.state.isCompleted
                ? "全部题目已完成"
                : `当前为第 ${props.state.currentRoundNumber} 题`}
            </p>
          </div>
          <div className="quiz-meta-card">
            <span>领先玩家</span>
            <strong>{props.state.winningPlayerIds.join(", ") || "暂无"}</strong>
            <p>分数相同会并列领先</p>
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
                ? `正确答案 ${props.state.lastCompletedRound.correctAnswer} · 胜出 ${props.state.lastCompletedRound.winningPlayerIds.join(", ") || "无人"}`
                : "等待本轮所有玩家完成作答"}
            </p>
          </div>
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
                正确答案 {round.correctAnswer} · 胜出{" "}
                {round.winningPlayerIds.join(", ") || "无人"}
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
            <span>提交了 {answer.answer}</span>
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
