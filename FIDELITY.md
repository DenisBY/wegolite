# Fidelity map: Wegolite against Oolite

This document maps each mechanic that the v1 single-player loop ports from Oolite to the Wegolite file that implements it, and to the Oolite source that defines it. Each row states whether Wegolite is `faithful` or a recorded `divergence`, and every divergence names its row in the PROJECT.md Key Decisions table. The scope is the single-player loop shipped in v1: launch, flight, docking, trade, outfitting and hyperspace. The source of truth is Oolite release 1.93.1-241 at commit `7437f22` (`third_party/oolite/pin.json`). Every excerpt below is copied from that commit, not from a checkout's HEAD.

## Attribution

The quoted excerpts are from Oolite, Copyright © 2004-2026 Giles C Williams, Jens Ayton and contributors, and are licensed under GPL-2.0-or-later. They are quoted unmodified, taken from `git show 7437f22:<path>`, so each one can be checked against that commit. The quotation is recorded as one row in ASSETS.md.

## How to check a row

The Wegolite cell is a `src/` path and a line. The Oolite cell is the Oolite file and line range, and the excerpt with the same id quotes those lines verbatim. The contract test in `tests/contract/fidelity.test.ts` checks every row on every run. When `OOLITE_SRC` points at a tree at commit `7437f22`, it also checks each excerpt against that tree.

## Mechanics

| Mechanic                                                                        | Wegolite                            | Oolite (7437f22)                             | Fidelity                                                                                                                                                                                                                 | Excerpt |
| ------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Commodity stock and price for each good at system generation (ECON-01, ECON-02) | `src/sim/economy/market.ts:180`     | `src/Core/OOCommodities.m:261-278`           | faithful                                                                                                                                                                                                                 | E-01    |
| Chart distance with C integer truncation (NAV-01)                               | `src/sim/hyperspace/jump.ts:89`     | `src/Core/legacy_random.h:154-160`           | faithful                                                                                                                                                                                                                 | E-02    |
| Witchpoint exit offset on arrival (NAV-05)                                      | `src/sim/hyperspace/arrival.ts:125` | `src/Core/Entities/PlayerEntity.m:6913-6928` | divergence: the offset is drawn from the seeded PRNG at jump commit, not from Oolite's global Ranrot stream. PROJECT.md: "Draw the arrival pose from the seeded PRNG at jump commit, in three dimensions as Oolite does" | E-03    |

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
