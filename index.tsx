
/**
 * Tracy Build 2.3
 * 初始多段自启重连、双向心跳、断线重连与防宿主睡眠保活版
 */

// ==========================================
// 0. 全局配置
// ==========================================
const CONFIG = {
    wsUrl: 'ws://127.0.0.1:9998',
    mode: 'real', 
    keepAlive: true,
    heartbeat: true
};

const LOG_STORE_KEY = 'tracy_log_html_v2';
const UNLOAD_STORE_KEY = 'tracy_last_unload_v2';

// 状态码解析增强
const ERROR_MAP: Record<number, string> = {
    400: '请求无效。通常是：1.中转注入的 SafetySettings 分类不支持；2.阈值 BLOCK_NONE 权限不足；3.JSON 格式损坏。',
    401: '身份验证失败。请检查 API Key 是否正确，或是否已被封禁。',
    403: '访问受限。IP 可能被 Google 封锁，或者该 API Key 无法访问请求的模型。',
    404: '接口未找到。请检查 URL 路径或模型版本号是否正确。',
    429: '触发限频。免费额度已耗尽或请求速度过快，请降低并发。',
    500: 'Google 服务端异常。可能是上下文超长或内部逻辑崩溃。',
    503: '服务不可用。服务器过载或正在维护。',
    504: '响应超时。云端生成内容过多，超过了网关等待时间。'
};

// ==========================================
// 1. 样式 (CSS) - 保持紫色风格并优化移动端
// ==========================================
const styles = `
:root {
  --bg-color: #050505;
  --card-bg: #0f0f11;
  --text-main: #e0e0e0;
  --text-sub: #888888;
  --primary: #8b5cf6;
  --primary-dim: #4c1d95;
  --border: #4c1d95;
  --green: #10b981;
  --red: #ef4444;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 12px;
  background-color: var(--bg-color);
  color: var(--text-main);
  font-family: -apple-system, Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  min-height: 100vh;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding: 0 4px; }
.app-title { font-weight: 700; font-size: 18px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px; }
.version-tag { font-size: 10px; color: var(--primary); border: 1px solid var(--primary); padding: 1px 6px; border-radius: 4px; opacity: 0.8; }
.update-date-tag { font-size: 10px; color: #fbbf24; border: 1px solid #a855f7; padding: 1px 6px; border-radius: 4px; opacity: 0.9; font-weight: 500; }

.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px; }

.control-panel { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }

.status-indicator { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-sub); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #444; }
.dot.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
.dot.wait { background: #f59e0b; }

.mode-switch { display: flex; background: #000; border: 1px solid var(--border); border-radius: 6px; padding: 2px; }
.mode-opt { padding: 6px 12px; font-size: 12px; cursor: pointer; border-radius: 4px; color: var(--text-sub); }
.mode-opt.active { background: var(--primary); color: #fff; font-weight: bold; }

.ka-switch { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-sub); cursor: pointer; background: #000; padding: 6px 10px; border-radius: 6px; border: 1px solid #333; }
.ka-switch.active { border-color: var(--primary); color: var(--primary); }
.ka-icon { width: 8px; height: 8px; border-radius: 2px; background: #333; }
.ka-switch.active .ka-icon { background: var(--primary); }

.action-btn { background: var(--primary); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; flex-shrink: 0; }
.action-btn.stop { background: var(--red); }
.action-btn:disabled { opacity: 0.5; }

.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stat-item { text-align: center; background: #000; padding: 10px 4px; border-radius: 8px; border: 1px solid #222; }
.stat-label { font-size: 10px; color: var(--text-sub); margin-bottom: 4px; }
.stat-num { font-family: 'Menlo', monospace; font-size: 15px; font-weight: 700; color: #fff; }

.log-container { background: #000; border: 1px solid var(--border); border-radius: 12px; height: 320px; overflow-y: auto; padding: 12px; font-family: 'Menlo', monospace; font-size: 11px; user-select: text; -webkit-user-select: text; }
.log-entry { margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #111; line-height: 1.4; }
.log-time { color: #555; margin-right: 6px; }
.c-info { color: #94a3b8; }
.c-success { color: var(--green); }
.c-error { color: var(--red); font-weight: bold; }
.c-latency { color: #d946ef; }
.c-detail { color: #facc15; font-size: 10px; padding-left: 10px; }

.footer { display: flex; justify-content: flex-end; gap: 15px; margin-top: 8px; }
.mini-btn { background: none; border: none; color: var(--text-sub); font-size: 12px; padding: 4px 8px; cursor: pointer; }
`;

// ==========================================
// 2. 界面构建
// ==========================================
function createUI() {
    const previousLogHtml =
        (document.getElementById('log-box') as HTMLElement | null)?.innerHTML ||
        sessionStorage.getItem(LOG_STORE_KEY) ||
        '';

    document.getElementById('tracy-style')?.remove();
    const style = document.createElement('style');
    style.id = 'tracy-style';
    style.textContent = styles;
    document.head.appendChild(style);

    document.body.innerHTML = `
    <div class="header">
        <div class="app-title">✨ Tracy <span class="version-tag">build 2.3</span><span class="update-date-tag">更新日期：2026年06月22日</span></div>
        <div class="status-indicator">
            <div id="status-dot" class="dot"></div>
            <span id="status-text">离线</span>
        </div>
    </div>

    <div class="card control-panel">
        <div class="mode-switch" id="mode-switch">
            <div class="mode-opt" data-val="fake">非流式</div>
            <div class="mode-opt active" data-val="real">流式</div>
        </div>
        <div class="ka-switch active" id="ka-btn">
            <div class="ka-icon"></div>
            <span>后台保活</span>
        </div>
        <div class="ka-switch active" id="hb-btn">
            <div class="ka-icon"></div>
            <span>主动心跳</span>
        </div>
        <button id="main-btn" class="action-btn">启动服务</button>
    </div>

    <div class="card">
        <div class="stats-grid" style="margin-bottom:8px">
            <div class="stat-item"><div class="stat-label">总调用</div><div class="stat-num" id="v-calls">0</div></div>
            <div class="stat-item"><div class="stat-label">总 Token</div><div class="stat-num" id="v-tokens">0</div></div>
            <div class="stat-item"><div class="stat-label">运行时间</div><div class="stat-num" id="v-time">00:00</div></div>
        </div>
        <div class="stats-grid">
            <div class="stat-item"><div class="stat-label">输入(In)</div><div class="stat-num" style="color:#60a5fa" id="v-in">0</div></div>
            <div class="stat-item"><div class="stat-label">输出(Out)</div><div class="stat-num" style="color:#34d399" id="v-out">0</div></div>
            <div class="stat-item"><div class="stat-label">合计</div><div class="stat-num" style="color:#facc15" id="v-sum">0</div></div>
        </div>
    </div>

    <div class="log-container" id="log-box"></div>

    <div class="footer">
        <button class="mini-btn" id="clean-log">清除日志</button>
        <button class="mini-btn" id="reset-stat">重置数据</button>
    </div>
    `;

    const logBox = document.getElementById('log-box') as HTMLElement | null;
    if (logBox && previousLogHtml) {
        logBox.innerHTML = previousLogHtml;
        logBox.scrollTop = logBox.scrollHeight;
    }
}

// ==========================================
// 3. 核心逻辑
// ==========================================
const Core: any = {
    socket: null,
    timer: null,
    startTime: null,
    stats: { calls: 0, totalTokens: 0 },
    audioEl: null,
    heartbeatTimer: null,
    reconnectTimer: null,
    isManuallyStopped: false,
    lastActiveTime: null,
    lifecycleBound: false,
    initialAttempts: 0,
    
    init() {
        createUI();
        this.els = {
            btn: document.getElementById('main-btn'),
            logBox: document.getElementById('log-box'),
            statusDot: document.getElementById('status-dot'),
            statusText: document.getElementById('status-text'),
            kaBtn: document.getElementById('ka-btn'),
            hbBtn: document.getElementById('hb-btn')
        };

        // 根据默认全局配置，同步按钮的激活样式
        this.els.kaBtn.classList.toggle('active', CONFIG.keepAlive);
        this.els.hbBtn.classList.toggle('active', CONFIG.heartbeat);

        this.els.btn.onclick = () => {
            if (this.reconnectTimer) {
                this.isManuallyStopped = true;
                this.clearReconnect();
                this.cleanup();
                this.initialAttempts = 0;
                this.log('🔌 已手动取消自动重连', 'c-info');
                return;
            }
            this.initialAttempts = 0;
            this.socket ? this.stop() : this.start();
        };
        
        const switchOpts = document.querySelectorAll<HTMLElement>('.mode-opt');
        switchOpts.forEach(opt => {
            opt.onclick = () => {
                switchOpts.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                CONFIG.mode = opt.dataset.val || 'fake';
                this.log(`🔄 转发模式: ${opt.innerText}`, 'c-info');
            };
        });

        this.els.kaBtn.onclick = () => {
            CONFIG.keepAlive = !CONFIG.keepAlive;
            this.els.kaBtn.classList.toggle('active', CONFIG.keepAlive);
            if (this.socket) CONFIG.keepAlive ? this.startKeepAlive() : this.stopKeepAlive();
            this.log(`⚙️ 后台保活已${CONFIG.keepAlive ? '开启' : '关闭'}`, 'c-info');
        };

        this.els.hbBtn.onclick = () => {
            CONFIG.heartbeat = !CONFIG.heartbeat;
            this.els.hbBtn.classList.toggle('active', CONFIG.heartbeat);
            if (this.socket) {
                CONFIG.heartbeat ? this.startHeartbeat() : this.stopHeartbeat();
            }
            this.log(`⚙️ 主动心跳已${CONFIG.heartbeat ? '开启' : '关闭'}`, 'c-info');
        };

        (document.getElementById('clean-log') as HTMLElement).onclick = () => {
            this.els.logBox.innerHTML = '';
            sessionStorage.removeItem(LOG_STORE_KEY);
        };
        (document.getElementById('reset-stat') as HTMLElement).onclick = () => {
            this.stats = { calls: 0, totalTokens: 0 };
            this.updateStats({ prompt: 0, candidates: 0, total: 0 });
        };

        this.initAudio();
        this.bindLifecycle();
        // 初始自动启动 (初次加载或刷新页面后)
        this.triggerInitialAutoStart();
    },

    bindLifecycle() {
        if (this.lifecycleBound) return;
        this.lifecycleBound = true;

        const lastUnload = sessionStorage.getItem(UNLOAD_STORE_KEY);
        if (lastUnload) {
            this.log(`🔄 检测到页面/脚本曾重新加载，上次卸载时间: ${lastUnload}`, 'c-info');
            sessionStorage.removeItem(UNLOAD_STORE_KEY);
        }

        window.addEventListener('beforeunload', () => {
            this.persistLog();
            sessionStorage.setItem(
                UNLOAD_STORE_KEY,
                new Date().toLocaleString('zh-CN', { hour12: false })
            );
        });

        document.addEventListener('visibilitychange', () => {
            this.log(`👁️ 页面可见性变更: ${document.visibilityState}`, 'c-info');
        });
    },

    initAudio() {
        const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////wAAADFMYXZjNTguMTM0AAAAAAAAAAAAAAAAJAAAAAAAAAAAASCCOzuJAAAAAAAAAAAAAAAAAAAAAP/zhAAAAAABiAAAAAAABIAAAAAAAAAAAAAAA';
        this.audioEl = new Audio(silentMp3);
        this.audioEl.loop = true;
    },

    async startKeepAlive() {
        if (!CONFIG.keepAlive) return;
        try { if (this.audioEl.paused) await this.audioEl.play(); } catch (e) {}
    },

    stopKeepAlive() { try { this.audioEl.pause(); } catch (e) {} },

    start() {
        this.isManuallyStopped = false;
        this.clearReconnect();
        this.setStatus('connecting');
        this.log(`📡 尝试建立连接: ${CONFIG.wsUrl}`, 'c-info');
        this.startKeepAlive();
        try {
            this.socket = new WebSocket(CONFIG.wsUrl);
            this.socket.onopen = () => {
                this.setStatus('online');
                this.log('✅ 通信链路已打通，监听请求中...', 'c-success');
                this.startTimer();
                this.startHeartbeat();
                this.initialAttempts = 0; // 连接成功建立，重置初始自启计数器
            };
            this.socket.onclose = (ev: CloseEvent) => {
                const reason = ev.reason ? ` reason=${ev.reason}` : '';
                this.cleanup();
                this.log(`🔌 通信链路已断开 code=${ev.code} clean=${ev.wasClean}${reason}`, 'c-error');
                if (!this.isManuallyStopped) {
                    this.handleDisconnectOrFailure();
                }
            };
            this.socket.onerror = () => {
                const readyState = this.socket ? this.socket.readyState : 'unknown';
                this.log(`⚠️ 连接错误，请确保中转服务器正在运行 readyState=${readyState}`, 'c-error');
                this.cleanup();
                if (!this.isManuallyStopped) {
                    this.handleDisconnectOrFailure();
                }
            };
            this.socket.onmessage = (e: any) => this.handleRequest(e.data);
        } catch(e: any) { this.cleanup(); this.log(`❌ 启动异常: ${e.message}`, 'c-error'); }
    },

    stop() {
        this.isManuallyStopped = true;
        this.initialAttempts = 0;
        this.clearReconnect();
        if (this.socket) {
            this.socket.close();
        } else {
            this.cleanup();
        }
    },

    cleanup() {
        this.socket = null;
        this.setStatus('offline');
        this.stopTimer();
        this.stopKeepAlive();
        this.stopHeartbeat();
    },

    setStatus(status: string) {
        const { btn, statusDot, statusText } = this.els;
        btn.disabled = false;
        statusDot.className = 'dot';
        if (status === 'online') {
            statusDot.classList.add('on'); statusText.innerText = '就绪';
            btn.innerText = '停止服务'; btn.classList.add('stop');
        } else if (status === 'connecting') {
            statusDot.classList.add('wait'); statusText.innerText = '握手中';
            btn.innerText = '连接中...'; btn.disabled = true;
        } else if (status === 'reconnecting') {
            statusDot.classList.add('wait'); statusText.innerText = '断线重连中...';
            btn.innerText = '取消重连'; btn.classList.add('stop');
        } else {
            statusText.innerText = '离线'; btn.innerText = '启动服务'; btn.classList.remove('stop');
        }
    },

    startHeartbeat() {
        this.stopHeartbeat();
        if (!CONFIG.heartbeat) return;
        this.heartbeatTimer = setInterval(() => {
            console.debug('💓 发送应用层心跳信号');
            this.send({ event_type: 'heartbeat' });
        }, 60000);
    },

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },

    triggerInitialAutoStart() {
        this.initialAttempts = 1;
        this.log('🚀 页面加载/刷新完成，触发首次自动建立连接 (第 1/4 次自启)...', 'c-info');
        this.start();
    },

    handleDisconnectOrFailure() {
        if (this.isManuallyStopped) return;

        // 初始自启重连逻辑：只在前 3 次重试期间 (第 1、2、3 次失败之后)
        if (this.initialAttempts > 0 && this.initialAttempts < 4) {
            let delay = 10000;
            if (this.initialAttempts === 1) delay = 10000; // 第 2 次自启间隔为 10 秒
            else if (this.initialAttempts === 2) delay = 15000; // 第 3 次自启间隔为 15 秒
            else if (this.initialAttempts === 3) delay = 30000; // 第 4 次自启间隔为 30 秒

            const nextAttempt = this.initialAttempts + 1;
            this.initialAttempts = nextAttempt;

            this.setStatus('reconnecting');
            this.log(`⏳ 初始自启链路未疏通，将在 ${delay / 1000} 秒后触发下一次自启 (第 ${nextAttempt}/4 次)...`, 'c-info');

            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                if (!this.socket && !this.isManuallyStopped) {
                    this.start();
                }
            }, delay);
        } else {
            // 正常工作的断线，或者 4 次初始自启额度已经全部用完，则回归常规断流重连
            if (this.initialAttempts >= 4) {
                this.log('⚠️ 4次初始自动连接重试已试满，连接依然未打通。此后退回常规 4 秒重试机制。', 'c-info');
                this.initialAttempts = 0;
            }
            this.reconnect();
        }
    },

    reconnect() {
        if (this.isManuallyStopped) return;
        if (this.reconnectTimer) return;

        this.setStatus('reconnecting');
        this.log('⏳ 4秒后尝试自动重新连接...', 'c-info');

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.socket && !this.isManuallyStopped) {
                this.start();
            }
        }, 4000);
    },

    clearReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    },

    async handleRequest(rawMsg: string) {
        this.lastActiveTime = Date.now(); // 收到任何消息（包括心跳信号），更新最后活体时间
        let req;
        try {
            req = JSON.parse(rawMsg);
        } catch (e: any) {
            console.error('解析 JSON 失败:', e);
            return;
        }

        // 过滤应用层心跳与 ping 包
        if (req && (req.event_type === 'heartbeat' || req.event_type === 'ping')) {
            console.debug('💓 忽略服务端心跳/ping消息:', req);
            return;
        }

        // 如果没有 path，则认为不是标准 API 转发请求
        if (!req || !req.path) {
            console.debug('忽略非 API 请求消息:', req);
            return;
        }

        try {
            const isStream = req.path.includes(':streamGenerateContent') || req.query_params?.alt === 'sse';
            const simplePath = req.path.split('/').pop().split('?')[0];
            
            this.log(`➡️ 请求: ${req.method || 'POST'} /${simplePath}`, 'c-info');

            let targetPath = req.path.startsWith('/') ? req.path.substring(1) : req.path;
            const qs = new URLSearchParams(req.query_params || {});
            
            if(CONFIG.mode === 'fake') {
                qs.delete('alt');
                if(targetPath.includes(':streamGenerateContent')) targetPath = targetPath.replace(':streamGenerateContent', ':generateContent');
            }

            const url = `https://generativelanguage.googleapis.com/${targetPath}?${qs}`;
            
            // 整理头部：移除可能被浏览器拒绝或引发 CORS 冲突的用户浏览器相关头部
            const headers: Record<string, string> = {};
            if (req.headers) {
                for (const [k, v] of Object.entries(req.headers)) {
                    const kl = k.toLowerCase();
                    // 只转发 content-type, x-goog-api-* 及 x- 开头的必要请求头
                    if (
                        kl === 'content-type' ||
                        kl === 'x-goog-api-client' ||
                        kl === 'x-goog-api-key' ||
                        kl.startsWith('x-')
                    ) {
                        headers[k] = v as string;
                    }
                }
            }

            // 安全处理请求 Body (如果是对象转为 string，防止 fetch 发送 "[object Object]")
            let requestBody: any = undefined;
            if (['POST', 'PUT'].includes(req.method || 'POST')) {
                if (req.body !== undefined && req.body !== null) {
                    requestBody = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
                }
            }

            const reqStart = Date.now();
            const res = await fetch(url, {
                method: req.method || 'POST',
                headers: headers,
                body: requestBody
            });

            const latency = Date.now() - reqStart;
            this.log(`⚡ 响应: ${latency}ms`, 'c-latency');

            if (!res.ok) {
                const status = res.status;
                let errMsg = `❌ API 报错 ${status}: ${ERROR_MAP[status] || '未知异常'}`;
                this.log(errMsg, 'c-error');
                
                let bodyText = '';
                try {
                    bodyText = await res.text();
                } catch (readErr: any) {
                    this.log(`   └ 无法读取异常响应体: ${readErr.message}`, 'c-detail');
                }

                if (bodyText) {
                    try {
                        const errJson = JSON.parse(bodyText);
                        if (errJson.error) {
                            this.log(`   └ 原因: ${errJson.error.message}`, 'c-detail');
                            // 深度诊断 400 错误
                            if (status === 400 && errJson.error.details) {
                                errJson.error.details.forEach((d: any) => {
                                    if (d.fieldViolations) {
                                        d.fieldViolations.forEach((v: any) => {
                                            this.log(`   └ 字段异常: ${v.field} - ${v.description}`, 'c-detail');
                                            if (v.field.includes('safety_settings')) {
                                                this.log(`   💡 建议: 请检查中转服务器注入的 SafetySettings，可能是分类名错误或 BLOCK_NONE 权限不足。`, 'c-detail');
                                            }
                                        });
                                    }
                                });
                            }
                        } else {
                            this.log(`   └ 响应回复: ${bodyText.substring(0, 150)}...`, 'c-detail');
                        }
                    } catch (parseErr) {
                        this.log(`   └ 响应回复: ${bodyText.substring(0, 150)}...`, 'c-detail');
                    }
                }
                throw new Error(`Cloud Error ${status}`);
            }

            const resHeaders: any = {};
            res.headers.forEach((v, k) => resHeaders[k] = v);
            if(CONFIG.mode === 'fake' && isStream) resHeaders['content-type'] = 'text/event-stream';
            this.send({ request_id: req.request_id, event_type: 'response_headers', status: res.status, headers: resHeaders });

            let usage: any = { prompt: 0, candidates: 0, total: 0 };

            if (CONFIG.mode === 'real') {
                if (res.body) {
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        const tMatch = chunk.match(/"totalTokenCount"\s*:\s*(\d+)/);
                        if (tMatch) usage.total = parseInt(tMatch[1]);
                        this.send({ request_id: req.request_id, event_type: 'chunk', data: chunk });
                    }
                } else {
                    this.log('⚠️ 响应体为空 (No Body)', 'c-error');
                }
            } else {
                const text = await res.text();
                try {
                    const json = JSON.parse(text);
                    const meta = json.usageMetadata || (Array.isArray(json) ? json[json.length-1]?.usageMetadata : null);
                    if (meta) usage = { prompt: meta.promptTokenCount || 0, candidates: meta.candidatesTokenCount || 0, total: meta.totalTokenCount || 0 };
                } catch(e) {}
                const data = isStream ? `data: ${text}\n\n` : text;
                this.send({ request_id: req.request_id, event_type: 'chunk', data });
            }

            this.send({ request_id: req.request_id, event_type: 'stream_close' });
            this.stats.calls++;
            this.stats.totalTokens += usage.total || 0;
            this.updateStats(usage);
            this.log(`✅ 传输成功 (${usage.total} Tokens)`, 'c-success');

        } catch (e: any) {
            this.log(`❌ 转发请求遇到异常: ${e.message || e}`, 'c-error');
            try { this.send({ request_id: req.request_id, event_type: 'error', status: 500, message: e.message }); } catch(ex){}
        }
    },

    send(msg: any) { if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(msg)); },

    persistLog() {
        if (this.els?.logBox) {
            sessionStorage.setItem(LOG_STORE_KEY, this.els.logBox.innerHTML);
        }
    },

    log(msg: string, cls: string) {
        const div = document.createElement('div');
        div.className = `log-entry ${cls || ''}`;
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        div.innerHTML = `<span class="log-time">[${time}]</span>${msg}`;
        this.els.logBox.appendChild(div);
        this.els.logBox.scrollTop = this.els.logBox.scrollHeight;
        if (this.els.logBox.childElementCount > 150) this.els.logBox.removeChild(this.els.logBox.firstChild);
        this.persistLog();
    },

    updateStats(u: any) {
        document.getElementById('v-calls')!.innerText = this.stats.calls;
        document.getElementById('v-tokens')!.innerText = this.stats.totalTokens.toLocaleString();
        document.getElementById('v-in')!.innerText = (u.prompt || 0).toLocaleString();
        document.getElementById('v-out')!.innerText = (u.candidates || 0).toLocaleString();
        document.getElementById('v-sum')!.innerText = (u.total || 0).toLocaleString();
    },

    startTimer() {
        if(this.timer) return;
        this.startTime = Date.now();
        this.lastActiveTime = Date.now(); // 重启定时器时初始化活跃基准时间
        this.timer = setInterval(() => {
            const diff = Math.floor((Date.now() - this.startTime) / 1000);
            const m = Math.floor(diff / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            document.getElementById('v-time')!.innerText = `${m}:${s}`;

            // 僵尸连接检测 (1500 秒无数据交互自动重连)
            if (this.socket && this.socket.readyState === 1) {
                const idleTime = Date.now() - this.lastActiveTime;
                if (idleTime > 1500000) { 
                    this.log('⚠️ 底层物理链路遭遇静默中断或断流 (1500秒无心跳)，自动断开重建中...', 'c-error');
                    this.socket.close(); // 这将自动触发 onclose 以进入 reconnect 阶段
                }
            }
        }, 1000);
    },
    
    stopTimer() { clearInterval(this.timer); this.timer = null; }
};

document.addEventListener('DOMContentLoaded', () => Core.init());
