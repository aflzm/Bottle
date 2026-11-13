const SUPABASE_URL = 'https://usugfffkqdhmwvcvjmrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_A0EEq3mPFe1QsOP7nog2Iw_lOAJWWmU';
const db = (typeof supabase !== 'undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// 违禁词词库位于 assets/js/banned-words.js，单独维护
const BANNED_WORDS = window.BANNED_WORDS || [];

// 禁止发布网址、图片、视频等外链内容（纯文字社区）
const LINK_OR_MEDIA_RE = /(https?:\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|cn|net|org|io|me|cc|tv|xyz|top|vip|link|site|club|shop|app)\b|data:image|<img|<video|<iframe|\[img\]|\[url\]|\[video\])/i;

const TYPE_META = {
    red: { icon: 'i-shield', label: '学术红线探讨' },
    blue: { icon: 'i-search', label: '科研困惑求助' },
    green: { icon: 'i-book', label: '导学关系树洞' },
    warm: { icon: 'i-sparkle', label: '暖光寄语' }
};

// 固定展示的三个漂流瓶（其中一个为非常正面的暖光寄语）
const fixedBottles = [
    { id: 'fixed-1', nickname: '匿名科研生', type: 'red', content: '求助大家，如果我在写论文时，引用了网络上的图表，但我自己重新画了一遍并且修改了部分数据，这算不算学术不端？导师最近强调了这个问题，我很慌。' },
    { id: 'fixed-2', nickname: '被温柔以待的研二', type: 'warm', content: '第一次投稿被拒的那天，导师没有批评我，只发来一句：“数据没问题，我们再改一版。”后来那张写满修改意见的稿纸，我一直留着。想告诉正在焦虑的你：慢一点没关系，认真走过的每一步都算数。' },
    { id: 'fixed-3', nickname: '实验小白', type: 'blue', content: '实验数据跑不出来，已经重复了半个月了，跟导师汇报他总觉得我不够努力。大家遇到实验瓶颈期都是怎么熬过来的？' }
];

// 初始漂在海面、需被捞起的漂流瓶
const fixedHiddenBottles = [
    { id: 'hidden-1', nickname: '路过的同学', type: 'warm', visible: false, content: '今天在实验楼捡到一张便签，上面写着“别急，你已经在路上了”。我把它夹进了实验记录本，也想把这句话送给捞到这只瓶子的你。' },
    { id: 'hidden-2', nickname: '不善言辞的研一', type: 'blue', visible: false, content: '导师平时很少主动交流，我也不太敢敲门。有没有同学分享过和导师建立沟通节奏的方法？' },
    { id: 'hidden-3', nickname: '三行周报', type: 'green', visible: false, content: '分享一个小习惯：每周给导师发一封三行周报——本周做了什么、遇到什么问题、下周计划。坚持一个学期后，组会压力小了很多，也更容易得到及时反馈。' }
];

let currentBottleId = null;
let currentRevealBottle = null;
// 当前海面上待捞起的瓶子（未公开展示）
let hiddenBottlesCache = [];
// 数据库是否已支持 visible 字段（null 表示尚未探测）
let supportsVisible = null;

// 内置示例瓶（fixed-* / hidden-*）不在数据库里，讨论存在 localStorage
const LOCAL_COMMENTS_KEY = 'fzu_bottle_local_comments_v1';

function isLocalBottle(id) {
    return !/^\d+$/.test(String(id));
}

function readLocalComments() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_COMMENTS_KEY) || '{}') || {};
    } catch (err) {
        return {};
    }
}

function addLocalComment(id, nickname, content) {
    const all = readLocalComments();
    all[id] = all[id] || [];
    all[id].push({
        id: 'lc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        nickname,
        content
    });
    try {
        localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(all));
    } catch (err) {
        console.warn('本地讨论保存失败', err);
    }
}

/* ───── 点赞 ─────
   数据库有 bottle_likes 表时全局共享；没有则退化为本地点赞，页面依然可用 */
const LOCAL_LIKES_KEY = 'fzu_bottle_likes_v1';   // 本地点赞数 { "bottle:fixed-1": 2 }
const LIKED_KEY = 'fzu_bottle_liked_v1';         // 本机已赞过的对象
const VISITOR_KEY = 'fzu_bottle_visitor_v1';     // 本机标识，用于去重

let supportsLikes = null;
let likeCounts = {};

function likeKey(kind, id) {
    return kind + ':' + id;
}

function readJSON(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch (err) {
        return {};
    }
}

function writeJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        console.warn('本地状态保存失败', err);
    }
}

function readerId() {
    try {
        let id = localStorage.getItem(VISITOR_KEY);
        if (!id) {
            id = 'v-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            localStorage.setItem(VISITOR_KEY, id);
        }
        return id;
    } catch (err) {
        return 'v-anonymous';
    }
}

async function loadLikes() {
    likeCounts = {};
    if (db) {
        const { data, error } = await db.from('bottle_likes').select('target_type, target_id');
        supportsLikes = !error;
        if (error) {
            console.warn('点赞表不可用，改用本地点赞：', error.message);
        } else {
            (data || []).forEach(row => {
                const key = likeKey(row.target_type, row.target_id);
                likeCounts[key] = (likeCounts[key] || 0) + 1;
            });
        }
    } else {
        supportsLikes = false;
    }

    if (supportsLikes !== true) {
        const local = readJSON(LOCAL_LIKES_KEY);
        Object.keys(local).forEach(key => {
            likeCounts[key] = (likeCounts[key] || 0) + (Number(local[key]) || 0);
        });
    }
}

// 用最新计数刷新页面上所有同 key 的点赞按钮
function refreshLikeButtons(scope) {
    const liked = readJSON(LIKED_KEY);
    (scope || document).querySelectorAll('.like-btn').forEach(btn => {
        const key = likeKey(btn.dataset.likeKind, btn.dataset.likeId);
        const icon = btn.querySelector('.like-count');
        if (icon) icon.textContent = likeCounts[key] || 0;
        const isLiked = !!liked[key];
        btn.classList.toggle('is-liked', isLiked);
        btn.setAttribute('aria-pressed', isLiked ? 'true' : 'false');
        btn.title = isLiked ? '取消点赞' : '点赞';
    });
}

async function toggleLike(kind, id, event) {
    if (event) event.stopPropagation();
    const key = likeKey(kind, id);
    const liked = readJSON(LIKED_KEY);

    // 已赞过 → 取消点赞
    if (liked[key]) {
        if (supportsLikes === true) {
            // select() 让 PostgREST 返回被删的行，才能判断是否真的删掉（0 行也会返回 204）
            const { data, error } = await db.from('bottle_likes').delete().match({
                target_type: kind,
                target_id: String(id),
                visitor_id: readerId()
            }).select('id');
            if (error || !data || !data.length) {
                console.warn('取消点赞失败', error || '没有删除任何记录，可能缺少 delete 策略');
                alert('取消点赞失败：请在 Supabase 执行 schema.sql 中 bottle_likes 的删除策略');
                return;
            }
        } else {
            const local = readJSON(LOCAL_LIKES_KEY);
            local[key] = Math.max(0, (Number(local[key]) || 0) - 1);
            if (!local[key]) delete local[key];
            writeJSON(LOCAL_LIKES_KEY, local);
        }

        delete liked[key];
        writeJSON(LIKED_KEY, liked);
        likeCounts[key] = Math.max(0, (likeCounts[key] || 0) - 1);
        refreshLikeButtons();
        return;
    }

    if (supportsLikes === true) {
        const { error } = await db.from('bottle_likes').insert([{
            target_type: kind,
            target_id: String(id),
            visitor_id: readerId()
        }]);
        // 23505 表示这行本来就存在，计数已包含它，不能再加一次
        if (error && error.code === '23505') {
            liked[key] = 1;
            writeJSON(LIKED_KEY, liked);
            refreshLikeButtons();
            return;
        }
        if (error) {
            console.warn('点赞失败', error);
            alert('点赞失败，请稍后再试');
            return;
        }
    } else {
        const local = readJSON(LOCAL_LIKES_KEY);
        local[key] = (Number(local[key]) || 0) + 1;
        writeJSON(LOCAL_LIKES_KEY, local);
    }

    liked[key] = 1;
    writeJSON(LIKED_KEY, liked);
    likeCounts[key] = (likeCounts[key] || 0) + 1;
    refreshLikeButtons();
}

function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function normalizeText(text) {
    return String(text || '').toLowerCase().replace(/[\s\-_·.,，。！!？?*~、|/\\]/g, '');
}

function findBannedWord(text) {
    const target = normalizeText(text);
    return BANNED_WORDS.find(word => target.includes(normalizeText(word))) || '';
}

function validateText(text) {
    const word = findBannedWord(text);
    if (word) {
        alert('内容包含违禁词“' + word + '”，请修改后再发布。');
        return false;
    }
    if (LINK_OR_MEDIA_RE.test(String(text || ''))) {
        alert('这里只能发文字：请勿发布网址、图片或视频链接。');
        return false;
    }
    return true;
}

// 页面加载时拉取数据
async function loadBottles() {
    let bottlesData = [];
    const commentCounts = {};

    try {
        if (db) {
            // 先按含 visible 字段查询，失败则判定旧库并降级
            let res = await db.from('bottles').select('id, nickname, content, type, visible').order('id', { ascending: true });
            if (res.error) {
                supportsVisible = false;
                console.warn('数据库未添加 visible 字段，请执行 supabase/schema.sql：', res.error.message);
                res = await db.from('bottles').select('id, nickname, content, type').order('id', { ascending: true });
            } else {
                supportsVisible = true;
            }

            const { data: commentsData, error: commentError } = await db.from('comments').select('bottle_id');

            if (res.error) console.warn('漂流瓶读取失败（请检查表结构与 RLS 策略）', res.error);
            if (commentError) console.warn('讨论数读取失败', commentError);

            bottlesData = res.data || [];
            if (commentsData) {
                commentsData.forEach(c => {
                    commentCounts[c.bottle_id] = (commentCounts[c.bottle_id] || 0) + 1;
                });
            }
        }
    } catch (err) {
        console.warn('数据加载失败，仅展示初始漂流瓶', err);
    }

    // 合并内置示例瓶的本地讨论数
    const localComments = readLocalComments();
    Object.keys(localComments).forEach(id => {
        commentCounts[id] = (commentCounts[id] || 0) + localComments[id].length;
    });

    await loadLikes();

    const publicFromDb = bottlesData.filter(b => b.visible !== false);
    const hiddenFromDb = bottlesData.filter(b => b.visible === false);

    renderWall([...fixedBottles, ...publicFromDb], commentCounts);
    renderHiddenSea([...fixedHiddenBottles, ...hiddenFromDb]);

    const totalComments = Object.values(commentCounts).reduce((a, b) => a + b, 0);
    const statBottles = document.getElementById('statBottles');
    const statComments = document.getElementById('statComments');
    if (statBottles) statBottles.textContent = fixedBottles.length + publicFromDb.length;
    if (statComments) statComments.textContent = totalComments;

    syncVisibilityOption();
}

// 旧库缺少 visible 字段时，禁用「漂在海面」并给出提示
function syncVisibilityOption() {
    const hiddenInput = document.getElementById('visHidden');
    const hint = document.getElementById('visHint');
    if (!hiddenInput) return;

    const available = supportsVisible !== false;
    hiddenInput.disabled = !available;
    if (hint) hint.style.display = available ? 'none' : 'block';

    if (!available) {
        const publicInput = document.getElementById('visPublic');
        if (publicInput) publicInput.checked = true;
    }
}

function renderWall(bottles, commentCounts) {
    const grid = document.getElementById('bottleGrid');
    grid.innerHTML = '';

    const addCard = document.createElement('button');
    addCard.type = 'button';
    addCard.className = 'add-card';
    addCard.innerHTML = `
        <span class="add-plus"><svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg></span>
        <span class="add-title">投递你的漂流瓶</span>
        <span class="add-sub">匿名写下困惑、红线探讨或导学故事</span>
    `;
    addCard.onclick = () => document.getElementById('postModal').classList.add('active');
    grid.appendChild(addCard);

    bottles.forEach((bottle, index) => {
        const count = commentCounts[bottle.id] || 0;
        const card = document.createElement('div');
        card.className = 'card type-' + (bottle.type || 'blue');
        card.style.animationDelay = Math.min(index * 55, 380) + 'ms';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.onclick = () => openCommentModal(bottle);
        card.onkeydown = e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openCommentModal(bottle);
            }
        };

        const meta = TYPE_META[bottle.type] || TYPE_META.blue;
        const nickname = (bottle.nickname || '匿名同学').trim();
        const initial = nickname.charAt(0) || '匿';

        card.innerHTML = `
            <div class="card-header">
                <div class="card-user">
                    <span class="avatar">${esc(initial)}</span>
                    <span class="user-name">${esc(nickname)}</span>
                </div>
                <div class="tag ${esc(bottle.type)}"><svg class="ico" aria-hidden="true"><use href="#${meta.icon}"/></svg>${meta.label}</div>
            </div>
            <div class="card-content">${esc(bottle.content)}</div>
            <div class="card-footer">
                <span class="meta"><svg class="ico" aria-hidden="true"><use href="#i-chat"/></svg>${count} 条讨论</span>
                <span class="card-actions">
                    <button type="button" class="like-btn" data-like-kind="bottle" data-like-id="${esc(bottle.id)}" aria-pressed="false" title="点赞">
                        <svg class="ico" aria-hidden="true"><use href="#i-heart"/></svg>
                        <span class="like-count">0</span>
                    </button>
                    <span class="meta-go">捞取讨论<svg class="ico" aria-hidden="true"><use href="#i-arrow"/></svg></span>
                </span>
            </div>
            <svg class="card-mark" aria-hidden="true"><use href="#i-bottle"/></svg>
        `;

        const likeBtn = card.querySelector('.like-btn');
        if (likeBtn) {
            likeBtn.onclick = e => toggleLike('bottle', bottle.id, e);
            likeBtn.onkeydown = e => e.stopPropagation();
        }

        grid.appendChild(card);
    });

    refreshLikeButtons(grid);

    const countEl = document.getElementById('bottleCount');
    if (countEl) countEl.textContent = bottles.length;
}

// 海上：未公开展示的漂流瓶
function renderHiddenSea(bottles) {
    const stage = document.getElementById('seaStage');
    if (!stage) return;
    stage.querySelectorAll('.sea-pick, .sea-empty').forEach(el => el.remove());

    hiddenBottlesCache = bottles;

    const countEl = document.getElementById('hiddenCount');
    if (countEl) countEl.textContent = bottles.length;

    if (!bottles.length) {
        stage.insertAdjacentHTML('beforeend', `
            <div class="sea-empty">
                <svg class="ico" aria-hidden="true"><use href="#i-wave"/></svg>
                海面上暂时空空的，投递时选择“漂在海面”就能藏下一只瓶子
            </div>
        `);
        return;
    }

    fillSeaStage(stage, bottles);
}

// 往海面容器里铺漂流瓶
function fillSeaStage(stage, bottles) {
    bottles.slice(0, 24).forEach((bottle, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sea-pick';
        btn.title = '捞起这只漂流瓶';
        btn.style.animationDelay = (index % 7) * 0.32 + 's';
        btn.style.animationDuration = (4 + (index % 3) * 0.7) + 's';
        btn.onclick = () => openRevealModal(bottle);

        const type = TYPE_META[bottle.type] ? bottle.type : 'blue';
        btn.innerHTML = `
            <svg viewBox="0 0 60 120" aria-hidden="true">
                <ellipse cx="30" cy="112" rx="13" ry="3" fill="#38C6E0" opacity="0.28"/>
                <g transform="rotate(-8 30 60)">
                    <rect x="23" y="8" width="14" height="9" rx="3" fill="#C8A96B"/>
                    <path d="M24 17h12v14c0 4 2 6 5 9 4 4 6 8 6 13v50c0 3-2 5-5 5H18c-3 0-5-2-5-5V53c0-5 2-9 6-13 3-3 5-5 5-9V17Z" fill="rgba(150,220,255,0.20)" stroke="#BFE9FF" stroke-opacity="0.8" stroke-width="1.6"/>
                    <rect x="18" y="58" width="24" height="34" rx="3" fill="#F7E8C2" opacity="0.92"/>
                    <path d="M22 66h16M22 74h16M22 82h10" stroke="#8A7750" stroke-opacity="0.5" stroke-width="1.2" stroke-linecap="round"/>
                </g>
            </svg>
            <i class="pick-dot ${type}"></i>
            <span class="pick-hint">捞起</span>
        `;
        stage.appendChild(btn);
    });
}

// 打开讨论弹窗
async function openCommentModal(bottle) {
    currentBottleId = String(bottle.id);

    document.getElementById('modalOriginalContent').innerText = `【${bottle.nickname}】${bottle.content}`;
    document.getElementById('commentModal').classList.add('active');

    await loadComments();
}

// 加载特定卡片的讨论
async function loadComments() {
    const list = document.getElementById('commentList');
    list.innerHTML = '<div class="empty-tip">加载中...</div>';

    let data = [];
    try {
        if (isLocalBottle(currentBottleId)) {
            data = (readLocalComments()[currentBottleId] || []).map((c, i) => ({
                ...c,
                id: c.id || ('local-' + i)
            }));
        } else if (db) {
            const res = await db.from('comments').select('*').eq('bottle_id', currentBottleId).order('id', { ascending: true });
            if (res.error) console.warn('讨论加载失败', res.error);
            data = res.data || [];
        }
    } catch (err) {
        console.warn('讨论加载失败', err);
    }

    list.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(c => {
            const name = (c.nickname || '匿名同学').trim();
            const initial = name.charAt(0) || '匿';
            list.innerHTML += `
                <div class="comment-item">
                    <span class="avatar">${esc(initial)}</span>
                    <div class="comment-main">
                        <div class="comment-user">${esc(name)}</div>
                        <div class="comment-text">${esc(c.content)}</div>
                    </div>
                    <button type="button" class="like-btn comment-like" data-like-kind="comment" data-like-id="${esc(c.id)}" aria-pressed="false" title="点赞">
                        <svg class="ico" aria-hidden="true"><use href="#i-heart"/></svg>
                        <span class="like-count">0</span>
                    </button>
                </div>
            `;
        });
        list.querySelectorAll('.like-btn').forEach(btn => {
            btn.onclick = e => toggleLike('comment', btn.dataset.likeId, e);
        });
        refreshLikeButtons(list);
        list.scrollTop = list.scrollHeight;
    } else {
        list.innerHTML = '<div class="empty-tip"><svg class="ico" aria-hidden="true"><use href="#i-chat"/></svg>还没有讨论，快来抢沙发！</div>';
    }
}

// 提交讨论
async function submitComment() {
    const nickname = document.getElementById('commentNickname').value.trim() || '匿名同学';
    const content = document.getElementById('commentContent').value.trim();
    const btn = document.getElementById('commentBtn');
    const label = btn.querySelector('.btn-label');

    if (!content) { alert('请填写讨论内容！'); return; }
    if (!validateText(nickname) || !validateText(content)) return;

    // 内置示例瓶：讨论保存在本地，无需数据库
    if (isLocalBottle(currentBottleId)) {
        addLocalComment(currentBottleId, nickname, content);
        document.getElementById('commentContent').value = '';
        await loadComments();
        loadBottles();
        return;
    }

    if (!db) { alert('当前为离线预览状态，暂时无法发送讨论。'); return; }

    label.innerText = '发送中...';
    btn.disabled = true;

    const { error } = await db.from('comments').insert([{
        bottle_id: currentBottleId,
        nickname: nickname,
        content: content
    }]);

    if (error) {
        alert('发送失败，请重试');
    } else {
        document.getElementById('commentContent').value = '';
        await loadComments();
        loadBottles();
    }

    label.innerText = '发送讨论';
    btn.disabled = false;
}

function closeCommentModal() {
    document.getElementById('commentModal').classList.remove('active');
}

// 捞起海面上的漂流瓶
function openRevealModal(bottle) {
    currentRevealBottle = bottle;
    closeSeaModal();
    const type = TYPE_META[bottle.type] ? bottle.type : 'blue';
    const meta = TYPE_META[type];

    const tag = document.getElementById('revealTag');
    tag.className = 'tag ' + type;
    tag.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#${meta.icon}"/></svg>${meta.label}`;
    document.getElementById('revealText').textContent = bottle.content;
    document.getElementById('revealMeta').textContent = `投递者 · ${bottle.nickname || '匿名同学'}`;
    document.getElementById('revealModal').classList.add('active');
}

function closeReveal() {
    document.getElementById('revealModal').classList.remove('active');
}

function joinRevealDiscussion() {
    const bottle = currentRevealBottle;
    closeReveal();
    if (bottle) openCommentModal(bottle);
}

// 首屏「捞一个漂流瓶」：先打开海面，再由用户挑选一只捞起
function openSeaModal() {
    const stage = document.getElementById('modalSeaStage');
    if (!stage) return;
    stage.querySelectorAll('.sea-pick, .sea-empty').forEach(el => el.remove());

    const note = document.getElementById('modalSeaNote');
    if (!hiddenBottlesCache.length) {
        stage.insertAdjacentHTML('beforeend', `
            <div class="sea-empty">
                <svg class="ico" aria-hidden="true"><use href="#i-wave"/></svg>
                海面上暂时空空的，投递时选择“漂在海面”就能藏下一只瓶子
            </div>
        `);
        if (note) note.textContent = '海面上暂时没有待捞的漂流瓶';
    } else {
        fillSeaStage(stage, hiddenBottlesCache);
        if (note) note.textContent = `海面上漂着 ${hiddenBottlesCache.length} 只瓶子 · 点击任意一只捞起`;
    }

    document.getElementById('seaModal').classList.add('active');
}

function closeSeaModal() {
    document.getElementById('seaModal').classList.remove('active');
}

// 投递新漂流瓶
async function submitPost() {
    const nickname = document.getElementById('postNickname').value.trim() || '匿名用户';
    const content = document.getElementById('postContent').value.trim();
    const type = document.getElementById('postType').value;
    const visibleInput = document.querySelector('input[name="postVisible"]:checked');
    const visible = visibleInput ? visibleInput.value === 'true' : true;
    const btn = document.getElementById('submitBtn');
    const label = btn.querySelector('.btn-label');

    if (!content) { alert('请填写漂流瓶内容！'); return; }
    if (!validateText(nickname) || !validateText(content)) return;
    if (!db) { alert('当前为离线预览状态，暂时无法投递漂流瓶。'); return; }

    // 旧库没有 visible 字段时，明确拦截“漂在海面”，避免悄悄变成公开
    if (!visible && supportsVisible === false) {
        alert('当前数据库尚未启用“隐藏漂流瓶”能力。\n请在 Supabase SQL Editor 执行 supabase/schema.sql 后重试。');
        return;
    }

    label.innerText = '正在抛入海中...';
    btn.disabled = true;

    const payload = { nickname, content, type };
    if (supportsVisible !== false) payload.visible = visible;

    const { error } = await db.from('bottles').insert([payload]);

    if (error) {
        alert('网络波动，投递失败，请重试');
        console.error(error);
    } else {
        document.getElementById('postNickname').value = '';
        document.getElementById('postContent').value = '';
        const publicRadio = document.getElementById('visPublic');
        if (publicRadio) publicRadio.checked = true;
        document.getElementById('postModal').classList.remove('active');
        loadBottles();
    }

    label.innerText = '抛入海中';
    btn.disabled = false;
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeCommentModal();
        closeReveal();
        closeSeaModal();
        document.getElementById('postModal').classList.remove('active');
    }
});

// 科技动态波浪 / 粒子模块
(function initWaveCanvas() {
    const canvas = document.getElementById('waveCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dots = Array.from({ length: 26 }, () => ({
        x: Math.random() * W,
        y: 24 + Math.random() * (H - 44),
        r: Math.random() * 1.6 + 0.6,
        s: Math.random() * 0.42 + 0.12,
        o: Math.random() * 0.45 + 0.2
    }));
    let t = 0;

    function frame() {
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            const amp = 7 + i * 5, freq = 0.018 + i * 0.005, base = H * 0.60 + i * 17;
            for (let x = 0; x <= W; x += 4) {
                const y = base + Math.sin(x * freq + t * (0.8 + i * 0.22)) * amp + Math.sin(x * freq * 2.3 - t * 0.55) * 3;
                if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = i === 0 ? 'rgba(255,255,255,0.78)' : i === 1 ? 'rgba(214,248,255,0.55)' : 'rgba(255,240,205,0.45)';
            ctx.lineWidth = i === 0 ? 1.6 : 1;
            ctx.stroke();
        }
        dots.forEach(d => {
            d.y -= d.s;
            if (d.y < 18) { d.y = H - 16; d.x = Math.random() * W; }
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,' + d.o + ')';
            ctx.fill();
        });
        t += 0.02;
        if (!reduce) requestAnimationFrame(frame);
    }
    frame();
})();

loadBottles();
