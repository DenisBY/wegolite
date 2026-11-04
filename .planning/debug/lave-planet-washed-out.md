---
status: diagnosed
trigger: "lave-planet-washed-out — Lave reads as a washed-out lime-green sphere with soft blobby continents and no clear polar ice; Coriolis reads very dark/low-contrast"
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T01:05:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED (set). Three independent defects, not one:
  1. The planet material feeds Oolite's sRGB palette values to the shader as
     linear-light albedo and then re-encodes with `<colorspace_fragment>`, so the
     displayed surface is `sRGB(authored colour)` — e.g. land `(0.36,0.589,0.120)`
     displays as `(162,202,97)` instead of Oolite's `(92,150,31)`.
  2. The terminator is a single symmetric `smoothstep(-0.185,+0.185,NdotL)` with
     `light = 0.1 + 0.9*day`, instead of Oolite's per-channel
     `smoothstep(0, [0.105,0.18,0.28], NdotL)`; the geometric terminator is lifted
     to ~55% and the band is ~22 degrees wide, so there is no dark side / no warm edge.
  3. The surface generator is a 4-octave value-noise fbm at scale 3.1 with no
     sea-depth/coastline/snowline/terrain-shade and a mis-calibrated land threshold
     (actual land share ~87%, not the intended 65%), plus a latitude-only polar
     wash `smoothstep(0.6,0.95,|y|)` that ignores Oolite's `polar_fraction` and its
     noise-perturbed polar cap. Result: big soft blobs, no relief, no crisp ice.
  4. The station uses the opposite lighting contract: `DirectionalLight 2.5` +
     `AmbientLight 0.1` with physically-correct 1/pi scaling and `NoToneMapping`,
     whereas Oolite multiplies sun radiance by 3.75 and pre-exposure by 2.484 and
     tone-maps with ACES before gamma. The Coriolis diffuse avg is sRGB 87 →
     ~60/255 lit faces (observed 60-90) vs Oolite's ~190/255; bloom/emission
     modulate (~26x) is also dropped (emissiveIntensity 0.8).
test: Done — see Evidence; no further hypothesis needed.
expecting: n/a (diagnosis mode)
next_action: Return ROOT CAUSE FOUND. Do not fix.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: >
  New game, launch, fly toward Lave's planet and station at 1080p. Palette, terminator,
  sun size, star density and station silhouette read as Oolite — green/mauve planet with
  polar ice, white sun with a thin corona, sparse stars, recognisable Coriolis.
actual: >
  Planet renders as a washed-out lime-green sphere with soft blobby continents and no
  clear polar ice. The Coriolis reads very dark/low-contrast.
errors: None reported
reproduction: New game from the menu, launch from the Coriolis, fly toward Lave's planet and the station.
started: Discovered during UAT (phase 03)
evidence:
  - /tmp/orca-paste-1793780723287-fba9c8fa-d8a0-4b29-bf35-30094231b4a0.png
  - /tmp/orca-paste-1793780745422-051ac1bd-e437-4662-a28d-c251a0034162.png

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "The compiled Lave palette is wrong or not the authored planetinfo data."
  evidence: >
    `src/content/generated/systems/g0.json` g0-s7 exactly matches
    `third_party/oolite/Config/planetinfo.plist` Lave: land_color 0.36/0.58882/0.120234,
    sea_color 0.589844/0.393997/0.573013, polar_land 0.934/0.908817/0.849174,
    polar_sea 0.9941/0.9933/0.9934, land_fraction 0.65. The data is right; the
    renderer misinterprets it. (2026-11-04T00:20Z)
  timestamp: 2026-11-04T00:20:00Z
- hypothesis: "The station is dark because the GLB textures are in the wrong colour
  space / metalness is 1 / KHR_materials_specular is mishandled."
  evidence: >
    `public/models/coriolis.glb` materials are metallicFactor 0, roughness 0.04 (hull)
    or 0.45 (dock), baseColorTexture is a normal sRGB glTF texture. GLTFLoader applies
    SRGBColorSpace to baseColor; the diffuse texture is genuinely dark (avg sRGB
    87,92,87). The darkness is illumination energy, not a texture decode bug.
    (2026-11-04T00:35Z)
  timestamp: 2026-11-04T00:35:00Z
- hypothesis: "The planet is washed out because of the aspect-ratio bug / ellipse."
  evidence: >
    Out of scope by instruction; the crop shows the wash, blobbiness, pastel seas and
    absent dark side independently of the elliptical silhouette.
    (2026-11-04T00:40Z)
  timestamp: 2026-11-04T00:40:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-04T00:10:00Z
  checked: Screenshot 1 (planet) pixel histogram (4092x1904 PNG decoded to PPM).
  found: >
    The most common lit-land pixels are (162,202,101..117). Exact sRGB encode of
    land_color (0.36,0.58882,0.120234) is (162,202,97). The sea blobs are
    (202,168,199..202) = exact sRGB encode of sea_color (0.589844,0.393997,0.573013)
    = (202,168,199). Polar pixels are ~(247,244,237) = sRGB(polar_land_color).
  implication: >
    The planet is displaying `sRGB(authored colour)` because the authored Oolite
    palette is treated as linear light and then sRGB-encoded by the renderer. The
    authored texture values Oolite would use are 8-bit (92,150,31) for land and
    (150,100,146) for sea. This is the washed-out lime/pastel cause.
- timestamp: 2026-11-04T00:12:00Z
  checked: `src/render/bodies/planet.ts` palette uniforms and `src/render/shaders/planet.glsl.ts`.
  found: >
    `color3()` (planet.ts:70-74) wraps the raw plist triples in `THREE.Vector3` with no
    colour-space conversion; all eight palette uniforms are fed raw (planet.ts:112-118).
    The fragment shader ends with `#include <colorspace_fragment>` (planet.glsl.ts:174),
    which converts linear→sRGB on output. `boot.ts:83` sets
    `renderer.outputColorSpace = SRGBColorSpace`; no tone mapping is configured
    (NoToneMapping default).
  implication: >
    Confirms the double-encode numerically reproduced by the pixel histogram.
- timestamp: 2026-11-04T00:15:00Z
  checked: Oolite's planet texture/shader colour contract.
  found: >
    `OOPlanetTextureGenerator.m:157-163` writes `255 * color` bytes, i.e. the plist
    colours are sRGB texture samples. `oolite-default-planet.fragment:373-374` does
    `diffuseColor.rgb = pow(diffuseColor.rgb, vec3(2.2))` (sRGB→linear) before lighting;
    `oolite-final.fragment:817-848` tone-maps (ACES default, `MyOpenGLView.m:257`) then
    applies `pow(result, 1/2.2)`. Oolite's ship shader does the same conversion at
    `oolite-default-shader.fragment:472`.
  implication: >
    Oolite treats the authored palette as sRGB, converts to linear, lights, tone-maps
    and gamma-encodes. Wegolite skips the sRGB→linear step and skips tone mapping, so
    its displayed planet is a midtone-lifted, desaturated version of the authored colour.
- timestamp: 2026-11-04T00:20:00Z
  checked: Terminator math in `planet.glsl.ts:159-165` and `planet.ts:81-83`.
  found: >
    `terminatorSoftness = clamp(0.08 + x, 0.02, 0.4)` → 0.185 for Lave;
    `day = smoothstep(-0.185, +0.185, dot(normalW, uSunDir))`; `light = 0.1 + 0.9*day`.
    At the geometric terminator (NdotL = 0) day = 0.5, so light = 0.55 (55% of full).
    Oolite's `oolite-default-planet.fragment:203-204` uses
    `smoothstep(vec3(0.0), terminatorThreshold.xyz, vec3(globalTerm))` with Lave's
    `terminator_threshold_vector = 0.105 0.18 0.28` (g0-s7): 0% at NdotL<=0, red
    saturates at 0.105, green at 0.18, blue at 0.28, giving a hard warm terminator.
  implication: >
    Wegolite's terminator is ~22° wide and only reaches 10% ambient far into the night
    side; the lit hemisphere is also flat (no Oren-Nayar / limb shading). This is the
    "no visible terminator / low contrast" cause independent of colour space.
- timestamp: 2026-11-04T00:25:00Z
  checked: Surface noise and land threshold; simulated the exact GLSL hash/valueNoise/fbm
    in Python on a uniform sphere (40,000 samples, seed uniform 49.19286 for Lave).
  found: >
    `fbm(n*3.1+seed, 4 octaves)` has 1st/50th/99th percentiles 0.250/0.472/0.712.
    `landThresholdFor(0.65, seed)` = 0.357. Fraction above 0.357 = 87.4% land, not the
    intended 65% (the code comment at planet.ts:53-63 assumes a uniform [0,1]
    distribution; the normalised octave sum is not uniform). Cloud threshold
    `1 - 0.26 = 0.74` is above the 99th percentile of the 3-octave cloud field, so only
    ~2.7% of the sphere gets any cloud. The noise has 4 octaves up to scale ~25 over the
    sphere; Oolite's generator runs 7+ octaves to the 1024x1024 texel scale
    (`OOPlanetTextureGenerator.m:727-756`), plus `PlanetMix` deep-sea/coast/snow/peak
    blends (`:636-690`) and Lambertian terrain shade `shade = norm.z` (`:462-505`).
  implication: >
    Most of the planet is flat land; the remaining ~13% sea is a flat pastel blob with
    no deep-sea darkening (Oolite does `deepSeaColor = Blend(0.85, sea, black)` at
    `:419`) and no relief shading. That is the "soft blobby continents" cause.
- timestamp: 2026-11-04T00:30:00Z
  checked: Polar handling in `planet.glsl.ts:138-140` vs Oolite `POLAR_CAPS`.
  found: >
    `polar = smoothstep(0.6, 0.95, abs(n.y))` — latitude-only, no noise, no authored
    `polar_fraction` (Lave derives `polar_fraction = 0.05` from percent_ice in
    `OOPlanetEntity.m:133-134`; the Wegolite System schema has no polar_fraction at all,
    src/content/schemas/system.ts:36-88). Oolite (`OOPlanetTextureGenerator.m:34,431,
    1078-1084,681-690`) sets `mix_polarCap = 0.95*(0.28+0.24*0.65)=0.415` and applies
    ice when `q > 2*mix_polarCap - nearPole`, blended with `polarSeaColor` and perturbed
    by the same fbm — a noise-broken cap reaching ~45° latitude with pure white ice.
  implication: >
    Wegolite's ice is a smooth 37°-72° latitude wash mixed with the land/sea mask, so it
    reads as a pale cloud-like blob rather than a recognisable polar cap; `polar_cloud_color`
    is then mixed over it by the same scalar (`planet.glsl.ts:154`).
- timestamp: 2026-11-04T00:35:00Z
  checked: Station illumination path (`system-scene.ts:248-253`, `boot.ts:82-84`,
    `station.ts:45-46,98-110`) and the GLB material values.
  found: >
    `DirectionalLight(0xffffff, 2.5)` + `AmbientLight(0xffffff, 0.1)`; renderer
    `NoToneMapping`, `SRGBColorSpace`. GLB: metallic 0, hull roughness 0.04, baseColor
    texture avg sRGB (87,92,87) → linear ≈0.095. With three's physically based
    `albedo * intensity * NdotL / pi`, a lit face at NdotL 0.7 outputs
    ≈0.095*2.5*0.7/π ≈ 0.053 linear → ~64/255; observed lit faces 60-90, dark faces
    20-30. Oolite's ship shader uses `LIGHTSRC_RADIANCE_DIFFUSE = light * 3.75`
    (`oolite-default-shader.fragment:33-37,479-492`), then `2.484` pre-exposure
    (`:34,509`), then ACES + 1/2.2 gamma (`oolite-final.fragment:817-848`): the same
    face is ≈0.095*3.75*0.7*2.484 ≈ 0.62 pre-tonemap → ~190/255 on screen. The station's
    authored emissive modulate is ~26.47x (`coriolis.glb` extras;
    shipdata.plist:1716-1728) but the runtime uses `emissiveIntensity = 0.8`
    (station.ts:46) and no bloom.
  implication: >
    The station is ~3x too dark on lit faces and nearly black in shadow because it is
    lit by a different, much weaker energy contract than Oolite's HDR pre-exposed,
    tone-mapped shader. Its emissive lights (2.4% of texels, max 255 in the bake) are
    also ~33x dimmer than the authored bloom.
- timestamp: 2026-11-04T00:40:00Z
  checked: Sun/star density affects the planet read? (screenshot 1 vs g0-s7 data)
  found: >
    Starfield uses the authored 8,887 stars (`system-scene.ts:332-337`); sun radius
    84,449 m at 905,520 m is the authored Lave value. These match the data; they are not
    part of the planet-surface/station-contrast defect. The green dot in the screenshots
    is a beacon marker (`beacon.ts:23` `0x66ffcc`), not the sun.
  implication: >
    Do not change sun/star values as part of this gap; the palette/terminator/station
    lighting are the defects.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: >
  Four coupled root causes. (1) Colour-space contract: the planet material treats the
  Oolite sRGB palette as linear light and lets `<colorspace_fragment>` sRGB-encode it
  again (planet.ts:70-74,112-118; planet.glsl.ts:173-174), so land displays as
  sRGB(0.36,0.589,0.120)=(162,202,97) instead of Oolite's texture byte (92,150,31) and
  sea as pastel (202,168,199) instead of (150,100,146). (2) Terminator: a single
  symmetric smoothstep(-0.185,+0.185) with a 0.1 ambient floor (planet.ts:81-83,
  planet.glsl.ts:159-165) replaces Oolite's per-channel smoothstep(0,[0.105,0.18,0.28])
  — geometric terminator at 55% brightness, no dark side, no warm red edge. (3) Surface
  generator: 4-octave value-noise fbm at scale 3.1 with a mis-calibrated threshold
  (87% land, not 65%), no deep-sea/coast/snowline/terrain shading, and a latitude-only
  polar wash ignoring polar_fraction (planet.glsl.ts:104-155) vs Oolite's 7+ octave
  1024px generator with PlanetMix deep sea/shelf/snow/peaks, Lambert terrain shade and
  noise-broken polar caps (OOPlanetTextureGenerator.m:34,401-505,590-690,1078-1084).
  (4) Station/exposure: DirectionalLight 2.5 + Ambient 0.1 with physical 1/pi and
  NoToneMapping (system-scene.ts:251-253, boot.ts:82-84) vs Oolite's radiance*3.75,
  pre-exposure*2.484, ACES+gamma (oolite-default-shader.fragment:33-37,509;
  oolite-final.fragment:817-848), making lit Coriolis faces ~60/255 instead of ~190/255
  and dropping the ~26x emissive bloom to emissiveIntensity 0.8 (station.ts:46).
fix: [empty until applied — diagnosis-only mode]
verification: [not applied]
files_changed: []
