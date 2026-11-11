# Online player world editing (26.1.2)

Uses the existing world-edit request/reply, 500 ms rate limit, token, revision,
one-step undo and area/reach guards. No offline player files are read or written.

## Target and permission

Open with `slot:{kind:"entity",dim,player:"self"}` or
`slot:{kind:"entity",dim,player:"name",name}`; a crosshair UUID/id also resolves
online players. Canonical slots have UUID/id and `player:"self"|"online"`.
Every open/apply/undo requires the requester's real
`ServerPlayer.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER)`.
Existing editor policy and area protection also apply. No self-edit exception.
Unknown/offline explicit player selectors return `player_offline`; insufficient
vanilla permission returns `player_forbidden`; unsupported Player subclasses
return `player_target`. Other guards retain their existing errors.

## Snapshot and apply

`world.kind="entity"`, `world.type="minecraft:player"`,
`world.player:{self:boolean,name:string,uuid:string}`.
`world.views.player` contains the following normalized values and `schema`:

```json
{
  "container":{"size":43,"slots":[{"slot":0,"stack":{"empty":true}}]},
  "ender":{"size":27,"slots":[]},
  "SelectedItemSlot":0,
  "Health":20,"AbsorptionAmount":0,
  "food":{"foodLevel":20,"saturation":5},
  "experience":{"XpLevel":0,"XpP":0,"XpTotal":0},
  "playerGameType":"survival",
  "abilities":{"flying":false,"mayfly":false,"invulnerable":false,"mayBuild":true,"instabuild":false,"walkSpeed":0.1,"flySpeed":0.05},
  "attributes":[{"id":"minecraft:max_health","base":20}],
  "active_effects":[],"Tags":[],"CustomName":null
}
```

This is an interface example, not a captured game sample. Container sizes are
read from the target's actual containers; equipment mapping comes from Inventory.
Stacks use the existing StackCodec JSON (`id,count,comps,component_snbt`), empty
stacks use `{empty:true}`.

Apply only `entity:{player:{...}}`; supplied sections are patches. Containers
accept `{slots:[{slot,stack}]}` with unique indices. Attributes accept unique
`{id,base?,modifiers?}` patches; effects and Tags replace their complete lists. CustomName
uses ComponentSerialization JSON or null. Unrecognized fields are rejected.
Raw SNBT, generic entity edits, riding and block fields are forbidden for players.

Schema lives in `views.player.schema` and `entity_schema("minecraft:player").views.player`.
Attribute IDs, defaults and bounds come from Player.createAttributes and the
live attribute registry; game modes from GameType.values; effects from the live
mob_effect registry and MobEffectInstance.CODEC. Selected slot uses
Inventory.getSelectionSize. Health uses effective max-health; saturation cannot
exceed foodLevel, XP progress is [0,1), level is 0..1,000,000 and total is 0..Integer.MAX_VALUE.
Abilities speeds are finite nonnegative floats (editor safety bound 1); permissions
are never derived from editable abilities.

Exact schema keys:
- source: provenance string.
- gameModes: GameType.getName() string array.
- selectedSlotMax: Inventory.getSelectionSize()-1 (minimum zero).
- inventorySize / enderSize: native container sizes.
- equipmentSlots: [{slot:int,equipment:EquipmentSlot.getSerializedName()}].
- attributes: [{id:string,base:number,min?:number,max?:number}], from real player
  attribute supplier and RangedAttribute bounds.
- effectsRegistry / effectsCodec: minecraft:mob_effect / MobEffectInstance.CODEC.
- effects: {registry,codec,shape,amplifier:{min,max,source},infiniteDuration}.
  Duration accepts the real codec's int range; amplifier uses native codec
  normalization. hidden_effect follows the same native codec shape.
- speedMax: 1; bounds: map from dotted field name to {min,max,source} for Health,
  AbsorptionAmount, food.foodLevel, food.saturation, experience.XpLevel,
  experience.XpTotal, experience.XpP, abilities.walkSpeed, abilities.flySpeed.
  World snapshot Health/Absorption bounds use this target's effective attributes;
  registry schema describes their dynamic source rather than a target value.

Changing playerGameType also adopts native GameType.updatePlayerAbilities values
for the five boolean abilities unless explicitly supplied in the same patch.
XP levels use native setExperienceLevels with the nonnegative int range (0 to
2147483647). Progress writes the public experienceProgress float directly, as
native player persistence does; editing level or total does not quantize an
unchanged fraction. XpTotal uses the public totalExperience field followed by the
native XP packet. Levels above 238609311 overflow vanilla's int calculation of
the next-level cost; the UI discloses this native limitation rather than imposing
an arbitrary one-million-level cap.
No full player-NBT load or connection field assignment is used.

## Safety, conflict and undo

No ServerPlayer.load is called. Validated plans use native inventory, food, XP,
game-mode, ability, attribute and effect methods, followed by vanilla sync packets
and menu broadcasts. Undo uses the same methods and rechecks permission/reach.
The preimage contains only editable sections, never connection/world state.

Identity, position, motion, rotation, dimension, Brain, recipeBook, advancements,
statistics and connection state are excluded from editable data and reject writes.
Revision is an opaque frozen session generation (world-revision-contract.md), not a live saved-player hash. The three-way merge uses the editable projection. Movement, exhaustion,
food tick timer, air/fire, fall distance, seenCredits and other unexposed counters
are therefore untouched and cannot cause stale conflicts. Effects retain current
duration for unchanged entries; XP progress retains current value unless explicitly
edited. All editable fields now use path-level base/mine/current merging: unchanged Health and inventory paths retain current values; only different edits to the same path conflict. See [world-merge-contract.md](world-merge-contract.md) for conflicts:[{path:[...]}] (maximum 20), server-side draft diff and selective undo.
Normalized patches are rebased again after parsing: forms echoing the originally
opened XP fraction or effect duration do not rewind them. A value differing from
the opened value is an intentional edit; undo restores intentional XP changes.
Walking out of reach still rejects; self distance is zero.

Errors additionally include `protected_field`, `invalid_request`, `slot_invalid`,
`target_changed`, `out_of_reach`, `not_allowed`, `payload_too_large`. Remote servers
without this mod remain unavailable.

## Verification

See logs/world-player for bytecode audit, JVM gates and any dedicated-server probe.
Live client validation is pending while the user's Minecraft is running.

Real captured normalized before/after/undo values and packet dispatch names:
历史采集回执（仅本地归档：`docs/archive/world-player-samples.json`，不随仓库分发）. The probe uses an actual
ServerPlayer in an independent dedicated ServerLevel with a recording packet
listener; no remote client is connected. Test-only player-list registration uses
reflection to exercise actual online lookup and permission/reach resolution.
This verifies native setter state and calls to send packets, not client receipt,
rendering, multiplayer tracking, or third-party protection integrations.

## Unified controls (latest priority)

Only two registered KeyMappings: key.cadeditor.edit defaults I (replaces the old
item I + world O bindings); key.cadeditor.vault defaults O (previously V). Both
are rebindable in vanilla Controls and localized in zh_cn/en_us.

I / /cade decision order:
1. Container screen hovered occupied slot: that item.
2. Shift (vanilla sneak binding or either Shift key): main-hand item, or self if empty.
3. In-reach entity hit: entity, including another online player.
4. Block with block entity: that block, even with an item in hand.
5. Main-hand item.
6. Empty hand plus a plain block with at least one state property: block state.
7. Self. Plain blocks without BE/properties (stone) are not targets.

Vanilla HitResult selects one entity/block; shared WorldEditorClient.hit performs
reach checks. Rejected requests never fall back to another page. EditDispatch.decide
is the pure JVM-tested decision function. Explicit commands remain
/cadeditor block|entity|player [name]|vault. README is maintained by the Lead.

## Vanilla permission audit

26.1.2 bytecode: ServerPlayer.permissions delegates to
MinecraftServer.getProfilePermissions(nameAndId). PlayerList.isOp is true for an
explicit op entry, an integrated-server owner with WorldData.isAllowCommands(),
or allowCommandsForAllPlayers. The non-op return is LevelBasedPermissionSet.ALL
(baseline PermissionLevel.ALL, NOT PermissionSet.ALL_PERMISSIONS).
Thus a single-player owner with cheats disabled and no explicit op grant fails
COMMANDS_GAMEMASTER; with cheats enabled the owner gets OWNER. Creative mode and
edited abilities cannot grant it. See the ServerPlayer, PlayerList and
MinecraftServer javap.txt files under logs/world-player.

## Volatile projection table

| Runtime field | Revision / write policy | Evidence |
|---|---|---|
| Pos/Motion/Rotation/Dimension | Position omitted from stable hash; never written | Real probe moved ServerPlayer |
| Air/Fire/fall_distance, foodExhaustionLevel/foodTickTimer, seenCredits | Absent from editable projection; never written | Player/ServerPlayer/FoodData bytecode under logs/world-player |
| experience.XpP | Omitted from hash; current value merged unless edited | Native float field, explicit XP packet; command-only backend uses setExperiencePoints |
| active_effects duration and hidden duration | Sign only in hash; current countdown merged when unchanged | Real MobEffectInstance.tickServer and JVM nested merge |
| Health, foodLevel/saturation, XP level/total, items, attributes, effect membership/amplifier | Only different concurrent edits to the same path conflict | Real health conflict plus JVM session checks |

The projection contains no recipeBook, advancements, statistics, Brain,
portal/connection/shoulder/spawn/credits state. They are not restored on undo.
Actual Inventory.getContainerSize is 43 in 26.1.2 (36 main plus the real
EQUIPMENT_SLOT_MAPPING, including BODY/SADDLE in addition to armor/offhand).
EnderChest is 27. Never hardcode 41 in the page. Schema equipmentSlots maps
indices to actual EquipmentSlot serialized names.

Attributes also accept permanent modifiers through AttributeModifier.CODEC;
transient gameplay modifiers are retained. Absorption is bounded by effective
minecraft:max_absorption; Health by effective minecraft:max_health. Raise the
corresponding attribute in the same patch, or apply an effect first. XP level
has an editor overflow safety bound 1,000,000; total is 0..Integer.MAX_VALUE.
XP progress keeps the native float fraction in [0,1). Only the command-only
backend quantizes progress to whole points, because experience set points requires
an integer. Decimal step sizes guide controls without truncating typed values.
Effects/game mode can invoke vanilla side effects. Native death from zero health
is not promised reversible after the game processes it.
Requester guards are rechecked on undo. A game-master may edit/undo while spectator, adventure, or mayBuild=false, including after changing oneself into those states. Alive/reach/chunk/border and native area protection remain enforced; no-game-master behavior is unchanged.
Payload size limits remain those of the world-edit envelope; oversized player
projections fail explicitly instead of truncating inventory or component data.
