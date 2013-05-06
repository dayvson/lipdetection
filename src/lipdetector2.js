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
    draw:function(containerCtx, points, offsetX, offsetY){
		if(!points || points.length < 2) return;
        containerCtx.strokeStyle = "red";
        containerCtx.fillStyle = "magenta";
        containerCtx.beginPath();
        for(var i = 0, x = points.length; i<x; i++){

            if(i)containerCtx.lineTo(offsetX+points[i][1], offsetY+points[i][2]);
            else containerCtx.moveTo(offsetX+points[i][1], offsetY+points[i][2]);                
        }
        containerCtx.globalAlpha = 1;
        //containerCtx.fill();
        containerCtx.stroke();
    },
    drawContourForImage:function(areaLips){
        var imageData = this.webcamCanvasCtx.getImageData(areaLips.left, 
                                            areaLips.top, 
                                            areaLips.width, 
                                            areaLips.height);
        this.webcamCanvasCtx.putImageData(imageData, 0, 0);
        var contours = LipContour.find(imageData);
        this.draw(this.lipCanvasCtx, contours, areaLips.left, areaLips.top);

    },
    tick:function(){
        var self = this;
        this._interval = compatibility.requestAnimationFrame(function(){
            self.tick();
        });
        if (this.webcam.readyState === this.webcam.HAVE_ENOUGH_DATA || this.useImage) {
            this.lipCanvasCtx.clearRect(0, 0, this.width, this.height);
            this.webcamCanvasCtx.drawImage(this.webcam, 0, 0, this.width, this.height);
            
            var imageData = this.webcamCanvasCtx.getImageData(this.areaLips.position().left, 
                                                            this.areaLips.position().top, 
                                                            this.areaLips.width(), 
                                                            this.areaLips.height());
            var contours = LipContour.find(imageData);
            this.webcamCanvasCtx.putImageData(imageData, 0, 0);
            this.draw(this.lipCanvasCtx, contours, this.areaLips.position().left, this.areaLips.position().top);
        }
    },
    stop:function () {
        compatibility.cancelAnimationFrame(this._interval);
    }
}
