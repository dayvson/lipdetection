var LipDetector = {
    init:function(webcam, webcamCanvas, lipCanvas){
        this.webcam = webcam;
        this.webcamCanvas = webcamCanvas;
        this.lipCanvas = lipCanvas;
        this.webcamCanvasCtx = this.webcamCanvas.getContext('2d');
        this.lipCanvasCtx = this.lipCanvas.getContext('2d');
        console.log("init", this);


		this.width = this.webcam.videoWidth;
		this.height = this.webcam.videoHeight;
		var max_work_size = 160;

		this.scale = Math.min(max_work_size/this.width, max_work_size/this.height);
		var w = (this.width*this.scale)|0;
		var h = (this.height*this.scale)|0;
		this.work_canvas = document.createElement('canvas');
		this.work_canvas.width = w;
		this.work_canvas.height = h;
		this.work_ctx = this.work_canvas.getContext('2d');
		document.firstChild.appendChild(this.work_canvas);

		this.img_u8 = new jsfeat.matrix_t(w, h, jsfeat.U8_t | jsfeat.C1_t);
		this.ii_sum = new Int32Array((w+1)*(h+1));
		this.ii_sqsum = new Int32Array((w+1)*(h+1));
		this.ii_tilted = new Int32Array((w+1)*(h+1));

		this.edges_density = 0.13;
		this.scale_factor = 1.2;
		this.min_scale = 2;
		this.use_tilted = false;

		this.color = "black";
    },

	haar:function(classifier, image, roi){
		if(roi) {
			this.color = "blue";
		} else {
			roi = {x:0, y:0, width:this.width, height:this.height};
			this.color = "yellow";
		}
		this.work_ctx.drawImage(image, roi.x, roi.y, roi.width, roi.height, 0, 0, this.work_canvas.width, this.work_canvas.height);
		var imageData = this.work_ctx.getImageData( 0,0, this.work_canvas.width,this.work_canvas.height);

		jsfeat.imgproc.grayscale(imageData.data, this.img_u8.data);

		// jsfeat.imgproc.equalize_histogram(this.img_u8, this.img_u8); // equalize_histogram

		jsfeat.imgproc.compute_integral_image(this.img_u8, this.ii_sum, this.ii_sqsum, this.use_tilted && classifier.tilted ? this.ii_tilted : null);

		jsfeat.haar.edges_density = this.edges_density;
		var rects = jsfeat.haar.detect_multi_scale(this.ii_sum, this.ii_sqsum, this.ii_tilted, null, this.img_u8.cols, this.img_u8.rows, classifier, this.scale_factor, this.min_scale);
		rects = jsfeat.haar.group_rectangles(rects, 1);

		jsfeat.math.qsort(rects, 0, rects.length-1, function(a,b){return (b.confidence<a.confidence);})

		var r = rects[0];

		if(r) {
			var unscale = roi.width/this.work_canvas.width;
			r.x = r.x * unscale + roi.x;
			r.y = r.y * unscale + roi.y;
			r.width  *= unscale;
			r.height *= unscale;
		}

		return r;
	},


	 draw_match: function (ctx, r, color) {
		 if(r && r.confidence > 0.5) {
			ctx.strokeStyle = color;
			ctx.strokeRect(r.x,r.y,r.width,r.height);
		 }
	 },


    tick:function(){
        compatibility.requestAnimationFrame(function(){
            LipDetector.tick();
        });

        if (this.webcam.readyState === this.webcam.HAVE_ENOUGH_DATA) {
			this.webcamCanvasCtx.drawImage(this.webcam, 0, 0, this.width, this.height);

			var face = this.haar(jsfeat.haar.frontalface, this.webcam);
			this.draw_match(this.webcamCanvasCtx, face, "red");

			if(face) {
				face.y += face.height*0.6;
				face.height *= 1-0.6;

				face.x+=face.width*0.1;
				face.width-=face.width*0.2;

				face.y-=face.height*0.1;
				face.height+=face.height*0.4;

				this.draw_match(this.webcamCanvasCtx, face, "green");
			}
		
			var mouth = this.haar(jsfeat.haar.mouth, this.webcam, face);
			if(face) { // XXX primor
				mouth.y -= this.height * 0.05;
				mouth.height += this.height * 0.05;
				mouth.x -= mouth.width*0.2;
				mouth.width *= 1.40;
			}
			this.draw_match(this.webcamCanvasCtx, mouth, this.color);


        }


    },
    captureLips:function(){

    },
    getLips:function(){
        return null;
    }
}  

