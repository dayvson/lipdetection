$(function(){
    var webcam = document.getElementById("webcam");
    var webcamCanvas = document.getElementById("webcam-canvas");
    var lipCanvas = document.getElementById("lips-canvas");

    var initDemo = function(){
        webcam.play();
        LipDetector.init(webcam, webcamCanvas, lipCanvas);
        compatibility.requestAnimationFrame(LipDetector.tick);
    }
    compatibility.getUserMedia({video: true}, 
        function(stream) {
            try {
                webcam.src = compatibility.URL.createObjectURL(stream);
            } catch (error) {
                webcam.src = stream;
            }
            setTimeout(initDemo, 500);
        }, 
        function (error) {
            console.log("ERROR");
        }
    );
    $(window).unload(function() {
        webcam.pause();
        webcam.src = null;
    });
});