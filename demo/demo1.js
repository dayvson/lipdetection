var areaLipsPositions = [
    {top:235, left:266, width:140, height:74},
    {top:304, left:256, width:140, height:74},
    {top:182, left:234, width:140, height:74},
    {top:213, left:255, width:140, height:74},
    {top:220, left:280, width:140, height:74},
    {top:220, left:280, width:140, height:74},
]
var areaLipsImages = [
    {top:200, left:244, width:140, height:74},
    {top:310, left:261, width:140, height:74},
    {top:243, left:249, width:140, height:54},
    {top:225, left:214, width:140, height:74},
    {top:205, left:254, width:140, height:74},
    {top:205, left:254, width:140, height:74},
    {top:208, left:250, width:140, height:74},
    {top:180, left:222, width:140, height:64},
    {top:208, left:245, width:140, height:74},
    {top:209, left:253, width:140, height:70},
    {top:235, left:253, width:140, height:74},
    {top:157, left:225, width:140, height:64},
    {top:292, left:239, width:140, height:74},
    {top:157, left:289, width:140, height:74}
    
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
        LipDetector.webcam.addEventListener('ended', function(){
            alert("ended");
            LipDetector.webcam.play();
        });

        LipDetector.webcam.src = url;
        LipDetector.webcam.load();
        LipDetector.webcam.play();
        LipDetector.tick($("#lips-area"));
    }
    var loadImage = function(url){
        LipDetector.stop();
        var img = document.createElement("img");
        img.addEventListener('load', function(){
            console.log("IMAGE LOADED");
            LipDetector.webcam = this;
            LipDetector.tick();
        });
        img.src = url;
    }

    var updateAreaLipsPosition = function(index, list){
        var area = list[index];
        $("#lips-area").offset({top:area.top, left:area.left}).width(area.width).height(area.height);
    }
    // var imgs = [];

    $("#samples li").each(function(index, elem){

        $(elem).bind("click", function(){
            LipDetector.useImage = false;
            $("#samples li").css({"border":"1px solid white"});
            $(this).css({"border":"1px solid red"});
            if($(this).hasClass("cam")){
                initWebcam();
            }else if ($(elem).hasClass("img")){
                loadImage(this.firstChild.src);
                updateAreaLipsPosition(this.firstChild.getAttribute('data-area'), areaLipsImages);
            }else{
                loadVideo(this.firstChild.getAttribute('data-video'));
                updateAreaLipsPosition(this.firstChild.getAttribute('data-index'), areaLipsPositions);
            }
        });
    });
    
    
    var initDemo = function(){
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
    $("#clear").click(function(){
        LipDetector.stop();
        LipDetector.reset();
        LipDetector.tick();
        try{
            webcam.play();
        }catch(e){};
    });
    $("#take-picture").click(function(){
        LipDetector.saveImage = true;
        try{
            //webcam.pause();
        }catch(e){};
        return false;
    });

    $("#lips-area").draggable();
    webcam.src = "videos/9.mp4";
    webcam.autoplay = true;
    webcam.load();
    webcam.play();
    updateAreaLipsPosition(0, areaLipsPositions);

   setTimeout(initDemo, 800);
    $(window).unload(function() {
        webcam.pause();
        webcam.src = null;
    });
});
