var LipContour = {
    find:function(imageData){
        return imageData;
    }
}
var LipDetector = {
    init:function(webcam, webcamCanvas, lipCanvas, areaLips){
        this.debug = 1;
        this.webcam = webcam;
        this.webcamCanvas = webcamCanvas;
        this.areaLips = areaLips;
        this.lipCanvas = lipCanvas;
        this.webcamCanvasCtx = this.webcamCanvas.getContext('2d');
        this.lipCanvasCtx = this.lipCanvas.getContext('2d');
        console.log(this.lipCanvas, this.webcamCanvas);
        this.width = this.webcam.videoWidth;
        this.height = this.webcam.videoHeight;
    },
    tick:function(){
        this._interval = compatibility.requestAnimationFrame(function(){
            LipDetector.tick();
        });
        console.log("tick");
        if (this.webcam.readyState === this.webcam.HAVE_ENOUGH_DATA || this.useImage) {
            this.lipCanvasCtx.clearRect(0, 0, this.width, this.height);
            this.webcamCanvasCtx.drawImage(this.webcam, 0, 0, this.width, this.height);
            
            var imageData = this.webcamCanvasCtx.getImageData(this.areaLips.position().left, 
                                                            this.areaLips.position().top, 
                                                            this.areaLips.width(), 
                                                            this.areaLips.height());
            var contours = LipContour.find(imageData);
            this.lipCanvasCtx.putImageData(contours, 0,0);
        }
    },
    stop:function () {
        compatibility.cancelAnimationFrame(this._interval);
    }
}