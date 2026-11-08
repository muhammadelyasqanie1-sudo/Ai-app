import assert from "node:assert/strict";
import { mediaJobVisualState, resolveVisual } from "../src/animations/coreState.ts";

assert.equal(mediaJobVisualState("image_generate"), "generatingImage");
assert.equal(mediaJobVisualState("image_edit"), "generatingImage");
assert.equal(mediaJobVisualState("document_extract"), "processingFile");
assert.equal(mediaJobVisualState("document_analyze"), "processingFile");
assert.equal(mediaJobVisualState("video_analyze"), "processingFile");
assert.equal(mediaJobVisualState("image_understand"), "processingFile");
assert.equal(mediaJobVisualState("ocr"), "processingFile");
assert.equal(mediaJobVisualState("speech_generate"), null);
assert.equal(mediaJobVisualState(undefined), null);

const image = resolveVisual("generatingImage", "balanced", false);
assert.equal(image.particleCount, 8);
assert.equal(image.hue[0], "--afg-core-violet");
const file = resolveVisual("processingFile", "low", false);
assert.equal(file.particleCount, 0);
assert.equal(file.hue[0], "--afg-core-blue");
const reduced = resolveVisual("generatingImage", "high", true);
assert.equal(reduced.particleCount, 0);
assert.equal(reduced.ringSpeed, 0);

console.log("Intelligence core media-state mapping and reduced-motion checks passed.");
