# Hero visuals — locked decisions

## What we show on home (now)

1. **Free 3D person (preferred):** [Ready Player Me](https://readyplayer.me) full-body GLB  
   - Create in character select → store `avatarUrl`  
   - Home loads `https://models.readyplayer.me/{id}.glb` (free CDN, no DIY mesh)  
2. **Painted fallback:** `boy_*/girl_*` portraits if no RPM avatar  

Upgrades still change painted tier art for cards / non-RPM players.

## What we tried and rejected for home

| Approach | Why not |
|----------|---------|
| Free GLB packs (Soldier, KayKit, Xbot) | Wrong identity / vibe |
| Procedural capsules | Toys |
| Spinning photo plane | Flip, not a real back |
| Single-image AI 3D (TripoSR blobs) | Real mesh, but soft muddy features |

`assets/models/from_art/*.glb` may remain as experiments — **not** the home hero until quality matches the paintings.

## How real products get “real-life 3D people”

They **don’t invent a human from scratch in game code**. They use:

1. **Avatar platforms** — e.g. [Ready Player Me](https://readyplayer.me): selfie → photoreal full-body GLB, free for many games  
2. **Asset stores** — Mixamo, Character Creator, Unity/Unreal marketplace medieval packs  
3. **3D artist** — commissions matching our turnaround sheets  
4. **Multi-view commercial AI** — Meshy / Tripo paid, with front+side+back inputs (better than free TripoSR)

## Free 3D path (shipped)

- Character select → **FREE 3D AVATAR** → Ready Player Me iframe  
- On export → `POST /me/character` with `avatarUrl`  
- Home → `Character3D` loads that GLB from RPM CDN  

Painted boy/girl remains as optional fallback.

Paid/custom packs later if we want medieval gear on the same body.
