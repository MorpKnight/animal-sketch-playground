#!/usr/bin/env python3
"""Export Animal Sketch Classifier V4 to an ONNX artifact for browser inference."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from torch import nn


class ConvBlock(nn.Sequential):
    def __init__(self, input_channels: int, output_channels: int) -> None:
        super().__init__(
            nn.Conv2d(input_channels, output_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(output_channels),
            nn.ReLU(inplace=True),
        )


class AnimalMultiTaskCNNV4(nn.Module):
    def __init__(self, number_of_species: int, number_of_behaviors: int) -> None:
        super().__init__()
        self.features = nn.Sequential(
            ConvBlock(1, 32),
            ConvBlock(32, 32),
            nn.MaxPool2d(2),
            ConvBlock(32, 64),
            ConvBlock(64, 64),
            nn.MaxPool2d(2),
            ConvBlock(64, 128),
            ConvBlock(128, 128),
            nn.MaxPool2d(2),
            ConvBlock(128, 192),
            ConvBlock(192, 192),
            nn.MaxPool2d(2),
            ConvBlock(192, 256),
            nn.AdaptiveAvgPool2d((2, 2)),
        )
        self.embedding = nn.Sequential(
            nn.Flatten(),
            nn.Linear(256 * 2 * 2, 384),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.30),
        )
        self.species_classifier = nn.Linear(384, number_of_species)
        self.behavior_classifier = nn.Linear(384, number_of_behaviors)

    def forward_species(self, image: torch.Tensor) -> torch.Tensor:
        return self.species_classifier(self.embedding(self.features(image)))


class SpeciesSoftmaxClassifier(nn.Module):
    def __init__(self, model: AnimalMultiTaskCNNV4) -> None:
        super().__init__()
        self.model = model

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        return torch.softmax(self.model.forward_species(image), dim=-1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--opset", type=int, default=17)
    parser.add_argument("--parity-samples", type=int, default=24)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    args = parse_args()
    checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    class_names = [str(name) for name in checkpoint["class_names"]]
    behavior_names = [str(name) for name in checkpoint["behavior_names"]]
    input_size = [int(value) for value in checkpoint["input_size"]]
    if input_size != [1, 64, 64]:
        raise ValueError(f"Expected V4 input [1, 64, 64], found {input_size}.")

    model = AnimalMultiTaskCNNV4(len(class_names), len(behavior_names))
    model.load_state_dict(checkpoint["state_dict"])
    wrapped = SpeciesSoftmaxClassifier(model).eval()
    example = torch.zeros((1, *input_size), dtype=torch.float32)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        wrapped,
        example,
        args.output,
        input_names=["image"],
        output_names=["probabilities"],
        opset_version=args.opset,
        do_constant_folding=True,
        dynamic_axes=None,
        dynamo=False,
    )

    session = ort.InferenceSession(str(args.output), providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(20260714)
    maximum_delta = 0.0
    top_one_matches = 0
    with torch.inference_mode():
        for _ in range(args.parity_samples):
            image = rng.random((1, *input_size), dtype=np.float32)
            pytorch = wrapped(torch.from_numpy(image)).numpy()
            onnx = session.run(["probabilities"], {"image": image})[0]
            maximum_delta = max(maximum_delta, float(np.max(np.abs(pytorch - onnx))))
            top_one_matches += int(int(np.argmax(pytorch)) == int(np.argmax(onnx)))

    if top_one_matches != args.parity_samples or maximum_delta > 0.00001:
        raise RuntimeError(
            f"ONNX parity failed: {top_one_matches}/{args.parity_samples} top-1 matches, "
            f"maximum delta {maximum_delta:.8f}."
        )

    manifest = {
        "schema_version": 1,
        "model_name": "Animal Sketch Classifier V4",
        "model_version": "v4.0.0",
        "format": "onnx",
        "file": args.output.name,
        "sha256": sha256(args.output),
        "input": {
            "name": "image",
            "shape": [1, 1, 64, 64],
            "dtype": "float32",
            "range": [0, 1],
            "background": "black",
            "strokes": "white",
            "padding_fraction": 0.1,
        },
        "output": {
            "name": "probabilities",
            "labels": class_names,
            "behavior_names": behavior_names,
        },
        "source": "https://github.com/MorpKnight/animal-sketch-coreml",
        "license": "CC-BY-4.0",
        "parity": {
            "samples": args.parity_samples,
            "top_one_matches": top_one_matches,
            "maximum_probability_delta": maximum_delta,
        },
    }
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Saved {args.output} ({args.output.stat().st_size} bytes)")
    print(json.dumps(manifest["parity"], indent=2))


if __name__ == "__main__":
    main()
