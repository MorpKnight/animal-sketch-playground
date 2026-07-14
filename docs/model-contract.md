# Browser model contract

The web app sends one `float32` tensor named `image` with shape `[1, 1, 64, 64]`.
Tensor values are in the `[0, 1]` range, with black background at `0` and white
strokes at `1`.

The rasterizer centers the drawing's bounds, preserves aspect ratio, leaves 10%
padding, draws a 4-pixel round stroke on a 4x canvas, and downsamples to 64x64.
This follows the V4 iOS rendering contract as closely as Canvas 2D allows.

The output tensor is named `probabilities` and contains a probability for each
label in `public/models/model-manifest.json`. The UI accepts a species only
when it is not `other` and its top confidence is at least 30%; otherwise it
reports `Unknown animal`.
