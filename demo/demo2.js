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
    // $("#images li").each(function(index, elem){

    //     var img = $('<img/>').load(function(e){
    //         var ii = e.currentTarget;
    //         var canvas = document.getElementById("p"+ii.getAttribute("rel"));
    //         var _lip = document.getElementById("l"+ii.getAttribute("rel"));
    //         var t = new LipDetector()
    //         t.init(ii, canvas, _lip, $("#lips-area"));
    //         t.useImage = true;
    //         t.tickImage();
    //     }).attr("rel", index+1).attr("src", elem.firstChild.src);
        

    //     // img.rel = index;
    //     // img.addEventListener("load", function(){
            
    //     //     var t = new LipDetector(this, document.getElementById("p"+this.rel), 
    //     //                             document.getElementById("l"+this.rel), $("#lips-area"));
    //     //     t.webcam = this;
    //     //     t.useImage = true;
    //     //     t.tick();
    //     //     console.loag

    //     //     //t.stop();
    //     // });
    //     // img.src = elem.firstChild.src;
    //     // imgs.push(img);
    //     // console.log("img", img.src);
        
    //     // $(elem).bind("click", function(){
    //     //     
    //     //     mainLipDetector.stop();
    //     //     img.addEventListener("load", function(){
    //     //         mainLipDetector.useImage = true;
    //     //         mainLipDetector.webcam = this;
    //     //         mainLipDetector.tick();
                    
    //     //     });
    //     //     img.src = this.firstChild.src;
    //     //     updateAreaLipsPosition(this.firstChild.getAttribute('data-index'));
    //     // });
    // });
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
