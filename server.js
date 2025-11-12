const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let players = {};
let pickups = [];
const pickupRadius = 20;
const pickupRespawnTime = 5000;
const WORLD_WIDTH = 1800;
const WORLD_HEIGHT = 1000;

function spawnPickup() {
  const type = Math.random() < 0.5 ? "energy" : "hp";
  const x = Math.random() * (WORLD_WIDTH - pickupRadius * 2) + pickupRadius;
  const y = Math.random() * (WORLD_HEIGHT - pickupRadius * 2) + pickupRadius;

  const pickup = { id: Date.now() + Math.random(), x, y, type };
  pickups.push(pickup);
  io.emit("pickupSpawned", pickup);
}

// Spawn pickup awal
for (let i = 0; i < 5; i++) spawnPickup();

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);
  socket.emit("currentPickups", pickups);
  players[socket.id] = {
    x: Math.random() * 500,
    y: Math.random() * 500,
    color: getRandomColor(),
    hp: 100,
    maxHp: 100,
    role: Object.keys(players).length === 0 ? "attacker" : "defender", // pemain pertama jadi penyerang
    energy: 50,
    maxEnergy: 100, // simpan maxEnergy
  };

  // Kirim semua player ke client baru
  socket.emit("currentPlayers", players);
  // Beritahu semua client tentang player baru
  socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

  socket.on("pickupCollected", (pickupId) => {
    const index = pickups.findIndex((p) => p.id === pickupId);
    if (index !== -1) {
      const p = pickups[index];
      pickups.splice(index, 1); // hapus pickup
      io.emit("pickupRemoved", pickupId);

      // update HP/energy pemain sesuai role
      const player = players[socket.id];
      if (!player) return;

      if (player.role === "attacker" && p.type === "energy") {
        const percentIncrease = 0.05; // 10% dari maxEnergy
        const increase = Math.floor(player.maxEnergy * percentIncrease);
        player.energy = Math.min(player.maxEnergy, player.energy + increase); // gunakan energy yang ada
        io.to(socket.id).emit("playerEnergyUpdated", {
          id: socket.id,
          energy: player.energy,
        });
      } else if (player.role === "defender" && p.type === "hp") {
        player.hp = Math.min(player.maxHp, player.hp + 20);
        io.to(socket.id).emit("hitBySkill", { hp: player.hp }); // pakai event HP update
      }

      // respawn pickup baru setelah delay
      setTimeout(spawnPickup, pickupRespawnTime);
    }
  });

  socket.on("activateDoubleSpeed", (data) => {
    if (players[socket.id]) {
      players[socket.id].doubleSpeed = true;

      // Broadcast ke semua client
      io.emit("doubleSpeedActivated", {
        id: socket.id,
        duration: data.duration,
      });

      // Matikan doubleSpeed setelah durasi
      setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].doubleSpeed = false;
          io.emit("doubleSpeedDeactivated", { id: socket.id });
        }
      }, data.duration);
    }
  });

  socket.on("activateShield", (data) => {
    if (players[socket.id]) {
      players[socket.id].shield = true;
      io.emit("shieldActivated", { id: socket.id, duration: data.duration });
      setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].shield = false;
        }
      }, data.duration);
    }
  });

  // Update posisi + HP
  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].hp = data.hp;
      socket.broadcast.emit("playerMoved", {
        id: socket.id,
        x: data.x,
        y: data.y,
        hp: data.hp,
      });
    }
  });

  socket.on("damage", (data) => {
    const target = players[data.targetId];
    if (target) {
      target.hp -= data.amount;
      target.hp = Math.max(0, target.hp);
      io.emit("playerMoved", {
        id: data.targetId,
        x: target.x,
        y: target.y,
        hp: target.hp,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit("playerDisconnected", socket.id);
  });

  socket.on("roleChange", (data) => {
    if (players[data.newAttackerId])
      players[data.newAttackerId].role = "attacker";
    if (players[data.newDefenderId])
      players[data.newDefenderId].role = "defender";
    io.emit("roleUpdated", {
      newAttackerId: data.newAttackerId,
      newDefenderId: data.newDefenderId,
    });
  });

  // ketika attacker menggunakan skill
  socket.on("useSkill", (data) => {
    const { x, y, radius, damage } = data;

    // hit semua defender dalam radius
    for (let id in players) {
      const p = players[id];
      if (p.role === "defender") {
        const dx = p.x + 15 - x;
        const dy = p.y + 15 - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          p.hp = Math.max(0, p.hp - damage);
          io.to(id).emit("hitBySkill", { hp: p.hp });
        }
      }
    }

    // broadcast skill effect ke semua client agar partikel bisa ditampilkan
    io.emit("skillEffect", { x, y });
  });

  socket.on("updateEnergy", (data) => {
    if (players[socket.id]) {
      players[socket.id].energy = data.energy; // simpan energy di server
      socket.broadcast.emit("playerEnergyUpdated", {
        id: socket.id,
        energy: data.energy,
      });
    }
  });

  socket.on("setRole", (data) => {
    if (players[socket.id]) {
      players[socket.id].role = data.role;
      players[socket.id].name = data.name || data.role; // simpan nama
      io.emit("roleUpdated", {
        newAttackerId: data.role === "attacker" ? socket.id : null,
        newDefenderId: data.role === "defender" ? socket.id : null,
      });
    }
  });
});

function getRandomColor() {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

http.listen(5000, () => console.log("Server running on http://localhost:5000"));
