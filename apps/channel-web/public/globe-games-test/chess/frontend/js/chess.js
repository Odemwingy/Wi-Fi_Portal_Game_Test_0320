/**
 * 国际象棋游戏逻辑
 * 包含完整规则和简单AI
 */

class ChessGame {
    constructor() {
        this.board = [];
        this.currentPlayer = 'white';
        this.selectedSquare = null;
        this.validMoves = [];
        this.moveHistory = [];
        this.capturedPieces = { white: [], black: [] };
        this.lastMove = null;
        this.gameOver = false;
        this.castlingRights = {
            whiteKingSide: true,
            whiteQueenSide: true,
            blackKingSide: true,
            blackQueenSide: true
        };
        this.enPassantTarget = null;
        this.sdk = null;
        
        // 棋子Unicode字符
        this.pieces = {
            'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
            'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
        };
        
        // 棋子价值（用于AI评估）
        this.pieceValues = {
            'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000
        };
        
        this.init();
    }
    
    async init() {
        // 初始化 SDK
        try {
            this.sdk = await createGameSDK({
                gameId: 'globe-chess',
                version: '1.0.0',
                mode: 'single'
            });
            await this.sdk.ready();
        } catch (e) {
            console.log('SDK not available, running standalone');
        }
        
        this.setupBoard();
        this.setupEventListeners();
        this.newGame();
    }
    
    setupBoard() {
        const boardEl = document.getElementById('board');
        boardEl.innerHTML = '';
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                boardEl.appendChild(square);
            }
        }
    }
    
    setupEventListeners() {
        document.getElementById('board').addEventListener('click', (e) => {
            const square = e.target.closest('.square');
            if (square) {
                this.handleClick(
                    parseInt(square.dataset.row),
                    parseInt(square.dataset.col)
                );
            }
        });
        
        document.getElementById('newGame').addEventListener('click', () => this.newGame());
        document.getElementById('undo').addEventListener('click', () => this.undoMove());
        document.getElementById('retryBtn').addEventListener('click', () => {
            document.getElementById('gameOverlay').classList.remove('show');
            this.newGame();
        });
    }
    
    newGame() {
        // 初始棋盘布局
        this.board = [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ];
        
        this.currentPlayer = 'white';
        this.selectedSquare = null;
        this.validMoves = [];
        this.moveHistory = [];
        this.capturedPieces = { white: [], black: [] };
        this.lastMove = null;
        this.gameOver = false;
        this.castlingRights = {
            whiteKingSide: true,
            whiteQueenSide: true,
            blackKingSide: true,
            blackQueenSide: true
        };
        this.enPassantTarget = null;
        
        document.getElementById('gameOverlay').classList.remove('show');
        this.updateDisplay();
        this.setStatus('白方走棋');
        
        this.trackEvent('game_start');
    }
    
    handleClick(row, col) {
        if (this.gameOver) return;
        
        const piece = this.board[row][col];
        
        // 如果已选中棋子
        if (this.selectedSquare) {
            const [selRow, selCol] = this.selectedSquare;
            
            // 点击有效移动位置
            if (this.isValidMove(row, col)) {
                this.makeMove(selRow, selCol, row, col);
                this.selectedSquare = null;
                this.validMoves = [];
                this.updateDisplay();
                
                // AI走棋（黑方）
                if (!this.gameOver && this.currentPlayer === 'black') {
                    setTimeout(() => this.aiMove(), 500);
                }
                return;
            }
            
            // 点击自己的其他棋子
            if (piece && this.getPieceColor(piece) === this.currentPlayer) {
                this.selectedSquare = [row, col];
                this.validMoves = this.getValidMoves(row, col);
                this.updateDisplay();
                return;
            }
            
            // 取消选择
            this.selectedSquare = null;
            this.validMoves = [];
            this.updateDisplay();
            return;
        }
        
        // 选择棋子
        if (piece && this.getPieceColor(piece) === this.currentPlayer) {
            this.selectedSquare = [row, col];
            this.validMoves = this.getValidMoves(row, col);
            this.updateDisplay();
        }
    }
    
    getPieceColor(piece) {
        if (!piece) return null;
        return piece === piece.toUpperCase() ? 'white' : 'black';
    }
    
    getPieceType(piece) {
        return piece ? piece.toLowerCase() : null;
    }
    
    getValidMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];
        
        const type = this.getPieceType(piece);
        const color = this.getPieceColor(piece);
        let moves = [];
        
        switch (type) {
            case 'p': moves = this.getPawnMoves(row, col, color); break;
            case 'r': moves = this.getRookMoves(row, col, color); break;
            case 'n': moves = this.getKnightMoves(row, col, color); break;
            case 'b': moves = this.getBishopMoves(row, col, color); break;
            case 'q': moves = this.getQueenMoves(row, col, color); break;
            case 'k': moves = this.getKingMoves(row, col, color); break;
        }
        
        // 过滤掉会导致自己被将军的移动
        moves = moves.filter(([r, c]) => !this.wouldBeInCheck(row, col, r, c, color));
        
        return moves;
    }
    
    getPawnMoves(row, col, color) {
        const moves = [];
        const direction = color === 'white' ? -1 : 1;
        const startRow = color === 'white' ? 6 : 1;
        
        // 前进一格
        if (this.isEmpty(row + direction, col)) {
            moves.push([row + direction, col]);
            // 初始位置可以前进两格
            if (row === startRow && this.isEmpty(row + 2 * direction, col)) {
                moves.push([row + 2 * direction, col]);
            }
        }
        
        // 吃子
        for (const dc of [-1, 1]) {
            const target = this.board[row + direction]?.[col + dc];
            if (target && this.getPieceColor(target) !== color) {
                moves.push([row + direction, col + dc]);
            }
            // 吃过路兵
            if (this.enPassantTarget && 
                this.enPassantTarget[0] === row + direction && 
                this.enPassantTarget[1] === col + dc) {
                moves.push([row + direction, col + dc]);
            }
        }
        
        return moves;
    }
    
    getRookMoves(row, col, color) {
        return this.getSlidingMoves(row, col, color, [[0, 1], [0, -1], [1, 0], [-1, 0]]);
    }
    
    getBishopMoves(row, col, color) {
        return this.getSlidingMoves(row, col, color, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    }
    
    getQueenMoves(row, col, color) {
        return this.getSlidingMoves(row, col, color, [
            [0, 1], [0, -1], [1, 0], [-1, 0],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        ]);
    }
    
    getSlidingMoves(row, col, color, directions) {
        const moves = [];
        
        for (const [dr, dc] of directions) {
            let r = row + dr, c = col + dc;
            
            while (this.isValidSquare(r, c)) {
                const target = this.board[r][c];
                
                if (!target) {
                    moves.push([r, c]);
                } else {
                    if (this.getPieceColor(target) !== color) {
                        moves.push([r, c]);
                    }
                    break;
                }
                
                r += dr;
                c += dc;
            }
        }
        
        return moves;
    }
    
    getKnightMoves(row, col, color) {
        const moves = [];
        const offsets = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        
        for (const [dr, dc] of offsets) {
            const r = row + dr, c = col + dc;
            if (this.isValidSquare(r, c)) {
                const target = this.board[r][c];
                if (!target || this.getPieceColor(target) !== color) {
                    moves.push([r, c]);
                }
            }
        }
        
        return moves;
    }
    
    getKingMoves(row, col, color) {
        const moves = [];
        
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const r = row + dr, c = col + dc;
                if (this.isValidSquare(r, c)) {
                    const target = this.board[r][c];
                    if (!target || this.getPieceColor(target) !== color) {
                        moves.push([r, c]);
                    }
                }
            }
        }
        
        // 王车易位
        if (color === 'white' && row === 7 && col === 4) {
            if (this.castlingRights.whiteKingSide && 
                this.isEmpty(7, 5) && this.isEmpty(7, 6) &&
                !this.isSquareAttacked(7, 4, 'black') &&
                !this.isSquareAttacked(7, 5, 'black') &&
                !this.isSquareAttacked(7, 6, 'black')) {
                moves.push([7, 6]);
            }
            if (this.castlingRights.whiteQueenSide && 
                this.isEmpty(7, 3) && this.isEmpty(7, 2) && this.isEmpty(7, 1) &&
                !this.isSquareAttacked(7, 4, 'black') &&
                !this.isSquareAttacked(7, 3, 'black') &&
                !this.isSquareAttacked(7, 2, 'black')) {
                moves.push([7, 2]);
            }
        } else if (color === 'black' && row === 0 && col === 4) {
            if (this.castlingRights.blackKingSide && 
                this.isEmpty(0, 5) && this.isEmpty(0, 6) &&
                !this.isSquareAttacked(0, 4, 'white') &&
                !this.isSquareAttacked(0, 5, 'white') &&
                !this.isSquareAttacked(0, 6, 'white')) {
                moves.push([0, 6]);
            }
            if (this.castlingRights.blackQueenSide && 
                this.isEmpty(0, 3) && this.isEmpty(0, 2) && this.isEmpty(0, 1) &&
                !this.isSquareAttacked(0, 4, 'white') &&
                !this.isSquareAttacked(0, 3, 'white') &&
                !this.isSquareAttacked(0, 2, 'white')) {
                moves.push([0, 2]);
            }
        }
        
        return moves;
    }
    
    isValidSquare(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }
    
    isEmpty(row, col) {
        return this.isValidSquare(row, col) && !this.board[row][col];
    }
    
    isValidMove(row, col) {
        return this.validMoves.some(([r, c]) => r === row && c === col);
    }
    
    makeMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        const captured = this.board[toRow][toCol];
        const pieceType = this.getPieceType(piece);
        const color = this.getPieceColor(piece);
        
        // 保存移动历史
        this.moveHistory.push({
            from: [fromRow, fromCol],
            to: [toRow, toCol],
            piece,
            captured,
            castlingRights: { ...this.castlingRights },
            enPassantTarget: this.enPassantTarget
        });
        
        // 记录吃子
        if (captured) {
            this.capturedPieces[color].push(captured);
        }
        
        // 吃过路兵
        if (pieceType === 'p' && this.enPassantTarget && 
            toRow === this.enPassantTarget[0] && toCol === this.enPassantTarget[1]) {
            const capturedPawnRow = color === 'white' ? toRow + 1 : toRow - 1;
            const capturedPawn = this.board[capturedPawnRow][toCol];
            this.capturedPieces[color].push(capturedPawn);
            this.board[capturedPawnRow][toCol] = null;
        }
        
        // 设置过路兵目标
        if (pieceType === 'p' && Math.abs(toRow - fromRow) === 2) {
            this.enPassantTarget = [(fromRow + toRow) / 2, fromCol];
        } else {
            this.enPassantTarget = null;
        }
        
        // 王车易位
        if (pieceType === 'k' && Math.abs(toCol - fromCol) === 2) {
            if (toCol === 6) { // 王翼易位
                this.board[toRow][5] = this.board[toRow][7];
                this.board[toRow][7] = null;
            } else { // 后翼易位
                this.board[toRow][3] = this.board[toRow][0];
                this.board[toRow][0] = null;
            }
        }
        
        // 更新易位权利
        if (pieceType === 'k') {
            if (color === 'white') {
                this.castlingRights.whiteKingSide = false;
                this.castlingRights.whiteQueenSide = false;
            } else {
                this.castlingRights.blackKingSide = false;
                this.castlingRights.blackQueenSide = false;
            }
        }
        if (pieceType === 'r') {
            if (fromRow === 7 && fromCol === 0) this.castlingRights.whiteQueenSide = false;
            if (fromRow === 7 && fromCol === 7) this.castlingRights.whiteKingSide = false;
            if (fromRow === 0 && fromCol === 0) this.castlingRights.blackQueenSide = false;
            if (fromRow === 0 && fromCol === 7) this.castlingRights.blackKingSide = false;
        }
        
        // 移动棋子
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        
        // 兵升变（自动变后）
        if (pieceType === 'p' && (toRow === 0 || toRow === 7)) {
            this.board[toRow][toCol] = color === 'white' ? 'Q' : 'q';
        }
        
        this.lastMove = { from: [fromRow, fromCol], to: [toRow, toCol] };
        
        // 切换玩家
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        
        // 检查游戏状态
        this.checkGameState();
    }
    
    undoMove() {
        if (this.moveHistory.length === 0 || this.currentPlayer === 'black') return;
        
        // 撤销两步（玩家和AI各一步）
        for (let i = 0; i < 2 && this.moveHistory.length > 0; i++) {
            const move = this.moveHistory.pop();
            
            this.board[move.from[0]][move.from[1]] = move.piece;
            this.board[move.to[0]][move.to[1]] = move.captured;
            
            if (move.captured) {
                this.capturedPieces[this.getPieceColor(move.piece)].pop();
            }
            
            this.castlingRights = move.castlingRights;
            this.enPassantTarget = move.enPassantTarget;
            this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        }
        
        this.selectedSquare = null;
        this.validMoves = [];
        this.gameOver = false;
        this.lastMove = this.moveHistory.length > 0 ? 
            { from: this.moveHistory[this.moveHistory.length - 1].from, 
              to: this.moveHistory[this.moveHistory.length - 1].to } : null;
        
        this.updateDisplay();
        this.setStatus(`${this.currentPlayer === 'white' ? '白' : '黑'}方走棋`);
    }
    
    wouldBeInCheck(fromRow, fromCol, toRow, toCol, color) {
        // 模拟移动
        const piece = this.board[fromRow][fromCol];
        const captured = this.board[toRow][toCol];
        
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        
        const inCheck = this.isInCheck(color);
        
        // 恢复
        this.board[fromRow][fromCol] = piece;
        this.board[toRow][toCol] = captured;
        
        return inCheck;
    }
    
    isInCheck(color) {
        // 找到王的位置
        const king = color === 'white' ? 'K' : 'k';
        let kingRow, kingCol;
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board[r][c] === king) {
                    kingRow = r;
                    kingCol = c;
                    break;
                }
            }
        }
        
        return this.isSquareAttacked(kingRow, kingCol, color === 'white' ? 'black' : 'white');
    }
    
    isSquareAttacked(row, col, byColor) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && this.getPieceColor(piece) === byColor) {
                    const moves = this.getRawMoves(r, c, byColor);
                    if (moves.some(([mr, mc]) => mr === row && mc === col)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    getRawMoves(row, col, color) {
        const piece = this.board[row][col];
        const type = this.getPieceType(piece);
        
        switch (type) {
            case 'p': return this.getPawnMoves(row, col, color);
            case 'r': return this.getRookMoves(row, col, color);
            case 'n': return this.getKnightMoves(row, col, color);
            case 'b': return this.getBishopMoves(row, col, color);
            case 'q': return this.getQueenMoves(row, col, color);
            case 'k': return this.getKingMoves(row, col, color).filter(([r, c]) => 
                Math.abs(c - col) <= 1); // 不包含易位
            default: return [];
        }
    }
    
    checkGameState() {
        const color = this.currentPlayer;
        
        // 检查是否有合法移动
        let hasLegalMove = false;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && this.getPieceColor(piece) === color) {
                    if (this.getValidMoves(r, c).length > 0) {
                        hasLegalMove = true;
                        break;
                    }
                }
            }
            if (hasLegalMove) break;
        }
        
        if (!hasLegalMove) {
            this.gameOver = true;
            if (this.isInCheck(color)) {
                const winner = color === 'white' ? '黑方' : '白方';
                this.showGameOver(`${winner}获胜`, '将杀');
                this.trackEvent('game_end', { result: 'checkmate', winner: color === 'white' ? 'black' : 'white' });
            } else {
                this.showGameOver('和棋', '僵局');
                this.trackEvent('game_end', { result: 'stalemate' });
            }
        } else if (this.isInCheck(color)) {
            this.setStatus(`${color === 'white' ? '白' : '黑'}方被将军！`);
        } else {
            this.setStatus(`${color === 'white' ? '白' : '黑'}方走棋`);
        }
    }
    
    // AI 部分
    aiMove() {
        if (this.gameOver) return;
        
        const move = this.findBestMove();
        if (move) {
            this.makeMove(move.fromRow, move.fromCol, move.toRow, move.toCol);
            this.updateDisplay();
        }
    }
    
    findBestMove() {
        let bestMove = null;
        let bestScore = -Infinity;
        
        const moves = this.getAllMoves('black');
        
        for (const move of moves) {
            const score = this.evaluateMove(move);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        
        return bestMove;
    }
    
    getAllMoves(color) {
        const moves = [];
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && this.getPieceColor(piece) === color) {
                    const validMoves = this.getValidMoves(r, c);
                    for (const [toR, toC] of validMoves) {
                        moves.push({ fromRow: r, fromCol: c, toRow: toR, toCol: toC });
                    }
                }
            }
        }
        
        return moves;
    }
    
    evaluateMove(move) {
        // 模拟移动
        const piece = this.board[move.fromRow][move.fromCol];
        const captured = this.board[move.toRow][move.toCol];
        
        this.board[move.toRow][move.toCol] = piece;
        this.board[move.fromRow][move.fromCol] = null;
        
        const score = this.evaluateBoard('black');
        
        // 恢复
        this.board[move.fromRow][move.fromCol] = piece;
        this.board[move.toRow][move.toCol] = captured;
        
        // 优先吃子
        if (captured) {
            return score + this.pieceValues[this.getPieceType(captured)] * 2;
        }
        
        return score;
    }
    
    evaluateBoard(color) {
        let score = 0;
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece) {
                    const value = this.pieceValues[this.getPieceType(piece)];
                    const pieceColor = this.getPieceColor(piece);
                    
                    if (pieceColor === color) {
                        score += value;
                    } else {
                        score -= value;
                    }
                }
            }
        }
        
        return score;
    }
    
    updateDisplay() {
        const squares = document.querySelectorAll('.square');
        
        squares.forEach(square => {
            const row = parseInt(square.dataset.row);
            const col = parseInt(square.dataset.col);
            const piece = this.board[row][col];
            
            // 清除样式
            square.classList.remove('selected', 'valid-move', 'last-move', 'check');
            square.innerHTML = '';
            
            // 显示棋子
            if (piece) {
                const char = this.pieces[piece];
                square.innerHTML = `<span class="piece-${this.getPieceColor(piece)}">${char}</span>`;
            }
            
            // 高亮选中
            if (this.selectedSquare && 
                this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
                square.classList.add('selected');
            }
            
            // 高亮有效移动
            if (this.validMoves.some(([r, c]) => r === row && c === col)) {
                square.classList.add('valid-move');
            }
            
            // 高亮上一步
            if (this.lastMove) {
                if ((this.lastMove.from[0] === row && this.lastMove.from[1] === col) ||
                    (this.lastMove.to[0] === row && this.lastMove.to[1] === col)) {
                    square.classList.add('last-move');
                }
            }
        });
        
        // 高亮被将军的王
        if (this.isInCheck(this.currentPlayer)) {
            const king = this.currentPlayer === 'white' ? 'K' : 'k';
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if (this.board[r][c] === king) {
                        squares[r * 8 + c].classList.add('check');
                    }
                }
            }
        }
        
        // 更新吃子显示
        document.getElementById('whiteCaptured').textContent = 
            this.capturedPieces.white.map(p => this.pieces[p]).join('');
        document.getElementById('blackCaptured').textContent = 
            this.capturedPieces.black.map(p => this.pieces[p]).join('');
        
        // 更新回合指示
        const turnIndicator = document.getElementById('turnIndicator');
        turnIndicator.textContent = this.currentPlayer === 'white' ? '白方走棋' : '黑方思考中...';
        turnIndicator.className = `turn-indicator ${this.currentPlayer}`;
    }
    
    setStatus(text) {
        document.getElementById('status').textContent = text;
    }
    
    showGameOver(title, message) {
        document.getElementById('overlayTitle').textContent = title;
        document.getElementById('overlayMessage').textContent = message;
        document.getElementById('gameOverlay').classList.add('show');
        
        if (this.sdk) {
            this.sdk.submitScore({
                score: this.moveHistory.length,
                metadata: { result: title }
            });
        }
    }
    
    trackEvent(eventName, payload = {}) {
        if (this.sdk) {
            this.sdk.track(eventName, { ...payload, gameId: 'globe-chess' });
        }
        console.log('[Game]', eventName, payload);
    }
}

// 启动游戏
document.addEventListener('DOMContentLoaded', () => {
    window.game = new ChessGame();
});
