(function(win, $, compatibility){
    "use strict";
    var LipDetector = {
        init:function(webcam, webcamCanvas, lipCanvas){
            this.webcam = webcam;
            this.webcamCanvas = webcamCanvas;
            this.lipCanvas = lipCanvas;
            this.webcamCanvasCtx = this.webcamCanvas.getContext('2d');
            this.lipCanvasCtx = this.lipCanvas.getContext('2d');
            console.log("init", this);
        },
        tick:function(){
            compatibility.requestAnimationFrame(this.tick);
            if (this.webcam.readyState === this.webcam.HAVE_ENOUGH_DATA) {
                this.webcamCanvasCtx.drawImage(this.webcam, 0, 0, 640, 480);
            }
        },
        camptureLips:function(){

        },
        getLips:function(){
            return null;
        }
    }  
    win.LipDetector = LipDetector;
})(window, jQuery, compatibility);
