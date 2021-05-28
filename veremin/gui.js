import dat from 'dat.gui';
import * as girlSVG from '../resources/illustration/girl.svg';
import * as boySVG from '../resources/illustration/boy.svg';
import * as abstractSVG from '../resources/illustration/abstract.svg';
import * as blathersSVG from '../resources/illustration/blathers.svg';
import * as tomNookSVG from '../resources/illustration/tom-nook.svg';
import { getMidiDevices, setPreferredDevice, getBrowserPresets, setPreferredPreset } from './audio-controller.js'
import { chords } from './chord-intervals.js'

export const avatarSvgs = {
  'girl': girlSVG.default,
  'boy': boySVG.default,
  'abstract': abstractSVG.default,
  'blathers': blathersSVG.default,
  'tom-nook': tomNookSVG.default,
};

export const guiState = {
  avatarSVG: Object.keys(avatarSvgs)[0],
  debug: {
    showDetectionDebug: true,
    showIllustrationDebug: false,
  },
  outputDevice: 'browser',
  chordIntervals: 'default',
  noteDuration: 300,
  notesRangeScale: 1,
  notesRangeOffset: 0,
  browser: {
    preset: 'default'
  },
};

const DEFAULTCHORDS = 'minor0'

/**
 * Sets up dat.gui controller on the top-right of the window
 */
 export const setupGui = async (cameras, guiState) => {

  if (cameras.length > 0) {
    guiState.camera = cameras[0].deviceId;
  }

  const gui = new dat.GUI({width: 300});

  let multi = gui.addFolder('Image');
  gui.add(guiState, 'avatarSVG', Object.keys(avatarSvgs)).onChange(() => {console.log('zzz');parseSVG(avatarSvgs[guiState.avatarSVG])});
  multi.open();

  let output = gui.addFolder('Debug control');
  output.add(guiState.debug, 'showDetectionDebug');
  output.add(guiState.debug, 'showIllustrationDebug');


  let audio = gui.addFolder('Audio');
  const midiDevices = await getMidiDevices()
  const mouts = Object.keys(midiDevices)
  const outputDeviceController = gui.add(guiState, 'outputDevice', ['browser'].concat(mouts))

  const achords = Object.keys(chords)
  if (achords.length > 0) {
    const defaultIndex = achords.indexOf(DEFAULTCHORDS)
    guiState.chordIntervals = defaultIndex >= 0 ? achords[defaultIndex] : achords[0]
  }

  audio.add(guiState, 'chordIntervals', ['default'].concat(achords))

  // Selector for the duration (in milliseconds) for how long a note is ON
  audio.add(guiState, 'noteDuration', 100, 2000, 50)

  // Selector for the vertical scale of the range
  audio.add(guiState, 'notesRangeScale', 0.6, 8, 0.05)

  audio.add(guiState, 'notesRangeOffset', 0, 1, 0.01)

  const browserPreset = gui.addFolder('Browser')
  const binst = getBrowserPresets()
  if (binst.length > 0) {
    guiState.browser.preset = binst[0]
    setPreferredPreset(binst[0])
  }

  // Selector for Tone.js presets to use in the browser
  const browserPresetController = browserPreset.add(guiState.browser, 'preset', ['default'].concat(binst))

  outputDeviceController.onChange(function (value) {
    if (!guiState.outputDevice || guiState.outputDevice === 'browser') {
      browserPreset.open()
    } else {
      browserPreset.close()
    }

    setPreferredDevice(guiState.outputDevice)
  })

  browserPresetController.onChange(function (value) {
    setPreferredPreset(guiState.browser.preset)
  })
}