/**
 * @license
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as posenet_module from "@tensorflow-models/posenet";
import * as facemesh_module from "@tensorflow-models/facemesh";
import * as tf from "@tensorflow/tfjs";
import * as paper from "paper";
import Stats from "stats.js";
import "babel-polyfill";
import {startSequences} from "./veremin/sequences";
import {getCurrentPose, setCurrentPose} from "./veremin/current-pose";

import {
  drawKeypoints,
  drawPoint,
  drawSkeleton,
  isMobile,
  toggleLoadingUI,
  setStatusText,
} from "./utils/demoUtils";
import { SVGUtils } from "./utils/svgUtils";
import { PoseIllustration } from "./illustrationGen/illustration";
import { Skeleton, facePartName2Index } from "./illustrationGen/skeleton";
import { FileUtils } from "./utils/fileUtils";


import { chords } from "./veremin/chord-intervals.js";
import {
  drawBox,
  drawWave,
  drawScale,
  drawText,
} from "./veremin/canvas-overlay.js";
import { avatarSvgs, setupGui, guiState } from "./veremin/gui.js";
import { processPose} from "./veremin/veremin.js";
import { config } from "./veremin/config.js";

// Camera stream video element
let video;
let videoWidth = config.getVideoWidth();
let videoHeight = config.getVideoHeight();

// Canvas
let faceDetection = null;
// let illustration = null;
let canvasScope;
let canvasWidth = config.getCanvasWidth();
let canvasHeight = config.getCanvasHeight();

// ML models
let facemesh;
let posenet;
let minPoseConfidence = 0.15;
let minPartConfidence = 0.1;
let nmsRadius = 30.0;

// Misc
let mobile = false;
const stats = new Stats();

const ZONEOFFSET = config.getZoneOffset();
let ZONEWIDTH = config.getZoneWidth();
let ZONEHEIGHT = config.getZoneHeight();

const MIN_CONFIDENCE = 0.1;
/**
 * Loads a the camera to be used in the demo
 *
 */
async function setupCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
      "Browser API navigator.mediaDevices.getUserMedia not available"
    );
  }

  const video = document.getElementById("video");
  video.width = videoWidth;
  video.height = videoHeight;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: videoWidth,
      height: videoHeight,
    },
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadVideo() {
  const video = await setupCamera();
  video.play();

  return video;
}

const defaultPoseNetArchitecture = "MobileNetV1";
const defaultQuantBytes = 2;
const defaultMultiplier = 1.0;
const defaultStride = 16;
const defaultInputResolution = 200;

/**
 * Sets up a frames per second panel on the top-left of the window
 */
function setupFPS() {
  stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
  document.getElementById("main").appendChild(stats.dom);
}

/**
 * Feeds an image to posenet to estimate poses - this is where the magic
 * happens. This function loops with a requestAnimationFrame method.
 */
function detectPoseInRealTime(video) {
  const canvas = document.getElementById("output");
  const keypointCanvas = document.getElementById("keypoints");
  const videoCtx = canvas.getContext("2d");
  const keypointCtx = keypointCanvas.getContext("2d");

  canvas.width = videoWidth;
  canvas.height = videoHeight;
  keypointCanvas.width = videoWidth;
  keypointCanvas.height = videoHeight;

  async function poseDetectionFrame() {
    // Begin monitoring code for frames per second
    stats.begin();
    const topOffset =
      ZONEHEIGHT - ZONEHEIGHT * guiState.notesRangeScale + ZONEOFFSET;
    const notesOffset = (ZONEHEIGHT - topOffset) * guiState.notesRangeOffset;
    const chordsInterval = guiState.chordIntervals === 'default' ? null : guiState.chordIntervals
    let chordsArray = []
    if (chordsInterval &&
        chordsInterval !== 'default' &&
        Object.prototype.hasOwnProperty.call(chords, chordsInterval)) {
      chordsArray = chords[chordsInterval]
    }

    let poses = [];

    videoCtx.clearRect(0, 0, videoWidth, videoHeight);
    // Draw video
    videoCtx.save();
    videoCtx.scale(-1, 1);
    videoCtx.translate(-videoWidth, 0);
    videoCtx.drawImage(video, 0, 0, videoWidth, videoHeight);
    videoCtx.restore();

    // Creates a tensor from an image
    const input = tf.browser.fromPixels(canvas);
    faceDetection = await facemesh.estimateFaces(input, false, false);
    let all_poses = await posenet.estimatePoses(video, {
      flipHorizontal: true,
      decodingMethod: "multi-person",
      maxDetections: 1,
      scoreThreshold: minPartConfidence,
      nmsRadius: nmsRadius,
    });

    poses = poses.concat(all_poses);
    input.dispose();

    keypointCtx.clearRect(0, 0, videoWidth, videoHeight);
    if (guiState.debug.showDetectionDebug) {
      poses.forEach(({ score, keypoints }) => {
        if (score >= minPoseConfidence) {
          drawKeypoints(keypoints, minPartConfidence, keypointCtx);
          drawSkeleton(keypoints, minPartConfidence, keypointCtx);
        }
      });
      faceDetection.forEach((face) => {
        Object.values(facePartName2Index).forEach((index) => {
          let p = face.scaledMesh[index];
          drawPoint(keypointCtx, p[1], p[0], 2, "red");
        });
      });
      drawBox(ZONEOFFSET, ZONEOFFSET, ZONEWIDTH, ZONEHEIGHT, keypointCtx);
      drawBox(
        ZONEWIDTH,
        ZONEOFFSET,
        videoWidth - ZONEOFFSET,
        ZONEHEIGHT,
        keypointCtx
      );
    }
    
    canvasScope.project.clear();

    if (poses.length >= 1 && config.getIllustration()) {
      let { score, keypoints } = poses[0];
      if(score < MIN_CONFIDENCE){
        setCurrentPose(null);
      }
      setCurrentPose(poses[0]);
      processPose(
        score,
        keypoints,
        minPartConfidence,
        topOffset,
        notesOffset,
        chordsArray,
        guiState
      );
      Skeleton.flipPose(poses[0]);

      if (faceDetection && faceDetection.length > 0) {
        let face = Skeleton.toFaceFrame(faceDetection[0]);
        config.getIllustration().updateSkeleton(poses[0], face);
      } else {
        config.getIllustration().updateSkeleton(poses[0], null);
      }
      config.getIllustration().draw(canvasScope, videoWidth, videoHeight);

      if (guiState.debug.showIllustrationDebug) {
        config.getIllustration().debugDraw(canvasScope);
      }
    } else {
      setCurrentPose(null);
    }

    canvasScope.project.activeLayer.scale(
      canvasWidth / videoWidth,
      canvasHeight / videoHeight,
      new canvasScope.Point(0, 0)
    );

    // End monitoring code for frames per second
    stats.end();

    requestAnimationFrame(poseDetectionFrame);
  }

  poseDetectionFrame();
}

function setupCanvas() {
  mobile = isMobile();
  if (mobile) {
    canvasWidth = Math.min(window.innerWidth, window.innerHeight);
   
    canvasHeight = window.innerHeight ;
    videoWidth *= 0.7;
    videoHeight *= 0.7;
  } else {
     canvasWidth = Math.round(window.innerWidth * 0.9);
     canvasHeight = Math.round(window.innerHeight * 0.9);
  }

  canvasScope = paper.default;
  let canvas = document.querySelector(".illustration-canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvasScope.setup(canvas);
}

/**
 * Kicks off the demo by loading the posenet model, finding and loading
 * available camera devices, and setting off the detectPoseInRealTime function.
 */
export async function bindPage() {
  setupCanvas();

  toggleLoadingUI(true);
  setStatusText("Loading PoseNet model...");
  posenet = await posenet_module.load({
    architecture: defaultPoseNetArchitecture,
    outputStride: defaultStride,
    inputResolution: defaultInputResolution,
    multiplier: defaultMultiplier,
    quantBytes: defaultQuantBytes,
  });
  setStatusText("Loading FaceMesh model...");
  facemesh = await facemesh_module.load();

  setStatusText("Loading Avatar file...");
  let t0 = new Date();
  await parseSVG(Object.values(avatarSvgs)[0]);

  setStatusText("Setting up camera...");
  try {
    video = await loadVideo();
  } catch (e) {
    let info = document.getElementById("info");
    info.textContent =
      "this device type is not supported yet, " +
      "or this browser does not support video capture: " +
      e.toString();
    info.style.display = "block";
    throw e;
  }

  //setupGui([], posenet);
  setupGui([], guiState);
  setupFPS();

  toggleLoadingUI(false);
  detectPoseInRealTime(video, posenet);
  startSequences();
}

navigator.getUserMedia =
  navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia;
FileUtils.setDragDropHandler((result) => {
  parseSVG(result);
});

async function parseSVG(target) {
  let svgScope = await SVGUtils.importSVG(target /* SVG string or file path */);
  let skeleton = new Skeleton(svgScope);
  let illustration = new PoseIllustration(canvasScope);
  illustration.bindSkeleton(skeleton, svgScope);
  config.setIllustration(illustration);
}



bindPage();
