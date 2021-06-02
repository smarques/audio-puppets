import * as Tone from 'tone'
import { times, identity, find } from "lodash";
import {getCurrentPose, setCurrentPose} from "./current-pose";

const SEQUENCE = [
  'leftWrist',
  'leftElbow',
  'leftShoulder',
  'rightShoulder',
  'rightElbow',
  'rightWrist'
];

let step = Tone.Time('4n').toSeconds();
let measure = Tone.Time('1m').toSeconds();
let loopDuration = measure * 2;
let scale = [1, 2, 2, 2, 1, 2, 2];
let rootNote = Tone.Frequency('E2').toMidi();
let gamut = 10;
let humanize = 0.025;
let active = false;

let delay = new Tone.PingPongDelay(step * 3 / 4, 0.5).toDestination();
let c2 = require('../resources/sounds/pure-bell-c2.mp3');
let ds2 = require('../resources/sounds/pure-bell-ds2.mp3');
let fs2 = require('../resources/sounds/pure-bell-fs2.mp3');
let a2 = require('../resources/sounds/pure-bell-a2.mp3');
let c3 = require('../resources/sounds/pure-bell-c3.mp3');
let ds3 = require('../resources/sounds/pure-bell-ds3.mp3');
let fs3 = require('../resources/sounds/pure-bell-fs3.mp3');
let a3 = require('../resources/sounds/pure-bell-a3.mp3');
let sampler = new Tone.Sampler({
  'urls':{
  'C2': c2,
  'D#2': ds2,
  'F#2': fs2,
  'A2': a2,
  'C3': c3,
  'D#3': ds3,
  'F#3': fs3,
  'A3': a3
  },
  // baseUrl: "../resources/sounds/",
  //baseUrl: "https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/",
 
  release: 1
})
  .connect(delay)
  .toDestination();

//let buffersPromise = new Promise(res => Tone.Buffer.on('load', res));

let points,
  notesOn,
  startTime,
  notesPlayed = times(loopDuration / step, () => times(gamut, () => 0));

  function isLineLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    // calculate the distance to intersection point
    let uA =
      ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) /
      ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
    let uB =
      ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) /
      ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
  
    // if uA and uB are between 0-1, lines are colliding
    if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {
      return true;
    }
    return false;
  }
  
  function isLineRectangleIntersection(x1, y1, x2, y2, rx, ry, rw, rh) {
    // check if the line has hit any of the rectangle's sides
    // uses the Line/Line function below
    let left = isLineLineIntersection(x1, y1, x2, y2, rx, ry, rx, ry + rh);
    let right = isLineLineIntersection(
      x1,
      y1,
      x2,
      y2,
      rx + rw,
      ry,
      rx + rw,
      ry + rh
    );
    let top = isLineLineIntersection(x1, y1, x2, y2, rx, ry, rx + rw, ry);
    let bottom = isLineLineIntersection(
      x1,
      y1,
      x2,
      y2,
      rx,
      ry + rh,
      rx + rw,
      ry + rh
    );
  
    // if ANY of the above are true, the line
    // has hit the rectangle
    if (left || right || top || bottom) {
      return true;
    }
    return false;
  }

  export const sequencePose = () => {
    const pose = getCurrentPose();
    if(!pose){
      active = false;
      setTimeout(() => sequencePose(), step / 4 * 1000);
      return;
    }
    active = true;
    points = SEQUENCE.map(part => find(pose.keypoints, { part })).filter(
      identity
    );
    const keypointCanvas = document.getElementById("keypoints");
    let steps = loopDuration / step;
    let noteWidth = keypointCanvas.width / steps;
    let noteHeight =  keypointCanvas.height / gamut;
    notesOn = [];
    for (let i = 0; i < steps; i++) {
      let x = i * noteWidth;
      let notesOnForStep = times(gamut, () => false);
      for (let j = 0; j < gamut; j++) {
        let y = j * noteHeight;
        for (let k = 0; k < points.length - 1; k++) {
          let p0 = points[k];
          let p1 = points[k + 1];
          if (
            isLineRectangleIntersection(
              p0.position.x,
              p0.position.y,
              p1.position.x,
              p1.position.y,
              x,
              y,
              noteWidth,
              noteHeight
            )
          ) {
            notesOnForStep[j] = true;
            break;
          }
        }
      }
      notesOn.push(notesOnForStep);
    }
    setTimeout(() => sequencePose(), step / 4 * 1000);
  };

  export const startSequences = () => {
    let synth = new Tone.Synth().toDestination(),
    nextPlay = Tone.now() + step;
    startTime = nextPlay;
    sequencePose();
    function scheduleNextPlay() {
      while (nextPlay - Tone.now() < step) {
        let steps = loopDuration / step;
        let playedFor = Tone.now() - startTime;
        let loopsGone = Math.floor(playedFor / loopDuration);
        let fraction =
          (playedFor - loopsGone * loopDuration) / loopDuration;
        let notesToPlay = [];
        let currentNote = Math.floor(fraction * steps);

        if (notesOn && notesOn[currentNote]) {
          let noteToPlay = rootNote;
          for (let i = notesOn[currentNote].length - 1; i >= 0; i--) {
            if (notesOn[currentNote][i]) {
              notesToPlay.push({ note: noteToPlay, idx: i });
            }
            noteToPlay += scale[i % scale.length];
          }
        }

        for (let i = 0; i < notesToPlay.length; i++) {
          let now = i % 2 === 0;
          let t = now ? nextPlay : nextPlay + step / 2;
          t += humanize * Math.random();
          let freq = Tone.Frequency(notesToPlay[i].note, 'midi');
          if(active) { sampler.triggerAttack(freq, t); }
          notesPlayed[currentNote][notesToPlay[i].idx] = t;
        }

        nextPlay += step;
        
      }
      setTimeout(scheduleNextPlay, 10);
    }

    // let freq = Tone.Frequency(rootNote, 'midi');
    // sampler.triggerAttackRelease(["C1", "E1", "G1", "B1"], 0.5);
    scheduleNextPlay();
  }
