const SUPABASE_URL = 'https://usugfffkqdhmwvcvjmrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_A0EEq3mPFe1QsOP7nog2Iw_lOAJWWmU';
const db = (typeof supabase !== 'undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// 违禁词词库：命中任意一个即禁止发布
const BANNED_WORDS = [
    '代写', '代发', '代考', '枪手', '包过', '刷单', '博彩', '赌博', '网赌',
    '色情', '黄片', '约炮', '卖淫', '嫖娼', '毒品', '冰毒', '摇头丸',
    '傻逼', '操你', '尼玛', '去死', '贱人', '弱智', '脑残'
];

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
    return true;
}

// 页面加载时拉取数据
async function loadBottles() {
    let bottlesData = [];
    const commentCounts = {};

    try {
        if (db) {
            const { data } = await db.from('bottles').select('*').order('id', { ascending: true });
            const { data: commentsData } = await db.from('comments').select('bottle_id');

            bottlesData = data || [];
            if (commentsData) {
                commentsData.forEach(c => {
                    commentCounts[c.bottle_id] = (commentCounts[c.bottle_id] || 0) + 1;
                });
            }
        }
    } catch (err) {
        console.warn('数据加载失败，仅展示初始漂流瓶', err);
    }

    const publicFromDb = bottlesData.filter(b => b.visible !== false);
    const hiddenFromDb = bottlesData.filter(b => b.visible === false);

    renderWall([...fixedBottles, ...publicFromDb], commentCounts);
    renderHiddenSea([...fixedHiddenBottles, ...hiddenFromDb]);

    const totalComments = Object.values(commentCounts).reduce((a, b) => a + b, 0);
    const statBottles = document.getElementById('statBottles');
    const statComments = document.getElementById('statComments');
    if (statBottles) statBottles.textContent = fixedBottles.length + publicFromDb.length;
    if (statComments) statComments.textContent = totalComments;
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
        card.onclick = () => openCommentModal(bottle);

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
                <span class="meta-go">捞取讨论<svg class="ico" aria-hidden="true"><use href="#i-arrow"/></svg></span>
            </div>
            <svg class="card-mark" aria-hidden="true"><use href="#i-bottle"/></svg>
        `;
        grid.appendChild(card);
    });

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
        if (db) {
            const res = await db.from('comments').select('*').eq('bottle_id', currentBottleId).order('id', { ascending: true });
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
                </div>
            `;
        });
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

    label.innerText = '正在抛入海中...';
    btn.disabled = true;

    let result = await db.from('bottles').insert([{ nickname, content, type, visible }]);

    // 兼容尚未添加 visible 字段的旧数据库
    if (result.error) {
        const msg = (result.error.message || '').toLowerCase();
        if (msg.includes('visible') || msg.includes('column') || msg.includes('schema')) {
            const retry = await db.from('bottles').insert([{ nickname, content, type }]);
            if (!retry.error) {
                result = { error: null };
                alert('数据库尚未添加 visible 字段，本次已按“公开展示”发布。请执行 supabase/schema.sql 启用海底漂流。');
            } else {
                result = retry;
            }
        }
    }

    if (result.error) {
        alert('网络波动，投递失败，请重试');
        console.error(result.error);
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
