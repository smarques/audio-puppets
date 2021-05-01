class Configuration {
  videoWidth = 300;
  videoHeight = 300;
  canvasWidth = 800;
  canvasHeight = 800;
  ZONEOFFSET = 10;
  getVideoWidth() {
    return this.videoWidth;
  }
  getVideoHeight() {
    return this.videoHeight;
  }
  getCanvasWidth() {
    return this.canvasWidth;
  }
  getCanvasHeight() {
    return this.canvasHeight;
  }
  getZoneOffset() {
    return this.ZONEOFFSET;
  }
  getZoneWidth() {
    return this.videoWidth * 0.5;
  }
  getZoneHeight() {
    return this.videoHeight * 0.7;
  }
}

export const config = new Configuration();
