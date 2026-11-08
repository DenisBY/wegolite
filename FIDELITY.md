# Fidelity map: Wegolite against Oolite

This document maps each mechanic that the v1 single-player loop ports from Oolite to the Wegolite file that implements it, and to the Oolite source that defines it. Each row states whether Wegolite is `faithful` or a recorded `divergence`, and every divergence names its row in the PROJECT.md Key Decisions table. The scope is the single-player loop shipped in v1: launch, flight, docking, trade, outfitting and hyperspace. The source of truth is Oolite release 1.93.1-241 at commit `7437f22` (`third_party/oolite/pin.json`). Every excerpt below is copied from that commit, not from a checkout's HEAD.

## Attribution

The quoted excerpts are from Oolite, Copyright © 2004-2026 Giles C Williams, Jens Ayton and contributors, and are licensed under GPL-2.0-or-later. They are quoted unmodified, taken from `git show 7437f22:<path>`, so each one can be checked against that commit. The quotation is recorded as one row in ASSETS.md.

## How to check a row

The Wegolite cell is a `src/` path and a line. The Oolite cell is the Oolite file and line range, and the excerpt with the same id quotes those lines verbatim. The contract test in `tests/contract/fidelity.test.ts` checks every row on every run. When `OOLITE_SRC` points at a tree at commit `7437f22`, it also checks each excerpt against that tree.

## Mechanics

| Mechanic                                                                        | Wegolite                                | Oolite (7437f22)                                        | Fidelity                                                                                                                                                                                                                  | Excerpt |
| ------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Commodity stock and price for each good at system generation (ECON-01, ECON-02) | `src/sim/economy/market.ts:180`         | `src/Core/OOCommodities.m:261-278`                      | faithful                                                                                                                                                                                                                  | E-01    |
| Chart distance with C integer truncation (NAV-01)                               | `src/sim/hyperspace/jump.ts:89`         | `src/Core/legacy_random.h:154-160`                      | faithful                                                                                                                                                                                                                  | E-02    |
| Witchpoint exit offset on arrival (NAV-05)                                      | `src/sim/hyperspace/arrival.ts:125`     | `src/Core/Entities/PlayerEntity.m:6913-6928`            | divergence: the offset is drawn from the seeded PRNG at jump commit, not from Oolite's global Ranrot stream. PROJECT.md: "Draw the arrival pose from the seeded PRNG at jump commit, in three dimensions as Oolite does"  | E-03    |
| Pitch and roll rates and their damping (FLGT-02)                                | `src/sim/flight/attitude.ts:34`         | `src/Core/Entities/PlayerEntityControls.m:3726-3728`    | faithful                                                                                                                                                                                                                  | E-04    |
| Speed ramp toward the torus cap                                                 | `src/sim/flight/speed.ts:37`            | `src/Core/Entities/PlayerEntity.m:2745-2748`            | faithful                                                                                                                                                                                                                  | E-05    |
| Torus factor from the nearest body (FLGT-04)                                    | `src/sim/flight/torus.ts:78`            | `src/Core/Entities/PlayerEntity.m:2958-2967`            | faithful                                                                                                                                                                                                                  | E-06    |
| Torus mass lock near a body (planet branch)                                     | `src/sim/flight/torus.ts:98`            | `src/Core/Entities/PlayerEntity.m:3019-3024`            | divergence: the torus disengages on any pilot input, which is stricter than Oolite's speed and mass-lock rule. PROJECT.md: "Torus disengages on any pilot input (deliberately stricter than Oolite)"                      | E-07    |
| Launch roll basis taken from the station                                        | `src/sim/flight/launch.ts:58`           | `src/Core/Entities/PlayerEntity.m:6469-6470`            | divergence: launch roll is expressed in the station's world basis, not Oolite's ship-relative value. PROJECT.md: "Launch roll is expressed in the station's world basis (D-10 reconciliation)"                            | E-08    |
| Station and planet aegis                                                        | `src/sim/world/aegis.ts:34`             | `src/Core/Entities/ShipEntity.m:6699-6702`              | faithful                                                                                                                                                                                                                  | E-09    |
| System layout: the sun clears the witchpoint by six sun radii                   | `src/sim/world/layout.ts:139`           | `src/Core/Universe.m:1473-1473`                         | faithful                                                                                                                                                                                                                  | E-10    |
| Docking corridor auto-centre and the y guard                                    | `src/sim/dock/corridor.ts:325`          | `src/Core/Entities/DockEntity.m:748-755`                | divergence: the y auto-centre guard is symmetric. PROJECT.md: "Apply the y auto-centre guard symmetrically"                                                                                                               | E-11    |
| Dock latch arming past the contact proxy                                        | `src/sim/dock/step.ts:163`              | `src/Core/Entities/DockEntity.m:716-720`                | divergence: the latch arms only once the contact proxy is clear, not at the mouth plane. PROJECT.md: "Arm the dock latch past the contact proxy, not at the mouth plane"                                                  | E-12    |
| Docking computer tech-level gate (TL 9)                                         | `src/sim/player/outfitting.ts:303`      | `src/Core/Entities/PlayerEntity.m:8293-8295`            | faithful                                                                                                                                                                                                                  | E-13    |
| Cargo pod and unit boundaries                                                   | `src/sim/economy/cargo.ts:22`           | `src/Core/Entities/PlayerEntity.h:1294-1297`            | faithful                                                                                                                                                                                                                  | E-14    |
| Buying in kg and g, clamped to the hold                                         | `src/sim/economy/cargo.ts:156`          | `src/Core/Entities/PlayerEntity.m:10029-10040`          | divergence: a partially filled hold is clamped exactly. PROJECT.md: "Clamp kg/g buys exactly in a partially filled hold (improves on Oolite)"                                                                             | E-15    |
| Market lifetime across reload and system changes                                | `src/sim/economy/market.ts:41`          | `src/Core/Universe.m:7173-7191`                         | divergence: Wegolite persists one market seed and regenerates from it, so a reload reproduces every price. PROJECT.md: "Stable market across reload: persist the seed (deliberate modernisation)"                         | E-16    |
| Missile removal trade-in                                                        | `src/sim/player/outfitting.ts:443`      | `src/Core/Entities/PlayerEntity.m:9326-9330`            | faithful                                                                                                                                                                                                                  | E-17    |
| Missile cap                                                                     | `src/sim/player/outfitting.ts:43`       | `src/Core/Entities/PlayerEntity.h:284-286`              | divergence: the cap is three missiles, not the four pylons Oolite allows. PROJECT.md: "Cap missiles at 3 and passenger berths at 7"                                                                                       | E-18    |
| Hyperspace fuel cost                                                            | `src/sim/hyperspace/jump.ts:116`        | `src/Core/Entities/PlayerEntity.m:6630-6633`            | faithful                                                                                                                                                                                                                  | E-19    |
| Hyperspace jump clock                                                           | `src/sim/hyperspace/jump.ts:106`        | `src/Core/Entities/PlayerEntity.m:6884-6886`            | faithful                                                                                                                                                                                                                  | E-20    |
| Hyperspace countdown cancelled by a dock                                        | `src/sim/flight/step.ts:218`            | `src/Core/Entities/PlayerEntity.m:3296-3297`            | faithful                                                                                                                                                                                                                  | E-21    |
| Coriolis mass blockage at jump completion                                       | `src/sim/hyperspace/countdown.ts:73`    | `src/Core/Entities/ShipEntity.m:12526-12530`            | divergence: no blockage data for the navigation buoy or for the 224 dodecahedron and icosahedron systems. PROJECT.md: "Block a witchspace jump that completes inside Oolite's mass-blockage radius of a Coriolis station" | E-22    |
| Coriolis station mass for blockage                                              | `src/sim/hyperspace/countdown.ts:55`    | `src/Core/Entities/ShipEntity.m:12504-12504`            | faithful                                                                                                                                                                                                                  | E-23    |
| Chart orientation: a larger galaxy y is drawn lower                             | `src/ui/chart-model.ts:206`             | `src/Core/GuiDisplayGen.m:1575-1575`                    | faithful                                                                                                                                                                                                                  | E-24    |
| Chart star placement                                                            | `src/ui/chart-model.ts:206`             | `src/Core/GuiDisplayGen.m:1947-1948`                    | faithful                                                                                                                                                                                                                  | E-25    |
| Planet surface colour classes (PlanetMix thresholds only; see open items)       | `src/render/shaders/planet.glsl.ts:219` | `src/Core/Materials/OOPlanetTextureGenerator.m:666-679` | faithful                                                                                                                                                                                                                  | E-26    |

## Excerpts

### E-01 src/Core/OOCommodities.m:261-278

```objc
    foreachkey(commodity, _commodityLists)
    {
        good = [_commodityLists oo_dictionaryForKey:commodity];
        OOCargoQuantity q = [self generateQuantityForGood:good inEconomy:economy];
        // main system market limited to 127 units of each item
        OOCargoQuantity cap = [good oo_unsignedIntForKey:kOOCommodityCapacity defaultValue:MAIN_SYSTEM_MARKET_LIMIT];
        if (q > cap) {
            q = cap;
        }
        OOCreditsQuantity p = [self generatePriceForGood:good inEconomy:economy];
        good = [self createDefinitionFrom:good price:p andQuantity:q forKey:commodity atStation:nil inSystem:[UNIVERSE currentSystemID]];

        if (script != nil) {
            good = [self modifyGood:good withScript:script atStation:nil inSystem:[UNIVERSE currentSystemID] localMode:YES];
        }
        [market setGood:commodity withInfo:good];
    }
    return [market autorelease];
```

### E-02 src/Core/legacy_random.h:154-160

```objc
OOINLINE double distanceBetweenPlanetPositions(int x1, int y1, int x2, int y2)
{
    int dx = x1 - x2;
    int dy = (y1 - y2) / 2;
    int dist = sqrt(dx * dx + dy * dy); // N.b. Rounding error due to truncation is desired.
    return 0.4 * dist;
}
```

### E-03 src/Core/Entities/PlayerEntity.m:6913-6928

```objc
- (void)leaveWitchspace
{
    double d1 = SCANNER_MAX_RANGE * ((Ranrot() & 255) / 256.0 - 0.5);
    HPVector pos = [UNIVERSE getWitchspaceExitPosition]; // no need to reset the PRNG
    Quaternion q1;
    HPVector whpos, exitpos;

    double min_d1 = [UNIVERSE safeWitchspaceExitDistance];
    quaternion_set_random(&q1);
    if (abs((int)d1) < min_d1) {
        d1 += ((d1 > 0.0) ? min_d1 : -min_d1); // not too close to the buoy.
    }
    HPVector v1 = HPvector_forward_from_quaternion(q1);
    exitpos = HPvector_add(pos, HPvector_multiply_scalar(v1, d1)); // randomise exit position
    position = exitpos;
    [self setOrientation:[UNIVERSE getWitchspaceExitRotation]];
```

### E-04 src/Core/Entities/PlayerEntityControls.m:3726-3728

```objc
    double roll_dampner = ROLL_DAMPING_FACTOR * delta_t;
    double pitch_dampner = PITCH_DAMPING_FACTOR * delta_t;
    double yaw_dampner = YAW_DAMPING_FACTOR * delta_t;
```

### E-05 src/Core/Entities/PlayerEntity.m:2745-2748

```objc
        if (flightSpeed < maxFlightSpeed * HYPERSPEED_FACTOR)
            flightSpeed += (float)(speed_delta * delta_t * HYPERSPEED_FACTOR);
        if (flightSpeed > maxFlightSpeed * HYPERSPEED_FACTOR)
            flightSpeed = (float)(maxFlightSpeed * HYPERSPEED_FACTOR);
```

### E-06 src/Core/Entities/PlayerEntity.m:2958-2967

```objc
        hyperspeedFactor = MIN_HYPERSPEED_FACTOR;
    } else {
        // once nearest object is >4x scanner range
        // start increasing torus speed
        double factor = hsnDistance / (4 * SCANNER_MAX_RANGE);
        if (factor < 1.0) {
            hyperspeedFactor = MIN_HYPERSPEED_FACTOR;
        } else {
            hyperspeedFactor = MIN_HYPERSPEED_FACTOR * sqrt(factor);
            if (hyperspeedFactor > MAX_HYPERSPEED_FACTOR) {
```

### E-07 src/Core/Entities/PlayerEntity.m:3019-3024

```objc
    if (EXPECT_NOT([ent isStellarObject])) {
        Entity<OOStellarBody>* stellar = (Entity<OOStellarBody>*)ent;
        if (EXPECT([stellar planetType] != STELLAR_TYPE_MINIATURE)) {
            double dist = stellar->zero_distance;
            double rad = stellar->collision_radius;
            double factor = ([stellar isSun]) ? 2.0 : 4.0;
```

### E-08 src/Core/Entities/PlayerEntity.m:6469-6470

```objc
    launchRoll = -flightRoll; // save the station's spin. (inverted for player)
    flightRoll = 0; // don't spin when showing the break pattern.
```

### E-09 src/Core/Entities/ShipEntity.m:6699-6702

```objc
    if (sd2 < SCANNER_MAX_RANGE2 * 4.0f) // double scanner range
    {
        result = AEGIS_IN_DOCKING_RANGE;
    } else if (EXPECT_NOT(isNearPlanetSurface || d2 < cr2 * 9.0f)) // to 3x radius of any planet/moon - or 500m of tiny ones,
```

### E-10 src/Core/Universe.m:1473-1473

```objc
    safeDistance = 36 * sun_radius * sun_radius; // 6 times the sun radius
```

### E-11 src/Core/Entities/DockEntity.m:748-755

```objc
            if (arbb.max.x < ww && arbb.min.x > -ww) {
                // x is okay - no need to correct
                delta.x = 0.0f;
            }
            if (arbb.max.y > hh && arbb.min.y > -hh) {
                // y is okay - no need to correct
                delta.y = 0.0f;
            }
```

### E-12 src/Core/Entities/DockEntity.m:716-720

```objc
    }

    if ([ship status] == STATUS_LAUNCHING) {
        return YES;
    }
```

### E-13 src/Core/Entities/PlayerEntity.m:8293-8295

```objc
            if (isOK) {
                if (techlevel < minTechLevel)
                    isOK = NO;
```

### E-14 src/Core/Entities/PlayerEntity.h:1294-1297

```objc
#define KILOGRAMS_PER_POD 1000
#define MAX_KILOGRAMS_IN_SAFE ((KILOGRAMS_PER_POD / 2) - 1)
#define GRAMS_PER_POD (KILOGRAMS_PER_POD * 1000)
#define MAX_GRAMS_IN_SAFE ((GRAMS_PER_POD / 2) - 1)
```

### E-15 src/Core/Entities/PlayerEntity.m:10029-10040

```objc
    // TODO - fix brokenness here...
    if (unit == UNITS_TONS && purchase + current_cargo > [self maxAvailableCargoSpace]) {
        purchase = [self availableCargoSpace]; // limit to available cargo space
    } else {
        if (current_cargo == [self maxAvailableCargoSpace]) {
            // other cases are fine so long as buying is limited to <1000kg / <1000000g
            // but if this case is true, we need to see if there is more space in
            // the manifest (safe) or an already-accounted-for pod
            if (unit == UNITS_KILOGRAMS) {
                if (manifest_quantity % KILOGRAMS_PER_POD <= MAX_KILOGRAMS_IN_SAFE && (manifest_quantity + purchase) % KILOGRAMS_PER_POD > MAX_KILOGRAMS_IN_SAFE) {
                    // going from < n500 to >= n500 would increase pods needed by 1
                    purchase = MAX_KILOGRAMS_IN_SAFE - manifest_quantity; // max possible
```

### E-16 src/Core/Universe.m:7173-7191

```objc
- (void)setSystemTo:(OOSystemID)s
{
    NSDictionary* systemData;
    PlayerEntity* player = PLAYER;
    OOEconomyID economy;
    NSString* scriptName;

    [self setGalaxyTo:[player galaxyNumber]];

    systemID = s;
    targetSystemID = s;

    systemData = [self generateSystemData:targetSystemID];
    economy = [systemData oo_unsignedCharForKey:KEY_ECONOMY];
    scriptName = [systemData oo_stringForKey:@"market_script" defaultValue:nil];

    DESTROY(commodityMarket);
    commodityMarket = [[commodities generateMarketForSystemWithEconomy:economy andScript:scriptName] retain];
}
```

### E-17 src/Core/Entities/PlayerEntity.m:9326-9330

```objc
    if ([eqKey isEqualToString:@"EQ_MISSILE_REMOVAL"]) {
        credits -= price;
        tradeIn += [self removeMissiles];
        [self doTradeIn:tradeIn forPriceFactor:priceFactor];
        return YES;
```

### E-18 src/Core/Entities/PlayerEntity.h:284-286

```objc
#define PLAYER_MAX_MISSILES 16
#define PLAYER_STARTING_MAX_MISSILES 4
#define PLAYER_STARTING_MISSILES 3
```

### E-19 src/Core/Entities/PlayerEntity.m:6630-6633

```objc
- (OOFuelQuantity)fuelRequiredForJump
{
    return 10.0 * MAX(0.1, [self hyperspaceJumpDistance]);
}
```

### E-20 src/Core/Entities/PlayerEntity.m:6884-6886

```objc
    if (!misjump) {
        ship_clock_adjust += distance * distance * 3600.0;
        [self setSystemID:sTo];
```

### E-21 src/Core/Entities/PlayerEntity.m:3296-3297

```objc
    if ([self status] == STATUS_WITCHSPACE_COUNTDOWN)
        [self cancelWitchspaceCountdown]; // cancel witchspace countdown properly
```

### E-22 src/Core/Entities/ShipEntity.m:12526-12530

```objc
        GLfloat d2 = HPmagnitude2(delta);
        if (![ship isPlayer] || ![PLAYER isDocked]) { // player doesn't block if docked
            if ((k * [ship mass] > d2) && (d2 < SCANNER_MAX_RANGE2)) // if you go off (typical) scanner from a blocker - it ceases to block
                result = [ship universalID];
        }
```

### E-23 src/Core/Entities/ShipEntity.m:12504-12504

```objc
    // coriolis station is mass 455,223,200
```

### E-24 src/Core/GuiDisplayGen.m:1575-1575

```objc
    double vscale = -size_in_pixels.height / (2 * CHART_HEIGHT_AT_MAX_ZOOM * zoom);
```

### E-25 src/Core/GuiDisplayGen.m:1947-1948

```objc
        star.x = (float)(sys_coordinates.x * hscale + hoffset);
        star.y = (float)(sys_coordinates.y * vscale + voffset);
```

### E-26 src/Core/Materials/OOPlanetTextureGenerator.m:666-679

```objc
    } else if (q < COASTLINE_PORTION) {
        // Coastline.
        specular = q * RECIP_COASTLINE_PORTION;
        diffuse = Blend(specular, info->landColor, info->paleSeaColor);
        specular = 1.0f - specular;
    } else if (q > 1.0f) {
        // High up - snow-capped peaks. With overrides q can range between -2 to +2.
        diffuse = white;
    } else if (q > info->mix_hi) {
        diffuse = Blend((q - info->mix_hi) * info->mix_ih, white, info->paleLandColor); // Snowline.
    } else {
        // Normal land.
        diffuse = Blend((info->mix_hi - q) * info->mix_oh, info->landColor, info->paleLandColor);
    }
```

## Open items

These are gaps the table cannot close on its own. Each one is stated so a reviewer can check it.

- **Planet noise budget (E-26).** E-26 quotes only the PlanetMix thresholds. The noise field is generated under a fixed budget in `src/render/planet-noise.ts:40-48` (six surface octaves, one relief tap, one cloud octave, nine evaluations). No excerpt covers Oolite's noise generator, and no PROJECT.md Key Decisions row records the budget. The planet-surface row is therefore faithful for the colour classes only.
- **Aegis near-surface clause (E-09).** Oolite's `isNearPlanetSurface` clause (`src/Core/Entities/ShipEntity.m:6681-6682`) is not modelled. It can change the result only for a planet with a radius below about 250 m, where the 500 m surface band reaches past the 3x-radius test. The v1 layouts were not checked against every one of the 2,048 systems.
- **Torus mass lock, station branch (E-07).** E-07 quotes the planet branch only. The station check in `src/sim/flight/torus.ts:98-102` uses the scanner range and is not covered by an excerpt.
- **Docking computer TL, station override (E-13).** Oolite's docked-station override of the tech level (`src/Core/Entities/PlayerEntity.m:8229-8232`) is not modelled. The only `equivalent_tech_level` in the pinned data is on the rock-hermit template (`Resources/Config/shipdata.plist:3247`), and the Coriolis template (`Resources/Config/shipdata.plist:1690`) sets none, so the override never applies to the v1 station.
- **Missile cap wording (E-18).** PROJECT.md row "Cap missiles at 3 and passenger berths at 7" says Oolite's Cobra allows four starting missiles, citing `PlayerEntity.h:284-286`. The pinned header gives `PLAYER_STARTING_MAX_MISSILES 4` and `PLAYER_STARTING_MISSILES 3`, so the divergence is the fourth pylon, not the starting count. That PROJECT.md row needs a correction.
- **Missile trade-in price factor (E-17).** `PlayerEntity.m:9434-9435` scales a trade-in only when the station's price factor is below 1.0. The Coriolis template sets no `equipment_price_factor`, and `src/Core/Entities/StationEntity.m:601` defaults it to 1.0, so no scaling applies to the v1 station.
