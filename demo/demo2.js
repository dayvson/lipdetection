var areaLipsPositions = [
    {top:235, left:266, width:140, height:74},
    {top:304, left:256, width:140, height:74},
    {top:182, left:234, width:140, height:74},
    {top:213, left:255, width:140, height:74},
    {top:220, left:280, width:140, height:74},
    {top:220, left:280, width:140, height:74},
]

var areaLipsImages = [
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
        mainLipDetector.stop();
        mainLipDetector.webcam = webcam;
        mainLipDetector.webcam.addEventListener('onend', function(){
            mainLipDetector.webcam.src = url;    
        });

        mainLipDetector.webcam.src = url;
        mainLipDetector.webcam.load();
        mainLipDetector.webcam.play();
        mainLipDetector.tick();
    }
    var updateAreaLipsPosition = function(index){
        var area = areaLipsPositions[index];
        $("#lips-area").offset({top:area.top, left:area.left}).width(area.width).height(area.height);
    }
    // var imgs = [];
    $("#images li").each(function(index, elem){

        var img = document.createElement("img");
        img.setAttribute("rel",  index+1);
        img.addEventListener("load", function(){
            var _img = document.createElement("canvas");
            var _lip = document.createElement("canvas");
            var _li = document.createElement("li");
            _img.width = _lip.width = 640;
            _img.height = _lip.height = 480;
            _lip.style.position= "absolute";
            _lip.style.left = "9px";
            var t = new LipDetector();
            t.webcam = this;

            t.init(this, _img, _lip)
            t.webcamCanvasCtx.drawImage(this, 0, 0, 640, 480);
            t.drawContourForImage({top:235, left:266, width:140, height:74});
            _li.appendChild(_img);
            _li.appendChild(_lip);
            document.getElementById("p-list").appendChild(_li);
        });
        img.src = elem.firstChild.src;

    });
    $("#samples li").each(function(index, elem){
        $(elem).bind("click", function(){
            mainLipDetector.useImage = false;
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
    
        mainLipDetector = new LipDetector();
        mainLipDetector.init(webcam, webcamCanvas, lipCanvas, $("#lips-area"));
        compatibility.requestAnimationFrame(function(){
            mainLipDetector.tick();

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
