const SEQUENCE = [
  'leftWrist',
  'leftElbow',
  'leftShoulder',
  'rightShoulder',
  'rightElbow',
  'rightWrist'
];

let video = document.querySelector('#webcam');
let canvas = document.querySelector('#canvas');
let captureCanvas = document.createElement('canvas');
let preContent = document.querySelector('#pre');
let startButton = document.querySelector('#start');
let ctx = canvas.getContext('2d');
let captureCtx = captureCanvas.getContext('2d');

let step = Tone.Time('4n').toSeconds();
let measure = Tone.Time('1m').toSeconds();
let loopDuration = measure * 2;
let scale = [1, 2, 2, 2, 1, 2, 2];
let rootNote = Tone.Frequency('E2').toMidi();
let gamut = 10;
let humanize = 0.025;

let delay = new Tone.PingPongDelay(step * 3 / 4, 0.5).toMaster();
let sampler = new Tone.Sampler({
  C2: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/pure-bell-c2.mp3',
  'D#2': 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/pure-bell-ds2.mp3',
  'F#2': 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/pure-bell-fs2.mp3',
  A2: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/pure-bell-a2.mp3',
  C3: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/pure-bell-c3.mp3',
  'D#3': 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/pure-bell-ds3.mp3',
  'F#3': 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/pure-bell-fs3.mp3',
  A3: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/pure-bell-a3.mp3'
})
  .connect(delay)
  .toMaster();
sampler.release.value = 2;

let netPromise = posenet.load();
let buffersPromise = new Promise(res => Tone.Buffer.on('load', res));

let points,
  notesOn,
  startTime,
  notesPlayed = _.times(loopDuration / step, () => _.times(gamut, () => 0));

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

function detectPose(net, scaleFactor) {
  captureCtx.drawImage(video, 0, 0);
  net.estimateSinglePose(captureCanvas, scaleFactor, true, 32).then(pose => {
    points = SEQUENCE.map(part => _.find(pose.keypoints, { part })).filter(
      _.identity
    );
    let steps = loopDuration / step;
    let noteWidth = video.videoWidth / steps;
    let noteHeight = video.videoHeight / gamut;

    notesOn = [];
    for (let i = 0; i < steps; i++) {
      let x = i * noteWidth;
      let notesOnForStep = _.times(gamut, () => false);
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
  });
  setTimeout(() => detectPose(net, scaleFactor), step / 4 * 1000);
}

function getOffshootPoint(
  { position: { x: x1, y: y1 } },
  { position: { x: x2, y: y2 } }
) {
  if (x1 === x2 && y1 === y2) {
    return [x1, y1];
  } else if (x1 === x2) {
    let ySign = (y2 - y1) / Math.abs(y2 - y1);
    return [x1, ySign * 1000];
  } else if (y1 === y2) {
    let xSign = (x2 - x1) / Math.abs(x2 - x1);
    return [xSign * 1000, y1];
  } else {
    let xSign = (x2 - x1) / Math.abs(x2 - x1);
    let ySign = (y2 - y1) / Math.abs(y2 - y1);
    let slope = (y2 - y1) / (x2 - x1);
    let x = x1 - xSign * 1000 * Math.sqrt(1 / (1 + slope ** 2));
    let y = y1 - xSign * slope * 1000 * Math.sqrt(1 / (1 + slope ** 2));
    return [x, y];
  }
}

function easeOutQuad(x) {
  return x * x;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate((canvas.width - 513) / 2, (canvas.height - 513) / 2);

  if (points) {
    ctx.strokeStyle = `rgba(3, 169, 244, 0.75)`;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();

    /*if (points.length >= 2) {
      let [preX, preY] = getOffshootPoint(points[0], points[1]);
      ctx.moveTo(preX, preY);
    }*/
    for (let point of points) {
      ctx.lineTo(point.position.x, point.position.y);
    }
    /*if (points.length >= 2) {
      let [postX, postY] = getOffshootPoint(
        points[points.length - 1],
        points[points.length - 2]
      );
      ctx.lineTo(postX, postY);
    }*/
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';

  if (startTime) {
    let steps = loopDuration / step;
    let noteWidth = video.videoWidth / steps;
    let noteHeight = video.videoHeight / gamut;

    let playedFor = Tone.now() - startTime - step;
    let loopsGone = Math.floor(playedFor / loopDuration);
    let fraction = (playedFor - loopsGone * loopDuration) / loopDuration;

    let currentNote = Math.floor(fraction * steps);

    ctx.fillRect(currentNote * noteWidth, 0, noteWidth, video.videoHeight);

    let radius = Math.min(noteWidth, noteHeight);
    for (let i = 0; i < gamut; i++) {
      let y = (i + 1 / 2) * noteHeight;
      /*ctx.moveTo(0, y);
      ctx.lineTo(video.videoWidth, y);
      ctx.stroke();*/
      for (let j = 0; j < steps; j++) {
        let playedAt = notesPlayed[j][i];
        if (playedAt <= Tone.now() && playedAt > Tone.now() - 1) {
          let alpha = 1 - (Tone.now() - playedAt);
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          let x = (j + 1 / 2) * noteWidth;
          ctx.beginPath();
          ctx.arc(x, y, radius * easeOutQuad(1 - alpha), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();
  requestAnimationFrame(render);
}

startButton.addEventListener('click', () => {
  preContent.remove();
  video.width = 513;
  video.height = 513;

  navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: { width: 513, height: 513, facingMode: 'user' }
    })
    .then(stream => {
      video.srcObject = stream;
      video.addEventListener('playing', () => {
        let scaleFactor = Math.min(
          1.0,
          Math.max(0.2, video.videoWidth / 513 * 0.5)
        );

        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
        captureCanvas.style.width = `${video.videoWidth}px`;
        captureCanvas.style.height = `${video.videoHeight}px`;
        netPromise.then(net => detectPose(net, scaleFactor));

        let synth = new Tone.Synth().toMaster(),
          nextPlay = Tone.now() + step;
        startTime = nextPlay;

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
              sampler.triggerAttack(freq, t);
              notesPlayed[currentNote][notesToPlay[i].idx] = t;
            }

            nextPlay += step;
          }
          setTimeout(scheduleNextPlay, 10);
        }

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        window.addEventListener('resize', () => {
          canvas.width = canvas.offsetWidth;
          canvas.height = canvas.offsetHeight;
        });
        scheduleNextPlay();
        render();
      });
    })
    .catch(e => console.error(e));
});

Promise.all([netPromise, buffersPromise]).then(() => {
  startButton.textContent = 'Start';
  startButton.disabled = false;
});

StartAudioContext(Tone.context, startButton);