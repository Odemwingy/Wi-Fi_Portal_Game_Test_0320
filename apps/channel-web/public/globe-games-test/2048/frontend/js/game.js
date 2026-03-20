/**
 * 2048 游戏逻辑
 * 竖屏设计，触屏滑动支持
 */

class Game2048 {
    constructor() {
        this.size = 4;
        this.grid = [];
        this.score = 0;
        this.bestScore = 0;
        this.gameOver = false;
        this.won = false;
        this.sdk = null;
        
        this.init();
    }
    
    async init() {
        // 初始化 SDK
        try {
            this.sdk = await createGameSDK({
                gameId: 'globe-2048',
                version: '1.0.0',
                mode: 'single'
            });
            
            // 加载最高分
            const saved = await this.sdk.load('progress');
            if (saved) {
                this.bestScore = saved.bestScore || 0;
                document.getElementById('best').textContent = this.bestScore;
            }
            
            // 监听退出事件
            this.sdk.onExitRequested(() => {
                this.saveProgress();
            });
            
            // 通知平台游戏已就绪
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
            cell.className = 'grid-cell';
            cell.dataset.index = i;
            gridEl.appendChild(cell);
        }
    }
    
    setupEventListeners() {
        // 触屏滑动
        let startX, startY;
        const container = document.querySelector('.game-container');
        
        container.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });
        
        container.addEventListener('touchend', (e) => {
            if (!startX || !startY) return;
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            
            const diffX = endX - startX;
            const diffY = endY - startY;
            
            const threshold = 50;
            
            if (Math.abs(diffX) > Math.abs(diffY)) {
                if (Math.abs(diffX) > threshold) {
                    if (diffX > 0) this.move('right');
                    else this.move('left');
                }
            } else {
                if (Math.abs(diffY) > threshold) {
                    if (diffY > 0) this.move('down');
                    else this.move('up');
                }
            }
            
            startX = startY = null;
        }, { passive: true });
        
        // 键盘控制（桌面端）
        document.addEventListener('keydown', (e) => {
            const keyMap = {
                'ArrowUp': 'up',
                'ArrowDown': 'down',
                'ArrowLeft': 'left',
                'ArrowRight': 'right'
            };
            if (keyMap[e.key]) {
                e.preventDefault();
                this.move(keyMap[e.key]);
            }
        });
        
        // 按钮
        document.getElementById('newGame').addEventListener('click', () => this.newGame());
        document.getElementById('retryBtn').addEventListener('click', () => {
            document.getElementById('gameOverlay').classList.remove('show');
            this.newGame();
        });
    }
    
    newGame() {
        this.grid = Array(this.size * this.size).fill(0);
        this.score = 0;
        this.gameOver = false;
        this.won = false;
        
        this.addRandomTile();
        this.addRandomTile();
        this.updateDisplay();
        
        this.trackEvent('game_start');
    }
    
    addRandomTile() {
        const emptyCells = [];
        for (let i = 0; i < this.grid.length; i++) {
            if (this.grid[i] === 0) emptyCells.push(i);
        }
        
        if (emptyCells.length === 0) return false;
        
        const index = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        this.grid[index] = Math.random() < 0.9 ? 2 : 4;
        
        // 动画效果
        setTimeout(() => {
            const cells = document.querySelectorAll('.grid-cell');
            cells[index].classList.add('new');
            setTimeout(() => cells[index].classList.remove('new'), 200);
        }, 50);
        
        return true;
    }
    
    move(direction) {
        if (this.gameOver) return;
        
        const oldGrid = [...this.grid];
        let moved = false;
        
        switch (direction) {
            case 'up':
                moved = this.moveUp();
                break;
            case 'down':
                moved = this.moveDown();
                break;
            case 'left':
                moved = this.moveLeft();
                break;
            case 'right':
                moved = this.moveRight();
                break;
        }
        
        if (moved) {
            this.addRandomTile();
            this.updateDisplay();
            
            // 检查是否获胜
            if (this.grid.includes(2048) && !this.won) {
                this.won = true;
                this.showOverlay('恭喜！', `你达到了 2048！\n得分: ${this.score}`);
                this.trackEvent('game_won', { score: this.score });
            }
            
            // 检查是否游戏结束
            if (this.isGameOver()) {
                this.gameOver = true;
                this.showOverlay('游戏结束', `最终得分: ${this.score}`);
                this.endGame();
            }
        }
    }
    
    moveLeft() {
        let moved = false;
        for (let row = 0; row < this.size; row++) {
            const start = row * this.size;
            const rowValues = this.grid.slice(start, start + this.size).filter(v => v > 0);
            const merged = this.mergeRow(rowValues);
            const newRow = [...merged, ...Array(this.size - merged.length).fill(0)];
            
            for (let col = 0; col < this.size; col++) {
                if (this.grid[start + col] !== newRow[col]) moved = true;
                this.grid[start + col] = newRow[col];
            }
        }
        return moved;
    }
    
    moveRight() {
        let moved = false;
        for (let row = 0; row < this.size; row++) {
            const start = row * this.size;
            const rowValues = this.grid.slice(start, start + this.size).filter(v => v > 0);
            const merged = this.mergeRow(rowValues.reverse()).reverse();
            const newRow = [...Array(this.size - merged.length).fill(0), ...merged];
            
            for (let col = 0; col < this.size; col++) {
                if (this.grid[start + col] !== newRow[col]) moved = true;
                this.grid[start + col] = newRow[col];
            }
        }
        return moved;
    }
    
    moveUp() {
        let moved = false;
        for (let col = 0; col < this.size; col++) {
            const colValues = [];
            for (let row = 0; row < this.size; row++) {
                const val = this.grid[row * this.size + col];
                if (val > 0) colValues.push(val);
            }
            const merged = this.mergeRow(colValues);
            const newCol = [...merged, ...Array(this.size - merged.length).fill(0)];
            
            for (let row = 0; row < this.size; row++) {
                const idx = row * this.size + col;
                if (this.grid[idx] !== newCol[row]) moved = true;
                this.grid[idx] = newCol[row];
            }
        }
        return moved;
    }
    
    moveDown() {
        let moved = false;
        for (let col = 0; col < this.size; col++) {
            const colValues = [];
            for (let row = 0; row < this.size; row++) {
                const val = this.grid[row * this.size + col];
                if (val > 0) colValues.push(val);
            }
            const merged = this.mergeRow(colValues.reverse()).reverse();
            const newCol = [...Array(this.size - merged.length).fill(0), ...merged];
            
            for (let row = 0; row < this.size; row++) {
                const idx = row * this.size + col;
                if (this.grid[idx] !== newCol[row]) moved = true;
                this.grid[idx] = newCol[row];
            }
        }
        return moved;
    }
    
    mergeRow(values) {
        const result = [];
        let skip = false;
        
        for (let i = 0; i < values.length; i++) {
            if (skip) {
                skip = false;
                continue;
            }
            
            if (i + 1 < values.length && values[i] === values[i + 1]) {
                const merged = values[i] * 2;
                result.push(merged);
                this.score += merged;
                skip = true;
            } else {
                result.push(values[i]);
            }
        }
        
        return result;
    }
    
    isGameOver() {
        // 检查是否还有空格
        if (this.grid.includes(0)) return false;
        
        // 检查是否还能合并
        for (let row = 0; row < this.size; row++) {
            for (let col = 0; col < this.size; col++) {
                const current = this.grid[row * this.size + col];
                // 检查右边
                if (col < this.size - 1 && current === this.grid[row * this.size + col + 1]) {
                    return false;
                }
                // 检查下边
                if (row < this.size - 1 && current === this.grid[(row + 1) * this.size + col]) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    updateDisplay() {
        const cells = document.querySelectorAll('.grid-cell');
        
        cells.forEach((cell, index) => {
            const value = this.grid[index];
            cell.textContent = value || '';
            cell.dataset.value = value || '';
        });
        
        document.getElementById('score').textContent = this.score;
        
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            document.getElementById('best').textContent = this.bestScore;
        }
    }
    
    showOverlay(title, message) {
        document.getElementById('overlayTitle').textContent = title;
        document.getElementById('overlayScore').textContent = message;
        document.getElementById('gameOverlay').classList.add('show');
    }
    
    async endGame() {
        // 提交分数
        if (this.sdk) {
            await this.sdk.submitScore({
                score: this.score,
                durationMs: Date.now() - (this.sdk.getContext()?.session?.startedAt ? new Date(this.sdk.getContext().session.startedAt).getTime() : Date.now())
            });
        }
        
        this.saveProgress();
        this.trackEvent('game_end', { score: this.score });
    }
    
    async saveProgress() {
        if (this.sdk) {
            await this.sdk.save('progress', {
                bestScore: this.bestScore
            });
        }
    }
    
    trackEvent(eventName, payload = {}) {
        if (this.sdk) {
            this.sdk.track(eventName, { ...payload, gameId: 'globe-2048' });
        }
        console.log('[Game]', eventName, payload);
    }
}

// 启动游戏
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game2048();
});
