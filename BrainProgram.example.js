/* ==========================================================================
 *  HUNTER — an example brain program for CELLS.
 *
 *  Load it from the inspector: select a creature, then
 *  «Actions → Brain program → 🧠 BrainProgram…» and pick this file.
 *  You can also drop the file straight onto a creature in the tank.
 *
 *  It is deliberately simple and readable: read BrainProgram.md for the full
 *  API. The priorities, in order:
 *
 *    1. badly hurt or badly outmatched  → flee (and ink, if it has any)
 *    2. an enemy within tentacle reach  → attack its weakest cell
 *    3. an enemy worth fighting         → chase it down
 *    4. hungry and food in sight        → eat
 *    5. nothing to do                   → patrol the vessel
 * ======================================================================= */

/*  Variables declared out here are THIS creature's memory: the program is
 *  compiled once per creature, so two creatures running this same file each
 *  get their own copy. Nothing needs to be stored anywhere else. */
let patrol = null;          // the corner of the vessel we are heading for
let patrolT = 0;            // how long we have been heading there
let lastHit = -99;          // when we were last damaged
let scannedAt = -99;        // when we last looked at how the enemy is built
let theirReach = 0;         // the longest weapon they carry
let exposedBrain = false;   // is their brain close enough to the surface to go for?

function setup(bot) {
  bot.log(`${bot.name}: hunter online — ${bot.cellCount} cells, `
        + `${bot.limbCount} limbs, attack ${bot.attackScore.toFixed(0)}`);
}

function think(bot, dt) {

  /* --- 1. run away ----------------------------------------------------- */
  const threat = bot.biggestThreat();
  const scared = bot.health < .45 || bot.pain > .8 || bot.time - lastHit < 1.2;

  if (threat && (scared || bot.ratioTo(threat) > 1.5)) {
    // `flee` is not just a direction: the state itself is what empties the ink
    // cells, and what makes the limbs thrash instead of paddle. With ink, that
    // cloud hides us for 3.6 seconds — they cannot see us and cannot scan us —
    // and it recharges in 2, so fleeing keeps the cover up continuously.
    bot.flee(threat, 1);
    bot.waveAll(2.0, 3.2);
    return;
  }

  // Under cover: they have lost us, so this is the moment to break the line
  // rather than keep running in a straight one. Note that fleeing also makes
  // us loud, and ear cells hear through ink — so cover is not silence.
  if (bot.hidden > .6 && threat) {
    bot.moveDir(bot.directionTo(threat).cross(bot.vec(0, 1, 0)), 1);
    return;
  }

  /* --- 1b. size up the opponent ---------------------------------------- */
  // `scan` gives the enemy's body as a tree: not just what it carries, but
  // how deep it is buried and which limb it sits on. Reading it once a second
  // is plenty — bodies do not change faster than that.
  // `canScan` is false while they are inside their own ink cloud: a body
  // cannot be read through one. A failed scan means *unknown*, not *harmless*,
  // so we keep the last reading rather than resetting it to zero.
  if (threat && bot.canScan(threat) && bot.time - scannedAt > 1) {
    scannedAt = bot.time;
    const cells = bot.treeCells(bot.scan(threat));
    const guns = cells.filter(n => n.weapon);
    theirReach = Math.max(0, ...guns.map(n => n.range));
    // a brain near the surface is a fight we can end early
    exposedBrain = cells.some(n => n.type === 'brain' && n.depth <= 3 && n.armor < .3);
  }

  /* --- 2. and 3. hunt --------------------------------------------------- */
  // remember() keeps the target alive in memory for a couple of seconds, so a
  // prey that slips out of the visual cone does not make us change our mind.
  const prey = bot.remember('prey', bot.easiestPrey());

  // an exposed brain is worth a fight we would otherwise have declined
  if (prey && (bot.ratioTo(prey) < 1.35 || exposedBrain)) {
    if (bot.inReach(prey)) {
      // Within reach: pick the softest cell and open it up. The weapons fire
      // by themselves once the state is `attack` and the target is in range.
      const enemy = prey.creature;
      // if their brain is reachable, go for it: losing every brain cell is the
      // only thing in this world that kills outright
      const brain = exposedBrain && enemy
        ? bot.treeCells(bot.scan(enemy)).filter(n => n.type === 'brain')
            .sort((a, b) => a.depth - b.depth)[0]
        : null;
      const soft = (brain && enemy.cells.find(c => c.id === brain.id))
        || (enemy ? enemy.weakestCell(bot.pos) : null);
      bot.attack(prey, soft, .3);
      // the armed limb tears, the others hold the body steady
      const arm = bot.bestLimb;
      for (const limb of bot.limbs) {
        if (limb === arm && soft) limb.strike(soft);
        else limb.wave(.6, 1.1);
      }
    } else {
      bot.chase(prey, 1);
    }
    return;
  }

  /* --- 4. eat ----------------------------------------------------------- */
  const food = bot.remember('food', bot.nearestFood());
  if (food && bot.hunger > .25) {
    bot.eat(food, .85);
    if (bot.distanceTo(food) < bot.reach) bot.reachAll(food);
    return;
  }

  /* --- 5. patrol -------------------------------------------------------- */
  patrolT += dt;
  if (!patrol || patrolT > 6 || bot.distanceTo(patrol) < .5) {
    patrol = bot.randomPoint(.7);
    patrolT = 0;
  }
  bot.moveTo(patrol, .45);
  bot.waveAll(.9, 1.3);
}

/*  Called once for every cell that takes damage. Useful to react to something
 *  that hit us from a direction we were not looking at. */
function onDamage(bot, ev) {
  lastHit = bot.time;
  if (ev.from) bot.forget('prey');                // whatever we were chasing, this is more urgent
}

function onDeath(bot, reason) {
  bot.log(`${bot.name}: down (${reason})`);
}
