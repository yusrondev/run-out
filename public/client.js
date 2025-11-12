const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let activeSkills = [];
const skillDuration = 300; // ms
const skillRadius = 80;
const skillDamage = 30;
const skillCooldown = 400;
let lastSkillTime = 0;

let doubleSpeedActive = false;
const doubleSpeedDuration = 1000;
let doubleSpeedEndTime = 0;
const doubleSpeedMultiplier = 2;
const speedCooldown = 5000; // 5 detik
let lastSpeedTime = 0;

let shieldActive = false;
const shieldDuration = 3000; // 3 detik
let shieldEndTime = 0;
const shieldCooldown = 5000; // 5 detik
let lastShieldTime = 0;

let trails = {}; // key = player id, value = array posisi
const trailLength = 10; // jumlah titik jejak maksimal

// Energy untuk attacker
const maxEnergy = 100;
const energyCost = 20;
let energy = maxEnergy;

let gameTimeLeft = 30; // detik
let gameTimerActive = false;

// Pickup
let pickups = [];
const pickupRadius = 20; // ukuran lingkaran pickup

const WORLD_WIDTH = 1800;
const WORLD_HEIGHT = 1000;

const backgroundImg = new Image();
backgroundImg.src = "/assets/bg-black.avif";

const minimapCanvas = document.getElementById("minimapCanvas");
const minimapCtx = minimapCanvas.getContext("2d");

const MINIMAP_WIDTH = minimapCanvas.width;
const MINIMAP_HEIGHT = minimapCanvas.height;

let players = {};
let localPlayer = {
  x: 100,
  y: 100,
  color: "#ff0000",
  speed: 5,
  hp: 100,
  maxHp: 100,
  role: "defender",
};
let moveVector = { x: 0, y: 0 };
let keys = {};

// Obstacles
const obstacles = [
  //   { x: 100, y: 100, width: 80, height: 80 },
  //   { x: 300, y: 200, width: 120, height: 60 },
  //   { x: 500, y: 400, width: 100, height: 100 },
];

let camera = {
  x: 0,
  y: 0,
  zoom: 1.9,
};

const slashImg = new Image();
slashImg.src = "/assets/slash.png";

// ==================== PILIH ROLE ====================
document
  .getElementById("roleAttacker")
  .addEventListener("click", () => startGame("attacker"));
document
  .getElementById("roleDefender")
  .addEventListener("click", () => startGame("defender"));

function updateUIButtons() {
  // Skill hanya untuk attacker
  if (localPlayer.role === "attacker") {
    skillBtn.style.display = "flex";
  } else {
    skillBtn.style.display = "none";
  }

  // Shield hanya untuk defender
  if (localPlayer.role === "defender") {
    shieldBtn.style.display = "block";
  } else {
    shieldBtn.style.display = "none";
  }
}

function startGame(role) {
  const nameInput = document.getElementById("playerName").value.trim();
  const playerName = nameInput !== "" ? nameInput : role; // default jika kosong

  localPlayer.role = role;
  localPlayer.name = playerName; // simpan nama lokal
  socket.emit("setRole", { role, name: playerName }); // kirim ke server

  // hide lobby
  document.getElementById("lobby").style.display = "none";

  // show game UI
  document.getElementById("gameUI").style.display = "block";

  updateUIButtons(); // update tombol sesuai role

  if (document.documentElement.requestFullscreen)
    document.documentElement.requestFullscreen();
  else if (document.documentElement.webkitRequestFullscreen)
    document.documentElement.webkitRequestFullscreen();

  gameLoop();
}

const speedBtn = document.getElementById("speedBtn");
speedBtn.addEventListener("pointerdown", () => {
  const now = Date.now();

  // cek cooldown
  if (now - lastSpeedTime < speedCooldown) return;

  doubleSpeedActive = true;
  doubleSpeedEndTime = now + doubleSpeedDuration;

  lastSpeedTime = now;
  socket.emit("activateDoubleSpeed", { duration: doubleSpeedDuration });
});

const shieldBtn = document.getElementById("shieldBtn");
document.getElementById("shieldBtn").addEventListener("pointerdown", () => {
  const now = Date.now();
  if (localPlayer.role !== "defender") return;
  if (now - lastShieldTime < shieldCooldown) return;
  shieldActive = true;
  shieldEndTime = now + shieldDuration;
  lastShieldTime = now;
  socket.emit("activateShield", { duration: shieldDuration });
});

// ==================== RESIZE CANVAS ====================
function resizeCanvas() {
  canvas.width = WORLD_WIDTH;
  canvas.height = WORLD_HEIGHT;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ==================== INPUT KEYBOARD ====================
document.addEventListener("keydown", (e) => (keys[e.key] = true));
document.addEventListener("keyup", (e) => (keys[e.key] = false));

// ==================== NIPPLE.JS JOYSTICK ====================
const joystick = nipplejs.create({
  zone: document.getElementById("joystick-container"),
  mode: "static",
  position: { left: "50%", top: "50%" },
  color: "#d1d8e085",
  size: 120,
  multitouch: true,
  catchMouseEvents: false,
});

joystick.on("move", (evt, data) => {
  if (data && data.vector) {
    moveVector.x = data.vector.x;
    moveVector.y = data.vector.y;
  }
});
joystick.on("end", () => {
  moveVector.x = 0;
  moveVector.y = 0;
});

// ==================== SKILL ====================
const skillBtn = document.getElementById("skillBtn");
skillBtn.addEventListener("pointerdown", () => {
  const now = Date.now();
  if (now - lastSkillTime < skillCooldown) return;
  if (localPlayer.role === "attacker" && energy < energyCost) return;

  lastSkillTime = now;
  socket.emit("useSkill", {
    x: localPlayer.x + 15,
    y: localPlayer.y + 15,
    radius: skillRadius,
    damage: skillDamage,
  });

  if (localPlayer.role === "attacker") {
    energy -= energyCost;
    players[socket.id].energy = energy;
  }
});

// updateSkillButton tetap ada, tapi hanya aktif jika role attacker
function updateSkillButton() {
  if (localPlayer.role !== "attacker") return;

  const now = Date.now();
  const remaining = skillCooldown - (now - lastSkillTime);

  if (remaining > 0 || energy < energyCost) {
    skillBtn.disabled = true;
    skillBtn.innerHTML =
      energy < energyCost
        ? "<img src='/assets/broken-sword.png'>"
        : `${Math.ceil(remaining / 1000)}s`;
    skillBtn.style.opacity = 0.5;
  } else {
    skillBtn.disabled = false;
    skillBtn.innerHTML = "<img src='/assets/sword.png'>";
    skillBtn.style.opacity = 1;
  }
}

function updateSpeedButton() {
  const now = Date.now();
  const remaining = speedCooldown - (now - lastSpeedTime);

  if (remaining > 0) {
    speedBtn.disabled = true;
    speedBtn.style.opacity = 0.5;
    speedBtn.innerHTML = `${Math.ceil(remaining / 1000)}s`;
  } else {
    speedBtn.disabled = false;
    speedBtn.style.opacity = 1;
    speedBtn.innerHTML = "<img src='/assets/speed.png'>";
  }
}

function updateShieldButton() {
  if (localPlayer.role !== "defender") return;

  const now = Date.now();
  const remaining = shieldCooldown - (now - lastShieldTime);

  if (remaining > 0) {
    shieldBtn.disabled = true;
    shieldBtn.style.opacity = 0.5;
    shieldBtn.innerHTML = `${Math.ceil(remaining / 1000)}s`;
  } else {
    shieldBtn.disabled = false;
    shieldBtn.style.opacity = 1;
    shieldBtn.innerHTML = "<img src='/assets/shield.png'>";
  }
}

// ==================== HANDLE PICKUPS ====================
function handlePickups() {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dx = localPlayer.x + 15 - p.x;
    const dy = localPlayer.y + 15 - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= pickupRadius + 15) {
      socket.emit("pickupCollected", p.id);
    }
  }
}

// ==================== SOCKET EVENTS ====================
socket.on("currentPlayers", (data) => {
  players = data;
  if (players[socket.id]) {
    const p = players[socket.id];
    localPlayer.color = p.color;
    localPlayer.x = p.x;
    localPlayer.y = p.y;
    localPlayer.hp = p.hp;
    localPlayer.maxHp = p.maxHp;
    players[socket.id] = localPlayer;
    if (localPlayer.role === "attacker") {
      players[socket.id].energy = energy;
    }
  }
});

socket.on("startCountdown", (data) => {
  gameTimeLeft = data.timeLeft;
  gameTimerActive = true;
});

socket.on("updateCountdown", (data) => {
  gameTimeLeft = data.timeLeft;
});

socket.on("gameOver", (data) => {
  const gameOverScreen = document.getElementById("gameOverScreen");
  const gameOverMessage = document.getElementById("gameOverMessage");

  if (data.winner === "attacker") {
    gameOverMessage.innerText = "Attacker menang!";
  } else {
    gameOverMessage.innerText = "Attacker kalah! Defender bertahan 30 detik!";
  }

  gameOverScreen.style.display = "flex";

  const restartBtn = document.getElementById("restartBtn");
  restartBtn.onclick = () => {
    window.location.reload();
  };
});

socket.on("shieldActivated", (data) => {
  if (players[data.id]) {
    players[data.id].shield = true;
    setTimeout(() => {
      if (players[data.id]) players[data.id].shield = false;
    }, data.duration);
  }
});

socket.on("doubleSpeedActivated", (data) => {
  if (players[data.id]) {
    players[data.id].doubleSpeed = true;
    if (!trails[data.id]) trails[data.id] = [];
  }
});

socket.on("doubleSpeedDeactivated", (data) => {
  if (players[data.id]) {
    players[data.id].doubleSpeed = false;
    if (trails[data.id]) trails[data.id] = [];
  }
});

socket.on("playerEnergyUpdated", (data) => {
  if (players[data.id]) {
    players[data.id].energy = data.energy;
    if (data.id === socket.id) energy = data.energy;
  }
});

socket.on("newPlayer", (data) => {
  players[data.id] = {
    x: data.x,
    y: data.y,
    color: data.color,
    hp: data.hp,
    maxHp: data.maxHp,
    role: data.role,
  };
});
socket.on("playerDisconnected", (id) => delete players[id]);

socket.on("playerMoved", (data) => {
  if (players[data.id] && data.id !== socket.id) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
    players[data.id].hp = data.hp;
  }
});

socket.on("roleUpdated", (data) => {
  if (players[data.newAttackerId])
    players[data.newAttackerId].role = "attacker";
  if (players[data.newDefenderId])
    players[data.newDefenderId].role = "defender";
});

socket.on("hitBySkill", (data) => {
  if (!shieldActive) {
    localPlayer.hp = data.hp;
  }
});

socket.on("skillEffect", (data) => {
  activeSkills.push({
    x: data.x,
    y: data.y,
    radius: skillRadius,
    startTime: Date.now(),
  });
});

// ==================== PICKUPS SYNC ====================
socket.on("currentPickups", (data) => {
  pickups = data;
});

socket.on("pickupSpawned", (pickup) => {
  pickups.push(pickup);
});

socket.on("pickupRemoved", (pickupId) => {
  pickups = pickups.filter((p) => p.id !== pickupId);
});

// ==================== COLLISION ====================
function checkCollision(playerA, playerB) {
  return (
    playerA.x < playerB.x + 30 &&
    playerA.x + 30 > playerB.x &&
    playerA.y < playerB.y + 30 &&
    playerA.y + 30 > playerB.y
  );
}

let lastDamageTime = 0;
function handleCollisions() {
  const now = Date.now();
  for (let id in players) {
    if (id === socket.id) continue;
    const other = players[id];
    if (checkCollision(localPlayer, other)) {
      if (
        localPlayer.role === "attacker" &&
        other.role === "defender" &&
        now - lastDamageTime > 100 &&
        !other.shield // kalau shield aktif, tidak kena hit
      ) {
        socket.emit("damage", { targetId: id, amount: 0.5 });
        lastDamageTime = now;
      }
    }
  }
}

// ==================== UPDATE ====================
// ==================== UPDATE ====================
function update() {
  // update posisi localPlayer
  let vx = 0,
    vy = 0;
  if (keys["ArrowUp"] || keys["w"]) vy = -1;
  else if (keys["ArrowDown"] || keys["s"]) vy = 1;
  if (keys["ArrowLeft"] || keys["a"]) vx = -1;
  else if (keys["ArrowRight"] || keys["d"]) vx = 1;

  if (vx === 0) vx = moveVector.x;
  if (vy === 0) vy = moveVector.y;

  let speed = localPlayer.speed;
  if (doubleSpeedActive) speed *= doubleSpeedMultiplier;

  let nextX = localPlayer.x + vx * speed;
  let nextY = localPlayer.y - vy * speed;

  if (doubleSpeedActive && Date.now() > doubleSpeedEndTime) {
    doubleSpeedActive = false;
  }

  if (shieldActive && Date.now() > shieldEndTime) shieldActive = false;

  if (
    nextX >= 0 &&
    nextX <= canvas.width - 30 &&
    !isCollidingWithObstacle(nextX, localPlayer.y)
  ) {
    localPlayer.x = nextX;
  }
  if (
    nextY >= 0 &&
    nextY <= canvas.height - 30 &&
    !isCollidingWithObstacle(localPlayer.x, nextY)
  ) {
    localPlayer.y = nextY;
  }

  // Update trails untuk semua pemain yang doubleSpeed
  for (let id in players) {
    if (!trails[id]) trails[id] = [];
    trails[id].push({ x: players[id].x + 15, y: players[id].y + 15 });
    if (trails[id].length > trailLength) trails[id].shift();
  }

  handlePickups();
  handleCollisions();
  socket.emit("move", {
    x: localPlayer.x,
    y: localPlayer.y,
    hp: localPlayer.hp,
  });
}

// ==================== DRAW ====================
function drawPickups() {
  pickups.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, pickupRadius, 0, Math.PI * 2);
    ctx.fillStyle = p.type === "energy" ? "blue" : "green";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  });
}

function drawMinimap() {
  minimapCtx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

  // Hitung skala map -> minimap
  const scaleX = MINIMAP_WIDTH / WORLD_WIDTH;
  const scaleY = MINIMAP_HEIGHT / WORLD_HEIGHT;

  // Gambar pickup
  pickups.forEach((p) => {
    minimapCtx.beginPath();
    minimapCtx.arc(p.x * scaleX, p.y * scaleY, 3, 0, Math.PI * 2);
    minimapCtx.fillStyle = p.type === "energy" ? "blue" : "green";
    minimapCtx.fill();
  });

  // Gambar pemain
  for (let id in players) {
    const p = players[id];
    minimapCtx.fillStyle = p.role === "attacker" ? "#ff0000" : "#00aaff";
    minimapCtx.fillRect(p.x * scaleX - 2, p.y * scaleY - 2, 4, 4);

    // Tanda pemain lokal
    if (id === socket.id) {
      minimapCtx.strokeStyle = "#fff";
      minimapCtx.beginPath();
      minimapCtx.arc(p.x * scaleX, p.y * scaleY, 4, 0, Math.PI * 2);
      minimapCtx.stroke();
    }
  }
}

function drawSkillAreas() {
  const now = Date.now();
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  for (let i = activeSkills.length - 1; i >= 0; i--) {
    const skill = activeSkills[i];
    const elapsed = now - skill.startTime;
    if (elapsed > skillDuration) {
      activeSkills.splice(i, 1);
      continue;
    }

    const blinkSpeed = 5;
    const alpha = Math.abs(
      Math.sin((elapsed / skillDuration) * Math.PI * blinkSpeed)
    );
    ctx.globalAlpha = alpha;

    const size = skill.radius * 2;
    ctx.drawImage(
      slashImg,
      skill.x - skill.radius,
      skill.y - skill.radius,
      size,
      size
    );
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawMap() {
  if (backgroundImg.complete) {
    ctx.drawImage(backgroundImg, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  } else {
    ctx.fillStyle = "#99cc99";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  ctx.fillStyle = "#666666";
  obstacles.forEach((ob) => ctx.fillRect(ob.x, ob.y, ob.width, ob.height));
}

function draw() {
  ctx.save();

  camera.x = localPlayer.x - WORLD_WIDTH / (2 * camera.zoom);
  camera.y = localPlayer.y - WORLD_HEIGHT / (2 * camera.zoom);

  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  ctx.clearRect(
    camera.x,
    camera.y,
    canvas.width / camera.zoom,
    canvas.height / camera.zoom
  );

  drawMap();
  drawPickups();

  for (let id in players) {
    const p = players[id];

    if (p.doubleSpeed) {
      ctx.filter = "blur(4px)"; // efek blur
    } else {
      ctx.filter = "none";
    }

    if (p.doubleSpeed && trails[id]) {
      ctx.filter = "blur(4px)";
      for (let i = 0; i < trails[id].length; i++) {
        const t = trails[id][i];
        const alpha = (i + 1) / trails[id].length;
        ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`; // kuning
        ctx.beginPath();
        ctx.arc(t.x, t.y, 15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.filter = "none";
    }

    ctx.fillStyle = p.role === "attacker" ? "#ff0000" : "#00aaff";
    ctx.fillRect(p.x, p.y, 30, 30);

    const barWidth = 30;
    const barHeight = 5;

    if (p.role === "defender") {
      const hpPercent = p.hp / p.maxHp;
      ctx.fillStyle = "red";
      ctx.fillRect(p.x, p.y - 8, barWidth, barHeight);
      ctx.fillStyle = "green";
      ctx.fillRect(p.x, p.y - 8, barWidth * hpPercent, barHeight);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(p.x, p.y - 8, barWidth, barHeight);
    } else {
      const energyPercent = p.energy !== undefined ? p.energy / maxEnergy : 1;
      ctx.fillStyle = "lightgray";
      ctx.fillRect(p.x, p.y - 8, barWidth, barHeight);
      ctx.fillStyle = "blue";
      ctx.fillRect(p.x, p.y - 8, barWidth * energyPercent, barHeight);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(p.x, p.y - 8, barWidth, barHeight);
    }

    if (p.shield) {
      ctx.beginPath();
      ctx.arc(p.x + 15, p.y + 15, 25, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 255, 255, 0.3)"; // lingkaran biru transparan
      ctx.fill();
      ctx.strokeStyle = "cyan";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(p.name || p.role, p.x + 15, p.y - 15);
  }

  if (gameTimerActive) {
    ctx.save();
    ctx.resetTransform(); // agar tidak terpengaruh camera zoom/translate
    ctx.fillStyle = "#ffffff";
    ctx.font = "30px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`Time Left: ${gameTimeLeft}s`, canvas.width / 2, 50);
    ctx.restore();
  }

  ctx.restore();
}

function isCollidingWithObstacle(x, y, width = 30, height = 30) {
  return obstacles.some(
    (ob) =>
      x < ob.x + ob.width &&
      x + width > ob.x &&
      y < ob.y + ob.height &&
      y + height > ob.y
  );
}

// ==================== GAME LOOP ====================
function gameLoop() {
  update();
  draw();
  drawSkillAreas();
  updateSkillButton(); // skill
  updateSpeedButton(); // speed
  updateShieldButton();
  drawMinimap();
  requestAnimationFrame(gameLoop);
}
