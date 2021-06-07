import {
  playNote,
  getMidiDevices,
  getAnalyzerValue,
} from "./audio-controller.js";
import { config } from "./config.js";
/**
 * Draw the resulting skeleton and keypoints and send data to play corresponding note
 */
 const LEFTWRIST = 9
 const RIGHTWRIST = 10
 const NOSE = 0
 const LEFTSHOULDER = 5
 const RIGHTSHOULDER = 6

 export const processPose = function (
  score,
  keypoints,
  minPartConfidence,
  topOffset,
  notesOffset,
  chordsArray,
  guiState
) {
  
  const leftWrist = keypoints[LEFTWRIST];
  const rightWrist = keypoints[RIGHTWRIST];
  const nose = keypoints[NOSE];
  const leftShoulder = keypoints[LEFTSHOULDER];
  const rightShoulder = keypoints[RIGHTSHOULDER];

  if (
    leftWrist.score > minPartConfidence &&
    rightWrist.score > minPartConfidence
  ) {
    // Normalize keypoints to values between 0 and 1 (horizontally & vertically)
    const position = normalizeMusicPositions(
      leftWrist,
      rightWrist,
      topOffset + notesOffset,
      config.getZoneHeight() + notesOffset
    );
    //console.log(position.left.horizontal);
    if (position.right.vertical > 0 && position.left.horizontal > 0) {
      playNote(
        position.right.vertical, // note
        position.left.horizontal, // volume
        guiState.noteDuration,
        chordsArray
      );
    } else {
      playNote(0, 0);
    }
  } else {
    playNote(0, 0);
  }
  return;
  if (guiState.mqtt.on) {
    let userPosition = {};
    if (
      nose.score > minPartConfidence &&
      leftShoulder.score > minPartConfidence &&
      rightShoulder.score > minPartConfidence
    ) {
      userPosition = normalizeUserPlacementPositions(
        leftShoulder,
        rightShoulder,
        nose,
        topOffset + notesOffset,
        ZONEHEIGHT + notesOffset
      );
      mqttClient.sendNose(userPosition.nose);
      const userAngle = calculateAngle(userPosition.nose.x);
      mqttClient.sendAngle(userAngle);

      // .5 meters is 50%-52% of the screen
      // 1 meter is 27 -> 29% of the screen
      // 1.5 meters is 20->21%
      // 2 meters is 16 to 17%
      // 2.5 meters projection is 13 -> 15
      // This is likely overfitting in some capacity but it should be fine for our purposes
      const estimatedDist =
        guiState.mqtt.distanceMult *
        60.873 *
        (100 * userPosition.shoulderWidthPercent) ** -1.225;
      mqttClient.sendEstDist(estimatedDist);
      const estWristDelta = {
        left: {
          x:
            keypoints[LEFTWRIST].position.x -
            keypoints[LEFTSHOULDER].position.x,
          y:
            keypoints[LEFTWRIST].position.y -
            keypoints[LEFTSHOULDER].position.y,
          conf: keypoints[LEFTWRIST].score,
        },
        right: {
          x:
            keypoints[RIGHTWRIST].position.x -
            keypoints[RIGHTSHOULDER].position.x,
          y:
            keypoints[RIGHTWRIST].position.y -
            keypoints[RIGHTSHOULDER].position.y,
          conf: keypoints[RIGHTWRIST].score,
        },
      };
      const robotData = {
        wristDelta: estWristDelta,
        nose: userPosition.nose,
        userAngle: userAngle,
        userDist: estimatedDist,
      };

      mqttClient.sendRobot(robotData);
    }

    mqttClient.sendKeypoints(keypoints);
  }

};

/**
 * Returns an object the horizontal and vertical positions of left and right wrist normalized between 0 and 1
 *
 * @param {Object} leftWrist - posenet 'leftWrist' keypoints (corresponds to user's right hand)
 * @param {Object} rightWrist - posenet 'rightWrist' keypoints (corresponds to user's left hand)
 * @param {Number} notesTopOffset - top edge (max position) for computing vertical notes
 */
 const normalizeMusicPositions = function (leftWrist, rightWrist, topOffset = config.getZoneOffset(), bottomOffset = config.getZoneHeight()) {
  const leftZone = leftWrist.position
  const rightZone = rightWrist.position

  const leftEdge = config.getZoneOffset()
  const verticalSplit = config.getZoneWidth()
  const rightEdge = config.getVideoWidth() - config.getZoneOffset()
  const topEdge = topOffset
  const bottomEdge = bottomOffset

  const position = {
    right: {
      vertical: 0,
      horizontal: 0
    },
    left: {
      vertical: 0,
      horizontal: 0
    }
  }

  if (rightZone.x >= verticalSplit && rightZone.x <= rightEdge) {
    position.right.horizontal = computePercentage(rightZone.x, verticalSplit, rightEdge)
  }
  if (rightZone.y <= config.getZoneHeight() && rightZone.y >= config.getZoneOffset()) {
    position.right.vertical = computePercentage(rightZone.y, bottomEdge, topEdge)
  }
  if (leftZone.x >= leftEdge && leftZone.x <= verticalSplit) {
    position.left.horizontal = computePercentage(leftZone.x, verticalSplit / 1.5, leftEdge) * 0.90
  }
  if (leftZone.y <= config.getZoneHeight() && leftZone.y >= config.getZoneOffset()) {
    position.left.vertical = computePercentage(leftZone.y, config.getZoneHeight(), config.getZoneOffset())
  }

  return position
}


/**
 * Compute percentage of the provided value in the given range
 *
 * @param {Number} value - a number between 'low' and 'high' to compute percentage
 * @param {Number} low - corresponds to a number that should produce value 0
 * @param {Number} high - corresponds to a number that should produce value 1
 */
 const computePercentage = function (value, low, high) {
  const dist = isNaN(value) ? 0 : value
  const minDist = isNaN(low) ? 0 : low
  const maxDist = isNaN(high) ? dist + 1 : high

  return (dist - minDist) / (maxDist - minDist)
}