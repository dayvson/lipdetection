var LipContour = {
    find:function(imageData){
        return [[314, 273.5],
                [331.4, 260.5],
                [343, 244.5],
                [356, 260.5],
                [364, 272.5],
                [358, 287.5],
                [342, 293.5],
                [325, 290.5]];
    }
}
var LipDetector = function(){};
LipDetector.prototype = {
    init:function(webcam, webcamCanvas, lipCanvas, areaLips){
        this.debug = 1;
        this.webcam = webcam;
        this.webcamCanvas = webcamCanvas;
        this.areaLips = areaLips;
        this.lipCanvas = lipCanvas;
        this.webcamCanvasCtx = this.webcamCanvas.getContext('2d');
        this.lipCanvasCtx = this.lipCanvas.getContext('2d');

        this.width = this.webcam.videoWidth;
        this.height = this.webcam.videoHeight;
    },
    draw:function(containerCtx, points){
        containerCtx.fillStyle = "magenta";
        containerCtx.beginPath();
        for(var i = 0, x = points.length; i<x; i++){
            if(i)containerCtx.lineTo( points[i][0], points[i][1]);
            else containerCtx.moveTo(points[i][0], points[i][1]);                
        }
        containerCtx.globalAlpha = 0.3;
        containerCtx.fill();
    },
    tickImage:function(){
        this.lipCanvasCtx.clearRect(0, 0, this.width, this.height);
        this.webcamCanvasCtx.drawImage(this.webcam, 0, 0, this.width, this.height);

        var imageData = this.webcamCanvasCtx.getImageData(this.areaLips.position().left, 
                                            this.areaLips.position().top, 
                                            this.areaLips.width(), 
                                            this.areaLips.height());
        var contours = LipContour.find(imageData);
        this.draw(this.lipCanvasCtx, contours);

    },
    tick:function(){
        var self = this;
        this._interval = compatibility.requestAnimationFrame(function(){
            self.tick();
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
            this.draw(this.lipCanvasCtx, contours);
        }
    },
    stop:function () {
        compatibility.cancelAnimationFrame(this._interval);
    }
}