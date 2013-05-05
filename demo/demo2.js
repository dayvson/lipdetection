var areaLipsPositions = [
    {top:235, left:266, width:140, height:74},
    {top:304, left:256, width:140, height:74},
    {top:182, left:234, width:140, height:74},
    {top:213, left:255, width:140, height:74},
    {top:220, left:280, width:140, height:74},
    {top:220, left:280, width:140, height:74},
]
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
    var updateAreaLipsPosition = function(index){
        var area = areaLipsPositions[index];
        $("#lips-area").offset({top:area.top, left:area.left}).width(area.width).height(area.height);
    }

    $("#images li").each(function(index, elem){
        $(elem).bind("click", function(){
            var img = document.createElement("img");
            LipDetector.stop();
            img.addEventListener("load", function(){
                LipDetector.useImage = true;
                LipDetector.webcam = this;
                LipDetector.tick();
                    
            });
            img.src = this.firstChild.src;
            updateAreaLipsPosition(this.firstChild.getAttribute('data-index'));
        });
    });
    $("#samples li").each(function(index, elem){
        $(elem).bind("click", function(){
            LipDetector.useImage = false;
            $("#samples li").css({"border":"1px solid white"});
            $(this).css({"border":"1px solid red"});
            if($(this).hasClass("cam")){
                initWebcam();
            }else{
                loadVideo(this.firstChild.getAttribute('data-video'));
                updateAreaLipsPosition(this.firstChild.getAttribute('data-index'));
            }
        });
    });
    
    
    var initDemo = function(){
        webcam.play();
    
        LipDetector.init(webcam, webcamCanvas, lipCanvas, $("#lips-area"));
        compatibility.requestAnimationFrame(function(){
            LipDetector.tick();
        });
    }
    var initWebcam = function(){
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
    }
    $("#lips-area").draggable();
    webcam.src = "videos/9.mp4";
    setTimeout(initDemo, 500);
    $(window).unload(function() {
        webcam.pause();
        webcam.src = null;
    });
});
