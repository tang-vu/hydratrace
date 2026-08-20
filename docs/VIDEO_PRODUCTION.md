# Submission video production

HydraTrace's final submission video is a reproducible 1080p composition built only from live product output. It uses the running Next.js interface and HydraDB graph, a real MCP handshake, Xiaomi MiMo V2.5 voice generation, MiMo ASR transcript verification, and an original low-volume sound bed synthesized by FFmpeg.

Generated media is written under ignored `generated/video/`. API keys, raw credentials, and generated video files are never committed.

## Security first

If an API key has appeared in chat, a screenshot, shell history, or a log, revoke it before use. On this Windows demo host, save the replacement with the current user's DPAPI protection:

```powershell
pnpm video:key
$env:MIMO_BASE_URL = "https://token-plan-sgp.xiaomimimo.com/v1"
```

The prompt hides input and the command never prints the key. The encrypted file can be decrypted only by the same Windows user on the same machine. It is inside the repository's ignored `.hydratrace` directory. Remove it after generation if no further voice iterations are needed:

```powershell
Remove-Item -LiteralPath .hydratrace/secrets/mimo-api-key.dpapi
```

On other operating systems, set `MIMO_API_KEY` only in the current shell through that platform's secure secret mechanism.

The Token Plan is used only as an interactive content-production tool. HydraTrace does not call MiMo at runtime, and the key is never exposed to the web application.

## Capture and render

Ensure the production demo and HydraDB are healthy, then run:

```powershell
pnpm video:capture
pnpm video:voice
pnpm video:render
pnpm video:verify
```

The stages are deliberately separate:

1. `video:capture` drives the real interface, executes the default ShopFlow analysis, captures selected evidence states, and renders actual `pnpm mcp:verify` output into a terminal frame.
2. `video:voice` uses MiMo V2.5's consistent built-in `Milo` English voice scene by scene, applies a modest 1.25× delivery speed, and validates the delivered clips with `mimo-v2.5-asr`. It canonicalizes spoken numbers and code identifiers, protects the exact `Hydra Trace` and `Hydra database` pronunciations, retries a rejected scene at most three times, then fails if either the best scene or accepted aggregate exceeds 8% word error rate. Short scenes avoid truncation while per-scene ASR makes additions and omissions attributable.
3. `video:render` allocates screen time from the measured narration duration, adds restrained motion, burns readable subtitles, mixes a copyright-free generated ambient bed, and exports H.264/AAC with fast-start metadata.
4. `video:verify` enforces 1920×1080 H.264, 48 kHz AAC, a 90–165 second duration, minimum file size, ASR quality, −18 to −14 LUFS integrated loudness, a −1 dBFS true-peak ceiling, bounded loudness range, and absence of token-shaped strings in text artifacts.

To inspect the visual edit before a replacement key is available:

```powershell
pnpm video:capture
pnpm video:preview
pnpm video:verify -- --silent-preview
```

## Final human review

Open `generated/video/hydratrace-demo-final.mp4` and verify pronunciation of HydraDB, TypeScript, applyCoupon, algo.SSpaths, and Model Context Protocol. Check subtitle line breaks at 1080p, confirm the public URL is visible, and ensure no notification or unrelated window appears. The automation checks technical correctness; a human listening pass remains mandatory before upload.

Upload the accepted MP4 to YouTube as **Unlisted**, confirm playback in a private window, and add the URL to `docs/SUBMISSION.md` and the official Hack Hydra form.
