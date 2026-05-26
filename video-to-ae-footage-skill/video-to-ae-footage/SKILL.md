---
name: video-to-ae-footage
description: Generate a video and export an After Effects project that references real image footage files instead of flattened screenshots or sliced PNG composites. Use when Codex is asked to make a video, HyperFrames-style promo, social ad, motion graphic, or rendered MP4 and also deliver an AE/AEP workflow with linked assets, scene precomps, editable text layers, image footage layers, and an MP4 reference.
---

# Video to AE Footage

## Goal

Create video projects that can be handed off to After Effects as real editable projects:

- render or preserve an MP4 reference
- keep source images in an `assets/` folder
- create one master comp and one precomp per beat/scene
- import images as AE Footage items referenced from disk
- create text as AE Text Layers where practical
- use simple AE Solid layers for backgrounds and safe rectangles

Do not satisfy an AE handoff request with only a single MP4 in an AEP. Do not flatten each scene into one screenshot unless the user explicitly asks for a safety/reference-only fallback.

## Workflow

1. Build or inspect the video project.
   - Define format, frame rate, duration, scene timings, and visual style.
   - If using HyperFrames or another HTML/video workflow, render an MP4 reference first when requested.

2. Prepare AE-safe delivery folders.
   - `assets/`: real source images to be referenced by AE, converted to PNG/JPG when needed.
   - `reference/`: final MP4 reference, optional but recommended.
   - `ae-package/`: generated JSX and final AEP.

3. Create a footage manifest.
   - Use `references/ae-export-contract.md` for the schema.
   - Describe scenes, start times, and layers.
   - Image layers must point to real files in `assets/`, such as product screenshots, logos, photos, and artwork.
   - Text layers should carry editable text, position, size, color, and bold/center flags.
   - Solid layers are acceptable for backgrounds, washes, simple CTA blocks, and safe color panels.

4. Generate the AE JSX.
   - Prefer `scripts/make_ae_footage_project.py`.
   - The script turns the manifest into an ExtendScript `.jsx` that imports footage, builds comps, lays out layers, adds scene markers, imports the MP4 reference as a hidden layer, and saves an AEP.

5. Run the JSX in After Effects.
   - Ask the user to open AE if command-line execution is unreliable.
   - Use `File > Scripts > Run Script File...`.
   - The generated JSX writes a status file in `ae-package/`.

6. Validate the result.
   - Confirm the AEP exists.
   - Confirm the master comp has all scene precomps.
   - Confirm each scene has multiple image/text/solid layers.
   - Confirm image layers are imported Footage items from `assets/`, not flattened full-frame screenshots.

## Defaults

- Use `1080x1920`, `30fps`, and 9:16 when the user asks for vertical social video and gives no other spec.
- Use one precomp per beat, typically 3 to 5 seconds per beat for short SaaS promos.
- Keep the MP4 reference hidden in the master comp.
- Keep generated JSX ASCII-only. Encode non-ASCII text with `String.fromCharCode` arrays to avoid AE string errors.
- Prefer PNG assets for AE 2023 compatibility. Convert WebP to PNG before building the AEP package.

## Avoid

- Avoid huge shape-layer grids or many native shape operations; AE 2023 can become unstable.
- Avoid `throw` on optional missing assets. For required assets, write a status file with the missing path before failing.
- Avoid sliced scene composites when the user asks for real source images to be referenced.
- Avoid command-line `AfterFX.exe -r` as the only path; on some Windows installs it silently fails. Provide a script the user can run from AE.

## Bundled Resources

- `scripts/make_ae_footage_project.py`: generate an AE JSX builder from a JSON manifest.
- `references/ae-export-contract.md`: manifest schema, folder layout, and handoff rules.
