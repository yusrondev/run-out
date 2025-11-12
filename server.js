const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};

io.on('connection', socket => {
    console.log(`Player connected: ${socket.id}`);
    players[socket.id] = {
        x: Math.random() * 500,
        y: Math.random() * 500,
        color: getRandomColor(),
        hp: 100,
        maxHp: 100,
        role: Object.keys(players).length === 0 ? 'attacker' : 'defender' // pemain pertama jadi penyerang
    };

    // Kirim semua player ke client baru
    socket.emit('currentPlayers', players);
    // Beritahu semua client tentang player baru
    socket.broadcast.emit('newPlayer', { id: socket.id, ...players[socket.id] });

    // Update posisi + HP
    socket.on('move', data => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].hp = data.hp;
            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, hp: data.hp });
        }
    });

    socket.on('damage', data => {
        const target = players[data.targetId];
        if (target) {
            target.hp -= data.amount;
            target.hp = Math.max(0, target.hp);
            io.emit('playerMoved', {
                id: data.targetId,
                x: target.x,
                y: target.y,
                hp: target.hp
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });

    socket.on('roleChange', data => {
        if (players[data.newAttackerId]) players[data.newAttackerId].role = 'attacker';
        if (players[data.newDefenderId]) players[data.newDefenderId].role = 'defender';
        io.emit('roleUpdated', {
            newAttackerId: data.newAttackerId,
            newDefenderId: data.newDefenderId
        });
    });

    // ketika attacker menggunakan skill
    socket.on('useSkill', data => {
        const { x, y, radius, damage } = data;

        // hit semua defender dalam radius
        for (let id in players) {
            const p = players[id];
            if (p.role === 'defender') {
                const dx = (p.x + 15) - x;
                const dy = (p.y + 15) - y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= radius) {
                    p.hp = Math.max(0, p.hp - damage);
                    io.to(id).emit('hitBySkill', { hp: p.hp });
                }
            }
        }

        // broadcast skill effect ke semua client agar partikel bisa ditampilkan
        io.emit('skillEffect', { x, y });
    });

    socket.on('setRole', data => {
        if (players[socket.id]) {
            players[socket.id].role = data.role;
            io.emit('roleUpdated', {
                newAttackerId: data.role === 'attacker' ? socket.id : null,
                newDefenderId: data.role === 'defender' ? socket.id : null
            });
        }
    });

});

function getRandomColor() {
    return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

http.listen(5000, () => console.log('Server running on http://localhost:3000'));
