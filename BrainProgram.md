# Writing a BrainProgram for CELLS

This document is the complete specification for **BrainProgram.js**, a JavaScript
file that takes over the brain of one creature in [CELLS](README.md). It is
written for an AI model that has to produce a working program from these
instructions alone, with no access to the simulator's source.

Read it top to bottom once. The two sections you cannot skip are
[The execution model](#1-the-execution-model) — which explains what a program
*is* — and [What you actually control](#3-what-you-actually-control) — which
explains the single most common mistake, trying to "fire" a weapon.

---

## 1. The execution model

A creature normally decides for itself: a built-in utility brain weighs fleeing,
hunting, feeding and wandering sixty times a second. A BrainProgram **replaces
that decision** and nothing else. The body, the physics, the senses, the weapons
and the metabolism keep working exactly as they did.

Your file is a plain script. It declares **top-level functions** which the
simulator calls; there is no `export`, no `module`, no object to return.

```js
function setup(bot)        { }   // optional — once, when the program is loaded
function think(bot, dt)    { }   // REQUIRED — once per simulation step
function onDamage(bot, ev) { }   // optional — every time one of our cells is hit
function onDeath(bot, why) { }   // optional — once, when the creature dies
```

`think` is mandatory. A file without it is refused at load time.

### One compilation per creature

The file is compiled **separately for every creature that runs it**. That has a
very useful consequence: variables declared at the top level of your file are
that creature's private memory, and they persist between steps.

```js
let patrolTarget = null;      // this creature's own variable
let ticks = 0;                // two creatures running this file do not share it

function think(bot, dt) {
  ticks++;
}
```

There is also `bot.memory`, a plain object that survives between steps, if you
prefer keeping state in one place. Both work; top-level variables are simpler.

### Never block

`think` runs inside the simulation loop, on the main thread. It must **return
quickly**. There is no scheduler, no `await`, no way to yield.

- **Never** write `while (true)`, a long `for`, `await`, or a `setTimeout` loop.
  A blocking `think` freezes the whole page.
- **Never** write a top-level `return` in the file (outside a function): it would
  cut the file short and your functions would never be declared.
- Think of `think` as *one frame of thought*: read the situation, issue a few
  commands, return. Persistence across frames is what your top-level variables
  are for.

If a single `think` call takes more than 8 ms, a warning is printed to the
console — once, not every frame.

### Errors are survivable

If `think` throws, the exception is caught, printed to the browser console with
the creature's name, and the **built-in brain decides that step instead**. Six
throws in a row and the program is stopped and detached. Your creature gets
clumsy, never frozen.

### Loading and stopping

- **Inspector →** select a creature **→ Actions → Brain program → 🧠 BrainProgram…**
  and pick the `.js` file.
- Or **drop the `.js` file straight onto the creature** in the vessel — or
  anywhere on the window, and it goes to the selected creature.
- **■ Stop** detaches the program; the creature goes back to the built-in brain.
- The **Deciding** row in *Vital signs* always says who is in charge.

Everything the program reports — load failures, syntax errors, runtime
exceptions, `bot.log()` — goes to the **browser console** (F12).

---

## 2. The one-page skeleton

This is a complete, valid program. Everything else in this document is detail.

```js
let patrol = null;

function think(bot, dt) {
  // 1. am I in danger?
  const threat = bot.biggestThreat();
  if (threat && (bot.health < .5 || bot.ratioTo(threat) > 1.5)) {
    bot.flee(threat, 1);
    return;
  }

  // 2. is there something worth attacking?
  const prey = bot.remember('prey', bot.easiestPrey());
  if (prey && bot.ratioTo(prey) < 1.2) {
    if (bot.inReach(prey)) bot.attack(prey);      // the weapons take it from here
    else                   bot.chase(prey, 1);
    return;
  }

  // 3. am I hungry?
  const food = bot.nearestFood();
  if (food && bot.hunger > .3) { bot.eat(food); return; }

  // 4. otherwise, look around
  if (!patrol || bot.distanceTo(patrol) < .5) patrol = bot.randomPoint();
  bot.moveTo(patrol, .45);
}
```

A longer, commented example ships with the simulator as
[`BrainProgram.example.js`](BrainProgram.example.js).

---

## 3. What you actually control

**You do not fire weapons. You choose a state and a target; the body does the
rest.** This is the single most important thing to understand, and the mistake
every first program makes.

Each simulation step your program sets, at most:

| what | how |
| --- | --- |
| a **behavioural state** | `attack`, `flee`, `feed`, `hunt`, `wander`, `hurt`, `idle` |
| a **direction** to face and swim | `bot.moveTo`, `moveDir`, `face`, `flee`, `chase` |
| a **speed**, 0 to 1 | second argument of the movement commands |
| a **target** creature, cell or morsel | `bot.attack`, `bot.chase`, `bot.eat` |
| a **pose for each limb** | `bot.limb(i).reach / strike / wave / retract` |

Everything else follows from the physics and the cells:

- **Ranged weapons (electric, sonic) fire on their own** while the state is
  `attack`, a target creature is set, and the target is inside the cell's radius.
  They respect their own cooldown.
- **Acid and gas leak on their own** at any time, at anything hostile inside
  their band — they do not even need the `attack` state. They burst for two
  seconds, then recharge.
- **Ink is released on its own** while the state is `flee` or `hurt`. Setting
  `flee` *is* how you use ink.
- **Contact weapons (nettle, spike, blunt plate) hurt whatever they touch.**
  Getting the limb onto the enemy is your job; the damage is not.
- **Adhesive cells grip on contact**, automatically.
- **Blunt plates do damage proportional to impact speed** — a slow, careful
  approach with a hammer limb does nothing. Swing it.

So "attacking" means: get close, face the enemy, set the `attack` state, and put
your limbs on the cell you want to open.

### Commands do not stack

Within one `think` call, the **last** movement command wins, and the **last**
state set wins. Calling `bot.moveTo` then `bot.flee` gives you `flee`. Limb
commands are per limb: the last command given to *that* limb wins.

If you issue no command at all, the creature stands still (`idle`).

---

## 4. `bot` — the full API

`bot` is the only object your program receives. Everything is on it.

### 4.1 Identity and clock

| member | type | meaning |
| --- | --- | --- |
| `bot.name` | string | the creature's name |
| `bot.id` | number | unique id |
| `bot.age` | number | seconds since birth |
| `bot.time` | number | simulation clock, in seconds |
| `bot.dt` | number | duration of this step (also the 2nd argument of `think`) |
| `bot.alive` | boolean | |
| `bot.state` | string | the state in force right now |
| `bot.vessel` | string | name of the vessel we are in |
| `bot.dna` | object | frozen copy of the genome (see [§7](#7-the-genome)) |
| `bot.memory` | object | free storage that survives between steps |

### 4.2 The body

| member | meaning |
| --- | --- |
| `bot.pos` | centre of the body, a `Vec` |
| `bot.velocity`, `bot.speed` | current motion (world units per second) |
| `bot.forward` | the direction the body is pointing, a `Vec` |
| `bot.radius` | how far the body extends from its centre |
| `bot.mass` | total mass |
| `bot.energy`, `bot.energyMax` | fuel |
| `bot.hunger` | 0 = full, 1 = empty |
| `bot.health` | 0 to 1, total hit points over total maximum |
| `bot.cellCount`, `bot.limbCount` | |
| `bot.brainPower` | thinking capacity; at 0 the creature cannot think at all |
| `bot.motorPower` | muscle power actually innervated |
| `bot.digestPower` | how fast it can eat |
| `bot.attackScore`, `bot.armorScore`, `bot.senseScore` | rough capability totals |
| `bot.reach` | how far the longest limb can stretch from the centre |
| `bot.weaponRange` | radius of the longest-ranged weapon; **0 if it has none** |

### 4.3 How we are doing — the damage we are taking

Each of these is a countdown in seconds (or an amount), and each corresponds to a
different enemy weapon. They are the only way to tell *what* is being done to you.

| member | caused by | meaning |
| --- | --- | --- |
| `bot.pain` | anything | 0 to 2; the built-in brain panics above 0.8 |
| `bot.stunned` | **electric** | > 0 means the brain is off — `think` is not even called |
| `bot.shocked` | **electric** | residual tremor |
| `bot.blind` | **ink** | senses cut to a fraction of their range |
| `bot.slowed` | **gas** | movement speed is reduced |
| `bot.gassed` | **gas** | the body is curling up |
| `bot.corrosion` | **acid** | 0 to 1; the body is dissolving and going limp |
| `bot.stung` | **nettle** | venom is burning |
| `bot.spinning` | **sonic** | the body is tumbling out of control |
| `bot.lastAttacker` | | the last creature that hurt us, or `null` |

A useful pattern: `if (bot.corrosion > .3) bot.flee(bot.lastAttacker, 1);` —
acid does not stop when you break contact, so running is the only answer.

### 4.4 Our own cells

| member | returns |
| --- | --- |
| `bot.cells` | array of `Cell` views, living cells only |
| `bot.cellsOfType('acid')` | array of `Cell` |
| `bot.countCells('muscle')` | number |
| `bot.hasCell('electric')` | boolean |
| `bot.weapons` | our attack cells |
| `bot.readyWeapons` | attack cells whose cooldown has finished |
| `bot.senses` | our sense cells |

A **`Cell` view** has:

`id`, `type` (`'acid'`, `'muscle'`, …), `typeName` (`'Acid'`), `category`
(`attack` \| `defense` \| `sense` \| `motor` \| `organ` \| `neural` \| `gland`),
`zone`, `pos` (`Vec`), `radius`, `mass`, `hp`, `hpMax`, `health` (0–1), `armor`,
`alive`, `vital`, `innervation` (0 = cut off from the brain), `activity`,
`venom`, `corroded`, `onLimb`, `isTip`, `limbIndex`, `isWeapon`, `isSense`,
`isMotor`, `ready`, `cooldown`, `range`, `power`, `distanceTo(point)`.

`bot.readyWeapons.length === 0` is a good reason not to pick a fight.

### 4.5 Limbs

`bot.limbs` is an array; `bot.limb(0)` is the first. `bot.bestLimb` gives the
longest armed one.

A **`Limb` view** has `index`, `length`, `cellCount`, `power` (0 means the limb
is dead or paralysed and will not move), `tip` and `base` (`Cell` views),
`cells`, `armed` (carries a weapon or an adhesive), `holding`, `mode`.

Commands, all of which return the limb so they can be chained:

| command | effect |
| --- | --- |
| `limb.reach(point)` | stretch the tip toward a point and hold it there |
| `limb.strike(target)` | same, but convulsing: it tears and yanks what it holds |
| `limb.grab(target)` | alias of `strike` |
| `limb.wave(amp, freq)` | undulate — this is how the creature swims; `amp` 0–3, `freq` 0–8 |
| `limb.rest()` | a slow idle wave |
| `limb.retract(seconds)` | snap back toward the body |

Batch versions on `bot`: `reachAll(point)`, `strikeAll(target)`,
`waveAll(amp, freq)`, `restLimbs()`.

`strike` is what does damage with a contact weapon. `reach` merely touches.
If you give no limb commands, the limbs do something sensible for the state you
chose — swim when moving, thrash when fleeing, reach for the target when
attacking. **You only need limb commands when you want something specific**, for
instance holding a victim with three limbs while a fourth one tears.

### 4.6 Perception

Perception is **not** ground truth. It is what the senses reported, delayed by
nerve conduction, blurred by the accuracy of the sense that reported it, and cut
short by ink. A creature with no eyes, or with its nerves severed, perceives
nothing and your program will correctly see an empty list.

| member | returns |
| --- | --- |
| `bot.percepts` | everything perceived this step |
| `bot.enemies()` | living, non-kin creatures |
| `bot.foods()` | free morsels and corpses |
| `bot.nearestEnemy()`, `bot.nearestFood()` | nearest of each, or `null` |
| `bot.biggestThreat()` | the most dangerous enemy in sight |
| `bot.easiestPrey()` | the best cost/benefit target |
| `bot.nearest(list)` | nearest of any percept list |
| `bot.ratioTo(target)` | their strength ÷ ours. **< 1 you are winning, > 1.35 the built-in brain would run** |
| `bot.canSee(target)` | is it in the current percepts? |
| `bot.inReach(target)` | close enough to touch it with a limb |
| `bot.distanceTo(point)`, `bot.directionTo(point)` | |

A **`Percept`** has: `kind` (`'creature'` \| `'food'`), `via` (which sense
reported it: `'eye'`, `'olfact'`, `'ear'`, `'touch'`), `pos`, `dist`, `dir`,
`size`, `threat`, `lure`, `isCreature`, `isFood`, `isCorpse`, `friendly` (kin
under truce — **attacking them does nothing**), `creature` (a `Creature` view or
`null`), `cell`.

A **`Creature` view** (an enemy) has: `name`, `id`, `pos`, `radius`, `cellCount`,
`limbCount`, `speed`, `alive`, `isCorpse`, `attackScore`, `armorScore`, `state`,
`glowing`, `noisy`, `cells`, `countCells(type)`, and two things worth using:

- `enemy.weakestCell(fromPoint)` — the softest cell to attack: little armour,
  ideally vital, ideally already wounded, ideally near us.
- `enemy.nearestCell(fromPoint)` — the closest cell.
- `enemy.tree()` — **how it is built**: the whole body as a tree, so you can
  see not just what weapons it carries but where they are. See
  [§4.11](#411-the-body-as-a-tree--reading-it-and-rebuilding-your-own).

### 4.7 Short-term memory

Percepts flicker. A prey that leaves the visual cone for a third of a second
vanishes and comes back, and a program that reads `nearestEnemy()` raw will
change its mind ten times a second. Use the memory:

```js
const prey = bot.remember('prey', bot.easiestPrey());
```

`remember(key, percept)` stores the percept if there is one, and returns the
remembered one if there is not. The memory **follows the object** while it
exists and expires after 2.5 seconds. `bot.recall(key, maxAge)` reads without
storing; `bot.forget(key)` drops one, `bot.forget()` drops all.

### 4.8 Commands

| command | effect |
| --- | --- |
| `bot.stop()` | stand still, state `idle` |
| `bot.moveTo(target, speed)` | swim toward a point or anything with a position |
| `bot.moveDir(direction, speed)` | swim along a direction |
| `bot.face(target)` | turn toward it without changing speed |
| `bot.wander(speed)` | drift, changing direction by itself every few seconds |
| `bot.flee(from, speed)` | swim away from a point; **state `flee` releases ink** |
| `bot.chase(target, speed)` | close on a creature, state `hunt` |
| `bot.attack(target, cell, speed)` | state `attack`: **weapons fire, limbs tear** |
| `bot.eat(target, speed)` | state `feed`: limbs carry the morsel to the stomach |
| `bot.setState(name)` | raw state, one of the seven |
| `bot.setSpeed(v)` | 0 to 1 |
| `bot.useNativeBrain()` | give this step back to the built-in brain |

`bot.attack(target)` without a second argument picks the enemy's weakest cell by
itself. Pass one to choose: `bot.attack(prey, enemy.weakestCell(bot.pos))`.

Every command that moves also sets the speed, so the last one you call decides
both. The defaults, when you omit the argument: `moveTo`/`moveDir`/`flee` full
speed, `chase` 0.95, `eat` 0.8, `wander` 0.45, `attack` **0.35** — attacking is
deliberately close to a standstill, because a body that keeps swimming pushes
its own target out of reach. Pass `bot.attack(prey, cell, 1)` to charge.

`bot.eat` accepts a food percept, a corpse or a single cell, and works out what
to bite.

`bot.useNativeBrain()` is the honest escape hatch: it discards everything you
commanded this step and lets the built-in utility brain decide. Use it for
situations you have not written a rule for.

### 4.9 Utilities

| | |
| --- | --- |
| `bot.vec(x, y, z)` | make a `Vec` |
| `bot.randomPoint(margin)` | a random point inside our vessel — good for patrolling |
| `bot.log(...)` | to the browser console, at most 4 lines a second per creature |
| `bot.say(text)` | to the on-screen log, at most one line every 2 seconds |

Injected globals, available anywhere in your file without importing:
`Vec`, `clamp(v, min, max)`, `lerp(a, b, t)`, `rand(a, b)`, `chance(p)`.
`Math`, `console` and the rest of the standard library work normally.

### 4.10 `Vec`

A minimal 3-D vector. **Every operation returns a new vector**; nothing is
modified in place, so you can never corrupt the simulation by keeping a
reference.

```js
new Vec(x, y, z)   bot.vec(x, y, z)
v.add(p)  v.sub(p)  v.scale(k)  v.dot(p)  v.cross(p)  v.lerp(p, t)
v.length()  v.normalize()  v.distanceTo(p)  v.directionTo(p)  v.clone()
```

Anywhere the API asks for a point you may pass: a `Vec`, a `{x, y, z}`, an
`[x, y, z]`, three numbers, or **any view that has a position** — a percept, a
creature view, a cell view. `bot.moveTo(enemy)` is legal and means what you
expect.

### 4.11 The body as a tree — reading it, and rebuilding your own

One format does three jobs: reading your own body, reading somebody else's,
and rebuilding your own. They are the same shape, so a tree you just read can
be modified and handed straight back.

| | |
| --- | --- |
| `bot.tree()` | your own body as a tree |
| `bot.scan(target)` | somebody else's — accepts a percept, a creature view or a cell |
| `bot.treeCells(tree)` | every node of a tree as a flat array, for searching |
| `bot.restructure(tree)` | rebuild your own body to match a tree |
| `bot.canScan(target)` | can that body be read right now? |
| `bot.hidden` | seconds left of your own ink cloud, 0 if you are not hiding |

A node is a **`BodyNode`**, and almost everything on it is **read-only**.
Assigning to `type`, `id`, `hp`, `armor` — anything that describes the cell
rather than your plan — throws on the spot:

```js
node.type = 'keratin';
// TypeError: Cannot set property type of [object Object] which has only a getter
```

That is deliberate, and it is why the node is a class and not a plain object.
Programs run in strict mode, so a mistaken assignment stops at the line that
made it, with the line number in the Debug console — instead of being silently
ignored, or surfacing three steps later as *the census does not match*.

**Exactly one thing is yours to change**: `node.children`, a normal array you
can sort, reverse, or splice a branch out of and onto another node. That is the
whole editing surface, and the node is **sealed**, so even a typo is caught:

```js
node.childs = [];   // TypeError: Cannot add property childs, object is not extensible
```

Since `type` and `id` cannot be touched, a tree that came out of `bot.tree()`
always maps every node back to **its own cell** — identity is guaranteed by
construction, and a rebuilt body keeps every wound exactly where it was.

**And limbs are read off the structure.** There is no limb field to set:
`node.isLimb()` asks whether a cell is part of one, and when you rebuild, the
engine works the limbs out from the tree alone. The rule is one line:

> **a limb starts where a muscle hangs off something that is not a muscle**, and
> takes in everything below it — the rest of the fibres and whatever tip they
> carry.

So you control limbs by controlling the shape. Move a branch to a different
parent and its limb goes with it, hinged on the new shoulder; detach the lower
half of a tentacle and re-hang it on the body and it becomes a limb of its own
(measured: four limbs became five); pull the muscles out of a chain and there
is no limb left. Nothing is remembered from before — the plan is the whole
input.

The one thing you can lose that way is a muscle chain placed at the *root* of
the tree: nothing to hinge on, so those cells stay part of the body, and the
Debug console says so.

**A rebuild that changes nothing costs nothing.** Cells whose parent is
unchanged go back to exactly where they were, so the geometry, the nerve reach
and therefore the innervation are preserved; only the branches you actually
moved get re-placed, and the cells hanging under them. Measured across all 24
preset bodies: `bot.restructure(bot.tree())` moves **zero** cells and leaves
motor power identical.

Two methods, and the fields:

| member | type | meaning |
| --- | --- | --- |
| `node.clone()` | method | a copy of the *plan* over the same cells — for trying a layout before committing to it |
| `node.toJSON()` | method | called automatically by `JSON.stringify`, so a tree still round-trips through JSON and prints readably. What comes back is a plain tree, and `restructure` accepts that too |

| field | type | on | meaning |
| --- | --- | --- | --- |
| `children` | array | **writable** | the cells attached to it. `[]` for a leaf. **The only thing you can change** |
| `isLimb()` | method | read-only | is this cell part of a limb? |
| `type` | string | read-only | cell type id — `'brain'`, `'acid'`, `'keratin'`… |
| `id` | number | read-only | this cell's identity, and what ties a node back to its own cell |
| `name` | string | every node | human-readable, e.g. `'Keratin plate'` |
| `category` | string | every node | `attack` \| `defense` \| `sense` \| `motor` \| `organ` \| `neural` \| `gland` |
| `depth` | number | every node | how many cells from the root — how buried it is |
| `hp`, `hpMax` | number | every node | current and maximum hit points |
| `health` | number | every node | `hp / hpMax`, 0 to 1 |
| `armor` | number | every node | effective armour, averaged over directions. Counts every plate within the **trunk radius**, weighted by `1 - (d/R)²`, so a cage that stands off the organs protects them. Averaged means undirected: the same cell can resolve from −85% to +160% of this once the side of the blow is known |
| `vital` | boolean | every node | brain, ganglion, gastric, germ, eye, olfactory, ear, vascular, adipose |
| `innervation` | number | every node | 0 means severed from the brain, and doing nothing |
| `radius` | number | every node | physical size |
| `pos` | `{x,y,z}` | every node | where it is in the world, right now |
| `rest` | `{x,y,z}` | every node | where it sits in the body's own frame |
| `weapon` | `true` | **weapons only** | `undefined` on everything else — `n.weapon` is the test |
| `range` | number | weapons only | the reach of that weapon |
| `power` | number | weapons only | its nominal damage |
| `ready` | boolean | weapons only | off cooldown and able to fire |

`restructure` reads **`type`, `children` and `id`, and ignores all the rest** — so a tree you just read can be modified and handed straight back. It
accepts both a `BodyNode` tree and a plain-object one (from `JSON.parse`, or
built by hand), which is why the fields are documented rather than hidden.

The full shape of one node:

```js
{
  type: 'acid',        // cell type id
  name: 'Acid',
  id: 314,             // this cell's identity
  category: 'attack',  // attack | defense | sense | motor | organ | neural | gland
  depth: 6,            // how many cells from the root: how buried it is
  isLimb(),            // a method, not a field: is it part of a limb?
  hp: 18, hpMax: 18, health: 1,
  armor: 0.14,         // effective armour, averaged over directions
  vital: false,        // losing every brain cell is the only instant death
  innervation: 1,      // 0 = cut off from the brain, and doing nothing
  radius: 0.09,
  pos:  { x, y, z },   // where it is in the world
  rest: { x, y, z },   // where it sits in the body's own frame
  weapon: true,        // only on cells that can hurt something
  range: 0.8, power: 17, ready: true,
  children: [ … ]      // the cells attached to it
}
```

#### Reading an opponent

This is the difference between knowing the enemy has acid and knowing it has
acid on the tip of its third tentacle, six cells out, behind nothing at all:

```js
const t = bot.scan(bot.nearestEnemy());
const cells = bot.treeCells(t);

const guns   = cells.filter(n => n.weapon);
const brains = cells.filter(n => n.type === 'brain');
const plates = cells.filter(n => n.category === 'defense');

// the reach we actually have to respect
const worst = Math.max(0, ...guns.map(n => n.range));
// a brain sitting near the surface is a fight we can end early
const soft  = brains.find(b => b.depth <= 3 && b.armor < .3);
// weapons out on limbs can be amputated; weapons in the body cannot
const onLimbs = guns.filter(n => n.limb >= 0);
```

`depth` and `armor` together tell you whether the win condition is reachable.
A brain at depth 1 with no plating around it is worth going for; a brain at
depth 6 inside a keratin cage is not, and the fight is about attrition.

#### Ink blocks the scan

**`bot.scan()` returns `null` for a creature hiding in its own ink cloud**, for
the 3.6 seconds the cloud lasts. You cannot read a body through a cloud: not
its weapons, not its armour, not where its brain is. `bot.canScan(target)`
tells you before you try.

A failed scan does not mean a harmless enemy — it means an unknown one, and it
is exactly the moment the other program wants you to close in. Keep the last
profile you had, mark it stale, and give the enemy the benefit of the doubt:

```js
let profile = null;
function look(bot, enemy) {
  if (bot.canScan(enemy)) {
    const cells = bot.treeCells(bot.scan(enemy));
    profile = { reach: Math.max(0, ...cells.filter(n => n.weapon).map(n => n.range)),
                stale: false };
  } else if (profile) {
    profile.stale = true;                 // it inked: assume the worst, stand off
    profile.reach = Math.max(profile.reach, 1.2);
  }
  return profile;
}
```

The same cloud also blinds you and hides its owner from most of your senses,
and **`bot.remember` stops tracking it**: a remembered percept normally follows
its object around, but not through ink, so `percept.pos` is where it *was*.
Ears and touch still work — fleeing makes a creature loud — so a body with ear
cells is the answer to an opponent that keeps disappearing.

If it is *you* doing the hiding: ink comes out on its own while your state is
`flee` or `hurt`, so `bot.flee(...)` is how you use it, and `bot.hidden` says
how many seconds of cover you have left.

#### Rebuilding your own

`bot.restructure(tree)` rearranges your body. Three rules, and they are not
negotiable:

1. **Exactly the same cells.** The tree must contain the same types in the
   same numbers as your living body — it is a rearrangement, not a shopping
   list. Asking for one keratin you do not have is refused with a message
   saying so. You cannot conjure armour, drop dead weight, change a muscle
   into a plate, or borrow a cell from another creature by quoting its `id`.
2. **Wounds travel with the cell.** Rebuilding heals nothing; a cell that was
   at a third of its hit points is still at a third wherever it ends up.
3. **It costs, and it has a cooldown.** `5 + cells × 0.2` energy, and one
   rebuild every 6 seconds. Ask before you knock:

```js
if (bot.canRestructure) {            // false while cooling down or too poor
  const body = bot.tree();
  // … move branches around …
  bot.restructure(body);
}
// bot.restructureIn   → seconds still to wait
// bot.restructureCost → what it would cost right now
```

#### What happens if you try to change anything else

Nothing inconsistent can come out of it: `restructure` does not trust the tree,
it **re-derives the body from it** and refuses anything it cannot honour. What
each field does when you edit it:

On a `BodyNode` the first four of these cannot happen at all — the assignment
throws before `restructure` is ever reached, which is the point of the class.
They are listed because `restructure` also accepts plain trees, where they can:

| you write | on a `BodyNode` | on a plain tree |
| --- | --- | --- |
| **`type`** changed on one node | **throws at the assignment** | refused: `the tree asks for 1 keratin but the body has 0`, body untouched |
| **`type`** *swapped* between two nodes | **throws** | accepted, and legitimate: the census is unchanged, so it means "the plate here, the muscle there" |
| **`id`** pointing at nothing, at another creature, or at a cell of a different type | **throws** | ignored — ids are looked up only inside your own pool of that type, and an unmatched one falls back to the next free cell |
| **the same `id`** on several nodes | **throws** | accepted, no duplication: the first claim takes that cell, the others fall back |
| **`limb`**, or any other name | **throws — the node is sealed** | ignored: limbs come from the structure, never from a field |
| moving a branch onto another parent | its limb goes with it, hinged on the new shoulder | same |
| detaching part of a limb onto the body | it becomes a limb of its own | same |
| putting a limb chain at the root of the tree | those cells stay body — nothing to hinge on — and the console says so | same |

Verified by trying every one of them: nothing gets through that would leave an
inconsistent body. In each accepted case the creature keeps exactly the same
cells, the same total hit points, valid limb shoulders and no empty limbs.

You give the plan — what attaches to what — and nothing else. Where each cell
physically ends up is worked out by the same routine the creature uses when it
grows naturally, and the limbs are worked out from the structure, so you cannot
produce an impossible body.

Worth doing because [armour is directional](README.md): a plate protects what
is behind it, so moving your vital organs inward and your plating outward is a
real defensive gain, paid for in energy.

```js
/*  Bury the organs, put the plating on the outside. */
function armourUp(bot) {
  if (!bot.canRestructure) return;
  const body = bot.tree();
  const plating = n => bot.treeCells(n)
    .filter(x => x.category === 'defense').length;
  // at every level, the branches carrying the most armour go first, so the
  // layout routine hangs them on the outside of the body
  for (const n of bot.treeCells(body)) n.children.sort((a, b) => plating(b) - plating(a));
  bot.restructure(body);
}
```

---

---

## 5. The states, and what each one really does

`bot.state` is not a label. The simulator reads it.

| state | consequences |
| --- | --- |
| `attack` | ranged weapons fire at `targetCreature`; limbs reach and convulse |
| `flee` | **ink is released**; limbs thrash at high amplitude |
| `hurt` | ink is released; same thrashing |
| `hunt` | limbs swim; the creature is audible to enemy ear cells |
| `feed` | limbs reach the morsel and carry it toward the stomach |
| `wander` | ordinary swimming |
| `idle` | limbs idle slowly; no thrust |

Being in `hunt` or `flee` makes you **loud**: creatures with ear cells will
perceive you even outside their field of view. Silence is a tactic.

---

## 6. The cells: ranges, damage, cooldowns

Check what you are carrying with `bot.hasCell('acid')` before writing a tactic
that depends on it. Everything here is the number the engine actually uses.

### 6.1 The senses — what you can know, and when

Perception is not a query. Each sense cell has a range, a cone and an accuracy,
and what it reports arrives **late**: a percept is stamped with a delay
proportional to how many synapses separate that cell from the brain, so a sense
out on the tip of a long limb genuinely reacts more slowly than one in the
core. A cell with `innervation` 0 is severed and reports nothing at all.

| sense | range | cone | accuracy | notes |
| --- | --- | --- | --- | --- |
| **Eye** | 5.5 | 1.15 rad, forward | perfect | position exact; the narrowest cone of the four |
| **Olfactory** | 8.0 | π, almost all round | 0.35 | the longest reach, and the vaguest: reported position is off by about **0.39 × distance** |
| **Ear** | 9.0 | 2.6 rad, very wide | 0.6 | off by 0.24 × distance. **Only picks up creatures that are moving or loud** — see below |
| **Touch** | 0.35 | all round | perfect | contact only; it is also what finds a creature hiding in ink |

**Being loud.** A creature in the `hunt` or `flee` state, or one moving faster
than 0.35, is audible to ear cells *anywhere in range and outside their cone*.
Every other state is quiet. That is the whole of stealth in this simulation:
approaching in `wander` instead of `hunt` costs you nothing and stops ears from
tracking you.

### 6.2 The weapons — reach, damage, and how often

Two of these need no permission from the brain. **Acid and gas leak on their
own**, at anything hostile inside their band, whatever the creature is doing —
so standing in the right place is a complete tactic. The other four fire only
while the state is `attack` (or, for contact weapons, when something touches).

| weapon | reach | damage | rhythm | needs | what else it does |
| --- | --- | --- | --- | --- | --- |
| **Acid** | band **0.2 – 0.8** | 17 /s | **2 s spraying, 4 s recharge** | nothing | `corrosion` builds up on the victim: its shape memory dies and its limbs stop swimming. Armour counts ×0.55, and then the victim's **barrier** takes off up to another 30% — mucus is the best thing in the game against it. Nothing at point blank |
| **Gas** | 1.1 radius | 7 /s | **2 s puffing, 2 s recharge** | nothing | slows for 0.5 s and makes the victim curl up for 0.45 s. Typed `venom`: armour ×0.55, and the acid barrier does **not** apply to it |
| **Electric** | 1.4 radius | 16 per shot | **2.2 s cooldown** | `attack` | **stuns for 1.6 s**, and a stunned creature's `think` is not called at all. Also hurls the victim away. Typed `shock`: armour ×0.45 as if it were blunt — a plate is not what stops current — and then the victim's **insulation** takes off up to another 30%. It is an **area** hit: every cell within the radius is damaged directly, so a shell does not have to be broken through |
| **Sonic** | **2.6 radius**, 0.9 rad cone | 11 per shot | **2.8 s cooldown** | `attack` | the longest reach in the game. Ear cells that catch it are stunned 0.8 s; the victim tumbles for 0.95 s. The cone aims itself at your target |
| **Blunt plate** | contact | up to **34** | 0.75 s cooldown | impact | damage scales with impact speed and is **zero below 0.9** — it has to be swung |
| **Nettle** | contact | 5 + venom 9 | 0.5 s cooldown | contact | the venom keeps burning after contact ends and the victim stiffens for 1.1 s |
| **Horn spike** | contact | 9 | 0.5 s cooldown | being touched | a defensive cell that hurts whatever runs into it. `pierce`: armour ×0.45 |

The burst clocks of acid and gas only run **while there is something in range**,
so a creature does not waste its charge on empty water.

### 6.3 Ink — the only cell that hides you

| | |
| --- | --- |
| radius | 1.6 |
| **cooldown** | **2 s** |
| **the cloud lasts** | **3.6 s** |
| released while | your state is `flee` or `hurt` |

It blinds every enemy caught in it for 2.5 s — their eyes drop to 15% of their
range, every other sense to 38% — and it **hides you for as long as the cloud
lasts**:

```
  chance a sense FAILS to find you while you are in your own ink
  eye      96%  ████████████████████████████████████████▏
  smell    88%  ████████████████████████████████████▏
  hearing  55%  ███████████████████████▏
  touch     0%  ▏
```

Three things follow, and they matter more than the numbers:

1. **`bot.scan()` returns `null` for a creature inside its own ink.** Nobody can
   read your structure while you are hidden, and you cannot read theirs.
2. **Memory stops tracking it.** A remembered percept normally follows its
   object around; through ink it does not, so `percept.pos` is where it *was*.
   Measured, a hunter chasing an inked target ends up **3.75 units** from where
   it actually is.
3. **Ears and touch still find you**, and fleeing is precisely what makes you
   loud. Measured over 25 s: a hunter with the standard kit perceives an inked,
   fleeing creature 28% of the time; a hunter carrying **6 ear cells** perceives
   it **54%** of the time.

With a cooldown of 2 s and a cloud of 3.6 s, a creature with ink cells that
stays in `flee` is hidden continuously — and is also, by definition, never
attacking. `bot.hidden` tells you how many seconds of cover you have left.

### 6.4 What is being done to you

Each of these is a countdown in seconds on `bot`, and each names a different
enemy weapon. They are the only way to tell what you are being hit with.

| member | weapon | meaning |
| --- | --- | --- |
| `bot.stunned` | electric | **1.6 s** — while it is above 0 your `think` is not called |
| `bot.shocked` | electric | 0.45 s of residual tremor |
| `bot.blind` | ink | 2.5 s; eyes cut to 15% of range, other senses to 38% |
| `bot.slowed` | gas | 0.5 s of reduced speed |
| `bot.gassed` | gas | 0.45 s of curling up |
| `bot.corrosion` | acid | 0 to 1, and it does not expire on its own: at 1 the body cannot hold its shape or swim |
| `bot.stung` | nettle | 1.1 s of burning and bristling |
| `bot.spinning` | sonic | 0.95 s of tumbling out of control |
| `bot.pain` | anything | 0 to 2 |

Acid and gas reactions are deliberately **late**: the damage lands at once but
the visible response waits 0.20 s (acid) or 0.55 s (gas), scaled by how far the
attacker is — the particles have to arrive first.

### 6.5 Food and energy — what a fight is actually paid for with

Food is dropped into a vessel by hand: the **💧 Food** button, or the **F**
key. It does not appear on its own, so how much there is, and when, is up to
whoever is watching. Two kinds count as food, and `bot.foods()` returns both.

| | worth | how it is taken |
| --- | --- | --- |
| **a free morsel** | 22 – 38 energy | gastric cells absorb 11/s each, within 0.30 of themselves |
| **a cell knocked off a body** | 8 – 15 energy, by its mass | the same: dead cells turn into morsels where they fell |
| **a corpse** | **1.52×** the energy per second of a morsel, and **twice** the push to grow per mouthful | gastric cells eat it directly, cell by cell |

Absorbing needs no state at all — a gastric cell takes in whatever drifts
close enough. What the `feed` state adds is the limbs: they reach the morsel
and carry it to the stomach, which is several times faster than waiting.

**Why it decides fights.** Energy is not a health bar, it is a budget:

- **every cell charges upkeep every second**, so a bigger body costs more to
  keep — measured, 1.75× the upkeep for 1.8× the cells;
- at **zero energy the body eats itself**, one cell every 1.6 seconds. Fat
  cells go first and give back 20 each, and then it starts on the rest;
- above **70% of capacity it builds new cells**, up to eight at a time —
  which is more armour, more muscle and more hit points that the other one
  has to chew through;
- having eaten enemy tissue lowers that threshold by up to **42%** and
  shortens the wait between growth spurts by up to **60%**, so a kill tends
  to be followed by a growth spurt;
- and **nothing heals** without immune cells, so damage is permanent while
  energy is renewable.

That asymmetry is the whole reason a program should be greedy about food. A
morsel is usually worth more than a poke: the poke does damage that will be
paid back by their next meal, the morsel becomes cells that never go away.
`bot.hunger` runs 0 (full) to 1 (empty); `bot.energy` and `bot.energyMax` are
the raw numbers.

It is also what everything else is billed against — a rebuild costs
`5 + cells × 0.2`, so a creature that restructures itself has to eat to
afford it.

### 6.6 Everything else

| cell | what it gives you |
| --- | --- |
| **Brain**, **Ganglion** | thinking. `bot.brainPower` at 0 means your program is not called at all |
| **Nerve** | carries signals. A cell with `innervation` 0 is disconnected and does nothing |
| **Muscle** | limb power. **Cilia** give slow thrust and need no nerves |
| **Gastric** | the only source of energy — digests within 0.30 of itself |
| **Adipose** | energy storage; **Vascular** cuts the upkeep of distant cells |
| **Immune** | repairs neighbours within 0.55 at 2.2/s — **the only healing there is** |
| **Adhesive** | grips on contact and holds the victim still. 1.2 s cooldown |
| **Mucus** | blunts corrosives and stops enemies gripping you |
| **Bioluminescent** | light: it draws curious prey toward you |
| **Germ** | buds off a daughter when energy is above 88% |

## 7. The genome

`bot.dna` is a frozen copy. You cannot change it, but reading it lets one program
behave differently in different bodies:

`seed`, `symmetry`, `clusterSize`, `autoRistrutt`, `shellCoverage`, `limbCount`,
`limbSpread`, `limbCurve`, `taper`, `rigidity`, `growth`, `metabolism`,
`aggression`, `fear`, `curiosity`, `hue`, `cageShape`, `cageWidth`.

`aggression`, `fear` and `curiosity` are 0–1 and are exactly what the built-in
brain weighs. A program that reads them stays in character:

```js
const boldness = bot.dna.aggression - bot.dna.fear;
if (bot.ratioTo(prey) < 1 + boldness) bot.chase(prey, 1);
```

---

## 8. The event hooks

### `onDamage(bot, ev)`

Called once for every cell of ours that takes damage — possibly many times per
step during an acid bath. Keep it very short.

`ev.cell` (the `Cell` view that was hit), `ev.amount`, `ev.kind`
(`'blunt'` \| `'pierce'` \| `'acid'` \| `'venom'` \| `'starve'`), `ev.from`
(the attacking `Creature` view, or `null`), `ev.fromCell`.

This is the only way to notice an attack coming from a direction you were not
looking at. Record it in a top-level variable and act on it in `think`:

```js
let hitAt = -99, hitBy = null;
function onDamage(bot, ev) { hitAt = bot.time; hitBy = ev.from; }
function think(bot, dt) {
  if (bot.time - hitAt < 1.5 && hitBy) { bot.flee(hitBy, 1); return; }
  // …
}
```

### `onDeath(bot, reason)`

Called once. The program is detached immediately afterwards. Useful only for
logging.

### `setup(bot)`

Called once at load. The body is already built, so you can inspect it and plan:

```js
let plan = 'brawler';
function setup(bot) {
  if (bot.weaponRange > 1) plan = 'sniper';
  else if (bot.hasCell('ink')) plan = 'skirmisher';
  bot.log(`plan: ${plan}`);
}
```

---

## 9. Debugging it in the app

**Shift-click a creature that is running a program** and its editor opens,
already focused, with a short flash so you can tell which of several panels it
was. Shift-*drag* still moves the whole body — a click is not a drag, and the
two share the key without either giving it up.

You can also select the creature and press **🐞 Debug** in *Actions*; like
**■ Stop**, that button is greyed out when nothing is running, because there
would be nothing to watch. Either way a panel opens with the program in a
syntax-highlighted editor, and it works on a live creature while the simulation
runs. Drag its title bar to move it, drag the corner to resize it, double-click
the title bar to put it back; the position, the size and the fade are
remembered. The **▾** next to the ✕ rolls the panel up to its toolbar and back
to exactly the height it had — useful for keeping the controls of three
programs to hand without three editors covering the tank.

**There can be several at once, one per creature** — which is the only way to
watch two programs fight each other. Each keeps its own breakpoints, its own
fade, and its own console: a panel shows only what *its* creature printed or
got wrong. Opening one for a creature that already has a panel brings that one
forward instead of making a second.

**If a creature dies while running a program you were editing here**, its panel
reopens by itself on the dead body — so the code you had written is never lost
with the creature. From there you can export it, or drag the **◎** target onto
a live creature to carry it over. A program loaded from a file does not trigger
this: the file already holds it.

- **The gutter flashes.** A green bar lights up next to every line as it
  executes and fades over a third of a second, so you watch the path your
  program actually takes, frame after frame. The current line stays
  highlighted.
- **Click a line number to set a breakpoint.** Only lines that start a
  statement can take one; the others have no dot. When one is hit the whole
  simulation pauses and the line turns red.
- **The inspector on the right lists the local variables** in scope *at the
  line that was last sampled* — your own top-level variables, the locals of
  `think`, `dt`, whatever exists there. It is read from the real scope, not
  reconstructed, so it shows exactly what the code can see. Values are sampled
  ten times a second, or exactly at the stop when you are stopped.
- **▶ Apply** compiles what is in the editor and hands it to the creature.
  This is a full restart of the program: top-level variables go back to their
  initial values. `⌘/Ctrl + Enter` does the same.
- **⬇ Export** downloads the editor content as a `.js` file.
- **◎** is a target you drag onto any creature in a vessel: it gives that one
  the program in this editor and opens its own panel. Dropped on empty water
  it does nothing. It is the shortest way to put the same brain in two bodies
  and watch them diverge.
- **▶ Continue** lets the simulation go again. **⤓ Step line** re-runs the step
  and stops one line further along the path. **⏭ Frame** runs exactly one
  simulation step with breakpoints suspended.
- **The console under the editor** collects everything the program said or got
  wrong — every exception with **the line it came from**, whatever `bot.log()`
  and `bot.say()` printed, and a note when a program starts, stops, or is
  detached after too many errors. Repeats are folded into one line with a `×N`
  counter, because an error inside `think` is not a new error sixty times a
  second — it is the same error continuing. Click the line number on the left
  of an entry and the editor scrolls to it. The bar folds the console away, and
  **clear** empties it.
- **The ◑ slider fades the whole panel**, background blur included, so you can
  watch the creature through the code and check that the line lighting up
  matches what it is actually doing. The setting is remembered.

Once the panel is open the editor is the fastest way to work: change the code,
press **▶ Run**, and the creature is thinking with the new version — no file, no
reload. To *start* from nothing, load any `.js` with **🧠 BrainProgram…** (the
one-page skeleton in [§2](#2-the-one-page-skeleton) is enough) and then edit it
here.

### What a breakpoint really does

There is no way to suspend JavaScript and resume it later — the same thread is
drawing the scene. So a breakpoint **pauses the simulation and abandons the
rest of that `think` call**: the creature simply does not act on that frame.
Nothing is visible, because the world is stopped anyway, and the next frame
starts `think` again from the top.

That is why **Continue** advances one frame at a time when a breakpoint is
inside `think`, and why **Step line** re-runs the step rather than resuming it.
For a program that *is* one frame, that turns out to be the natural
granularity — but it does mean the world has moved on by one step between one
stepped line and the next.

### Where an error's line number comes from

The program runs inside a `new Function`, so the browser reports stack lines
against a wrapper that has a signature, a brace and a `"use strict";` in front
of your code. The offset is not guessed: it is measured once, at startup, by
compiling a probe that throws on a known line. So the line the console shows is
the line in your file, and it stays right even if the browser changes how it
builds that wrapper.

### What the line markers cost

To know which line is running, the source is rewritten before compiling: a
marker call is inserted in front of every statement, on the same line, so the
line numbers you see are the line numbers of your file. Measured on a 35-line
program: `think` goes from 1.25 µs to 3.4 µs per creature per frame, against
about 2500 µs for a whole simulation step. It is not worth worrying about, and
that is why closing the panel leaves the program running as it is instead of
restarting it.

Lines that do not begin a statement never get a marker — a continuation line, a
key inside an object literal, the body of an `if` written without braces. This
is deliberate: instrumenting those would change what the program does. If the
rewritten source somehow fails to compile, the program is loaded plain instead
and the panel says so, so a defect in the debugger can never break a working
brain.

---

## 10. Rules and pitfalls

1. **Declare `think`.** A file without it is refused.
2. **No top-level `return`**, no `export`, no `import`, no `await`.
3. **Never loop or block.** One frame of thought per call.
4. **You cannot fire a weapon.** Set the state and the target.
5. **Check what body you are in.** `bot.hasCell(…)`, `bot.weaponRange`,
   `bot.limbCount` — half of them will be zero on some creature.
6. **Use `bot.remember`** for targets, or your creature will dither.
7. **Perception is partial.** An empty `bot.enemies()` means *we cannot see
   anyone*, not *nobody is there*.
8. **A creature in its own ink cannot be scanned or reliably seen.** Check
   `bot.canScan`, keep the last profile, and do not read a failed scan as
   "harmless".
9. **Kin are untouchable.** `percept.friendly` means a truce is in force and
   attacks do literally nothing. Skip them.
10. **`bot.stunned > 0` means `think` is not called at all** — do not build logic
   that depends on running while stunned.
11. **Ranged weapons need a target creature, not a direction.** They fire at
    whatever `bot.attack(target)` set, and only if it is inside their radius.
    Setting the `attack` state with no target does nothing at all. The sonic
    cone is aimed at that target for you; where the body happens to be pointing
    only decides who *else* gets caught in it.
12. **Do not touch `bot.dna`, the views, or anything you did not create.** The
    views are read-only; writing to them does nothing useful.
13. **Everything you print goes to the browser console.** Use `bot.log`, not
    `console.log`, so the rate limiter can protect the frame rate.
14. **A rebuild cannot create anything.** `bot.restructure` takes the cells
    you already have and puts them somewhere else, at a cost in energy and
    with a cooldown. If it is refused, the reason is in the Debug console.
15. **When in doubt, open 🐞 Debug** ([§9](#9-debugging-it-in-the-app)) and
    watch which lines actually light up. Half the bugs in a brain program are
    a branch that is never taken.

---

## 11. A complete, non-trivial example

A skirmisher: it stays at the edge of its own weapon range, uses ink to break
contact, and only closes in when the enemy is already hurt.

```js
/*  SKIRMISHER — keeps its distance, bleeds the enemy, never brawls. */

let plan = 'melee';
let hitAt = -99, hitBy = null;
let post = null, postT = 0;

function setup(bot) {
  plan = bot.weaponRange > 1 ? 'ranged' : 'melee';
  bot.log(`${bot.name}: ${plan}, reach ${bot.reach.toFixed(2)}, ` +
          `range ${bot.weaponRange.toFixed(2)}`);
}

function onDamage(bot, ev) { hitAt = bot.time; hitBy = ev.from; }

function think(bot, dt) {
  const hurt = bot.health < .5 || bot.corrosion > .3;
  const justHit = bot.time - hitAt < 1.2;

  // 1. break contact: fleeing is also what empties the ink sacs
  if (hurt) {
    bot.flee(hitBy || bot.biggestThreat(), 1);
    bot.waveAll(2.2, 3.4);
    return;
  }

  const prey = bot.remember('prey', bot.easiestPrey());

  // 2. nothing in sight: eat if hungry, otherwise patrol
  if (!prey) {
    const food = bot.nearestFood();
    if (food && bot.hunger > .3) { bot.eat(food); return; }
    postT += dt;
    if (!post || postT > 7 || bot.distanceTo(post) < .6) { post = bot.randomPoint(.8); postT = 0; }
    bot.moveTo(post, .45);
    return;
  }

  const d = bot.distanceTo(prey);
  const enemy = prey.creature;

  // 3. ranged body: hold the edge of our range and keep facing them
  if (plan === 'ranged') {
    const band = bot.weaponRange * .85;
    if (d > band)      bot.chase(prey, .9);
    else if (d < band * .6) bot.flee(prey, .5);
    else               bot.attack(prey, null, .1);
    return;
  }

  // 4. melee body: only commit when they are already losing
  const worth = bot.ratioTo(prey) < 1.1 || justHit;
  if (!worth) { bot.moveTo(prey, .3); return; }   // shadow them, do not engage

  if (bot.inReach(prey)) {
    const soft = enemy ? enemy.weakestCell(bot.pos) : null;
    bot.attack(prey, soft, .25);
    const arm = bot.bestLimb;
    for (const limb of bot.limbs) {
      if (limb === arm && soft) limb.strike(soft);   // one limb tears
      else                      limb.reach(prey);    // the others hold on
    }
  } else {
    bot.chase(prey, 1);
  }
}
```
