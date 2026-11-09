# WO3U character porting notes

These notes cover bringing a character from another Koei Tecmo game into Warriors Orochi 3 Ultimate (PC), or building one from scratch. They describe how the game stores a character, where ports tend to go wrong, and what I have yet to figure out.

Everything here comes from reading the data and code of WO3U (Steam release, v1.0.0.1) and of the two source games checked so far, Samurai Warriors 4 and Samurai Warriors 3 (Wii). When these notes mention a source game, they mean one of those two. Other games may behave differently. Exact table ids, offsets and function addresses are in the Reference section at the end.

## Tools

You'll be working with Koei Tecmo's LINKDATA archives and their model, animation, texture and effect formats (G1M, G1A, G1T, G1FX), so start with an unpacker and readers for those formats. Ghidra or another disassembler covers anything the data alone doesn't explain, and Blender is handy for checking meshes and skeletons. Most of the work ends up as small converters that you run many times.

In WO3U and both source games, each component (skeleton, hits, effects) is driven by a table or a function. Converting from those gives exact results. Offsets nudged by eye until a move looks right tend to break on the next character.

## How the game sees a character

WO3U has 145 playable characters, numbered 0 to 144. Each one is spread across several tables: a master record (stats, skills, category, type), a unit row (name, voice, model and moveset ids), a costume row, a motion-pack row and a set of weapon rows. The game expects all of these to share the same number, which leaves two options.

You can replace an existing character by putting your character's data into a stock character's rows. That's data only, and every mode works straight away, but you lose the character you replaced.

Adding a new slot is much harder. The game checks "is this a valid character number?" in hundreds of places, and every one of them has to accept your new id. You'll need a DLL loader, your own copies of the tables and a side save file, because the stock save packs team members into a single byte. Then you visit every screen (shop, Gallery, Duel, Gauntlet, bonds, results and so on) and fix the checks that turn your character away. Logging every check that sees your new id while you click around is a good way to find them.

## Getting the source data

Samurai Warriors 4 and Samurai Warriors 3 keep movesets, hit data and effect timings as data files, so they can be converted exactly.

Some archive entries are stored uncompressed, and some extractors silently hand you an empty file for those. Wii and PS3 games are big-endian, and Samurai Warriors 3 on Wii also uses older format versions, so it needs extra conversion work.

If you can't work out what a field means, find the function that reads it. Samurai Warriors 4 closes itself when a debugger attaches, so a small DLL that only reads memory can be a better way to watch values live.

## Skeleton

WO3U finds hands, weapons, effects and hit shapes by joint number, so every character uses the same 114-joint layout. The shared animations (hit reactions, getting up, riding) drive the first 89 joints by number. If your joints don't line up with the standard ones, the character twists and stretches every time they get hit.

Build the skeleton from the source character, but in WO3U's layout. Match bones by what they do (pelvis, thigh, forearm), not by name. Twist bones are easy to miss: left as extra joints, nothing in WO3U moves them and sleeves tear. Anything the standard layout doesn't have, like hair or cloth chains, goes on new joints after the standard ones.

If you write your own model files, two more things can go wrong. The skeleton section ends with a short list of joint groups, one for the main skeleton and one per physics chain. If that list is empty, the character is invisible or the game freezes at battle start. And if the LOD entry doesn't match the final matrix count, the model sinks into the floor.

## Models and costumes

The stock game crashes if a model has more than about 15,000 vertices, because its shared buffer overflows without warning. Each drawn piece can use up to 32 bones, so bigger pieces need splitting. Each model also gets a fixed memory block for its piece and bone tables, and I haven't found a way around that limit yet.

Samurai Warriors 4 cloth (NUNV) works in WO3U as it is, since both games run the same cloth system. Those pieces need WO3U's cloth shader variants, or the loose vertices fly to the origin. I haven't checked cloth from other games. If the source cuts hair and lashes out with alpha, build them the same way here, or they get hard edges.

Each character has 25 costume slots: ten Standard and fifteen Downloaded. A data file, not the exe, controls whether a Downloaded slot shows up, so new costume slots don't need code.

## Animation

WO3U and Samurai Warriors 4 both run actions at 60 frames a second, and Samurai Warriors 3 stores its timings in 1/60 s, so timings carry over frame for frame. Keep the source's joint rotations and rescale only the hip movement to fit the new body.

Check how the source game holds its weapons. Samurai Warriors 4 mounts weapons on a helper bone near the wrist that has its own animation. Attach the weapon to the hand instead and every spin and throw disappears.

If the source game speeds up or slows down a move, apply that speed when the move plays. Baking it into the animation throws the hit timings and cancel windows out of step with the source data.

## Moveset

A moveset is four motion files full of action, attack and item records.

- The last page of reactions (getting hit from different directions) is shared by every Samurai Warriors character in WO3U, so a new Samurai Warriors character doesn't need its own.
- Basic movement (idle, run, jump, guard) comes in roughly the same order in WO3U, Samurai Warriors 4 and Samurai Warriors 3: their first 15-17 generic actions line up by length. You still need to check each row's role before pairing them.
- WO3U's tables hold six normal attacks. Anything longer needs your own code.
- If the source move has no cancel window, set it to "never" rather than zero. Zero means the move can be cancelled straight away.
- Character type (Power, Speed, Technique, Wonder) is one byte, but setting it does nothing unless the moves carry that type's data too. A Speed character needs a double jump and jump-cancel flags on their attacks.
- Combo length unlocks with level, so a level 1 character only has short chains.

WO3U checks hits with thin lines swept along a bone and tested against the target's cylinder. Samurai Warriors 4 uses spheres, cylinders and boxes, which WO3U's format can't express exactly, so an exact port means running SW4's own hit test in your code. SW4's damage formula has the same shape as WO3U's, so SW4's power value can go straight into WO3U's damage byte. I haven't compared other games' damage formulas.

## Effects

WO3U only loads one version of the effect format, 0025. Samurai Warriors 4 effects load as they are. Samurai Warriors 3 on Wii uses version 0018 and needs converting. I haven't checked other games.

WO3U and Samurai Warriors 4 both place an effect at its own offset relative to a bone, every frame. Use the source record as it is. If you add a rotation to correct it, the effect gets rotated twice.

Samurai Warriors 4 effects can look washed out in WO3U because SW4's shaders brighten flagged particles and WO3U's ignore the flag. Converting the colour of your own particles fixes it.

In WO3U, Samurai Warriors 4 and Samurai Warriors 3, code picks the hit sparks and dust, so there's nothing to port there.

## Weapons

Each action says which bone each weapon part sits on, so weapon placement can change mid-combo. Weapons can also have their own animations. If one does, every action needs a weapon animation, or the weapon falls back to its bind pose.

The game copies weapon textures into fixed-size pools (256x256, 256x128, 256x64 or 128x128), so any other size shows up garbled in game even though it looks fine in a viewer. The texture's alpha holds both the shine and the cutout, so don't paste a shine mask straight into it.

The X-tier weapon always loads the tier 4 model. A unique X weapon needs a code hook.

## Names, voices and menus

One field in the master record sets which tab a character appears in on the select screen, and every menu reads the same field. Each tab holds up to 30 characters.

The game won't read text ids above a certain number, and the English text has only 19 blank ids under that limit.

Voices come in two systems: short combat shouts in sound banks, and spoken lines with subtitles as streamed audio. A new character needs both. Character select art lives in large texture atlases, with separate copies per language.

## Where a character shows up

Outside battle, a character appears on character select, the camp, Check Model, the Gallery, Duel, Gauntlet, Musou Battlefields, the shop, growth, bonds and battle results. In battle, musou attacks, Triple Attacks, mounted attacks, switch-ins and hit reactions from the front and back each use different data.

## What I have yet to figure out

- Only 19 free text ids exist under the game's limit. Going past that means patching every place the limit is checked.
- The select screen is built around exactly nine tabs. The art has room for more, but I haven't built one yet.
- The Gauntlet unlock list and the bonds table are sized for the stock roster and haven't been extended.
- Story animations only exist for characters 0 to 86.
- The per-model memory block mentioned above has no known workaround.
- I only partly understand the reaction and element parts of WO3U's hit data.
- I haven't decoded the per-character sound set table, and I haven't tried building a brand-new weapon family (parts, tiers, prices).
- I haven't found Samurai Warriors 3's musou hit data, and its effects (G1FX 0018) only partly convert.
- Samurai Warriors 4 and Samurai Warriors 3 each needed their own converter. I haven't written one that works for any game.

## Credits

Tools and research by other modders that these notes draw on:

- Joschuka: G1M format research and the [fmt_g1m](https://github.com/Joschuka/fmt_g1m) Noesis plugin.
- eArmada8: [gust_stuff](https://github.com/eArmada8/gust_stuff), a G1M mesh exporter and importer.
- VitaSmith: [gust_tools](https://github.com/VitaSmith/gust_tools), including G1T texture conversion.
- eterniti (G1M Tools) and the Three Houses Research Team: earlier G1M format work.
- PythWare: [GokonSoftworks](https://github.com/PythWare) (LINKDATA unpacking and rebuilding) and Kybernes Tools (includes a Warriors Orochi 3 unit table editor).
- wxhwz ([bilibili](https://space.bilibili.com/114495216)): a WO3U DLL mod loader (dinput8.dll), based on techiew's [EldenRingModLoader](https://github.com/techiew/EldenRingModLoader).
- Rich Whitehouse: Noesis, a model and texture viewer and converter.
- vgmstream: game audio decoding, including KOVS.
- Koei Wiki ([koei.fandom.com](https://koei.fandom.com)): move lists and character references.

General tools: Ghidra, Blender, Python (NumPy, Pillow, Capstone) and Upscayl.

## Reference

Code locations are Ghidra addresses with image base `0x7ff768a10000`.

| What | Where |
|---|---|
| Character master table | Archive entry 32, item 2. In memory at `DAT_7ff7695d4d48 + 0x51740 + id x 0x628 + 8`. Category = field 15 (read at +0x51766, values 0-8). Type = byte +0x64 (0 Power, 1 Speed, 2 Technique, 3 Wonder) |
| Unit row | 0x30 bytes, 2206 rows. +4 name id, +8 voice set, +0xA model id, +0xC moveset id |
| Costume row | 0x6A bytes: base motion sets +0 / +2, then 25 (model, texture) pairs. Mapped through table 10100 |
| Costume unlock | Archive 6733 status array; a value under 2 loads descriptor 14754 + content |
| Motion-pack table | Archive 10102, 255 rows x 7 s16. Page chosen by `FUN_7ff768a1ced0` (action >= 0x180 = page 2) |
| Weapon table | `CAllWeaponData`, 1400 rows of 0x48 bytes, row 1400 = no weapon. Parts 10106, type-to-bone map 10107, part records 10108. Action +0x2A weapon type, +0x2B / +0x2C window |
| Weapon cards | Archive 000, 3132 + weapon row, 256x256 DXT1 |
| X weapon file | Hard-wired in `FUN_7ff768a6c110` |
| Save team ids | Packed into one byte, code at RVA 0x238F80 |
| Range checks | `CMP` against 0x87, 0x88, 0x90, 0x91, 0x95, 0xFE, 0xFF (about 1,800 sites) |
| Skeleton | 114 joints; ids 0-88 driven by shared motions 1, 0x1B7, 0x248; weapon bones 55 / 56 |
| G1MS joint groups | After the id table: layer 0 = joint count - 1, then each physics chain length - 1; flags 1 only with chains; weapons `[1]`. Reader `FUN_7ff768f0a7a0` |
| Model limits | 14,979 vertices, 1,048,916 vertex bytes, 117,036 index bytes, 32 bones per piece, 0x19000 heap per model, 1024 px costume textures |
| Cloth shaders | `STD-CNRi` (LOD group 0), `SDCTH` (shadow) |
| Hit test | Swept segments vs target cylinder, `FUN_7ff768ae3f70`. Damage byte at hit block +7; reaction +0x0A, forces +0x0C / +0x0D |
| Speed type data | Midair-jump flag on rows 21-23, double jump action 108, jump-cancel flag on attacks |
| Level gate | Charblock +0xCF = level - 1, read by `FUN_7ff768a2a890` |
| Effects | G1FX 0025 only. SW4 gamma flag = emitter draw byte +4 bit 0x20. Effect parts >= 0x40 = weapon bone part - 64 |
| Musou cameras | Archive 10059, G1A clips |
| Name text ids | Clamped above 0x76B; blank English ids 1881-1899 |
| Audio | Combat shouts: KWB2 banks, archive 000 6075-6368. Lines: KOVS, archive 003 14718-14749, index tables 000 0-31. Music: `bgm\BGMLink.g1l` |
| Select screen art | Atlas 6051 (figures 0-144, name plates 184-328, tabs 161 / 172), portraits 6052, Gauntlet 6053 |
| Story event motions | Archive 0x1E1C + id, characters 0-86 only |
