const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let activeSkills = [];
const skillDuration = 300; // ms
const skillRadius = 80;
const skillDamage = 30;
const skillCooldown = 5000; // 5 detik
let lastSkillTime = 0;

// Energy untuk attacker
const maxEnergy = 100;
const energyCost = 20;
let energy = maxEnergy;

let players = {};
let localPlayer = {
    x: 100, y: 100, color: '#ff0000', speed: 5,
    hp: 100, maxHp: 100, role: 'defender'
};
let moveVector = { x: 0, y: 0 };
let keys = {};

// ==================== PILIH ROLE ====================
document.getElementById('roleAttacker').addEventListener('click', () => startGame('attacker'));
document.getElementById('roleDefender').addEventListener('click', () => startGame('defender'));

function startGame(role) {
    localPlayer.role = role;
    socket.emit('setRole', { role });
    document.getElementById('roleAttacker').style.display = 'none';
    document.getElementById('roleDefender').style.display = 'none';

    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();

    gameLoop();
}

// ==================== RESIZE CANVAS ====================
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==================== INPUT KEYBOARD ====================
document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup', e => keys[e.key] = false);

// ==================== NIPPLE.JS JOYSTICK ====================
const joystick = nipplejs.create({
    zone: document.getElementById('joystick-container'),
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'blue',
    size: 120,
    multitouch: true,
    catchMouseEvents: false
});

joystick.on('move', (evt, data) => {
    if (data && data.vector) {
        moveVector.x = data.vector.x;
        moveVector.y = data.vector.y;
    }
});
joystick.on('end', () => {
    moveVector.x = 0;
    moveVector.y = 0;
});

// ==================== SKILL DAMAGE ====================
const skillBtn = document.getElementById('skillBtn');
skillBtn.addEventListener('pointerdown', () => {
    const now = Date.now();
    if (now - lastSkillTime < skillCooldown) return;
    if (localPlayer.role === 'attacker' && energy < energyCost) return;

    lastSkillTime = now;
    if (localPlayer.role === 'attacker') energy -= energyCost;

    const skillData = {
        x: localPlayer.x + 15,
        y: localPlayer.y + 15,
        radius: skillRadius,
        damage: skillDamage,
        startTime: now
    };
    activeSkills.push(skillData);
    socket.emit('useSkill', skillData);
});

function updateSkillButton() {
    if (localPlayer.role !== 'attacker') {
        skillBtn.style.display = 'none';
        return;
    }
    skillBtn.style.display = 'block';

    const now = Date.now();
    const remaining = skillCooldown - (now - lastSkillTime);

    if (remaining > 0 || energy < energyCost) {
        skillBtn.disabled = true;
        skillBtn.textContent = energy < energyCost ? 'NO ENERGY' : `${Math.ceil(remaining / 1000)}s`;
        skillBtn.style.opacity = 0.5;
    } else {
        skillBtn.disabled = false;
        skillBtn.textContent = 'SKILL';
        skillBtn.style.opacity = 1;
    }
}

// ==================== SOCKET EVENTS ====================
socket.on('currentPlayers', data => {
    players = data;
    if (players[socket.id]) {
        const p = players[socket.id];
        localPlayer.color = p.color;
        localPlayer.x = p.x;
        localPlayer.y = p.y;
        localPlayer.hp = p.hp;
        localPlayer.maxHp = p.maxHp;
        players[socket.id] = localPlayer;
    }
});

socket.on('newPlayer', data => {
    players[data.id] = { x: data.x, y: data.y, color: data.color, hp: data.hp, maxHp: data.maxHp, role: data.role };
});
socket.on('playerDisconnected', id => delete players[id]);
socket.on('playerMoved', data => {
    if (players[data.id] && data.id !== socket.id) {
        players[data.id].x = data.x;
        players[data.id].y = data.y;
        players[data.id].hp = data.hp;
    }
});
socket.on('roleUpdated', data => {
    if (players[data.newAttackerId]) players[data.newAttackerId].role = 'attacker';
    if (players[data.newDefenderId]) players[data.newDefenderId].role = 'defender';
});
socket.on('hitBySkill', data => { localPlayer.hp = data.hp; });

// ==================== COLLISION DETECTION ====================
function checkCollision(playerA, playerB) {
    return playerA.x < playerB.x + 30 &&
           playerA.x + 30 > playerB.x &&
           playerA.y < playerB.y + 30 &&
           playerA.y + 30 > playerB.y;
}

let lastDamageTime = 0;
function handleCollisions() {
    const now = Date.now();
    for (let id in players) {
        if (id === socket.id) continue;
        const other = players[id];
        if (checkCollision(localPlayer, other)) {
            if (localPlayer.role === 'defender' && now - lastDamageTime > 100) {
                localPlayer.hp -= 0.5;
                localPlayer.hp = Math.max(0, localPlayer.hp);
                lastDamageTime = now;
                socket.emit('move', { x: localPlayer.x, y: localPlayer.y, hp: localPlayer.hp });
            }
            if (localPlayer.role === 'attacker' && other.role === 'defender' && now - lastDamageTime > 100) {
                socket.emit('damage', { targetId: id, amount: 0.5 });
                lastDamageTime = now;
            }
        }
    }
}

// ==================== UPDATE ====================
function update() {
    let vx = 0, vy = 0;
    if (keys['ArrowUp'] || keys['w']) vy = -1;
    else if (keys['ArrowDown'] || keys['s']) vy = 1;
    if (keys['ArrowLeft'] || keys['a']) vx = -1;
    else if (keys['ArrowRight'] || keys['d']) vx = 1;

    if (vx === 0) vx = moveVector.x;
    if (vy === 0) vy = moveVector.y;

    localPlayer.x += vx * localPlayer.speed;
    localPlayer.y -= vy * localPlayer.speed;

    localPlayer.x = Math.max(0, Math.min(localPlayer.x, canvas.width - 30));
    localPlayer.y = Math.max(0, Math.min(localPlayer.y, canvas.height - 30));

    handleCollisions();
    socket.emit('move', { x: localPlayer.x, y: localPlayer.y, hp: localPlayer.hp });
}

// ==================== DRAW ====================
function drawSkillAreas() {
    const now = Date.now();
    for (let i = activeSkills.length - 1; i >= 0; i--) {
        const skill = activeSkills[i];
        const elapsed = now - skill.startTime;
        if (elapsed > skillDuration) {
            activeSkills.splice(i, 1);
            continue;
        }
        const alpha = 1 - elapsed / skillDuration;
        ctx.fillStyle = `rgba(255, 255, 0, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(skill.x, skill.y, skill.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let id in players) {
        const p = players[id];
        ctx.fillStyle = p.role === 'attacker' ? '#ff0000' : '#00aaff';
        ctx.fillRect(p.x, p.y, 30, 30);

        const barWidth = 30;
        const barHeight = 5;

        if (p.role === 'defender') {
            const hpPercent = p.hp / p.maxHp;
            ctx.fillStyle = 'red';
            ctx.fillRect(p.x, p.y - 8, barWidth, barHeight);
            ctx.fillStyle = 'green';
            ctx.fillRect(p.x, p.y - 8, barWidth * hpPercent, barHeight);
            ctx.strokeStyle = '#000';
            ctx.strokeRect(p.x, p.y - 8, barWidth, barHeight);
        } else {
            const energyPercent = energy / maxEnergy;
            ctx.fillStyle = 'lightgray';
            ctx.fillRect(p.x, p.y - 8, barWidth, barHeight);
            ctx.fillStyle = 'blue';
            ctx.fillRect(p.x, p.y - 8, barWidth * energyPercent, barHeight);
            ctx.strokeStyle = '#000';
            ctx.strokeRect(p.x, p.y - 8, barWidth, barHeight);
        }

        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.role ? p.role.toUpperCase() : '', p.x + 15, p.y - 15);
    }
}

// ==================== GAME LOOP ====================
function gameLoop() {
    update();
    draw();
    drawSkillAreas();
    updateSkillButton();
    requestAnimationFrame(gameLoop);
}
