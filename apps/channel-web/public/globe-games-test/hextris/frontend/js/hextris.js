/**
 * 六边形俄罗斯方块 (Hextris) 游戏逻辑
 * 旋转六边形以匹配下落的方块颜色
 */

class HextrisGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 游戏参数
        this.hexRadius = 0;
        this.blocks = [];
        this.fallingBlocks = [];
        this.score = 0;
        this.bestScore = 0;
        this.level = 1;
        this.linesCleared = 0;
        this.gameOver = false;
        this.running = false;
        this.lastSpawn = 0;
        this.spawnInterval = 2000;
        this.fallSpeed = 1;
        
        // 六边形颜色段
        this.numSegments = 6;
        this.segmentColors = [
            '#e74c3c', // 红
            '#f39c12', // 橙
            '#f1c40f', // 黄
            '#2ecc71', // 绿
            '#3498db', // 蓝
            '#9b59b6'  // 紫
        ];
        
        this.sdk = null;
        this.init();
    }
    
    async init() {
        // 初始化 SDK
        try {
            this.sdk = await createGameSDK({
                gameId: 'globe-hextris',
                version: '1.0.0',
                mode: 'single'
            });
            
            const saved = await this.sdk.load('progress');
            if (saved) {
                this.bestScore = saved.bestScore || 0;
                document.getElementById('best').textContent = this.bestScore;
            }
            
            await this.sdk.ready();
        } catch (e) {
            console.log('SDK not available, running standalone');
        }
        
        this.resizeCanvas();
        this.setupEventListeners();
        this.draw();
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const size = Math.min(container.clientWidth, container.clientHeight);
        this.canvas.width = size * 2; // 高分辨率
        this.canvas.height = size * 2;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        this.hexRadius = size * 0.35;
        this.ctx.scale(2, 2);
    }
    
    setupEventListeners() {
        // 开始按钮
        document.getElementById('startBtn').addEventListener('click', () => this.startGame());
        document.getElementById('retryBtn').addEventListener('click', () => this.startGame());
        
        // 触屏/鼠标控制
        let startX = 0;
        
        const handleStart = (x) => {
            startX = x;
        };
        
        const handleMove = (x) => {
            if (!this.running) return;
            const diff = x - startX;
            if (Math.abs(diff) > 30) {
                if (diff > 0) {
                    this.rotateHex(1); // 顺时针
                } else {
                    this.rotateHex(-1); // 逆时针
                }
                startX = x;
            }
        };
        
        const handleClick = (x) => {
            if (!this.running) return;
            const centerX = this.canvas.width / 4;
            if (x < centerX) {
                this.rotateHex(-1);
            } else {
                this.rotateHex(1);
            }
        };
        
        // 触屏
        this.canvas.addEventListener('touchstart', (e) => {
            handleStart(e.touches[0].clientX);
        }, { passive: true });
        
        this.canvas.addEventListener('touchmove', (e) => {
            handleMove(e.touches[0].clientX);
        }, { passive: true });
        
        // 鼠标
        this.canvas.addEventListener('mousedown', (e) => {
            handleStart(e.clientX);
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (e.buttons === 1) {
                handleMove(e.clientX);
            }
        });
        
        this.canvas.addEventListener('click', (e) => {
            handleClick(e.clientX);
        });
        
        // 键盘
        document.addEventListener('keydown', (e) => {
            if (!this.running) return;
            if (e.key === 'ArrowLeft' || e.key === 'a') {
                this.rotateHex(-1);
            } else if (e.key === 'ArrowRight' || e.key === 'd') {
                this.rotateHex(1);
            }
        });
    }
    
    startGame() {
        this.blocks = [];
        this.fallingBlocks = [];
        this.score = 0;
        this.level = 1;
        this.linesCleared = 0;
        this.gameOver = false;
        this.running = true;
        this.spawnInterval = 2000;
        this.fallSpeed = 1;
        
        // 初始化六边形边缘的方块（每个颜色段一个）
        for (let i = 0; i < this.numSegments; i++) {
            this.blocks.push({
                segment: i,
                color: this.segmentColors[i],
                distance: this.hexRadius
            });
        }
        
        document.getElementById('startOverlay').classList.add('hide');
        document.getElementById('gameOverlay').classList.add('hide');
        document.getElementById('score').textContent = '0';
        document.getElementById('level').textContent = '等级: 1';
        document.getElementById('lines').textContent = '消行: 0';
        
        this.lastSpawn = Date.now();
        this.gameLoop();
        
        this.trackEvent('game_start');
    }
    
    gameLoop() {
        if (!this.running) return;
        
        const now = Date.now();
        
        // 生成新方块
        if (now - this.lastSpawn > this.spawnInterval) {
            this.spawnBlock();
            this.lastSpawn = now;
        }
        
        // 更新方块位置
        this.updateBlocks();
        
        // 绘制
        this.draw();
        
        // 检查游戏结束
        if (this.checkGameOver()) {
            this.endGame();
            return;
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    spawnBlock() {
        const segment = Math.floor(Math.random() * this.numSegments);
        const color = this.segmentColors[segment];
        
        this.fallingBlocks.push({
            segment: segment,
            color: color,
            distance: this.hexRadius + 80,
            fallSpeed: this.fallSpeed
        });
    }
    
    updateBlocks() {
        // 更新下落的方块
        for (let i = this.fallingBlocks.length - 1; i >= 0; i--) {
            const block = this.fallingBlocks[i];
            block.distance -= block.fallSpeed;
            
            // 检查是否到达六边形边缘
            if (block.distance <= this.hexRadius) {
                // 添加到边缘
                this.blocks.push({
                    segment: block.segment,
                    color: block.color,
                    distance: this.hexRadius
                });
                
                // 移除下落的方块
                this.fallingBlocks.splice(i, 1);
                
                // 检查是否消除
                this.checkMatches();
            }
        }
    }
    
    rotateHex(direction) {
        // 旋转所有已固定的方块
        this.blocks.forEach(block => {
            block.segment = (block.segment + direction + this.numSegments) % this.numSegments;
        });
    }
    
    checkMatches() {
        // 统计每个颜色段的方块数量
        const segmentCounts = Array(this.numSegments).fill(0);
        
        this.blocks.forEach(block => {
            segmentCounts[block.segment]++;
        });
        
        // 检查是否有完整的一圈（每段至少3个）
        let allSegmentsHaveThree = true;
        for (let i = 0; i < this.numSegments; i++) {
            if (segmentCounts[i] < 3) {
                allSegmentsHaveThree = false;
                break;
            }
        }
        
        if (allSegmentsHaveThree) {
            // 消除最外层一圈
            this.blocks = this.blocks.map(block => ({
                ...block,
                distance: block.distance - 15 // 减少半径
            })).filter(block => block.distance > 30);
            
            this.score += 100;
            this.linesCleared++;
            
            // 升级
            if (this.linesCleared % 5 === 0) {
                this.level++;
                this.spawnInterval = Math.max(500, 2000 - this.level * 150);
                this.fallSpeed = 1 + this.level * 0.2;
            }
            
            document.getElementById('score').textContent = this.score;
            document.getElementById('level').textContent = `等级: ${this.level}`;
            document.getElementById('lines').textContent = `消行: ${this.linesCleared}`;
        }
    }
    
    checkGameOver() {
        // 检查方块是否堆满
        const maxBlocks = this.numSegments * 10;
        return this.blocks.length > maxBlocks;
    }
    
    draw() {
        const ctx = this.ctx;
        const width = this.canvas.width / 2;
        const height = this.canvas.height / 2;
        const centerX = width / 2;
        const centerY = height / 2;
        
        // 清空画布
        ctx.fillStyle = '#0f0f23';
        ctx.fillRect(0, 0, width, height);
        
        // 绘制六边形
        this.drawHexagon(ctx, centerX, centerY, this.hexRadius);
        
        // 绘制已固定的方块
        this.blocks.forEach(block => {
            this.drawBlock(ctx, centerX, centerY, block);
        });
        
        // 绘制下落的方块
        this.fallingBlocks.forEach(block => {
            this.drawFallingBlock(ctx, centerX, centerY, block);
        });
    }
    
    drawHexagon(ctx, cx, cy, radius) {
        const angleStep = Math.PI / 3;
        
        for (let i = 0; i < this.numSegments; i++) {
            const startAngle = i * angleStep - Math.PI / 2;
            const endAngle = startAngle + angleStep;
            
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.closePath();
            
            ctx.fillStyle = this.segmentColors[i] + '40';
            ctx.fill();
            ctx.strokeStyle = this.segmentColors[i];
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        // 中心圆
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a2e';
        ctx.fill();
    }
    
    drawBlock(ctx, cx, cy, block) {
        const angleStep = Math.PI / 3;
        const midAngle = block.segment * angleStep - Math.PI / 2 + angleStep / 2;
        
        const x = cx + Math.cos(midAngle) * (block.distance - 10);
        const y = cy + Math.sin(midAngle) * (block.distance - 10);
        
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = block.color;
        ctx.fill();
    }
    
    drawFallingBlock(ctx, cx, cy, block) {
        const angleStep = Math.PI / 3;
        const midAngle = block.segment * angleStep - Math.PI / 2 + angleStep / 2;
        
        const x = cx + Math.cos(midAngle) * block.distance;
        const y = cy + Math.sin(midAngle) * block.distance;
        
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fillStyle = block.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    async endGame() {
        this.running = false;
        this.gameOver = true;
        
        document.getElementById('finalScore').textContent = `得分: ${this.score}`;
        document.getElementById('gameOverlay').classList.remove('hide');
        
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            document.getElementById('best').textContent = this.bestScore;
        }
        
        if (this.sdk) {
            await this.sdk.submitScore({
                score: this.score,
                metadata: { level: this.level, linesCleared: this.linesCleared }
            });
            await this.sdk.save('progress', { bestScore: this.bestScore });
        }
        
        this.trackEvent('game_end', { score: this.score, level: this.level });
    }
    
    trackEvent(eventName, payload = {}) {
        if (this.sdk) {
            this.sdk.track(eventName, { ...payload, gameId: 'globe-hextris' });
        }
        console.log('[Game]', eventName, payload);
    }
}

// 启动游戏
document.addEventListener('DOMContentLoaded', () => {
    window.game = new HextrisGame();
});
