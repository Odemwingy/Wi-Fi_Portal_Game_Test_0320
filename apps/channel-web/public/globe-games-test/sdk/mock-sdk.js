/**
 * Globe Game SDK Mock - 用于本地开发测试
 * 模拟平台 SDK 接口规范 v1.0
 */

class GlobeGameSDK {
  constructor(options = {}) {
    this.gameId = options.gameId || 'unknown';
    this.version = options.version || '1.0.0';
    this.mode = options.mode || 'single';
    this._initialized = false;
    this._context = null;
    this._eventHandlers = new Map();
    this._storage = new Map();
  }

  // ============ Core SDK ============

  async init() {
    if (this._initialized) return this._context;
    
    this._context = {
      session: {
        sessionId: this._uuid(),
        launchId: this._uuid(),
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        startedAt: new Date().toISOString()
      },
      player: {
        playerId: 'player_' + this._uuid().slice(0, 8),
        displayName: '测试玩家',
        isGuest: true
      },
      device: {
        deviceType: this._detectDevice(),
        os: navigator?.platform || 'unknown',
        browser: this._detectBrowser(),
        screenWidth: window?.innerWidth || 375,
        screenHeight: window?.innerHeight || 667
      },
      config: {
        featureFlags: {},
        params: {}
      },
      capabilities: {
        leaderboard: true,
        multiplayer: false,
        saveData: true,
        reconnect: false,
        achievements: true
      }
    };

    this._initialized = true;
    console.log('[SDK] Initialized:', this._context);
    return this._context;
  }

  getContext() {
    return this._context;
  }

  async ready() {
    console.log('[SDK] Game ready');
    this._track('game_ready', { gameId: this.gameId });
  }

  async exit(payload = {}) {
    console.log('[SDK] Game exit:', payload);
    this._track('game_exit', { ...payload, gameId: this.gameId });
    // 模拟退出
    if (window.opener) {
      window.close();
    } else {
      alert('游戏结束');
    }
  }

  onPause(handler) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) handler();
    });
  }

  onResume(handler) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) handler();
    });
  }

  onExitRequested(handler) {
    window.addEventListener('beforeunload', handler);
  }

  // ============ Storage API ============

  async save(slot, data) {
    const key = `${this.gameId}_${slot}`;
    const value = JSON.stringify(data);
    localStorage.setItem(key, value);
    this._storage.set(key, data);
    console.log('[SDK] Saved:', slot, data);
  }

  async load(slot) {
    const key = `${this.gameId}_${slot}`;
    const value = localStorage.getItem(key);
    if (value) {
      return JSON.parse(value);
    }
    return null;
  }

  async remove(slot) {
    const key = `${this.gameId}_${slot}`;
    localStorage.removeItem(key);
    this._storage.delete(key);
  }

  async clear() {
    // 只清除当前游戏的存档
    const prefix = `${this.gameId}_`;
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    });
  }

  // ============ Score API ============

  async submitScore(payload) {
    console.log('[SDK] Score submitted:', payload);
    this._track('score_submit', payload);
    // 模拟排行榜存储
    const scores = JSON.parse(localStorage.getItem(`${this.gameId}_scores`) || '[]');
    scores.push({
      score: payload.score,
      timestamp: Date.now(),
      playerId: this._context?.player?.playerId
    });
    scores.sort((a, b) => b.score - a.score);
    localStorage.setItem(`${this.gameId}_scores`, JSON.stringify(scores.slice(0, 100)));
  }

  // ============ Leaderboard API ============

  async getLeaderboard(options = {}) {
    const scores = JSON.parse(localStorage.getItem(`${this.gameId}_scores`) || '[]');
    return {
      entries: scores.slice(0, options.limit || 10).map((s, i) => ({
        rank: i + 1,
        score: s.score,
        displayName: `玩家${s.playerId?.slice(-4) || '????'}`,
        timestamp: s.timestamp
      })),
      total: scores.length
    };
  }

  // ============ Telemetry API ============

  track(eventName, payload = {}) {
    console.log('[SDK] Track:', eventName, payload);
    // 存储到 localStorage 用于调试
    const logs = JSON.parse(localStorage.getItem('sdk_logs') || '[]');
    logs.push({
      event: eventName,
      payload,
      timestamp: Date.now()
    });
    localStorage.setItem('sdk_logs', JSON.stringify(logs.slice(-100)));
  }

  error(code, message, payload = {}) {
    console.error('[SDK] Error:', code, message, payload);
    this.track('error', { code, message, ...payload });
  }

  // ============ Helper Methods ============

  _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  _detectDevice() {
    const width = window?.innerWidth || 375;
    if (width < 600) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'laptop';
  }

  _detectBrowser() {
    const ua = navigator?.userAgent || '';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Firefox')) return 'Firefox';
    return 'Unknown';
  }

  _track(event, payload) {
    const logs = JSON.parse(localStorage.getItem('sdk_logs') || '[]');
    logs.push({ event, payload, timestamp: Date.now() });
    localStorage.setItem('sdk_logs', JSON.stringify(logs.slice(-100)));
  }
}

// 导出 SDK 创建函数
window.createGameSDK = async (options) => {
  const sdk = new GlobeGameSDK(options);
  await sdk.init();
  return sdk;
};

console.log('[SDK] Mock SDK loaded');
