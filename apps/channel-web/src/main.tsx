import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { CabinPuzzlePackagePage } from "./CabinPuzzlePackagePage";
import { QuizDuelPackagePage } from "./QuizDuelPackagePage";
import { WordRallyPackagePage } from "./WordRallyPackagePage";
import "./styles.css";

const pathname = window.location.pathname;
const RootComponent =
  pathname === "/games/quiz-duel"
    ? QuizDuelPackagePage
    : pathname === "/games/cabin-puzzle"
      ? CabinPuzzlePackagePage
      : pathname === "/games/word-rally"
        ? WordRallyPackagePage
      : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
