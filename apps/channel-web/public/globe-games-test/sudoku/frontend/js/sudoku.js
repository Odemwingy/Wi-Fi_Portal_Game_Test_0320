/**
 * 数独游戏逻辑
 * 支持多种难度，触屏友好
 */

class SudokuGame {
    constructor() {
        this.size = 9;
        this.grid = [];
        this.solution = [];
        this.userGrid = [];
        this.selectedCell = null;
        this.mistakes = 0;
        this.maxMistakes = 3;
        this.timer = 0;
        this.timerInterval = null;
        this.gameOver = false;
        this.sdk = null;
        
        this.init();
    }
    
    async init() {
        // 初始化 SDK
        try {
            this.sdk = await createGameSDK({
                gameId: 'globe-sudoku',
                version: '1.0.0',
                mode: 'single'
            });
            await this.sdk.ready();
        } catch (e) {
            console.log('SDK not available, running standalone');
        }
        
        this.setupGrid();
        this.setupEventListeners();
        this.newGame();
    }
    
    setupGrid() {
        const gridEl = document.getElementById('grid');
        gridEl.innerHTML = '';
        
        for (let i = 0; i < this.size * this.size; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            gridEl.appendChild(cell);
        }
    }
    
    setupEventListeners() {
        // 单元格点击
        document.getElementById('grid').addEventListener('click', (e) => {
            const cell = e.target.closest('.cell');
            if (cell && !cell.classList.contains('given')) {
                this.selectCell(parseInt(cell.dataset.index));
            }
        });
        
        // 数字键盘
        document.getElementById('numpad').addEventListener('click', (e) => {
            const btn = e.target.closest('.num-btn');
            if (btn && this.selectedCell !== null) {
                const num = parseInt(btn.dataset.num);
                this.inputNumber(num);
            }
        });
        
        // 键盘输入
        document.addEventListener('keydown', (e) => {
            if (this.selectedCell === null) return;
            
            const num = parseInt(e.key);
            if (num >= 1 && num <= 9) {
                this.inputNumber(num);
            } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
                this.inputNumber(0);
            } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                this.navigateCell(e.key);
            }
        });
        
        // 按钮
        document.getElementById('newGame').addEventListener('click', () => this.newGame());
        document.getElementById('hint').addEventListener('click', () => this.showHint());
        document.getElementById('retryBtn').addEventListener('click', () => {
            document.getElementById('gameOverlay').classList.remove('show');
            this.newGame();
        });
    }
    
    newGame() {
        const difficulty = document.getElementById('difficulty').value;
        
        // 停止旧计时器
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        // 重置状态
        this.mistakes = 0;
        this.gameOver = false;
        this.selectedCell = null;
        this.timer = 0;
        
        // 生成谜题
        this.generatePuzzle(difficulty);
        
        // 更新显示
        document.getElementById('mistakes').textContent = `错误: 0/${this.maxMistakes}`;
        document.getElementById('timer').textContent = '00:00';
        document.getElementById('gameOverlay').classList.remove('show');
        
        // 启动计时器
        this.timerInterval = setInterval(() => {
            this.timer++;
            const mins = Math.floor(this.timer / 60).toString().padStart(2, '0');
            const secs = (this.timer % 60).toString().padStart(2, '0');
            document.getElementById('timer').textContent = `${mins}:${secs}`;
        }, 1000);
        
        this.updateDisplay();
        this.updateNumpadCounts();
        
        this.trackEvent('game_start', { difficulty });
    }
    
    generatePuzzle(difficulty) {
        // 生成完整的数独解
        this.solution = this.generateSolution();
        
        // 复制解并移除部分数字
        this.grid = [...this.solution];
        this.userGrid = Array(81).fill(0);
        
        // 根据难度确定要移除的数字数量
        const removeCounts = { easy: 35, medium: 45, hard: 55 };
        const removeCount = removeCounts[difficulty] || 45;
        
        // 随机移除
        const positions = Array.from({ length: 81 }, (_, i) => i);
        this.shuffle(positions);
        
        for (let i = 0; i < removeCount; i++) {
            const pos = positions[i];
            this.userGrid[pos] = 0; // 标记为空（需要用户填写）
        }
        
        // 填充已给出的数字
        for (let i = 0; i < 81; i++) {
            if (this.userGrid[i] !== 0) {
                this.userGrid[i] = -this.solution[i]; // 负数表示已给出的数字
            }
        }
    }
    
    generateSolution() {
        const board = Array(81).fill(0);
        this.solveSudoku(board);
        return board;
    }
    
    solveSudoku(board) {
        const empty = board.indexOf(0);
        if (empty === -1) return true;
        
        const row = Math.floor(empty / 9);
        const col = empty % 9;
        
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        this.shuffle(nums);
        
        for (const num of nums) {
            if (this.isValid(board, row, col, num)) {
                board[empty] = num;
                if (this.solveSudoku(board)) return true;
                board[empty] = 0;
            }
        }
        
        return false;
    }
    
    isValid(board, row, col, num) {
        // 检查行
        for (let i = 0; i < 9; i++) {
            if (board[row * 9 + i] === num) return false;
        }
        
        // 检查列
        for (let i = 0; i < 9; i++) {
            if (board[i * 9 + col] === num) return false;
        }
        
        // 检查3x3宫
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (board[(boxRow + i) * 9 + (boxCol + j)] === num) return false;
            }
        }
        
        return true;
    }
    
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    
    selectCell(index) {
        this.selectedCell = index;
        this.highlightCells();
    }
    
    highlightCells() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.classList.remove('selected', 'highlight', 'same-number');
        });
        
        if (this.selectedCell === null) return;
        
        const row = Math.floor(this.selectedCell / 9);
        const col = this.selectedCell % 9;
        const value = Math.abs(this.userGrid[this.selectedCell]);
        
        cells.forEach((cell, i) => {
            const cellRow = Math.floor(i / 9);
            const cellCol = i % 9;
            const cellValue = Math.abs(this.userGrid[i]);
            
            if (i === this.selectedCell) {
                cell.classList.add('selected');
            } else if (cellRow === row || cellCol === col) {
                cell.classList.add('highlight');
            } else if (value > 0 && cellValue === value) {
                cell.classList.add('same-number');
            }
        });
    }
    
    inputNumber(num) {
        if (this.selectedCell === null || this.gameOver) return;
        
        const current = this.userGrid[this.selectedCell];
        
        // 不能修改已给出的数字
        if (current < 0) return;
        
        if (num === 0) {
            // 清除
            this.userGrid[this.selectedCell] = 0;
        } else {
            // 检查是否正确
            if (num !== this.solution[this.selectedCell]) {
                this.mistakes++;
                document.getElementById('mistakes').textContent = `错误: ${this.mistakes}/${this.maxMistakes}`;
                
                // 显示错误
                const cells = document.querySelectorAll('.cell');
                cells[this.selectedCell].classList.add('error');
                setTimeout(() => cells[this.selectedCell].classList.remove('error'), 500);
                
                if (this.mistakes >= this.maxMistakes) {
                    this.endGame(false);
                    return;
                }
            }
            
            this.userGrid[this.selectedCell] = num;
        }
        
        this.updateDisplay();
        this.highlightCells();
        this.updateNumpadCounts();
        
        // 检查是否完成
        if (this.checkWin()) {
            this.endGame(true);
        }
    }
    
    navigateCell(direction) {
        if (this.selectedCell === null) {
            this.selectedCell = 0;
        } else {
            const row = Math.floor(this.selectedCell / 9);
            const col = this.selectedCell % 9;
            
            switch (direction) {
                case 'ArrowUp': if (row > 0) this.selectedCell -= 9; break;
                case 'ArrowDown': if (row < 8) this.selectedCell += 9; break;
                case 'ArrowLeft': if (col > 0) this.selectedCell -= 1; break;
                case 'ArrowRight': if (col < 8) this.selectedCell += 1; break;
            }
        }
        
        this.highlightCells();
    }
    
    showHint() {
        // 找一个空格子并填入正确答案
        const emptyCells = [];
        for (let i = 0; i < 81; i++) {
            if (this.userGrid[i] === 0) {
                emptyCells.push(i);
            }
        }
        
        if (emptyCells.length === 0) return;
        
        const index = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        this.userGrid[index] = this.solution[index];
        
        // 显示提示动画
        const cells = document.querySelectorAll('.cell');
        cells[index].classList.add('hint');
        setTimeout(() => cells[index].classList.remove('hint'), 500);
        
        this.updateDisplay();
        this.updateNumpadCounts();
        
        this.trackEvent('hint_used');
        
        if (this.checkWin()) {
            this.endGame(true);
        }
    }
    
    checkWin() {
        for (let i = 0; i < 81; i++) {
            if (this.userGrid[i] === 0) return false;
        }
        return true;
    }
    
    updateDisplay() {
        const cells = document.querySelectorAll('.cell');
        
        cells.forEach((cell, i) => {
            const value = this.userGrid[i];
            
            if (value === 0) {
                cell.textContent = '';
                cell.classList.remove('given', 'user-input');
            } else if (value < 0) {
                cell.textContent = -value;
                cell.classList.add('given');
                cell.classList.remove('user-input');
            } else {
                cell.textContent = value;
                cell.classList.add('user-input');
                cell.classList.remove('given');
            }
        });
    }
    
    updateNumpadCounts() {
        // 统计每个数字的使用次数
        const counts = Array(10).fill(0);
        for (let i = 0; i < 81; i++) {
            const value = Math.abs(this.userGrid[i]);
            if (value > 0) counts[value]++;
        }
        
        // 更新数字键盘
        const buttons = document.querySelectorAll('.num-btn');
        buttons.forEach(btn => {
            const num = parseInt(btn.dataset.num);
            if (num > 0 && counts[num] >= 9) {
                btn.classList.add('disabled');
            } else {
                btn.classList.remove('disabled');
            }
        });
    }
    
    async endGame(won) {
        this.gameOver = true;
        clearInterval(this.timerInterval);
        
        const mins = Math.floor(this.timer / 60).toString().padStart(2, '0');
        const secs = (this.timer % 60).toString().padStart(2, '0');
        
        if (won) {
            document.getElementById('overlayTitle').textContent = '恭喜！';
            document.getElementById('overlayMessage').textContent = `完成时间: ${mins}:${secs}`;
            this.trackEvent('game_won', { time: this.timer, mistakes: this.mistakes });
        } else {
            document.getElementById('overlayTitle').textContent = '游戏结束';
            document.getElementById('overlayMessage').textContent = '错误次数过多';
            this.trackEvent('game_lost', { mistakes: this.mistakes });
        }
        
        document.getElementById('gameOverlay').classList.add('show');
        
        // 提交分数
        if (this.sdk) {
            await this.sdk.submitScore({
                score: won ? (3600 - this.timer) : 0,
                durationMs: this.timer * 1000,
                metadata: { won, mistakes: this.mistakes }
            });
        }
    }
    
    trackEvent(eventName, payload = {}) {
        if (this.sdk) {
            this.sdk.track(eventName, { ...payload, gameId: 'globe-sudoku' });
        }
        console.log('[Game]', eventName, payload);
    }
}

// 启动游戏
document.addEventListener('DOMContentLoaded', () => {
    window.game = new SudokuGame();
});
