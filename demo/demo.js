$(function(){
    var webcam = document.getElementById("webcam");
    var webcamCanvas = document.getElementById("webcam-canvas");
    var lipCanvas = document.getElementById("lips-canvas");
    var thumb = document.getElementById("thumb-canvas");
    var webcamStream;
    var loadVideo = function(url){
        LipDetector.stop();
        LipDetector.webcam = webcam;
        LipDetector.webcam.addEventListener('onend', function(){
            LipDetector.webcam.src = url;    
        });
        LipDetector.webcam.src = url;
        LipDetector.webcam.load();
        LipDetector.webcam.play();
        LipDetector.tick();
    }

    $("#samples li").each(function(index, elem){
        $(elem).bind("click", function(){
            $("#samples li").css({"border":"1px solid white"});
            $(this).css({"border":"1px solid red"});
            if($(this).hasClass("cam")){
                initWebcam();
            }else{
                loadVideo(this.firstChild.getAttribute('data-video'));
            }
			LipDetector.reset();
        });
    });
    
    
    var initDemo = function(){
        webcam.play();
    
        LipDetector.init(webcam, webcamCanvas, lipCanvas);
        compatibility.requestAnimationFrame(function(){
            LipDetector.tick();
        });
    }
    var initWebcam = function(){
        compatibility.getUserMedia({video: true}, 
            function(stream) {
                try {
                   webcam.src = compatibility.URL.createObjectURL(stream);
                   thumb.src =  compatibility.URL.createObjectURL(stream);
                } catch (error) {
                    webcam.src = stream;
                    thumb.src =  stream;
                }
                setTimeout(initDemo, 500);
            }, 
            function (error) {
                console.log("ERROR");
            }
        );
    }
    webcam.src = "videos/10.mp4";
    setTimeout(initDemo, 500);
    $(window).unload(function() {
        webcam.pause();
        webcam.src = null;
    });
});
