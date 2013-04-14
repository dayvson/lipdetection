$(function(){
    var webcam = document.getElementById("webcam");
    var webcamCanvas = document.getElementById("webcam-canvas");
    var lipCanvas = document.getElementById("lips-canvas");
    var thumbCtx = document.getElementById("thumb-canvas").getContext('2d');
    var loadImage = function(url){
        LipDetector.stop();
        LipDetector.useImage = true;
        LipDetector.webcam = new Image();
        LipDetector.webcam.onload = function() {
            LipDetector.tick();
        };
        LipDetector.webcam.src = url;
    };
    var loadWebcam = function(){
        LipDetector.stop();
        LipDetector.useImage = false;
        LipDetector.webcam = webcam;
        LipDetector.tick();
    };
    $("#samples li").each(function(index, elem){
        $(elem).bind("click", function(){
            $("#samples li").css({"border":"1px solid white"});
            $(this).css({"border":"1px solid red"});
            if($(this).hasClass("video")){
                loadWebcam();
            }else{
                loadImage(this.firstChild.src);
            }
        });
    });
    
    var drawWebcamThumb = function(){
        compatibility.requestAnimationFrame(drawWebcamThumb);
        thumbCtx.drawImage(webcam, 0, 0, 90, 90);
    }
    var initDemo = function(){
        webcam.play();
        drawWebcamThumb();
        LipDetector.init(webcam, webcamCanvas, lipCanvas);
        compatibility.requestAnimationFrame(function(){
            LipDetector.tick();
        });
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