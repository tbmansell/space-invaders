const assert = require('assert');
const { GameEngine } = require('../server.js');

console.log('--- Testing Rocket Launcher Power-up ---');

const engine = new GameEngine();
engine.addPlayer('test_p1', 'Maverick', '#00ff66');
const player = engine.players['test_p1'];

// 1. Give player rocket_launcher
player.powerups = { rocket_launcher: true };
player.inputs.shoot = true;
player.lastShootTime = 0;

// Tick to shoot
engine.tick(20);

// Check that bullet is created as a missile
assert.strictEqual(engine.bullets.length, 1, 'Bullet should be created');
const missile = engine.bullets[0];
assert.strictEqual(missile.isMissile, true, 'Bullet should have isMissile = true');
assert.strictEqual(missile.width, 6, 'Missile width should be 6');
assert.strictEqual(missile.height, 14, 'Missile height should be 14');
assert.strictEqual(missile.color, '#ff4400', 'Missile color should be #ff4400');
console.log('✓ Rocket launcher fires a missile correctly');

// Check player_shoot event
const shootEv = engine.events.find(e => e.type === 'player_shoot');
assert(shootEv, 'player_shoot event should exist');
assert.strictEqual(shootEv.isMissile, true, 'player_shoot event should indicate isMissile = true');
console.log('✓ player_shoot event emitted with isMissile = true');

// 2. Test collision and cross splash damage
// Pick a middle invader in horde, e.g. row 2, col 5
const centerInv = engine.invaders.find(inv => inv.row === 2 && inv.col === 5);
assert(centerInv && centerInv.alive, 'Center invader must be alive');

// Check its 4 neighbors
const topInv = engine.invaders.find(inv => inv.row === 1 && inv.col === 5);
const bottomInv = engine.invaders.find(inv => inv.row === 3 && inv.col === 5);
const leftInv = engine.invaders.find(inv => inv.row === 2 && inv.col === 4);
const rightInv = engine.invaders.find(inv => inv.row === 2 && inv.col === 6);

assert(topInv.alive && bottomInv.alive && leftInv.alive && rightInv.alive, 'All 4 neighbors should initially be alive');

const initialAliveCount = engine.aliveCount;
const initialScore = player.score;
const initialKills = player.kills;

// Position the missile right onto centerInv
missile.x = centerInv.x + 2;
missile.y = centerInv.y + 2;

// Clear events to inspect collision events
engine.events = [];

// Tick physics to trigger collision
engine.tick(16);

// Missile should be consumed
assert.strictEqual(engine.bullets.length, 0, 'Missile should be consumed on hit');

// Center invader should be dead
assert.strictEqual(centerInv.alive, false, 'Center invader should be killed');

// All 4 adjacent neighbors (top, bottom, left, right) should be killed by splash
assert.strictEqual(topInv.alive, false, 'Top neighbor should be killed by rocket explosion');
assert.strictEqual(bottomInv.alive, false, 'Bottom neighbor should be killed by rocket explosion');
assert.strictEqual(leftInv.alive, false, 'Left neighbor should be killed by rocket explosion');
assert.strictEqual(rightInv.alive, false, 'Right neighbor should be killed by rocket explosion');

// Check that aliveCount decreased by 5
assert.strictEqual(engine.aliveCount, initialAliveCount - 5, 'Alive count should decrease by 5');

// Check that player gained 5 kills and points for all 5
assert.strictEqual(player.kills, initialKills + 5, 'Player kills should increase by 5');
assert(player.score > initialScore, 'Player score should increase');

// Check events
const rocketExpEv = engine.events.find(e => e.type === 'rocket_explosion');
assert(rocketExpEv, 'rocket_explosion event should be emitted');
console.log('✓ Rocket explosion event emitted with coordinates:', rocketExpEv.x, rocketExpEv.y);

const hitEvents = engine.events.filter(e => e.type === 'invader_hit');
assert.strictEqual(hitEvents.length, 5, '5 invader_hit events should be emitted');
const splashHits = hitEvents.filter(e => e.isRocketSplash);
assert.strictEqual(splashHits.length, 4, '4 side kills should have isRocketSplash = true');

console.log('✓ Center alien + 4 side aliens (top, bottom, left, right) killed successfully!');

// 3. Test edge case: alien on the top border (row 0, col 0)
const cornerInv = engine.invaders.find(inv => inv.row === 0 && inv.col === 0);
const cornerRight = engine.invaders.find(inv => inv.row === 0 && inv.col === 1);
const cornerBottom = engine.invaders.find(inv => inv.row === 1 && inv.col === 0);

engine.triggerMissileSplash(cornerInv.x + cornerInv.width / 2, cornerInv.y + cornerInv.height / 2, player.id, cornerInv);
cornerInv.alive = false;

assert.strictEqual(cornerRight.alive, false, 'Right neighbor of corner alien killed');
assert.strictEqual(cornerBottom.alive, false, 'Bottom neighbor of corner alien killed');
console.log('✓ Corner alien splash kills available sides cleanly without crashing');

// 4. Test broadcast state serialization
const broadcastState = engine.getBroadcastState();
assert(Array.isArray(broadcastState.bullets), 'bullets array exists');
console.log('✓ Broadcast state serialization verified');

console.log('All Rocket Launcher tests PASSED successfully! 🎉');
process.exit(0);
