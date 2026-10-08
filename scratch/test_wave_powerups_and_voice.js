const assert = require('assert');
const { GameEngine } = require('../server.js');

console.log('=== Test: Power-Up Retention Across Waves ===');

const engine = new GameEngine();
engine.addPlayer('pilot_alpha', 'Maverick', '#00ff66');
const player = engine.players['pilot_alpha'];

// Equip player with multiple power-ups in Wave 1
player.powerups = {
  rapid_fire: true,
  rocket_launcher: true,
  shield: true,
  triple_shot: true,
  fast_move: true,
  super_speed: true
};
player.lives = 3;
player.score = 500;

assert.strictEqual(engine.wave, 1, 'Initial wave should be 1');
assert.strictEqual(Object.keys(player.powerups).length, 6, 'Player should have 6 power-ups');

console.log('✓ Initial setup: Player has 6 active power-ups in Wave 1');

// Simulate horde wipeout -> wave_cleared
engine.aliveCount = 0;
engine.boss.alive = false;
engine.status = 'wave_cleared';
engine.intermissionTimer = 100; // fast-forward intermission

// Tick engine by 150ms to cross the intermission timer
engine.tick(150);

assert.strictEqual(engine.status, 'playing', 'Engine status should transition back to playing');
assert.strictEqual(engine.wave, 2, 'Wave should advance to Wave 2');
assert.strictEqual(player.lives, 4, 'Player should receive bonus life (+1)');
assert.strictEqual(player.alive, true, 'Player should be alive');

// Verify all power-ups are retained!
assert(player.powerups, 'player.powerups must exist');
assert.strictEqual(player.powerups.rapid_fire, true, 'rapid_fire should be retained');
assert.strictEqual(player.powerups.rocket_launcher, true, 'rocket_launcher should be retained');
assert.strictEqual(player.powerups.shield, true, 'shield should be retained');
assert.strictEqual(player.powerups.triple_shot, true, 'triple_shot should be retained');
assert.strictEqual(player.powerups.fast_move, true, 'fast_move should be retained');
assert.strictEqual(player.powerups.super_speed, true, 'super_speed should be retained');
console.log('✓ Wave 1 -> Wave 2: All 6 power-ups successfully preserved!');

// Verify broadcast state contains retained power-ups
const broadcastState = engine.getBroadcastState();
assert.strictEqual(broadcastState.wave, 2, 'Broadcast state wave should be 2');
const broadcastPlayer = broadcastState.players.find(p => p.id === 'pilot_alpha');
assert(broadcastPlayer, 'Broadcast player should exist');
assert.strictEqual(broadcastPlayer.powerups.rocket_launcher, true, 'Broadcast state should include retained rocket_launcher');
assert.strictEqual(broadcastPlayer.powerups.shield, true, 'Broadcast state should include retained shield');
console.log('✓ Network broadcast state accurately propagates retained power-ups to all clients');

// Advance Wave 2 -> Wave 3
engine.aliveCount = 0;
engine.boss.alive = false;
engine.status = 'wave_cleared';
engine.intermissionTimer = 50;
engine.tick(80);

assert.strictEqual(engine.wave, 3, 'Wave should advance to Wave 3');
assert.strictEqual(player.powerups.rocket_launcher, true, 'Power-ups retained through multiple consecutive waves');
console.log('✓ Wave 2 -> Wave 3: Power-ups continue to persist across consecutive waves');

// Verify game restart correctly clears power-ups upon game over
engine.restartGame();
assert.strictEqual(engine.wave, 1, 'Game restart resets wave to 1');
assert.deepStrictEqual(player.powerups, {}, 'Game restart resets power-ups for fresh game');
console.log('✓ Game restart safely resets power-ups when starting a new session');

console.log('\n=== All Server Power-Up Retention Tests PASSED! ===');
