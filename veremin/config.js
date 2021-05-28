class Configuration {
  videoWidth = 300;
  videoHeight = 300;
  canvasWidth = 800;
  canvasHeight = 800;
  ZONEOFFSET = 10;
  illustration = null;
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
    return this.videoHeight * 0.9;
  }
  getIllustration(){
    return this.illustration;
  }
  setIllustration(ill){
    this.illustration = ill;
  }
}

export const config = new Configuration();
