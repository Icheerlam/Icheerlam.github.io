# AE Footage Export Contract

Use this contract when exporting a rendered video project into an After Effects project with real referenced image footage.

## Folder Layout

```text
project-ae-delivery/
  assets/
    logo.png
    product-scene.png
    artist-01.png
  reference/
    final-reference.mp4
  ae-package/
    ae-footage-manifest.json
    build-ae-footage-linked.jsx
    output.aep
```

## Manifest Schema

```json
{
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "duration": 18,
  "assetsDir": "E:/project-ae-delivery/assets",
  "referenceMp4": "E:/project-ae-delivery/reference/final-reference.mp4",
  "outputAep": "E:/project-ae-delivery/ae-package/output.aep",
  "statusFile": "E:/project-ae-delivery/ae-package/AE_BUILD_STATUS.txt",
  "masterComp": "MASTER_1080x1920_18s",
  "scenes": [
    {
      "name": "Beat_01_Hook",
      "start": 0,
      "duration": 3.6,
      "layers": [
        {
          "type": "solid",
          "name": "background",
          "color": "#080F0D",
          "cx": 540,
          "cy": 960,
          "w": 1080,
          "h": 1920,
          "opacity": 100
        },
        {
          "type": "image",
          "name": "logo",
          "file": "logo.png",
          "cx": 140,
          "cy": 170,
          "w": 120,
          "h": 120,
          "mode": "contain",
          "opacity": 100,
          "rotation": 0
        },
        {
          "type": "text",
          "name": "headline",
          "text": "Frame your artwork professionally",
          "x": 80,
          "y": 450,
          "size": 64,
          "color": "#FFFFFF",
          "bold": true,
          "center": false,
          "opacity": 100
        }
      ]
    }
  ]
}
```

## Layer Rules

Image layers:

- Use real files in `assetsDir`.
- Use `mode: "contain"` for logos, artwork cards, and UI screenshots that must not crop.
- Use `mode: "cover"` for backgrounds and full-bleed photos.
- Use `cx`, `cy` for center position, not top-left.

Text layers:

- Use AE Text Layers for editable copy.
- Use `String.fromCharCode` generation for Chinese or other non-ASCII text.
- Use one text layer per logical text block.

Solid layers:

- Use for backgrounds, washes, CTA blocks, simple rectangles, and fallback panels.
- Do not overuse many shape layers; keep the project stable.

Master comp:

- Add one scene precomp per scene at its `start`.
- Add scene markers.
- Import the MP4 reference as a hidden layer if present.

## Validation Checklist

- AEP exists at `outputAep`.
- Status file says `OK`.
- Master comp duration matches manifest duration.
- Every scene has multiple layers.
- Image layers are footage items imported from `assetsDir`.
- Text is editable AE text, not baked into screenshots.
